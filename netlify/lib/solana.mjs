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
/* Accepts a JSON array of 64 numbers (solana-keygen) or a base58 string (wallet export). */
export function keypairFromEnv(name) {
  const raw = (process.env[name] || "").trim();
  if (!raw) return null;
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : b58decode(raw);
  if (bytes.length !== 64) throw new Error(name + " must be a 64-byte secret key");
  return Keypair.fromSecretKey(bytes);
}
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
  await c.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
  return { ok: true, created: true, sig };
}
export { PublicKey, Transaction, Keypair };
