/* Public usage numbers, read from Solana devnet (not from any browser): every USDC payment that
   left Coco's wallet. Photos analyzed = paid Litter Spotter calls.
   Always fast and never counts a payment twice:
   - the totals are worked out from a saved list of the payments already read (stats/state → tx,
     one entry per transaction signature), so reading the same transaction twice changes nothing;
   - new signatures go into a queue; each request reads a few of them, one transaction per call
     (the public devnet RPC refuses a batch of 25 with "Too many requests for a specific RPC
     call"), for at most ~5 s, then saves its progress. The next request carries on.
   - refreshed at most once a minute, or right after a payment (stats/dirty), or while the queue
     is not empty. If Solana is slow or down, the last known numbers come back (stale: true). */
import { SKILLS, json, preflight } from "../lib/config.mjs";
import { cocoKeypair, connection, ataOf, PublicKey } from "../lib/solana.mjs";
import { getJSON, setJSON, del } from "../lib/store.mjs";

const FRESH_MS = 60_000, CALL_MS = 3000, TX_MS = 2500, WORK_MS = 4000, MAX_QUEUE = 2000; // worst case ≈ 4 + 2.5 s
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " timed out")), ms))]);

function empty(coco) { return { coco, newest: null, queue: [], tx: {} }; }

/* Totals from the list of payments read so far. */
export function totals(s) {
  const perSkill = Object.fromEntries(Object.keys(SKILLS).map(id => [id, { calls: 0, units: 0, wallet: SKILLS[id].wallet ? SKILLS[id].wallet() : null }]));
  const reviewers = new Set();
  for (const transfers of Object.values(s.tx || {})) for (const [id, units, dest] of transfers) {
    const k = perSkill[id] ? id : "human-reviewer";
    perSkill[k].calls++; perSkill[k].units += units;
    if (k === "human-reviewer") reviewers.add(dest);
  }
  const all = Object.values(perSkill);
  return { ready: true, coco: s.coco, photos: perSkill["litter-spotter"].calls, paidCalls: all.reduce((a, x) => a + x.calls, 0),
    paidUnits: all.reduce((a, x) => a + x.units, 0), reviewers: reviewers.size, perSkill,
    counting: (s.queue || []).length, updatedAt: s.updatedAt };
}

/* Reads new signatures into the queue, then works through the queue until the time is up. */
export async function refresh(state, coco, workMs = WORK_MS) {
  const started = Date.now();
  const c = connection(), source = ataOf(coco).toBase58();
  const s = state && state.coco === coco.toBase58() ? structuredClone(state) : empty(coco.toBase58());
  s.queue = s.queue || []; s.tx = s.tx || {};
  const byAta = {};
  for (const [id, sk] of Object.entries(SKILLS)) if (sk.wallet) byAta[ataOf(new PublicKey(sk.wallet())).toBase58()] = id;

  const opts = { limit: 1000 }; if (s.newest) opts.until = s.newest;
  const sigs = await timeout(c.getSignaturesForAddress(new PublicKey(source), opts), CALL_MS, "Solana (signatures)");
  if (sigs.length) s.newest = sigs[0].signature;
  const queued = new Set(s.queue);
  for (const x of sigs) if (!x.err && !queued.has(x.signature) && !(x.signature in s.tx)) s.queue.push(x.signature);
  s.queue = s.queue.slice(0, MAX_QUEUE);

  let error = null;
  while (s.queue.length && Date.now() - started < workMs) {
    const sig = s.queue[0];
    let tx;
    try { tx = await timeout(c.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }), TX_MS, "Solana (transaction)"); }
    catch (e) {
      // A transaction this client can't read (e.g. a newer version) can't be a payment Coco signed: skip it.
      if (/not supported by the requesting client/i.test(e.message)) { s.queue.shift(); continue; }
      error = e; break; // rate limit or slow: keep it in the queue for the next request
    }
    if (!tx) { s.queue.push(s.queue.shift()); break; } // not readable yet: try it again next time
    s.queue.shift();
    const transfers = [];
    if (!tx.meta?.err) for (const ix of tx.transaction.message.instructions) {
      const p = ix.parsed;
      if (ix.program !== "spl-token" || !p || !["transferChecked", "transfer"].includes(p.type) || p.info.source !== source) continue;
      const units = Number(p.info.tokenAmount ? p.info.tokenAmount.amount : p.info.amount) || 0;
      transfers.push([byAta[p.info.destination] || "human-reviewer", units, p.info.destination]);
    }
    s.tx[sig] = transfers; // also the transactions with no payment out (top-ups), so they are never read again
  }
  s.updatedAt = Date.now();
  return { state: s, error };
}

export default async req => {
  if (req.method === "OPTIONS") return preflight();
  const k = cocoKeypair();
  if (!k) return json(200, { ready: false });
  const [state, dirty] = await Promise.all([getJSON("stats/state").catch(() => null), getJSON("stats/dirty").catch(() => null)]);
  const mine = state && state.coco === k.publicKey.toBase58() && state.tx ? state : null; // older saved formats are read again
  if (mine && !dirty && !(mine.queue || []).length && Date.now() - mine.updatedAt < FRESH_MS) return json(200, totals(mine));
  try {
    const { state: next, error } = await refresh(mine, k.publicKey);
    await setJSON("stats/state", next).catch(() => {});
    if (dirty) await del("stats/dirty").catch(() => {});
    const out = totals(next);
    return json(200, error ? { ...out, stale: true, error: String(error.message || error).slice(0, 100) } : out);
  } catch (e) {
    const why = String(e.message || e).slice(0, 100);
    if (mine) return json(200, { ...totals(mine), stale: true, error: why });
    return json(200, { ready: false, stale: true, error: why });
  }
};
export const config = { path: "/api/stats" };
