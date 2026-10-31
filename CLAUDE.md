# Isla Skills · project context for Claude

Read this first. It is the handoff from the conversation where the project was built (Oct 27–31, 2026).

> **Current work: read [`docs/hackathon-plan.md`](docs/hackathon-plan.md).** On Oct 31 the focus changed: skills are paid-per-use services (x402), the main demo is **Beach Patrol**, the community vote is being removed, and an "Ask a human" skill is added. That file is the build spec and overrides the roadmap below where they differ.

## What it is

Isla Skills is an **app store for robot skills, paid per use** on Solana. Developers publish skills with a price per use; every time a robot uses a skill, the developer gets paid in USDC.

**Coco** is the first demo: a *simulated* robot owned by the IslandDAO V5 community (Florianópolis). The community votes on which skill Coco learns next. 95% of each payment goes to the developer, 5% stays with the community.

Pitch (IslandHack v5): "Isla Skills is an app store for robot skills. Robots pay on their own, per use, with x402 on Solana."

**The project must not depend on Phantom.** Most people at the house use Solflare. Any Solana wallet must work; in copy say "your Solana wallet (Solflare, Phantom, Backpack…)". The "community treasury" is simply the wallet the person connects.

- Live demo: https://isla-skills-dao-2b40fb.netlify.app
- Board of votes on Solana Explorer: https://explorer.solana.com/address/Gg46k4FaiuUm38UES1kTw6i3ySBBZp9BoqDhK7r4d5tu?cluster=devnet
- Listed in the IslandDAO V5 project directory. IslandHack v5 entries close **Nov 11, 2026** (owner still deciding whether to enter).

## How the code is organised

- **No build step.** The whole app is `index.html` (HTML + CSS + one inline script).
- `netlify/functions/skills.mjs`: the x402 skill store (Netlify Function, no dependencies), served at `/api/skills/:id`.
- `web3.min.js` = `@solana/web3.js@1.95.3` IIFE build **with a Buffer polyfill prepended** (`buffer@6.0.3`, bundled with esbuild). Wallets need `window.Buffer`; do not replace this file with the plain CDN build.
- `favicon.png`, `apple-touch-icon.png`: the gold robot logo. `assets/`: cover, logo, screenshot of the first payment.
- Everything runs on **Solana devnet**. If the page can't reach devnet, it falls back to a simulated mode with example votes.

### Main pieces inside `index.html`

