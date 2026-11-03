/* Shared settings for the Isla Skills server. Secrets only come from environment variables. */
export const NETWORK = "solana-devnet";
export const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Circle devnet USDC
export const USDC_DECIMALS = 6;
export const RPC_URL = () => process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const FACILITATOR = () => (process.env.X402_FACILITATOR_URL || "https://facilitator.ultravioletadao.xyz").replace(/\/+$/, "");
export const int = (name, def) => { const v = parseInt(process.env[name] || "", 10); return v > 0 ? v : def; };

// Coco's daily spending budget (USDC base units) and the limits that protect the Claude bill.
export const COCO_DAILY_BUDGET = () => int("COCO_DAILY_BUDGET_UNITS", 1_000_000);   // 1 USDC
export const PHOTOS_PER_DAY = () => int("PHOTOS_PER_DAY", 100);                        // all visitors together
export const PHOTOS_PER_VISITOR = () => int("PHOTOS_PER_VISITOR_PER_DAY", 5);
export const PAYMENTS_PER_VISITOR = () => int("COCO_PAYMENTS_PER_VISITOR_PER_DAY", 40);
export const REVIEW_SECONDS = 20; // how long a robot waits for a person

/* The skills. Each one is an independent service with its own payout wallet, never Coco's.
   Set the payout wallets in Netlify (LITTER_SPOTTER_WALLET, CLEANUP_PLANNER_WALLET). The Human
   Reviewer is paid to whichever person answers the review. */
export const SKILLS = {
  "litter-spotter": {
    name: "Litter Spotter", kind: "AI", price: 10_000, // 0.01 USDC
    wallet: () => process.env.LITTER_SPOTTER_WALLET || "LdnKQSmuMQTYUuHESv8c1Vshd3KSxXs5j7BHsS96WJZ",
    does: "Looks at a photo, says which room of the villa it shows, and lists the litter it sees with a confidence for each item."
  },
  "human-reviewer": {
    name: "Human Reviewer", kind: "Person", price: 5_000, // 0.005 USDC
    wallet: null,
    does: "A real person answers when the AI isn't sure, from anywhere, and gets paid for each review."
  },
  "cleanup-planner": {
    name: "Cleanup Planner", kind: "Planner", price: 2_000, // 0.002 USDC
    wallet: () => process.env.CLEANUP_PLANNER_WALLET || "F7KdtphCEnvnuBtkfDd2Wa9JkUznqAuaK9D5BPFXMX6X",
    does: "Turns the litter list into a cleanup plan: order, recycling bins, time and % recyclable."
  }
};
export const today = () => new Date().toISOString().slice(0, 10); // UTC day
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "X-PAYMENT, Content-Type",
  "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE"
};
export const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra } });
export const preflight = () => new Response(null, { status: 204, headers: CORS });
/* The visitor's IP is only used, hashed with the day, to count photos per visitor. */
import { createHash } from "node:crypto";
export function visitorId(req, context) {
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  return createHash("sha256").update(today() + ":" + ip).digest("hex").slice(0, 24);
}
