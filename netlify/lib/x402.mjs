/* x402 v1, scheme "exact", on Solana devnet.
   Facilitator: a remote one (X402_FACILITATOR_URL, default Ultravioleta DAO) or, as plan B,
   X402_FACILITATOR_URL=local: this server checks and submits the payment itself, with the
   sponsor wallet (SPONSOR_SECRET_KEY, a little devnet SOL) paying the network fee. */
import { NETWORK, USDC_MINT, FACILITATOR, json } from "./config.mjs";
import { connection, confirm, sponsorKeypair, ataOf, isAddress, PublicKey, Transaction, TOKEN_PROGRAM, COMPUTE_BUDGET, MINT } from "./solana.mjs";

export const isLocal = () => FACILITATOR() === "local";
let feePayerCache = { url: null, value: null };
export function resetFacilitator() { feePayerCache = { url: null, value: null }; }

export async function facilitatorFeePayer() {
  if (isLocal()) { const s = sponsorKeypair(); if (!s) throw new Error("local facilitator needs SPONSOR_SECRET_KEY"); return s.publicKey.toBase58(); }
  if (feePayerCache.url === FACILITATOR() && feePayerCache.value) return feePayerCache.value;
  const r = await fetch(FACILITATOR() + "/supported", { signal: AbortSignal.timeout(6000) });
  const d = await r.json();
  const kinds = Array.isArray(d.kinds) ? d.kinds : Array.isArray(d) ? d : [];
  const k = kinds.find(x => x.network === NETWORK && x.scheme === "exact" && Number(x.x402Version) === 1);
  if (!k || !k.extra || !k.extra.feePayer) throw new Error("the facilitator does not offer exact payments on " + NETWORK);
  feePayerCache = { url: FACILITATOR(), value: k.extra.feePayer };
  return k.extra.feePayer;
}

export function requirements({ amount, payTo, resource, description, feePayer }) {
  return { scheme: "exact", network: NETWORK, maxAmountRequired: String(amount), resource, description,
    mimeType: "application/json", payTo, maxTimeoutSeconds: 60, asset: USDC_MINT, extra: { feePayer } };
}
export const paymentRequired = (reqs, error, extra = {}) => json(402, { x402Version: 1, error, accepts: [reqs], ...extra });

export function decodePayment(header) {
  let p; try { p = JSON.parse(Buffer.from(header, "base64").toString("utf8")); } catch (e) { return null; }
  if (!p || Number(p.x402Version) !== 1 || p.scheme !== "exact" || p.network !== NETWORK || !p.payload || typeof p.payload.transaction !== "string") return null;
  return p;
}

/* ---------- plan B: local verify + settle ---------- */
function inspect(paymentPayload, reqs) {
  let t;
  try { t = Transaction.from(Buffer.from(paymentPayload.payload.transaction, "base64")); } catch (e) { return { error: "invalid_transaction" }; }
  const sp = sponsorKeypair();
  if (!t.feePayer || !t.feePayer.equals(sp.publicKey)) return { error: "invalid_fee_payer" };
  let transfer = null;
  for (const ix of t.instructions) {
    if (ix.programId.equals(COMPUTE_BUDGET)) {
      if (ix.data[0] === 3 && ix.data.readBigUInt64LE(1) > 5_000_000n) return { error: "priority_fee_too_high" };
      continue;
    }
    if (ix.programId.equals(TOKEN_PROGRAM) && ix.data[0] === 12 && ix.data.length === 10 && !transfer) { transfer = ix; continue; }
    return { error: "unexpected_instruction" };
  }
  if (!transfer) return { error: "no_transfer" };
  const [src, mint, dst, owner] = transfer.keys.map(k => k.pubkey);
  if (!mint.equals(MINT)) return { error: "wrong_asset" };
  if (!isAddress(reqs.payTo) || !dst.equals(ataOf(new PublicKey(reqs.payTo)))) return { error: "wrong_recipient" };
  if (transfer.data.readBigUInt64LE(1) !== BigInt(reqs.maxAmountRequired)) return { error: "wrong_amount" };
  if (transfer.keys.some(k => k.pubkey.equals(sp.publicKey))) return { error: "fee_payer_in_transfer" };
  if (!src.equals(ataOf(owner))) return { error: "wrong_source" };
  const ownerSig = t.signatures.find(s => s.publicKey.equals(owner));
  if (!ownerSig || !ownerSig.signature) return { error: "missing_payer_signature" };
  return { t, owner: owner.toBase58() };
}
async function localVerify(paymentPayload, reqs) {
  const r = inspect(paymentPayload, reqs);
  if (r.error) return { isValid: false, invalidReason: r.error };
  const t = Transaction.from(r.t.serialize({ requireAllSignatures: false, verifySignatures: false }));
  t.partialSign(sponsorKeypair());
  if (!t.verifySignatures()) return { isValid: false, invalidReason: "invalid_signature" };
  const sim = await connection().simulateTransaction(t);
  if (sim.value.err) return { isValid: false, invalidReason: "simulation_failed: " + JSON.stringify(sim.value.err).slice(0, 80) };
  return { isValid: true, payer: r.owner };
}
async function localSettle(paymentPayload, reqs) {
  const r = inspect(paymentPayload, reqs);
  if (r.error) return { success: false, errorReason: r.error };
  r.t.partialSign(sponsorKeypair());
  const c = connection();
  const sig = await c.sendRawTransaction(r.t.serialize());
  try { await confirm(sig); } catch (e) { return { success: false, errorReason: String(e.message).slice(0, 80) }; }
  return { success: true, transaction: sig, network: NETWORK, payer: r.owner };
}

/* ---------- remote facilitator ---------- */
async function post(path, body, ms) {
  const r = await fetch(FACILITATOR() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, body: j || {} };
}
export async function verify(paymentPayload, reqs) {
  if (isLocal()) return localVerify(paymentPayload, reqs);
  const v = await post("/verify", { x402Version: 1, paymentPayload, paymentRequirements: reqs }, 8000);
  if (!v.ok || v.body.isValid === false) return { isValid: false, invalidReason: v.body.invalidReason || v.body.error || v.body.errorReason || "HTTP " + v.status };
  return { isValid: true, payer: v.body.payer };
}
export async function settle(paymentPayload, reqs) {
  if (isLocal()) return localSettle(paymentPayload, reqs);
  const s = await post("/settle", { x402Version: 1, paymentPayload, paymentRequirements: reqs }, 15000);
  const transaction = s.body.transaction || s.body.transactionHash || s.body.txHash;
  if (!s.ok || !s.body.success || !transaction) return { success: false, errorReason: s.body.errorReason || s.body.error || "HTTP " + s.status };
  return { success: true, transaction, network: NETWORK, payer: s.body.payer || null };
}
export const paymentResponseHeader = settled => Buffer.from(JSON.stringify(settled), "utf8").toString("base64");
