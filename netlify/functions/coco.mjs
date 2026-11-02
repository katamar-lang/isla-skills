/* Coco's wallet service. Coco is one shared robot; its devnet key lives only here, in the
   Netlify environment variable COCO_SECRET_KEY.
     GET  /api/coco      -> Coco's address, balance, today's budget, photo limits
     POST /api/coco/pay  -> Coco signs an x402 payment for a skill, if it passes every rule:
        known skill, the skill's own wallet (never Coco's), the listed price, today's budget. */
import { SKILLS, NETWORK, USDC_MINT, json, preflight, today, visitorId, COCO_DAILY_BUDGET, PHOTOS_PER_DAY, PHOTOS_PER_VISITOR, PAYMENTS_PER_VISITOR, FACILITATOR } from "../lib/config.mjs";
import { cocoKeypair, sponsorKeypair, connection, ataOf, usdcUnits, isAddress, ensureUsdcAccount, transferCheckedIx, cuLimitIx, cuPriceIx, PublicKey, Transaction } from "../lib/solana.mjs";
import { facilitatorFeePayer, isLocal } from "../lib/x402.mjs";
import { getJSON, bump, count } from "../lib/store.mjs";
import { reviewState, skillInfo } from "./skills.mjs";

const err = (status, error, code, extra = {}) => json(status, { error, code, ...extra });

async function status(req, context) {
  const k = cocoKeypair(), day = today(), vid = visitorId(req, context);
  const [spent, photos, mine] = await Promise.all([count(`coco/spent/${day}`), count(`photos/${day}`), count(`photos/${day}/${vid}`)]);
  let balance = null;
  if (k) balance = await usdcUnits(k.publicKey).catch(() => null);
  return json(200, {
    address: k ? k.publicKey.toBase58() : null, usdcUnits: balance,
    sponsorAddress: sponsorKeypair() ? sponsorKeypair().publicKey.toBase58() : null, // public, so the owner can send it devnet SOL
    budget: { day, limitUnits: COCO_DAILY_BUDGET(), spentUnits: spent },
    photos: { today: photos, limit: PHOTOS_PER_DAY(), yours: mine, perVisitor: PHOTOS_PER_VISITOR() },
    facilitator: isLocal() ? "local (this server, plan B)" : FACILITATOR(),
    ready: { coco: !!k, ai: !!process.env.ANTHROPIC_API_KEY, sponsor: !!sponsorKeypair() },
    skills: Object.keys(SKILLS).map(skillInfo)
  });
}

async function pay(req, context) {
  const k = cocoKeypair();
  if (!k) return err(503, "Coco's wallet isn't set up on the server yet (COCO_SECRET_KEY).", "no_coco");
  let body; try { body = await req.json(); } catch (e) { return err(400, "Send JSON.", "bad_json"); }
  const skill = String(body && body.skill || ""), r = body && body.requirements;
  if (!Object.hasOwn(SKILLS, skill) || !r || typeof r !== "object") return err(400, "Unknown skill or missing paymentRequirements.", "bad_request");

  // 1. The request must be exactly what this skill costs, paid to this skill's wallet.
  const url = new URL(req.url);
  if (r.scheme !== "exact" || r.network !== NETWORK || r.asset !== USDC_MINT) return err(400, "Coco only pays USDC on Solana devnet (x402 exact).", "wrong_kind");
  if (r.resource !== url.origin + "/api/skills/" + skill) return err(400, "Coco only pays skills from this store.", "wrong_resource");
  if (String(r.maxAmountRequired) !== String(SKILLS[skill].price)) return err(400, `Coco refuses: ${SKILLS[skill].name} costs ${SKILLS[skill].price / 1e6} USDC.`, "wrong_price");
  let payTo;
  if (skill === "human-reviewer") {
    const rv = await reviewState(String(body.reviewId || "").slice(0, 40));
    if (!rv || rv.status !== "answered" || rv.reviewer !== r.payTo) return err(400, "Coco only pays a reviewer who answered this review.", "wrong_reviewer");
    payTo = rv.reviewer;
  } else payTo = SKILLS[skill].wallet();
  if (r.payTo !== payTo || !isAddress(payTo)) return err(400, "Coco only pays the skill's own wallet.", "wrong_wallet");
  if (payTo === k.publicKey.toBase58()) return err(400, "Coco never pays itself.", "self_payment");
  const feePayer = await facilitatorFeePayer();
  if (!r.extra || r.extra.feePayer !== feePayer) return err(400, "Unknown fee payer.", "wrong_fee_payer");

  // 2. Limits: per visitor, then Coco's daily budget (the hard stop).
  const day = today(), vid = visitorId(req, context), amount = SKILLS[skill].price;
  if ((await count(`coco/pays/${day}/${vid}`)) >= PAYMENTS_PER_VISITOR()) return err(429, "You've reached today's number of payments for your visits. Come back tomorrow.", "visitor_payment_limit");
  const spent = await count(`coco/spent/${day}`), limit = COCO_DAILY_BUDGET();
  if (spent + amount > limit) return err(402, `Coco stopped: today's budget of ${limit / 1e6} USDC is used up (${spent / 1e6} spent). It starts again tomorrow (UTC).`, "budget_used_up", { spentUnits: spent, limitUnits: limit });

  // 3. Money and accounts on Solana.
  const have = await usdcUnits(k.publicKey);
  if (have < amount) return err(402, "Coco's wallet is out of USDC. Top it up from your wallet.", "coco_empty", { usdcUnits: have });
  const dest = new PublicKey(payTo);
  const acct = await ensureUsdcAccount(dest);
  if (!acct.ok) return err(409, `${skill === "human-reviewer" ? "The reviewer" : SKILLS[skill].name}'s wallet has no USDC account yet, and the server has no sponsor wallet to open it.`, "no_usdc_account");

  // 4. Sign: compute budget + one USDC transfer, the facilitator pays the network fee.
  const t = new Transaction().add(cuLimitIx(60000), cuPriceIx(1), transferCheckedIx(ataOf(k.publicKey), ataOf(dest), k.publicKey, amount));
  t.feePayer = new PublicKey(feePayer);
  t.recentBlockhash = (await connection().getLatestBlockhash()).blockhash;
  t.partialSign(k);
  await Promise.all([bump(`coco/spent/${day}`, amount), bump(`coco/pays/${day}/${vid}`)]);
  const payment = { x402Version: 1, scheme: "exact", network: NETWORK, payload: { transaction: t.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64") } };
  return json(200, { payment: Buffer.from(JSON.stringify(payment)).toString("base64"), amount, payTo, budget: { spentUnits: spent + amount, limitUnits: limit } });
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight();
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (req.method === "GET" && path === "/api/coco") return await status(req, context);
    if (req.method === "POST" && path === "/api/coco/pay") return await pay(req, context);
    return err(404, "Not found", "not_found");
  } catch (e) {
    console.error("coco", e && e.message);
    return err(502, "Coco's wallet couldn't reach Solana devnet or the facilitator: " + String(e.message || e).slice(0, 120), "network");
  }
};
export const config = { path: ["/api/coco", "/api/coco/pay"] };
