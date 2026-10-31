/* Small key-value storage on Netlify Blobs (built into Netlify, no database to run).
   Tests replace it with an in-memory store through setStore(). */
import { getStore } from "@netlify/blobs";
let impl = null;
export function setStore(s) { impl = s; }
export function db() {
  if (!impl) impl = getStore({ name: "isla-skills", consistency: "strong" });
  return impl;
}
export async function getJSON(key) { return (await db().get(key, { type: "json" })) ?? null; }
export async function setJSON(key, value) { await db().setJSON(key, value); }
/* Read-modify-write counter. Blobs has no transactions; for a demo with a few visitors at a time
   this is fine, and every limit is also bounded by the money in Coco's wallet. */
export async function bump(key, by = 1) { const v = ((await getJSON(key)) || 0) + by; await setJSON(key, v); return v; }
export async function count(key) { return (await getJSON(key)) || 0; }
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
