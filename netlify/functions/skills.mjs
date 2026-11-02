/* The skill store. Every skill is a separate paid service with its own payout wallet:
     POST /api/skills/:id                 -> 402 Payment Required + x402 paymentRequirements
     POST /api/skills/:id  + X-PAYMENT    -> verify, do the work, settle, return the result
   Skills: litter-spotter (AI), human-reviewer (a person), cleanup-planner (rules). */
import { randomUUID, createHash } from "node:crypto";
import { SKILLS, json, preflight, today, visitorId, PHOTOS_PER_DAY, PHOTOS_PER_VISITOR, REVIEW_SECONDS } from "../lib/config.mjs";
import { requirements, paymentRequired, decodePayment, verify, settle, facilitatorFeePayer, paymentResponseHeader } from "../lib/x402.mjs";
import { getJSON, setJSON, bump, count, del, TTL } from "../lib/store.mjs";
import { spotLitter } from "../lib/spotter.mjs";
import { planCleanup } from "../lib/planner.mjs";

const MAX_IMAGE_CHARS = 900_000; // about 650 KB of JPEG (the free Redis plan takes up to 1 MB per request); the page shrinks photos first

export function skillInfo(id) {
  const s = SKILLS[id];
  return { id, name: s.name, kind: s.kind, price: s.price, priceUsdc: s.price / 1e6, does: s.does,
    payTo: s.wallet ? s.wallet() : "the person who answers" };
}

/* Same payment sent again (the robot lost the answer, e.g. a phone put the page to sleep):
   the store gives back the saved result. It is never charged twice. */
const replayKeyFor = header => "paid/" + createHash("sha256").update(header).digest("hex").slice(0, 40);
async function replay(req) {
  const header = req.headers.get("x-payment");
  if (!header) return null;
  const saved = await getJSON(replayKeyFor(header)).catch(() => null);
  return saved ? json(200, saved.body, { "X-PAYMENT-RESPONSE": saved.header, "X-Replay": "1" }) : null;
}

/* Sell one result: no payment -> 402; payment -> verify (in parallel with the work) -> settle -> deliver.
   If the work fails, the payment is never settled, so Coco isn't charged. */
async function sell(req, reqs, work, afterSettle) {
  const header = req.headers.get("x-payment");
  if (!header) return paymentRequired(reqs, "X-PAYMENT header is required");
  const payment = decodePayment(header);
  if (!payment) return paymentRequired(reqs, "X-PAYMENT must be an x402 v1 exact payment on solana-devnet");
  const replayKey = replayKeyFor(header);
  const t0 = Date.now();
  const [v, w] = await Promise.all([
    verify(payment, reqs).catch(e => ({ isValid: false, invalidReason: "facilitator didn't answer: " + String(e.message || e).slice(0, 80) })),
    work().then(r => ({ ok: true, r }), e => ({ ok: false, e }))
  ]);
  if (!v.isValid) return paymentRequired(reqs, "Facilitator /verify: " + v.invalidReason);
  if (!w.ok) return json(w.e.status || 502, { error: String(w.e.message || w.e).slice(0, 200), code: w.e.code || "skill_failed", charged: false });
  const t1 = Date.now();
  const s = await settle(payment, reqs).catch(e => ({ success: false, errorReason: "facilitator didn't answer: " + String(e.message || e).slice(0, 80) }));
  if (!s.success) return paymentRequired(reqs, "Facilitator /settle: " + s.errorReason);
  const body = { result: w.r, payment: { transaction: s.transaction, amount: reqs.maxAmountRequired, payTo: reqs.payTo, asset: reqs.asset } };
  const paidHeader = paymentResponseHeader(s);
  await setJSON(replayKey, { body, header: paidHeader }, TTL.day).catch(() => {});
  if (afterSettle) await afterSettle(s.transaction);
  await del("stats/cache").catch(() => {}); // the public numbers include this payment right away
  return json(200, body, { "X-PAYMENT-RESPONSE": paidHeader, "Server-Timing": `verify_and_work;dur=${t1 - t0}, settle;dur=${Date.now() - t1}` });
}

const err = (status, error, code, extra = {}) => json(status, { error, code, ...extra });

async function litterSpotter(req, context, body, reqsFor) {
  if (!process.env.ANTHROPIC_API_KEY) return err(503, "Litter Spotter isn't switched on yet (no AI key on the server).", "no_key");
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(body.image || ""));
  if (!m) return err(400, "Send the photo as a JPEG, PNG or WebP data URL in \"image\".", "bad_image");
  if (m[2].length > MAX_IMAGE_CHARS) return err(413, "Photo too large. Send at most about 650 KB.", "too_large");
  const day = today(), vid = visitorId(req, context);
  const [all, mine] = await Promise.all([count(`photos/${day}`), count(`photos/${day}/${vid}`)]);
  if (all >= PHOTOS_PER_DAY()) return err(429, `Coco has analyzed today's ${PHOTOS_PER_DAY()} photos, the daily limit for the AI. It starts again tomorrow (UTC).`, "daily_photo_limit", { limit: PHOTOS_PER_DAY() });
  if (mine >= PHOTOS_PER_VISITOR()) return err(429, `You've used your ${PHOTOS_PER_VISITOR()} photos for today. Thanks for trying Coco! Come back tomorrow.`, "visitor_photo_limit", { limit: PHOTOS_PER_VISITOR() });
  const reqs = await reqsFor(SKILLS["litter-spotter"].wallet(), "Isla Skills: Litter Spotter (one photo)");
  return sell(req, reqs, async () => {
    // Count the photo before calling the AI: the limit protects the real AI bill.
    await Promise.all([bump(`photos/${day}`), bump(`photos/${day}/${vid}`)]);
    const result = await spotLitter(m[2], m[1]);
    const spotId = randomUUID();
    if (result.unsure) await setJSON(`spot/${spotId}`, { image: body.image, unsure: result.unsure, items: result.items, created: Date.now(), reviewId: null }, TTL.day);
    return { ...result, spotId };
  });
}

