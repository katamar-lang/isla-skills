/* Isla Skills store, x402 v1 on Solana devnet.
   GET /api/skills/:id
   - without X-PAYMENT: 402 with the payment requirements (who to pay, how much, in which token)
   - with X-PAYMENT (base64 JSON payment payload): the facilitator verifies and settles the
     payment, then the skill (task instructions as JSON) is returned with X-PAYMENT-RESPONSE.
   The facilitator URL is configurable with the X402_FACILITATOR_URL environment variable. */

const FACILITATOR = (process.env.X402_FACILITATOR_URL || "https://facilitator.ultravioletadao.xyz").replace(/\/+$/, "");
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const NETWORK = "solana-devnet";
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Circle devnet USDC, 6 decimals
const DEV_SHARE = 0.95; // 95% of the price goes to the developer, 5% stays with the community
const BOARD = "Gg46k4FaiuUm38UES1kTw6i3ySBBZp9BoqDhK7r4d5tu";
const TAG = "isla:v1:";
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/* Example skills. Same prices and payout addresses as SEED in index.html. */
export const CATALOG = {
  "1": { name: "Serve coffee", price: 0.002, wallet: "7EnzRoMpgCYThA4MXHx31d3u3kQzGzcNtJSsEZbzWog5",
    steps: ["Go to the kitchen", "Brew one cup of coffee", "Carry it to the co-working tables", "Come back to the dock"] },
  "2": { name: "Beach cleanup", price: 0.003, wallet: "4Zt8pisTsQpRNiv8jcfPKguNLYh25WGxvsNEZy3GFUc4",
    steps: ["Walk to the beach in front of the house", "Scan the sand for plastic and glass", "Pick up and sort the trash", "Empty the bags in the recycling bins"] },
  "3": { name: "Visitor guide", price: 0.002, wallet: "6baT8qi1o2wTNPDfrXDUtyiFyP66pwNra9VLPKBV25yk",
    steps: ["Wait at the entrance", "Welcome the new attendee", "Walk them to their room", "Show the house rules"] },
  "4": { name: "Demo Day timer", price: 0.004, wallet: "D2kBeezt5apTAKengXQRuZtsjao1bDCgXSYzBscpR88s",
    steps: ["Stand next to the stage", "Start a 3-minute timer for the pitch", "Show the time left", "Ring at 3 minutes"] }
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-PAYMENT, Content-Type",
  "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE"
};
const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra } });
const b64json = obj => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");

async function post(url, body, ms = 9000) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, body: j || {} };
}

