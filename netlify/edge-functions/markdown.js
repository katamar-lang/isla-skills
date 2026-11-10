/* Markdown for agents: the same URL answers Markdown when the request asks for it
   (Accept: text/markdown), and the normal HTML page otherwise. Vary: Accept keeps the two cached apart.
   The Markdown files are index.md and review.md, served as static files too. */
const PAGES = { "/": "/index.md", "/index.html": "/index.md", "/review": "/review.md", "/review.html": "/review.md" };

/* true when the client prefers Markdown over HTML (q-values respected; equal → the one listed first) */
export function wantsMarkdown(accept) {
  if (!accept) return false;
  let md = null, html = null;
  accept.split(",").forEach((part, i) => {
    const [type, ...params] = part.trim().toLowerCase().split(";").map(s => s.trim());
    const qp = params.find(p => p.startsWith("q="));
    const q = qp ? parseFloat(qp.slice(2)) : 1;
    if (Number.isNaN(q)) return;
    if (type === "text/markdown" || type === "text/x-markdown") md = md || { q, i };
    if (type === "text/html" || type === "application/xhtml+xml") html = html || { q, i };
  });
  if (!md || md.q <= 0) return false;
  if (!html) return true;
  return md.q > html.q || (md.q === html.q && md.i < html.i);
}

export default async (request, context) => {
  const url = new URL(request.url);
  const md = PAGES[url.pathname];
  if (md && wantsMarkdown(request.headers.get("accept"))) {
    const res = await fetch(new URL(md, url.origin));
    if (res.ok) {
      const text = await res.text();
      return new Response(text, { status: 200, headers: {
        "Content-Type": "text/markdown; charset=utf-8", "Vary": "Accept", "Access-Control-Allow-Origin": "*",
        "Link": `<${url.pathname}>; rel="canonical"`, "X-Markdown-Tokens": String(Math.ceil(text.length / 4)) } });
    }
  }
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.append("Vary", "Accept");
  return out;
};
export const config = { path: ["/", "/index.html", "/review", "/review.html"] };
