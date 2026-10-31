/* Small key-value storage for reviews, budget and counters.
   - On Vercel: Upstash Redis (free plan), through its REST API, no extra package. Vercel's Upstash
     integration sets KV_REST_API_URL + KV_REST_API_TOKEN (Upstash itself: UPSTASH_REDIS_REST_URL/_TOKEN).
   - On Netlify (no Redis variables): Netlify Blobs.
   Tests replace it with an in-memory store through setStore(). */
let impl = null;
export function setStore(s) { impl = s; }

const redisUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DAY = 86400;

export function redisStore(url, token, fetchImpl = globalThis.fetch) {
  async function cmd(...args) {
    const r = await fetchImpl(url.replace(/\/+$/, ""), { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(args.map(String)), signal: AbortSignal.timeout(6000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error("storage: " + (j.error || "HTTP " + r.status));
    return j.result;
  }
  return {
    async get(k, o) { const v = await cmd("GET", k); if (v == null) return null; return o && o.type === "json" ? JSON.parse(v) : v; },
    async setJSON(k, v, o = {}) { await (o.ttl ? cmd("SET", k, JSON.stringify(v), "EX", o.ttl) : cmd("SET", k, JSON.stringify(v))); },
    async delete(k) { await cmd("DEL", k); },
    async incr(k, by, o = {}) { const v = await cmd("INCRBY", k, by); if (o.ttl) await cmd("EXPIRE", k, o.ttl); return Number(v); },
    async list(o = {}) {
      const keys = []; let cursor = "0";
      do { const [next, batch] = await cmd("SCAN", cursor, "MATCH", (o.prefix || "") + "*", "COUNT", 200); cursor = String(next); keys.push(...batch); } while (cursor !== "0" && keys.length < 1000);
      return { blobs: [...new Set(keys)].map(key => ({ key })) };
    }
  };
}

export async function db() {
  if (impl) return impl;
  if (redisUrl() && redisToken()) return (impl = redisStore(redisUrl(), redisToken()));
  const { getStore } = await import("@netlify/blobs");
  return (impl = getStore({ name: "isla-skills", consistency: "strong" }));
}
export async function getJSON(key) { return (await (await db()).get(key, { type: "json" })) ?? null; }
/* ttl (seconds) is used by Redis to clean up old data; Netlify Blobs ignores it. */
export async function setJSON(key, value, ttl) { await (await db()).setJSON(key, value, ttl ? { ttl } : undefined); }
export async function del(key) { await (await db()).delete(key); }
export async function list(prefix) { return (await (await db()).list({ prefix })).blobs.map(b => b.key); }
/* Counters. Redis adds atomically; Blobs reads and writes (fine for a demo: the money in Coco's
   wallet is the hard limit). Daily counters expire after two days. */
export async function bump(key, by = 1) {
  const s = await db();
  if (s.incr) return s.incr(key, by, { ttl: 2 * DAY });
  const v = ((await getJSON(key)) || 0) + by; await setJSON(key, v); return v;
}
export async function count(key) { return Number(await getJSON(key)) || 0; }
export const TTL = { day: DAY, week: 7 * DAY };

export function memoryStore() {
  const m = new Map();
  return {
    m,
    async get(k, o) { if (!m.has(k)) return null; const v = m.get(k); return o && o.type === "json" ? JSON.parse(v) : v; },
    async set(k, v) { m.set(k, v); }, async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list(o = {}) { return { blobs: [...m.keys()].filter(k => k.startsWith(o.prefix || "")).map(key => ({ key })) }; }
  };
}
