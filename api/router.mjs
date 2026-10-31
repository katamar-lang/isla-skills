/* Vercel entry point. vercel.json rewrites every /api/<path> here as /api/router?p=<path>, and this
   file hands the request to the same handlers Netlify uses (netlify/functions/*.mjs), with the
   original URL, so the x402 "resource" stays https://<site>/api/skills/<id>. */
import skills from "../netlify/functions/skills.mjs";
import coco from "../netlify/functions/coco.mjs";
import reviews from "../netlify/functions/reviews.mjs";
import stats from "../netlify/functions/stats.mjs";
import { json } from "../netlify/lib/config.mjs";

const routes = { skills, coco, reviews, stats };

export async function route(request) {
  const url = new URL(request.url);
  const path = (url.searchParams.get("p") || "").replace(/^\/+|\/+$/g, "");
  url.searchParams.delete("p");
  const parts = path.split("/").filter(Boolean);
  const handler = routes[parts[0]];
  if (!handler) return json(404, { error: "Not found", code: "not_found" });
  url.pathname = "/api/" + parts.join("/");
  const ip = (request.headers.get("x-real-ip") || (request.headers.get("x-forwarded-for") || "").split(",")[0]).trim();
  const body = ["GET", "HEAD", "OPTIONS"].includes(request.method) ? undefined : await request.arrayBuffer();
  const original = new Request(url.toString(), { method: request.method, headers: request.headers, body });
  return handler(original, { ip, params: { id: parts[1] } });
}
export const GET = route, POST = route, OPTIONS = route;
