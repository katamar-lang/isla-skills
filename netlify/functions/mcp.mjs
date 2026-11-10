/* MCP server for agents (Model Context Protocol, Streamable HTTP, JSON responses, no session).
     POST /mcp  JSON-RPC 2.0: initialize, ping, tools/list, tools/call (single message or a batch)
   Read-only tools: they never pay and never spend Coco's budget. To *use* a skill, an agent calls
   POST /api/skills/:id and pays with its own wallet over x402 (see /.well-known/agent-skills/isla-skills/SKILL.md).
   Card: /.well-known/mcp/server-card.json */
import { SKILLS, CORS } from "../lib/config.mjs";
import { skillInfo } from "./skills.mjs";
import coco from "./coco.mjs";
import stats from "./stats.mjs";

export const SERVER_INFO = { name: "isla-skills", title: "Isla Skills", version: "1.0.0" };
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS = "Isla Skills is an app store for robot skills, paid per use in devnet USDC on Solana with x402. " +
  "These tools are read-only. To call a skill, POST /api/skills/{id}: it answers 402 with the price and the maker's wallet; " +
  "pay with your own devnet wallet in the X-PAYMENT header. Devnet only: test USDC, never real money.";
const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const skillIds = Object.keys(SKILLS);

export const TOOLS = [
  { name: "list_skills", title: "List skills",
    description: "All skills in the store: id, name, kind (AI, Person, Planner), what it does, price per call in USDC and the maker's payout wallet.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { title: "List skills", ...ro } },
  { name: "get_skill", title: "Get a skill and how to pay for it",
    description: "One skill's details, its endpoint, the request body it expects, and the x402 steps to call and pay for it.",
    inputSchema: { type: "object", properties: { skill_id: { type: "string", enum: skillIds } }, required: ["skill_id"], additionalProperties: false },
    annotations: { title: "Get a skill", ...ro } },
  { name: "get_coco_wallet", title: "Coco's wallet",
    description: "Robot #1 (Coco): its Solana devnet address, USDC balance, today's spending against its daily budget, and photo limits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { title: "Coco's wallet", ...ro } },
  { name: "get_usage_stats", title: "Usage read from Solana",
    description: "Public numbers read from Solana devnet: photos analyzed, paid skill calls, USDC paid to skill makers, people paid for reviews, per skill.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { title: "Usage stats", ...ro } }
];

const BODIES = {
  "litter-spotter": { image: "data:image/jpeg;base64,… (JPEG, PNG or WebP, at most about 650 KB; 5 photos per visitor a day)" },
  "cleanup-planner": { items: [{ type: "can", label: "soda can", count: 2, where: "table" }] },
  "human-reviewer": { spotId: "spotId from an unsure Litter Spotter result; then poll { reviewId } every 2 s (202 waiting, 402 once a person answered, 410 after 20 s)" }
};

async function callTool(name, args, req, context) {
  const origin = new URL(req.url).origin;
  const sub = path => new Request(origin + path, { method: "GET", headers: req.headers });
  if (name === "list_skills") return { skills: skillIds.map(skillInfo), network: "solana-devnet", currency: "USDC (devnet, 6 decimals)" };
  if (name === "get_skill") {
    const id = args && args.skill_id;
    if (!Object.hasOwn(SKILLS, id)) throw Object.assign(new Error("Unknown skill_id. Use one of: " + skillIds.join(", ")), { invalid: true });
    return { ...skillInfo(id), endpoint: origin + "/api/skills/" + id, method: "POST", body: BODIES[id],
      payment: { protocol: "x402", x402Version: 1, scheme: "exact", network: "solana-devnet", asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        steps: ["POST the body without payment: the answer is 402 with accepts[0] (maxAmountRequired, payTo, extra.feePayer).",
          "Sign one USDC transferChecked of maxAmountRequired to payTo with your devnet wallet (fee payer = extra.feePayer) and send the same request again with the base64 x402 payload in the X-PAYMENT header.",
          "200: result + X-PAYMENT-RESPONSE (the Solana transaction). If the skill fails, the payment is not settled."] },
      guide: origin + "/.well-known/agent-skills/isla-skills/SKILL.md" };
  }
  if (name === "get_coco_wallet") {
    const j = await (await coco(sub("/api/coco"), context)).json();
    return { address: j.address, usdcUnits: j.usdcUnits, usdc: j.usdcUnits == null ? null : j.usdcUnits / 1e6, budget: j.budget, photos: j.photos,
      facilitator: j.facilitator, ready: j.ready, network: "solana-devnet", note: "Devnet only: test USDC. Don't send real money." };
  }
  if (name === "get_usage_stats") return await (await stats(sub("/api/stats"), context)).json();
  throw Object.assign(new Error("Unknown tool: " + String(name).slice(0, 60)), { unknownTool: true });
}

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handle(msg, req, context) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg && msg.id, -32600, "Invalid Request");
  const { id, method, params = {} } = msg;
  if (id === undefined) return null; // a notification (e.g. notifications/initialized): no answer
  if (method === "initialize") {
    const v = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
    return ok(id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    try {
      const data = await callTool(params.name, params.arguments || {}, req, context);
      return ok(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false });
    } catch (e) {
      if (e.unknownTool) return fail(id, -32602, e.message);
      return ok(id, { content: [{ type: "text", text: String(e.message || e).slice(0, 300) }], isError: true });
    }
  }
  return fail(id, -32601, "Method not found: " + method.slice(0, 60));
}

const headers = { ...CORS, "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version", "Access-Control-Expose-Headers": "Mcp-Session-Id" };
const send = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { ...headers, ...(body == null ? {} : { "Content-Type": "application/json" }) } });

export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify(fail(null, -32000, "Use POST with JSON-RPC 2.0 (MCP Streamable HTTP). Card: /.well-known/mcp/server-card.json")),
    { status: 405, headers: { ...headers, Allow: "POST, OPTIONS", "Content-Type": "application/json" } });
  let body; try { body = await req.json(); } catch (e) { return send(400, fail(null, -32700, "Parse error")); }
  if (Array.isArray(body)) {
    if (!body.length) return send(400, fail(null, -32600, "Invalid Request"));
    const out = (await Promise.all(body.map(m => handle(m, req, context)))).filter(Boolean);
    return out.length ? send(200, out) : send(202, null);
  }
  const out = await handle(body, req, context);
  return out ? send(200, out) : send(202, null);
};
export const config = { path: "/mcp" };