let feePayerCache = null;
async function facilitatorFeePayer() {
  if (feePayerCache) return feePayerCache;
  const r = await fetch(FACILITATOR + "/supported", { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  const kinds = Array.isArray(d.kinds) ? d.kinds : Array.isArray(d) ? d : [];
  const k = kinds.find(x => x.network === NETWORK && x.scheme === "exact" && Number(x.x402Version) === 1);
  if (!k || !k.extra || !k.extra.feePayer) throw new Error("facilitator does not offer exact/solana-devnet");
  feePayerCache = k.extra.feePayer;
  return feePayerCache;
}

/* Community skills are memos on Solana devnet (see the board in index.html). id = "c" + first 10 chars of the signature. */
async function communitySkill(id) {
  const prefix = id.slice(1);
  const r = await post(RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [BOARD, { limit: 1000 }] }, 8000);
  const hit = (r.body.result || []).find(x => !x.err && x.signature.startsWith(prefix) && x.memo && x.memo.includes(TAG));
  if (!hit) return null;
  let txt = hit.memo.slice(hit.memo.indexOf(TAG) + TAG.length);
  const j = txt.lastIndexOf("}"); if (j < 0) return null;
  let d; try { d = JSON.parse(txt.slice(0, j + 1)); } catch (e) { return null; }
  const price = Number(d && d.p);
  if (!d || d.t !== "skill" || typeof d.n !== "string" || !d.n.trim() || d.n.length > 40) return null;
  if (!(price >= 0.002 && price <= 1) || typeof d.w !== "string" || !B58.test(d.w)) return null;
  return { name: d.n.trim(), price, wallet: d.w, steps: ["Read the task", "Do the task: " + d.n.trim(), "Check the result", "Report back"] };
}

export async function findSkill(id) {
  if (Object.hasOwn(CATALOG, id)) return CATALOG[id];
  if (/^c[1-9A-HJ-NP-Za-km-z]{10}$/.test(id)) return communitySkill(id);
  return null;
}

export function requirementsFor(id, skill, resource, feePayer) {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: String(Math.round(skill.price * DEV_SHARE * 1e6)),
    resource,
    description: "Isla Skills: " + skill.name,
    mimeType: "application/json",
    payTo: skill.wallet,
    maxTimeoutSeconds: 60,
    asset: USDC_MINT,
    extra: { feePayer }
  };
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json(405, { error: "Use GET" });

  const url = new URL(req.url);
  const id = decodeURIComponent((context && context.params && context.params.id) || url.pathname.split("/").filter(Boolean).pop() || "");
  let skill;
  try { skill = await findSkill(id); } catch (e) { return json(502, { error: "Couldn't read the skill from Solana devnet" }); }
  if (!skill) return json(404, { error: "Unknown skill: " + id });

  let feePayer;
  try { feePayer = await facilitatorFeePayer(); }
  catch (e) { return json(502, { error: "x402 facilitator unavailable: " + String(e.message || e).slice(0, 120), facilitator: FACILITATOR }); }

  const requirements = requirementsFor(id, skill, url.origin + url.pathname, feePayer);
  const paymentRequired = error => json(402, { x402Version: 1, error, accepts: [requirements] });

  const header = req.headers.get("x-payment");
  if (!header) return paymentRequired("X-PAYMENT header is required");

  let paymentPayload;
  try { paymentPayload = JSON.parse(Buffer.from(header, "base64").toString("utf8")); }
  catch (e) { return paymentRequired("X-PAYMENT is not valid base64 JSON"); }
  if (!paymentPayload || Number(paymentPayload.x402Version) !== 1 || paymentPayload.scheme !== "exact" ||
      paymentPayload.network !== NETWORK || !paymentPayload.payload || typeof paymentPayload.payload.transaction !== "string")
    return paymentRequired("X-PAYMENT must be an x402 v1 exact payment on " + NETWORK);

  const body = { x402Version: 1, paymentPayload, paymentRequirements: requirements };
  let v, s;
  try { v = await post(FACILITATOR + "/verify", body); }
  catch (e) { return json(502, { error: "Facilitator /verify did not answer: " + String(e.message || e).slice(0, 120), facilitator: FACILITATOR }); }
  if (!v.ok || v.body.isValid === false)
    return paymentRequired("Facilitator /verify: " + (v.body.invalidReason || v.body.error || v.body.errorReason || "HTTP " + v.status));

  try { s = await post(FACILITATOR + "/settle", body, 20000); }
  catch (e) { return json(502, { error: "Facilitator /settle did not answer: " + String(e.message || e).slice(0, 120), facilitator: FACILITATOR }); }
  const transaction = s.body.transaction || s.body.transactionHash || s.body.txHash;
  if (!s.ok || !s.body.success || !transaction)
    return paymentRequired("Facilitator /settle: " + (s.body.errorReason || s.body.error || "HTTP " + s.status));

  const settlement = { success: true, transaction, network: NETWORK, payer: s.body.payer || v.body.payer || null };
  return json(200, {
    skill: { id, name: skill.name, version: 1, steps: skill.steps },
    paid: { amount: requirements.maxAmountRequired, asset: USDC_MINT, payTo: skill.wallet, transaction }
  }, { "X-PAYMENT-RESPONSE": b64json(settlement) });
};

export const config = { path: "/api/skills/:id" };