| Area | What it does |
|---|---|
| `addStdWallet()`, `stdAdapter()`, `detectWallets()`, `connectWallet()` | **Wallet Standard**: the page dispatches `wallet-standard:app-ready` and listens to `wallet-standard:register-wallet`, so any compatible Solana wallet appears. `stdAdapter` gives it the old provider shape (`connect`, `signTransaction`, `signAndSendTransaction`, `on("accountChanged")`), always with chain `solana:devnet`. Older injected providers (`window.solflare`, `window.phantom.solana`, `window.backpack`, `window.braveSolana`) are a fallback, not listed twice. Picker (`#walletPick`) when several are installed. Phones without a wallet: "Open in Solflare / Phantom / Backpack" deep links |
| `sendTx()` | Sign and send with the connected wallet (prefers `signAndSendTransaction`) and confirm on devnet |
| `pay()` | Runs when Coco finishes a task. **Pay in** options: `USDC` (direct transferChecked, creates the dev's token account if needed), `USDC · x402 (beta)`, `SOL` |
| `payX402()` | Gasless USDC via the Ultravioleta DAO facilitator (see Known issues) |
| Community board (`loadBoard`, `applyBoard`, `postBoard`) | Votes, new skills and closed rounds are **memos** signed by the wallet, sent with a 0-SOL transfer to the board address so they can be listed. State is rebuilt from chain for everyone. One wallet, one vote (latest counts). Data from memos is untrusted: validated and escaped |
| Coco on its own (`cocoWallet`, `cocoTask`, `renderCoco`, `#topUp`) | **Who pays: Coco on its own · x402**. `GET /api/skills/:id` → 402 → Coco signs a transferChecked with its own keypair (compute budget + transfer, fee payer = facilitator, same rules as `payX402`) → retry with `X-PAYMENT` → skill JSON + `X-PAYMENT-RESPONSE`. Then Coco runs the task with the skill's steps. Ledger shows "402 received → paid → skill delivered" with Explorer link |
| `say(where, html)` | Messages appear where the person tapped (`voteHint`, `pubMsg`) and in Coco's status box |

### Constants worth knowing

- Board address: `Gg46k4FaiuUm38UES1kTw6i3ySBBZp9BoqDhK7r4d5tu` (no private key exists; it only receives 0-SOL transfers)
- Memo program: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, memo prefix `isla:v1:` + JSON (`{t:"vote",r,s}`, `{t:"skill",n,d,p,dev,w}`, `{t:"close",r}`)
- Devnet USDC mint (Circle): `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, 6 decimals
- Example skills have fixed payout addresses (see `SEED` in the script)
- x402 facilitator: `https://facilitator.ultravioletadao.xyz`, network `solana-devnet`, x402 v1, scheme `exact`; fee payer comes from `GET /supported`. On the server it's the env var `X402_FACILITATOR_URL` (set it in Netlify → Site configuration → Environment variables to switch). `SOLANA_RPC_URL` optional.
- Server catalog (`CATALOG` in `skills.mjs`) must match `SEED` in `index.html` (ids, prices, payout wallets). Community skills (`c` + 10 chars of the memo signature) are read from the board on devnet.
- Amount charged = 95% of the listed price (developer share), in USDC units (6 decimals): Serve coffee 0.002 → `1900`. Coco refuses a 402 that asks more than the listed price.

## Coco's spending wallet (agreed with the owner, Oct 31)

- The connected wallet is the **community treasury**. Coco has its own small devnet `Keypair`, created in the browser and saved in `localStorage` (`isla:coco:v1`). Never show, log or commit it.
- **Top up Coco from my wallet**: one treasury signature sends USDC to Coco and opens (create ATA idempotent) Coco's and the installed skills' developers' USDC accounts, because Coco has no SOL and the facilitator doesn't pay rent.
- Daily budget in `localStorage` (`isla:coco:budget`, units; default 1 USDC), spent today in `isla:coco:spent` (`{day, units}`). When the next payment would pass the budget, Coco stops the shift and says so.
- Each browser has its own Coco wallet (it's a demo; a real robot would keep its key on the device).

## Deploying

Pushing to `main` deploys automatically: `.github/workflows/deploy.yml` copies the site files to `public/` and runs `netlify deploy --prod --functions=netlify/functions` (so the x402 store is deployed too) to the existing Netlify project (site ID `774dae81-dcf7-42e4-b800-fad91c6ba090`). The token lives in the repo secret `NETLIFY_AUTH_TOKEN`. Never print or commit tokens.

If you add a new file the site needs, also add it to the `cp` line in the workflow.

## Testing

- Syntax check: extract the last inline `<script>` and run `node --check`.
- Behaviour: load `index.html` in jsdom with `web3.min.js` inlined; fake Wallet Standard wallets (register via `wallet-standard:app-ready` and `wallet-standard:register-wallet`, sign with a real `Keypair`), stub `conn` with `window.eval("conn=…;netOk=true;setMode()")`, and route `window.fetch` to the function's default export with a fake facilitator that decodes the transaction with `@solana/spl-token`. Real wallet signing can only be tested by the owner in her browser.
- Server: import `netlify/functions/skills.mjs` in Node, mock `globalThis.fetch` for the facilitator, call the default export with a `Request`.
- Layout: screenshot with Playwright at 1280px and 390px.
- **This cloud environment's network blocks `api.devnet.solana.com` and the facilitator**, so the real end-to-end x402 test has to be run on the live site, or after allowing those hosts in the environment's network settings.
- Before pushing a payment change, compare hand-built instructions against `@solana/spl-token` (this was done for the USDC instructions).

## Known issues and open items

- **x402 facilitator returns `contract_call_failed` on `/verify`** for solana-devnet, even for a transaction that simulates fine on devnet. Refs: `7246d3c8-5541-45d0-95ea-6f64fe3536b3`, `f068847d-d749-4f0a-ba9b-0ef73f4b6b08`. The owner was going to contact Ultravioleta DAO. Not re-tested after Oct 31 changes (network blocked in the cloud session). If it still fails, try another facilitator that supports `solana-devnet` (candidate: PayAI, `https://facilitator.payai.network`, untested) by setting `X402_FACILITATOR_URL`. The store passes the facilitator's reason through in the 402 `error`, and the page shows it.
- Wallet Standard support, Solflare and Backpack were tested only with simulated wallets; Phantom (legacy provider) is confirmed with real payments and votes.
- Netlify Functions time out after 10 s by default; `/verify` + `/settle` must fit in that.
- Voting needs the wallet on **Devnet** with a little devnet SOL. The page checks this before asking to sign.
- X hides posts with `.netlify.app` links; a custom domain (e.g. islaskills.xyz) is on the list.

## Roadmap (3-week plan, started Oct 28)

- [x] Code on GitHub, auto-deploy to Netlify
- [x] USDC payments on devnet (SOL as an option)
- [x] Votes and skills saved on Solana, one wallet one vote
- [x] Multi-wallet support, phone deep links, clear error messages
- [x] x402 gasless payments (beta, blocked by the facilitator error)
- [x] Wallet Standard: any Solana wallet, Solflare first in copy (Oct 31)
- [x] x402 skill store (`/api/skills/:id`) + Coco pays on its own with a daily budget (Oct 31, needs a real end-to-end test)
- [ ] Get feedback from a mentor at the house; test the shared board with 2–3 people
- [ ] **Week 2 (Nov 5–11):** Solana program (Anchor) for skill registry + pay-per-use; connect the page; 8-slide pitch deck; new demo video (no voice, music + subtitles); submit to IslandHack v5 by Nov 11
- [ ] **Week 3 (Nov 12–18):** low-cost open-source robot arm for a pilot; robotics labs in Florianópolis; invite developers; business one-pager; Solana ecosystem grants (e.g. Superteam Brasil); robot pays on its own with a daily budget (x402)

## Working with the owner

- The owner is Karen (GitHub `katamar-lang`). She is learning web development; explain things **in Spanish, simply, step by step**, with no unexplained jargon.
- Before pushing, test what you can and say plainly what was and wasn't tested.
- Don't add names of other people from the house to the repo, docs or posts.
- Public-facing copy (page, README, posts) is in English; conversation is in Spanish.
