/* Public usage numbers, read from Solana devnet (not from any browser): every USDC payment that
   left Coco's wallet. Photos analyzed = paid Litter Spotter calls.
   Always fast: the totals are saved (stats/state) and refreshed at most once a minute, or right
   after a payment (stats/dirty). A refresh only reads the payments newer than the last one it saw,
   every Solana call has a time limit, and if Solana is slow or down the last known numbers are
   returned (stale: true) instead of an error. */
import { SKILLS, json, preflight } from "../lib/config.mjs";
import { cocoKeypair, connection, ataOf, PublicKey } from "../lib/solana.mjs";
import { getJSON, setJSON, del } from "../lib/store.mjs";

const FRESH_MS = 60_000, CALL_MS = 4000, REFRESH_MS = 7000, BATCH = 25;
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " timed out")), ms))]);

function empty(coco) {
  return { ready: true, coco, newest: null, photos: 0, paidCalls: 0, paidUnits: 0, reviewers: 0, reviewerAtas: [],
    perSkill: Object.fromEntries(Object.keys(SKILLS).map(id => [id, { calls: 0, units: 0, wallet: SKILLS[id].wallet ? SKILLS[id].wallet() : null }])) };
}

/* Adds the payments newer than state.newest to the totals. */
export async function refresh(state, coco) {
  const c = connection(), source = ataOf(coco).toBase58();
  const s = state && state.coco === coco.toBase58() ? structuredClone(state) : empty(coco.toBase58());
  const byAta = {};
  for (const [id, sk] of Object.entries(SKILLS)) if (sk.wallet) { byAta[ataOf(new PublicKey(sk.wallet())).toBase58()] = id; s.perSkill[id].wallet = sk.wallet(); }
  const opts = { limit: 1000 }; if (s.newest) opts.until = s.newest;
  const sigs = (await timeout(c.getSignaturesForAddress(new PublicKey(source), opts), CALL_MS, "Solana (signatures)")).filter(x => !x.err);
  const reviewers = new Set(s.reviewerAtas || []);
  for (let i = 0; i < sigs.length; i += BATCH) {
    const txs = await timeout(c.getParsedTransactions(sigs.slice(i, i + BATCH).map(x => x.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" }), CALL_MS, "Solana (transactions)");
    for (const tx of txs) {
      if (!tx || tx.meta?.err) continue;
      for (const ix of tx.transaction.message.instructions) {
        const p = ix.parsed;
        if (ix.program !== "spl-token" || !p || !["transferChecked", "transfer"].includes(p.type) || p.info.source !== source) continue;
        const units = Number(p.info.tokenAmount ? p.info.tokenAmount.amount : p.info.amount) || 0;
        const id = byAta[p.info.destination] || "human-reviewer";
        s.perSkill[id].calls++; s.perSkill[id].units += units;
        if (id === "human-reviewer") reviewers.add(p.info.destination);
      }
    }
  }
  if (sigs.length) s.newest = sigs[0].signature;
  s.reviewerAtas = [...reviewers].slice(-5000);
  s.reviewers = reviewers.size;
  const all = Object.values(s.perSkill);
  s.photos = s.perSkill["litter-spotter"].calls;
  s.paidCalls = all.reduce((a, x) => a + x.calls, 0);
  s.paidUnits = all.reduce((a, x) => a + x.units, 0);
  s.updatedAt = Date.now();
  return s;
}

const publicView = s => { const { reviewerAtas, newest, ...rest } = s; return rest; };

export default async req => {
  if (req.method === "OPTIONS") return preflight();
  const k = cocoKeypair();
  if (!k) return json(200, { ready: false });
  const [state, dirty] = await Promise.all([getJSON("stats/state").catch(() => null), getJSON("stats/dirty").catch(() => null)]);
  const mine = state && state.coco === k.publicKey.toBase58() ? state : null;
  if (mine && !dirty && Date.now() - mine.updatedAt < FRESH_MS) return json(200, publicView(mine));
  try {
    const next = await timeout(refresh(mine, k.publicKey), REFRESH_MS, "Solana");
    await setJSON("stats/state", next).catch(() => {});
    if (dirty) await del("stats/dirty").catch(() => {});
    return json(200, publicView(next));
  } catch (e) {
    const why = String(e.message || e).slice(0, 100);
    if (mine) return json(200, { ...publicView(mine), stale: true, error: why });
    return json(200, { ready: false, stale: true, error: why });
  }
};
export const config = { path: "/api/stats" };
