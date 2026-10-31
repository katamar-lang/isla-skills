/* Public usage numbers, read from Solana devnet (not from any browser): every USDC payment that
   left Coco's wallet. Photos analyzed = paid Litter Spotter calls. Cached for 30 seconds. */
import { SKILLS, json, preflight } from "../lib/config.mjs";
import { cocoKeypair, connection, ataOf, PublicKey } from "../lib/solana.mjs";
import { getJSON, setJSON } from "../lib/store.mjs";

export async function computeStats() {
  const k = cocoKeypair();
  if (!k) return { ready: false };
  const c = connection(), source = ataOf(k.publicKey).toBase58();
  const byAta = {};
  for (const [id, s] of Object.entries(SKILLS)) if (s.wallet) byAta[ataOf(new PublicKey(s.wallet())).toBase58()] = id;
  const sigs = (await c.getSignaturesForAddress(new PublicKey(source), { limit: 1000 })).filter(s => !s.err);
  const per = Object.fromEntries(Object.keys(SKILLS).map(id => [id, { calls: 0, units: 0, wallet: SKILLS[id].wallet ? SKILLS[id].wallet() : null }]));
  const reviewers = new Set();
  for (let i = 0; i < sigs.length; i += 100) {
    const txs = await c.getParsedTransactions(sigs.slice(i, i + 100).map(s => s.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    for (const tx of txs) {
      if (!tx || tx.meta?.err) continue;
      for (const ix of tx.transaction.message.instructions) {
        const p = ix.parsed;
        if (ix.program !== "spl-token" || !p || !["transferChecked", "transfer"].includes(p.type) || p.info.source !== source) continue;
        const units = Number(p.info.tokenAmount ? p.info.tokenAmount.amount : p.info.amount) || 0;
        const id = byAta[p.info.destination] || "human-reviewer";
        per[id].calls++; per[id].units += units;
        if (id === "human-reviewer") reviewers.add(p.info.destination);
      }
    }
  }
  const all = Object.values(per);
  return { ready: true, coco: k.publicKey.toBase58(), photos: per["litter-spotter"].calls, paidCalls: all.reduce((a, x) => a + x.calls, 0),
    paidUnits: all.reduce((a, x) => a + x.units, 0), perSkill: per, reviewers: reviewers.size, updatedAt: Date.now() };
}

export default async req => {
  if (req.method === "OPTIONS") return preflight();
  try {
    const cached = await getJSON("stats/cache");
    if (cached && Date.now() - cached.updatedAt < 30000) return json(200, cached);
    const s = await computeStats();
    if (s.ready) await setJSON("stats/cache", s);
    return json(200, s);
  } catch (e) {
    return json(502, { error: "Couldn't read Solana devnet: " + String(e.message || e).slice(0, 120) });
  }
};
export const config = { path: "/api/stats" };
