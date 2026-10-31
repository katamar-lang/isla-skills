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

- Live demo: https://isla-skills-dao-2b40fb.netlify.app (reviewers: `/review`)
- Everything runs on **Solana devnet** (test USDC).

## How the code is organised

No build step for the pages. Netlify Functions (Node, ES modules) hold the server.

| File | What it is |
|---|---|
| `index.html` | Beach Patrol: photo (upload, phone camera, "desk robot" webcam, optional samples in `assets/samples/beach-1..3.jpg`), patrol timeline, "Who pays whom", live usage numbers, top up Coco |
| `review.html` | "Earn by helping robots, from anywhere." Reviewer connects any Solana wallet, sees pending photos + the AI's question, answers with one tap, sees payments. Served at `/review` via `_redirects` |
| `wallet.js` | Shared wallet code (`window.IslaWallet`): **Wallet Standard** discovery (`wallet-standard:app-ready` / `register-wallet`) + legacy providers as fallback, picker, "Open in Solflare / Phantom / Backpack" phone links, USDC instructions, `sendTx`, error messages |
| `style.css` | Shared styles (light/dark tokens) |
| `web3.min.js` | `@solana/web3.js@1.95.3` IIFE build **with a Buffer polyfill prepended**. Don't replace with the plain CDN build |
| `netlify/functions/skills.mjs` | The store: `GET /api/skills/:id` (info), `POST /api/skills/:id` → **402** with x402 v1 requirements; with `X-PAYMENT` → facilitator `/verify` (in parallel with the work) → `/settle` → result + `X-PAYMENT-RESPONSE`. If the work fails, the payment is never settled |
| `netlify/functions/coco.mjs` | Coco's wallet service: `GET /api/coco` (address, balance, budget, photo limits, readiness), `POST /api/coco/pay` (signs one payment if it passes every rule, below) |
| `netlify/functions/reviews.mjs` | `GET /api/reviews[?wallet=]`, `GET /api/reviews/:id`, `GET /api/reviews/:id/image`, `POST /api/reviews/:id/answer` |
| `netlify/functions/stats.mjs` | `GET /api/stats`: public numbers read from Solana (every USDC transfer out of Coco's USDC account), cached 30 s, cache cleared after each settled payment |
| `netlify/lib/*.mjs` | `config` (prices, limits, skill wallets), `store` (Netlify Blobs), `solana` (keys, USDC instructions, sponsor), `x402` (requirements, remote + local facilitator), `spotter` (Claude), `planner` |
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

### Netlify Blobs keys (store `isla-skills`, strong consistency)

`coco/spent/<day>`, `coco/pays/<day>/<visitor>`, `photos/<day>`, `photos/<day>/<visitor>`, `spot/<id>` (photo + AI result, only when unsure), `review/<id>`, `pending/<id>`, `reviewer/<wallet>` (last 50 review ids), `stats/cache`. No transactions: counters are read-modify-write (fine for a demo; the money in Coco's wallet is the hard limit).

## Setup on Netlify (owner)

Environment variables (Site configuration → Environment variables, mark secrets as secret):

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

Pushing to `main` deploys: `.github/workflows/deploy.yml` runs `npm ci`, copies the site files to `public/` (if you add a file the site needs, add it to the `cp` line), and runs `netlify deploy --prod --functions=netlify/functions` to site `774dae81-dcf7-42e4-b800-fad91c6ba090`. Token: repo secret `NETLIFY_AUTH_TOKEN`. Never print or commit tokens or keys.

## Testing

- Syntax: `node --check` on every `netlify/**/*.mjs`, and on the inline script of each page.
- Server: import the functions in Node with a fake ledger (`setConnection`), in-memory Blobs (`setStore(memoryStore())`), a fake Claude (`setClaudeClient`) and a fake facilitator on `globalThis.fetch`; test both `X402_FACILITATOR_URL=https://…` and `local`. Decode the transactions with `@solana/spl-token`.
- End to end: Playwright with a static server and `context.route("**/api/**")` calling the functions; a fake Wallet Standard wallet via `addInitScript`; two contexts (Coco page + reviewer page on a phone viewport). Screenshots at 1280 and 390 px.
- Bundling: `npx @netlify/zip-it-and-ship-it netlify/functions <out>` must list the 4 functions with their routes.
- Cloud sessions: the environment now allows `api.devnet.solana.com`, `facilitator.ultravioletadao.xyz` and `facilitator.payai.network`. Node needs `NODE_USE_ENV_PROXY=1` and `new Connection(url, { fetch: globalThis.fetch })` to go through the proxy (only here, not on Netlify). The devnet RPC airdrop is closed: fund test wallets from faucet.circle.com / faucet.solana.com. There is no Anthropic key here, so Claude is only tested on the live site.

## Known issues and open items

- **Real devnet test, Nov 1 2026 (from this repo's functions, test wallets, real facilitators): all three work end to end.** Ultravioleta (`https://facilitator.ultravioletadao.xyz`, fee payer `6xNPewUd…`), PayAI (`https://facilitator.payai.network`, fee payer `2wKupLR9…`) and plan B (`local`) each verified and settled a Cleanup Planner payment and a Human Reviewer payment (finalized on devnet, e.g. tx `3fMvf6hU…`). The old `contract_call_failed` did not appear. Paid call times: 1.2–2.9 s (settle 1.2–2.7 s). Litter Spotter (Claude) was not part of this test: no API key here.
- Confirmations poll `getSignatureStatuses` (`confirm()` in `netlify/lib/solana.mjs`) instead of web3.js websockets, which time out in serverless functions.
- The public devnet RPC sometimes answers 429 (rate limit). If that shows up on the live site, set `SOLANA_RPC_URL` to a free devnet RPC (e.g. Helius).
- Netlify Functions have a time limit (10 s by default on many plans). The paid Litter Spotter call runs verify ∥ Claude, then settle; measure on the live site (`Server-Timing` header).
- Wallet Standard, Solflare and Backpack were tested only with simulated wallets. Phantom was confirmed with real payments in the earlier version.
- Coco is shared: anyone can make it spend, up to the daily budget.
- X hides posts with `.netlify.app` links; a custom domain (e.g. islaskills.xyz) is on the list.

## Working with the owner

- The owner is Karen (GitHub `katamar-lang`). She is learning web development; explain things **in Spanish, simply, step by step**, with no unexplained jargon.
- Before pushing, test what you can and say plainly what was and wasn't tested.
- Don't add names of other people from the house to the repo, docs or posts.
- Public-facing copy (page, README, posts) is in English; conversation is in Spanish.
- She builds and presents the project alone: no joint demos or partnerships with other projects.
