/* Ask a human: the reviewer's side.
     GET  /api/reviews                 -> photos waiting for a person (with ?wallet=… also that person's recent reviews)
     GET  /api/reviews/:id/image       -> the photo
     POST /api/reviews/:id/answer      -> { answer: "litter" | "not_litter", wallet }
   Storage: Netlify Blobs keys review/<id>, pending/<id>, spot/<id> (see netlify/lib/store.mjs). */
import { json, preflight, SKILLS } from "../lib/config.mjs";
import { isAddress, ensureUsdcAccount, PublicKey } from "../lib/solana.mjs";
import { getJSON, setJSON, del, list as keys, TTL } from "../lib/store.mjs";
import { reviewState } from "./skills.mjs";

const err = (status, error, code) => json(status, { error, code });
const pub = r => ({ id: r.id, question: r.question, litterOption: r.litterOption, notLitterOption: r.notLitterOption, label: r.label,
  status: r.status, secondsLeft: Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 1000)), image: `/api/reviews/${r.id}/image`,
  answer: r.answer || null, transaction: r.transaction || null, priceUsdc: SKILLS["human-reviewer"].price / 1e6 });

async function list(url) {
  const pendingKeys = await keys("pending/");
  const out = [];
  for (const k of pendingKeys.slice(0, 30)) {
    const r = await reviewState(k.slice("pending/".length));
    if (r && r.status === "pending") out.push(pub(r));
  }
  const wallet = url.searchParams.get("wallet");
  let mine = [];
  if (wallet && isAddress(wallet)) {
    const idx = (await getJSON(`reviewer/${wallet}`)) || [];
    for (const id of idx.slice(-10).reverse()) { const r = await getJSON(`review/${id}`); if (r) mine.push(pub(r)); }
  }
  return json(200, { pending: out.sort((a, b) => a.secondsLeft - b.secondsLeft), mine });
}

async function image(id) {
  const r = await getJSON(`review/${id}`);
  if (!r || !["pending", "answered"].includes(r.status)) return err(404, "No photo", "no_photo");
  const spot = await getJSON(`spot/${r.spotId}`);
  const m = spot && /^data:(image\/[a-z]+);base64,(.+)$/.exec(spot.image || "");
  if (!m) return err(404, "No photo", "no_photo");
  return new Response(Buffer.from(m[2], "base64"), { status: 200, headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=120" } });
}

async function answer(req, id) {
  let body; try { body = await req.json(); } catch (e) { return err(400, "Send JSON.", "bad_json"); }
  const a = body && body.answer, wallet = body && body.wallet;
  if (!["litter", "not_litter"].includes(a)) return err(400, "Answer litter or not_litter.", "bad_answer");
  if (!isAddress(wallet)) return err(400, "Connect your Solana wallet first: the payment goes to it.", "bad_wallet");
  const r = await reviewState(id);
  if (!r) return err(404, "Unknown review.", "no_review");
  if (r.status === "expired") return err(410, "Too late: Coco already moved on with the AI's answer. No payment for this one.", "expired");
  if (r.status !== "pending") return err(409, "Someone else answered first.", "taken");
  r.status = "answered"; r.answer = a; r.reviewer = wallet; r.answeredAt = Date.now();
  await setJSON(`review/${id}`, r, TTL.week); await del(`pending/${id}`);
  const idx = (await getJSON(`reviewer/${wallet}`)) || []; idx.push(id); await setJSON(`reviewer/${wallet}`, idx.slice(-50), TTL.week);
  // The reviewer needs a USDC account to be paid; the sponsor wallet opens it if needed.
  let account = "ok";
  try { const e = await ensureUsdcAccount(new PublicKey(wallet)); if (!e.ok) account = "missing"; } catch (e) { account = "unknown"; }
  return json(200, { ok: true, review: pub(r), account });
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight();
  const url = new URL(req.url), parts = url.pathname.split("/").filter(Boolean); // api, reviews, id?, action?
  const id = (parts[2] || "").slice(0, 40);
  try {
    if (req.method === "GET" && parts.length === 2) return await list(url);
    if (req.method === "GET" && parts[3] === "image") return await image(id);
    if (req.method === "GET" && parts.length === 3) { const r = await reviewState(id); return r ? json(200, pub(r)) : err(404, "Unknown review.", "no_review"); }
    if (req.method === "POST" && parts[3] === "answer") return await answer(req, id);
    return err(404, "Not found", "not_found");
  } catch (e) {
    console.error("reviews", e && e.message);
    return err(502, "Something went wrong: " + String(e.message || e).slice(0, 120), "server");
  }
};
export const config = { path: ["/api/reviews", "/api/reviews/:id", "/api/reviews/:id/:action"] };