export async function reviewState(id) {
  const r = await getJSON(`review/${id}`);
  if (r && r.status === "pending" && Date.now() > r.expiresAt) {
    r.status = "expired"; await setJSON(`review/${id}`, r, TTL.week); await del(`pending/${id}`);
  }
  return r;
}

async function humanReviewer(req, body, reqsFor) {
  // Step 1: Coco asks for a review. Nothing to pay yet: nobody has answered.
  if (body.spotId && !body.reviewId) {
    const spot = await getJSON(`spot/${String(body.spotId).slice(0, 40)}`);
    if (!spot || !spot.unsure) return err(404, "Nothing to review for this photo.", "no_spot");
    if (spot.reviewId) { const r = await reviewState(spot.reviewId); return json(202, { status: r.status === "pending" ? "waiting" : r.status, reviewId: r.id, expiresAt: r.expiresAt }); }
    const id = randomUUID(), u = spot.unsure, item = spot.items[u.itemIndex] || {};
    const r = { id, spotId: body.spotId, question: u.question, litterOption: u.litterOption, notLitterOption: u.notLitterOption,
      aiGuess: u.aiGuess, label: item.label || "", created: Date.now(), expiresAt: Date.now() + REVIEW_SECONDS * 1000, status: "pending" };
    await setJSON(`review/${id}`, r, TTL.week); await setJSON(`pending/${id}`, { expiresAt: r.expiresAt }, TTL.day);
    spot.reviewId = id; await setJSON(`spot/${body.spotId}`, spot, TTL.day);
    return json(202, { status: "waiting", reviewId: id, expiresAt: r.expiresAt, seconds: REVIEW_SECONDS });
  }
  // Step 2: Coco checks back. Once a person has answered, the answer costs a payment to that person.
  const r = await reviewState(String(body.reviewId || "").slice(0, 40));
  if (!r) return err(404, "Unknown review.", "no_review");
  if (r.status === "pending") return json(202, { status: "waiting", reviewId: r.id, secondsLeft: Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 1000)) });
  if (r.status === "expired") return json(410, { status: "expired", reviewId: r.id, error: "Nobody answered in time." });
  if (r.status === "paid") return err(409, "This review was already paid.", "already_paid", { transaction: r.transaction });
  const reqs = await reqsFor(r.reviewer, "Isla Skills: Human Reviewer (one answer)");
  return sell(req, reqs, async () => ({ answer: r.answer, reviewer: r.reviewer, reviewId: r.id }), async tx => {
    const cur = await getJSON(`review/${r.id}`); cur.status = "paid"; cur.transaction = tx; await setJSON(`review/${r.id}`, cur, TTL.week);
  });
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight();
  const url = new URL(req.url);
  const id = decodeURIComponent((context && context.params && context.params.id) || url.pathname.split("/").filter(Boolean).pop() || "");
  if (!Object.hasOwn(SKILLS, id)) return err(404, "Unknown skill: " + id.slice(0, 40), "unknown_skill");
  if (req.method === "GET") return json(200, skillInfo(id));
  if (req.method !== "POST") return err(405, "Use POST", "method");
  if (Number(req.headers.get("content-length") || 0) > 2_000_000) return err(413, "Request too large.", "too_large");
  let body; try { body = await req.json(); } catch (e) { return err(400, "Send a JSON body.", "bad_json"); }
  if (!body || typeof body !== "object") return err(400, "Send a JSON body.", "bad_json");
  const again = await replay(req); // before limits and "already paid" checks
  if (again) return again;

  let feePayer;
  const reqsFor = async (payTo, description) => {
    feePayer = feePayer || await facilitatorFeePayer();
    return requirements({ amount: SKILLS[id].price, payTo, resource: url.origin + "/api/skills/" + id, description, feePayer });
  };
  try {
    if (id === "litter-spotter") return await litterSpotter(req, context, body, reqsFor);
    if (id === "human-reviewer") return await humanReviewer(req, body, reqsFor);
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items) return err(400, "Send the litter list in \"items\".", "bad_items");
    return await sell(req, await reqsFor(SKILLS["cleanup-planner"].wallet(), "Isla Skills: Cleanup Planner (one plan)"), async () => planCleanup(items));
  } catch (e) {
    return err(502, "The store couldn't reach the payment facilitator: " + String(e.message || e).slice(0, 120), "facilitator_down");
  }
};
export const config = { path: "/api/skills/:id" };
