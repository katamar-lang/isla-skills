# Isla Skills · project context for Claude

Read this first, then [`docs/hackathon-plan.md`](docs/hackathon-plan.md) (the build spec and the goal: **win IslandHack v5**, entries close **Nov 11, 2026**). Where the two differ, the plan wins.

## What it is

Isla Skills is an **app store for robot skills**. Each skill is a **service** a robot calls and pays **per use**, in USDC on Solana, with **x402**. No human approves anything. Skills come from AI models and from people.

**Beach Patrol** is the demo: **Coco**, a *simulated* beach robot in Florianópolis (a phone or laptop camera plays its eyes), patrols with one photo and pays a chain of skills, each with its own payout wallet:

1. **Litter Spotter** (AI, Claude Haiku with vision) · 0.01 USDC
2. **Human Reviewer** (a real person, only when the AI is unsure) · 0.005 USDC to whoever answers
3. **Cleanup Planner** (rules) · 0.002 USDC

Pitch: "Robots are learning new skills through software, but there's no way to pay for a skill each time a robot uses it. Isla Skills is an app store for robot skills: each skill is a service the robot calls and pays per use, in USDC on Solana, with x402. No human approves anything. Skills can come from AI models and from people."

**Don't depend on Phantom.** Most people at the house use Solflare. Copy says "your Solana wallet (Solflare, Phantom, Backpack…)".

**Nothing on the page may be false.** There is no community vote and no 5% community share anymore (both removed Oct 31); 100% of each price goes to the skill's maker.

- Live demo: https://isla-skills-dao-2b40fb.netlify.app (reviewers: `/review`). **Hosting: Netlify** (the owner's team is on a paid Netlify plan since Nov 1, 2026). The code also runs on Vercel (free) as a fallback: `api/router.mjs` + `vercel.json` + Upstash Redis.
- **The owner has no money for paid APIs.** Litter Spotter needs an AI key: ask the hackathon organizers for credits, or use a free tier (decision pending).
- Everything runs on **Solana devnet** (test USDC).

## How the code is organised

No build step for the pages. The server is a set of handlers (Node, ES modules, Web `Request` → `Response`) in `netlify/functions/`. On **Vercel**, `api/router.mjs` is the only function: `vercel.json` rewrites `/api/<path>` to `/api/router?p=<path>` and the router calls the same handlers with the original URL and the visitor IP (`x-forwarded-for`). On Netlify they run as Netlify Functions directly.

