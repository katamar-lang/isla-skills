/* Solana helpers: keys from environment variables, USDC instructions (same bytes as the page,
   checked against @solana/spl-token), and the devnet connection. */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { RPC_URL, USDC_MINT, USDC_DECIMALS } from "./config.mjs";
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const COMPUTE_BUDGET = new PublicKey("ComputeBudget111111111111111111111111111111");
export const MINT = new PublicKey(USDC_MINT);

let conn = null;
export function setConnection(c) { conn = c; }
export function connection() { return conn || (conn = new Connection(RPC_URL(), "confirmed")); }

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s) {
  let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== "1") break; out.unshift(0); }
  return Uint8Array.from(out);
}
/* Reads a secret key from an environment variable. Accepts the [ ... ] list of 64 numbers (what
   scripts/new-keys.mjs prints) or a base58 string (a wallet export). Forgiving: the variable name,
   "=", quotes, spaces and line breaks around it are ignored. Errors say what is wrong but never
   include any part of the key. */
export function parseSecretKey(name, value) {
  let raw = String(value || "").trim();
  if (!raw) return null;
  const at = raw.indexOf(name + "=");
  if (at >= 0) raw = raw.slice(at + name.length + 1);
  raw = raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  let bytes;
  if (raw.includes("[")) {
    const end = raw.indexOf("]", raw.indexOf("["));
    if (end < 0) throw new Error(name + " has a [ but no closing ]: the value looks cut off. Paste it again, from [ to ]");
    const nums = raw.slice(raw.indexOf("[") + 1, end).split(",").map(x => x.trim()).filter(Boolean);
    if (!nums.every(x => /^\d{1,3}$/.test(x) && Number(x) <= 255)) throw new Error(name + " has something that isn't a number between [ and ]. Paste it again, from [ to ]");
    if (nums.length !== 64) throw new Error(name + " has " + nums.length + " numbers between [ and ], it needs 64: the value looks cut off. Paste it again, from [ to ]");
    bytes = Uint8Array.from(nums.map(Number));
  } else {
    const compact = raw.replace(/\s+/g, "");
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(compact)) throw new Error(name + " isn't a [ ... ] list of 64 numbers or a base58 key. Paste only the part from [ to ]");
    bytes = b58decode(compact);
    if (bytes.length !== 64) throw new Error(name + " looks like an address or a short key (" + bytes.length + " bytes), not a 64-byte secret key. Paste the [ ... ] part");
  }
  try { return Keypair.fromSecretKey(bytes); }
  catch (e) { throw new Error(name + " has 64 numbers but they don't form a valid key: copy it again from the script output"); }
}
export function keypairFromEnv(name) { return parseSecretKey(name, process.env[name]); }
let coco, sponsor;
export const cocoKeypair = () => (coco === undefined ? (coco = keypairFromEnv("COCO_SECRET_KEY")) : coco);
export const sponsorKeypair = () => (sponsor === undefined ? (sponsor = keypairFromEnv("SPONSOR_SECRET_KEY")) : sponsor);
export function resetKeys() { coco = undefined; sponsor = undefined; }

export const isAddress = a => { try { return typeof a === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && !!new PublicKey(a); } catch (e) { return false; } };
export const ataOf = owner => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), MINT.toBuffer()], ATA_PROGRAM)[0];
export function createAtaIdempotentIx(payer, ata, owner) {
  return new TransactionInstruction({ programId: ATA_PROGRAM, data: Buffer.from([1]), keys: [
    { pubkey: payer, isSigner: true, isWritable: true }, { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false }, { pubkey: MINT, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false }] });
}
export function transferCheckedIx(src, dst, owner, amount) {
  const data = Buffer.alloc(10); data[0] = 12; data.writeBigUInt64LE(BigInt(amount), 1); data[9] = USDC_DECIMALS;
  return new TransactionInstruction({ programId: TOKEN_PROGRAM, data, keys: [
    { pubkey: src, isSigner: false, isWritable: true }, { pubkey: MINT, isSigner: false, isWritable: false },
    { pubkey: dst, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false }] });
}
export function cuLimitIx(units) { const d = Buffer.alloc(5); d[0] = 2; d.writeUInt32LE(units, 1); return new TransactionInstruction({ programId: COMPUTE_BUDGET, keys: [], data: d }); }
export function cuPriceIx(micro) { const d = Buffer.alloc(9); d[0] = 3; d.writeBigUInt64LE(BigInt(micro), 1); return new TransactionInstruction({ programId: COMPUTE_BUDGET, keys: [], data: d }); }
/* Waits for a transaction by asking every 500 ms (HTTP only). Websockets, which web3.js uses by
   default, are unreliable in serverless functions. */
export async function confirm(sig, ms = 20000) {
  const c = connection(), until = Date.now() + ms;
  while (Date.now() < until) {
    const st = (await c.getSignatureStatuses([sig])).value[0];
    if (st && st.err) throw new Error("transaction failed: " + JSON.stringify(st.err).slice(0, 80));
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("transaction not confirmed in time");
}
export async function usdcUnits(owner) {
  try { const r = await connection().getTokenAccountBalance(ataOf(owner)); return Number(r.value.amount); } catch (e) { return 0; }
}
/* Opens someone's USDC account, paid by the sponsor wallet (if configured). Coco has no SOL. */
export async function ensureUsdcAccount(owner) {
  const ata = ataOf(owner);
  if (await connection().getAccountInfo(ata)) return { ok: true, created: false };
  const sp = sponsorKeypair();
  if (!sp) return { ok: false };
  const c = connection(), bh = await c.getLatestBlockhash();
  const t = new Transaction({ feePayer: sp.publicKey, recentBlockhash: bh.blockhash }).add(createAtaIdempotentIx(sp.publicKey, ata, owner));
  t.sign(sp);
  const sig = await c.sendRawTransaction(t.serialize());
  await confirm(sig);
  return { ok: true, created: true, sig };
}
export { PublicKey, Transaction, Keypair };
