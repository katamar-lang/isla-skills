# Isla Skills · project context for Claude

Read this first. It is the handoff from the conversation where the project was built (Oct 27–31, 2026).

## What it is

Isla Skills is an **app store for robot skills, paid per use** on Solana. Developers publish skills with a price per use; every time a robot uses a skill, the developer gets paid in USDC.

**Coco** is the first demo: a *simulated* robot owned by the IslandDAO V5 community (Florianópolis). The community votes on which skill Coco learns next. 95% of each payment goes to the developer, 5% stays with the community.

One-liner: "An app store for robots that pays per use. Coco, the house robot, is our first demo: the community votes on what it learns and every use pays whoever taught it."

- Live demo: https://isla-skills-dao-2b40fb.netlify.app
- Board of votes on Solana Explorer: https://explorer.solana.com/address/Gg46k4FaiuUm38UES1kTw6i3ySBBZp9BoqDhK7r4d5tu?cluster=devnet
- Listed in the IslandDAO V5 project directory. IslandHack v5 entries close **Nov 11, 2026** (owner still deciding whether to enter).

## How the code is organised

- **No build step.** The whole app is `index.html` (HTML + CSS + one inline script).
- `web3.min.js` = `@solana/web3.js@1.95.3` IIFE build **with a Buffer polyfill prepended** (`buffer@6.0.3`, bundled with esbuild). Wallets need `window.Buffer`; do not replace this file with the plain CDN build.
- `favicon.png`, `apple-touch-icon.png`: the gold robot logo. `assets/`: cover, logo, screenshot of the first payment.
- Everything runs on **Solana devnet**. If the page can't reach devnet, it falls back to a simulated mode with example votes.

### Main pieces inside `index.html`

| Area | What it does |
|---|---|
| `detectWallets()`, `connectWallet()` | Phantom, Solflare, Backpack, Brave Wallet; picker when several are installed; on phones without a wallet, "Open in Phantom / Solflare" deep links (`phantom.app/ul/browse/…`, `solflare.com/ul/v1/browse/…`) |
| `sendTx()` | Sign and send with the connected wallet (prefers `signAndSendTransaction`) and confirm on devnet |
| `pay()` | Runs when Coco finishes a task. **Pay in** options: `USDC` (direct transferChecked, creates the dev's token account if needed), `USDC · x402 (beta)`, `SOL` |
| `payX402()` | Gasless USDC via the Ultravioleta DAO facilitator (see Known issues) |
| Community board (`loadBoard`, `applyBoard`, `postBoard`) | Votes, new skills and closed rounds are **memos** signed by the wallet, sent with a 0-SOL transfer to the board address so they can be listed. State is rebuilt from chain for everyone. One wallet, one vote (latest counts). Data from memos is untrusted: validated and escaped |
| `say(where, html)` | Messages appear where the person tapped (`voteHint`, `pubMsg`) and in Coco's status box |

### Constants worth knowing

- Board address: `Gg46k4FaiuUm38UES1kTw6i3ySBBZp9BoqDhK7r4d5tu` (no private key exists; it only receives 0-SOL transfers)
- Memo program: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, memo prefix `isla:v1:` + JSON (`{t:"vote",r,s}`, `{t:"skill",n,d,p,dev,w}`, `{t:"close",r}`)
- Devnet USDC mint (Circle): `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, 6 decimals
- Example skills have fixed payout addresses (see `SEED` in the script)
- x402 facilitator: `https://facilitator.ultravioletadao.xyz`, network `solana-devnet`, x402 v1, scheme `exact`; fee payer comes from `GET /supported`

## Deploying

Pushing to `main` deploys automatically: `.github/workflows/deploy.yml` copies the site files to `public/` and runs `netlify deploy --prod` to the existing Netlify project (site ID `774dae81-dcf7-42e4-b800-fad91c6ba090`). The token lives in the repo secret `NETLIFY_AUTH_TOKEN`. Never print or commit tokens.

If you add a new file the site needs, also add it to the `cp` line in the workflow.

## Testing

- Syntax check: extract the last inline `<script>` and run `node --check`.
- Behaviour: load `index.html` in jsdom with `web3.min.js` inlined; fake wallets (`window.solflare`, `window.phantom.solana`) and stub `conn` to test flows. Real wallet signing can only be tested by the owner in her browser.
- Before pushing a payment change, compare hand-built instructions against `@solana/spl-token` (this was done for the USDC instructions).

## Known issues and open items

- **x402 facilitator returns `contract_call_failed` on `/verify`** for solana-devnet, even for a transaction that simulates fine on devnet. Refs: `7246d3c8-5541-45d0-95ea-6f64fe3536b3`, `f068847d-d749-4f0a-ba9b-0ef73f4b6b08`. The owner was going to contact Ultravioleta DAO. The option is labelled "beta"; plain USDC is the default.
- Solflare and Backpack support was tested only with simulated wallets; Phantom is confirmed with real payments and votes.
- Voting needs the wallet on **Devnet** with a little devnet SOL. The page checks this before asking to sign.
- X hides posts with `.netlify.app` links; a custom domain (e.g. islaskills.xyz) is on the list.

## Roadmap (3-week plan, started Oct 28)

- [x] Code on GitHub, auto-deploy to Netlify
- [x] USDC payments on devnet (SOL as an option)
- [x] Votes and skills saved on Solana, one wallet one vote
- [x] Multi-wallet support, phone deep links, clear error messages
- [x] x402 gasless payments (beta, blocked by the facilitator error)
- [ ] Get feedback from a mentor at the house; test the shared board with 2–3 people
- [ ] **Week 2 (Nov 5–11):** Solana program (Anchor) for skill registry + pay-per-use; connect the page; 8-slide pitch deck; new demo video (no voice, music + subtitles); submit to IslandHack v5 by Nov 11
- [ ] **Week 3 (Nov 12–18):** low-cost open-source robot arm for a pilot; robotics labs in Florianópolis; invite developers; business one-pager; Solana ecosystem grants (e.g. Superteam Brasil); robot pays on its own with a daily budget (x402)

## Working with the owner

- The owner is Karen (GitHub `katamar-lang`). She is learning web development; explain things **in Spanish, simply, step by step**, with no unexplained jargon.
- Before pushing, test what you can and say plainly what was and wasn't tested.
- Don't add names of other people from the house to the repo, docs or posts.
- Public-facing copy (page, README, posts) is in English; conversation is in Spanish.