| File | What it is |
|---|---|
| `index.html` | Beach Patrol: photo (upload, phone camera, "desk robot" webcam, optional samples in `assets/samples/beach-1..3.jpg`), patrol timeline, "Who pays whom", live usage numbers, top up Coco |
| `review.html` | "Earn by helping robots, from anywhere." Reviewer connects any Solana wallet, sees pending photos + the AI's question, answers with one tap, sees payments. Served at `/review` via `_redirects` |
| `wallet.js` | Shared wallet code (`window.IslaWallet`) on top of the **official Solana wallet adapter** ([anza-xyz/wallet-adapter](https://github.com/anza-xyz/wallet-adapter)) without React: `getWallets()` from `@wallet-standard/app` finds every Wallet Standard wallet, `StandardWalletAdapter` connects/signs/sends (`sendTransaction` picks `solana:devnet` from the connection's endpoint), and the **Mobile Wallet Adapter** (`registerMwa`) adds "Wallet app on this phone" on Android Chrome. Legacy injected providers are a fallback; a broken wallet is skipped. Also: picker, "Open in Solflare / Phantom / Backpack" links (iPhone), USDC instructions, `sendTx` (confirms by polling), plain-language errors |
| `wallet-adapter.min.js` | The official adapter pieces bundled with esbuild from `wallet-adapter/` (pinned versions, see its README). `@solana/web3.js` is not bundled: it points to `window.solanaWeb3`. Load order: `web3.min.js` → `wallet-adapter.min.js` → `wallet.js` |
| `style.css` | Shared styles (light/dark tokens) |
| `web3.min.js` | `@solana/web3.js@1.95.3` IIFE build **with a Buffer polyfill prepended**. Don't replace with the plain CDN build |
| `netlify/functions/skills.mjs` | The store: `GET /api/skills/:id` (info), `POST /api/skills/:id` → **402** with x402 v1 requirements; with `X-PAYMENT` → facilitator `/verify` (in parallel with the work) → `/settle` → result + `X-PAYMENT-RESPONSE`. If the work fails, the payment is never settled |
| `netlify/functions/coco.mjs` | Coco's wallet service: `GET /api/coco` (address, balance, budget, photo limits, readiness), `POST /api/coco/pay` (signs one payment if it passes every rule, below) |
| `netlify/functions/reviews.mjs` | `GET /api/reviews[?wallet=]`, `GET /api/reviews/:id`, `GET /api/reviews/:id/image`, `POST /api/reviews/:id/answer` |
| `netlify/functions/stats.mjs` | `GET /api/stats`: public numbers read from Solana (every USDC transfer out of Coco's USDC account), cached 30 s, cache cleared after each settled payment |
| `netlify/lib/*.mjs` | `config` (prices, limits, skill wallets), `store` (Netlify Blobs), `solana` (keys, USDC instructions, sponsor), `x402` (requirements, remote + local facilitator), `spotter` (Claude), `planner` |
| `api/router.mjs`, `vercel.json`, `.vercelignore` | Vercel: one function (maxDuration 30 s), static files copied to `public/` by `buildCommand`, `cleanUrls` serves `/review` |
| `scripts/new-keys.mjs` | The owner runs it **on her computer** to create `COCO_SECRET_KEY` and `SPONSOR_SECRET_KEY`. Never run it where the output is logged or shown in chat |

### The patrol, step by step (browser = Coco's body, server = Coco's wallet)

1. Page shrinks the photo (≤1024 px JPEG) and `POST /api/skills/litter-spotter {image}` → 402 (or 429 if a photo limit is reached, 503 if no AI key).
2. Page sends the 402 requirements to `POST /api/coco/pay` → base64 `X-PAYMENT`. Page retries the skill with it → 200 result.
3. If `result.unsure`: `POST /api/skills/human-reviewer {spotId}` → 202 `{reviewId}`; the page polls with `{reviewId}` every 2 s: 202 waiting, **402 once a person answered** (payTo = that person) → pay like any skill, **410 after 60 s** → Coco uses the AI guess and pays nothing. A late answer gets 410 too.
4. `POST /api/skills/cleanup-planner {items}` (with the human correction applied) → 402 → pay → plan.

### Coco's wallet rules (`/api/coco/pay`)

Known skill · `resource` = this store's `/api/skills/<id>` · exact/solana-devnet/devnet USDC · amount = listed price · `payTo` = the skill's wallet (for Human Reviewer: the person who answered that review, not yet paid) · never Coco's own address · fee payer = the facilitator's · ≤ 40 payments per visitor per day · **daily budget** (default 1 USDC, `coco/spent/<UTC day>` in Blobs, counted at signing time, so a failed settle still uses budget) · enough USDC. If the payee has no USDC account, the **sponsor wallet** opens it.

### Limits that protect the Claude bill

`PHOTOS_PER_DAY` (100) and `PHOTOS_PER_VISITOR_PER_DAY` (5), checked before the 402 and before calling Claude; a photo is counted before the AI call. Visitor = sha256(UTC day + IP), not stored in clear.

### Storage keys (Upstash Redis on Vercel when `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set; otherwise Netlify Blobs store `isla-skills`)

Redis is used through its REST API with plain `fetch` (no package); counters use `INCRBY` (atomic) and expire after 2 days; spots expire after 1 day, reviews after 7. Keys: `coco/spent/<day>`, `coco/pays/<day>/<visitor>`, `photos/<day>`, `photos/<day>/<visitor>`, `spot/<id>` (photo + AI result, only when unsure), `review/<id>`, `pending/<id>`, `reviewer/<wallet>` (last 50 review ids), `stats/cache`. On Netlify Blobs counters are read-modify-write (fine for a demo; the money in Coco's wallet is the hard limit). Photos are limited to ~650 KB (900k base64 chars) because the free Redis plan takes up to 1 MB per request.

## Setup (owner)

On **Vercel**: Project → Settings → Environment Variables (all environments). Redis: Project → Storage → Upstash for Redis (free) → connect, which adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`. On Netlify the same variables go in Site configuration → Environment variables.

| Variable | What |
|---|---|
| `COCO_SECRET_KEY` | Coco's devnet key, from `node scripts/new-keys.mjs`. **Secret** |
| `SPONSOR_SECRET_KEY` | Devnet key with ~1 SOL: opens USDC accounts for skills and reviewers, and pays fees in plan B. **Secret** |
| `ANTHROPIC_API_KEY` | For Litter Spotter. **Secret**, server only |
| `LITTER_SPOTTER_WALLET`, `CLEANUP_PLANNER_WALLET` | Payout addresses of each skill's maker (defaults in `config.mjs` are placeholder addresses with no known key: set real ones) |
| `X402_FACILITATOR_URL` | Default `https://facilitator.ultravioletadao.xyz`. `local` = plan B (this server verifies and submits; fee payer = sponsor). Another facilitator URL also works |
| optional | `COCO_DAILY_BUDGET_UNITS` (1000000), `PHOTOS_PER_DAY` (100), `PHOTOS_PER_VISITOR_PER_DAY` (5), `COCO_PAYMENTS_PER_VISITOR_PER_DAY` (40), `SOLANA_RPC_URL` |

Then top up Coco with devnet USDC from the page ("Top up Coco"), and send the sponsor 1 devnet SOL.

## Constants worth knowing

- Devnet USDC mint (Circle): `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, 6 decimals
- x402 v1, scheme `exact`, network `solana-devnet`; Coco's transaction = ComputeBudget limit 60000 + price 1 + one `transferChecked`; fee payer from the facilitator's `GET /supported`
- Claude model `claude-haiku-5-5`, `messages.parse` with a Zod schema (`zodOutputFormat`), effort `low`, 9 s timeout, no retries
- Old community board address `Gg46k4Fai…d5tu` is no longer used by the page

## Deploying

**Netlify** (current): pushing to `main` deploys. `.github/workflows/deploy.yml` runs `npm ci`, copies the site files to `public/` (if you add a file the site needs, add it to the `cp` line) and runs `netlify deploy --prod --functions=netlify/functions` to site `774dae81-dcf7-42e4-b800-fad91c6ba090` (token: repo secret `NETLIFY_AUTH_TOKEN`). The workflow uses **netlify-cli 27.16.2** with `--no-build`: netlify-cli 17 bundled the functions for **Node 18** (`runtimeVersion: nodejs18.x`), too old for the dependencies, and production answered `error decoding lambda response: invalid status code returned from lambda: 0`. **`--context production` is required**: without it the CLI deploys with context `dev`, and secret variables (which only have Production values) don't reach the functions. `GET /api/coco` lists `problems` (missing or badly pasted keys, never their values). There are no branch previews: test locally before merging. Storage = Netlify Blobs (no Redis variables set).

**Vercel** (fallback, not connected): the Vercel GitHub app would deploy every push; keep `buildCommand` in `vercel.json` in sync with the workflow's `cp` line.

Never print or commit tokens or keys.

## Testing

- Syntax: `node --check` on every `netlify/**/*.mjs`, and on the inline script of each page.
- Run the server and browser tests both ways: as Netlify (handlers called directly, in-memory store) and as Vercel (through `api/router.mjs` with the `?p=` rewrite, and a fake Upstash REST endpoint).
- Server: import the functions in Node with a fake ledger (`setConnection`), in-memory Blobs (`setStore(memoryStore())`), a fake Claude (`setClaudeClient`) and a fake facilitator on `globalThis.fetch`; test both `X402_FACILITATOR_URL=https://…` and `local`. Decode the transactions with `@solana/spl-token`.
- End to end: Playwright with a static server and `context.route("**/api/**")` calling the functions; a fake Wallet Standard wallet via `addInitScript`; two contexts (Coco page + reviewer page on a phone viewport). Screenshots at 1280 and 390 px.
- Bundling: `npx @netlify/zip-it-and-ship-it netlify/functions <out>` must list the 4 functions with their routes.
- Wallets: Playwright page loading `web3.min.js` + `wallet-adapter.min.js` + `wallet.js` with fake Wallet Standard wallets (one sign-only like Solflare, one sign-and-send, one broken, one EVM-only; early and late registration), a stub connection with `rpcEndpoint` devnet, and device emulation (Pixel 7 → Mobile Wallet Adapter appears; iPhone → it doesn't). Fake wallets need `supportedTransactionVersions` and account `features`, like real ones.
- Cloud sessions: the environment now allows `api.devnet.solana.com`, `facilitator.ultravioletadao.xyz` and `facilitator.payai.network`. Node needs `NODE_USE_ENV_PROXY=1` and `new Connection(url, { fetch: globalThis.fetch })` to go through the proxy (only here, not on Netlify). The devnet RPC airdrop is closed: fund test wallets from faucet.circle.com / faucet.solana.com. There is no Anthropic key here, so Claude is only tested on the live site.

## Known issues and open items

- **Real devnet test, Nov 1 2026 (from this repo's functions, test wallets, real facilitators): all three work end to end.** Ultravioleta (`https://facilitator.ultravioletadao.xyz`, fee payer `6xNPewUd…`), PayAI (`https://facilitator.payai.network`, fee payer `2wKupLR9…`) and plan B (`local`) each verified and settled a Cleanup Planner payment and a Human Reviewer payment (finalized on devnet, e.g. tx `3fMvf6hU…`). The old `contract_call_failed` did not appear. Paid call times: 1.2–2.9 s (settle 1.2–2.7 s). Litter Spotter (Claude) was not part of this test: no API key here.
- Confirmations poll `getSignatureStatuses` (`confirm()` in `netlify/lib/solana.mjs`) instead of web3.js websockets, which time out in serverless functions.
- The public devnet RPC sometimes answers 429 (rate limit). If that shows up on the live site, set `SOLANA_RPC_URL` to a free devnet RPC (e.g. Helius).
- Function time limit: Netlify synchronous functions have a time limit (check the plan; Vercel fallback: `maxDuration` 30 s). The paid Litter Spotter call runs verify ∥ Claude, then settle; measure on the live site (`Server-Timing` header).
- The Vercel fallback (`vercel.json`, Web-handler exports in `api/router.mjs`) is untested on Vercel itself.
- Wallets go through the official adapter since Nov 2, 2026; tested only with simulated wallets (and Android/iPhone emulation). Phantom was confirmed with real payments in an earlier version. The Mobile Wallet Adapter needs a real Android phone with a wallet app to confirm.
- Coco is shared: anyone can make it spend, up to the daily budget.
- X hides posts with `.netlify.app` links; a custom domain (e.g. islaskills.xyz) is on the list.

## Working with the owner

- The owner is Karen (GitHub `katamar-lang`). She is learning web development; explain things **in Spanish, simply, step by step**, with no unexplained jargon.
- Before pushing, test what you can and say plainly what was and wasn't tested.
- Don't add names of other people from the house to the repo, docs or posts.
- Public-facing copy (page, README, posts) is in English; conversation is in Spanish.
- She builds and presents the project alone: no joint demos or partnerships with other projects.
