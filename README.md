<p align="center">
  <img src="assets/cover.png" alt="Isla Skills" width="720">
</p>

# Isla Skills

**An app store for robot skills. Robots pay on their own, per use, with x402 on Solana.**

Isla Skills started at the IslandDAO V5 house in Florianópolis. Coco is a robot that belongs to the whole community and our first demo. Developers publish skills with a price per use, the community votes on what Coco learns next, and every time Coco uses a skill it pays the developer by itself, from a small daily budget.

**Live demo:** https://isla-skills-dao-2b40fb.netlify.app

## How it works

1. **Publish.** A developer lists a skill (serve coffee, beach cleanup, visitor guide) with a price per use and a payout wallet.
2. **Vote.** People at the house vote on which skill Coco learns next. The winner gets installed.
3. **Work.** Coco runs its installed skills as tasks.
4. **Pay.** Before each task, Coco buys the skill from the store with x402: the store answers `402 Payment Required`, Coco signs a USDC payment with its own spending wallet, and gets the skill. Nobody taps "Confirm". 95% of the price goes to the developer and 5% stays with the community.

## How Coco pays on its own (x402)

```
Coco ──GET /api/skills/1──────────────▶ store (Netlify Function)
     ◀── 402 + paymentRequirements ───   (payTo = developer, amount, USDC, feePayer)
Coco signs a USDC transfer with its spending wallet (no wallet popup)
Coco ──GET /api/skills/1 + X-PAYMENT──▶ store ──/verify, /settle──▶ x402 facilitator ──▶ Solana devnet
     ◀── 200 skill JSON + X-PAYMENT-RESPONSE (transaction signature)
```

- **Community treasury** = the Solana wallet you connect (Solflare, Phantom, Backpack…). It tops up Coco with one button.
- **Coco's spending wallet** = a small devnet wallet created in your browser. Its key never leaves the browser and is never shown.
- **Daily budget** (1 USDC by default, editable). When it's used up, Coco stops and says so. Coco also refuses to pay more than a skill's listed price.
- The facilitator pays the network fee, so Coco needs no SOL. The top-up also opens the developers' USDC accounts, since Coco can't pay for that.

## What's real today

- **Any Solana wallet** works: the page uses the [Wallet Standard](https://github.com/wallet-standard/wallet-standard), so every compatible wallet installed in the browser (Solflare, Phantom, Backpack, Glow…) shows up in a picker. On phones, "Open in Solflare / Phantom / Backpack" reopens the page inside the wallet app.
- **Coco pays on its own** with x402 through the store's server (`/api/skills/:id`) and an x402 facilitator ([Ultravioleta DAO](https://facilitator.ultravioletadao.xyz) by default).
- **Backup:** with *Who pays: Treasury*, payments are **USDC** transfers on **Solana devnet** (SOL also works) that you approve in your wallet, verifiable on Solana Explorer. *Pay in: USDC · x402 (beta)* sends the same payment through the facilitator so it pays the network fee.
- Votes, new skills and closed rounds are saved on **Solana devnet** as memos signed by the voter's wallet, so everyone sees the same board. One wallet, one vote (the latest vote counts).
- The robot is a simulation in the browser.
- Without a wallet connected, the page runs in simulated mode.

<p align="center">
  <img src="assets/first-payment.png" alt="First confirmed payment on Solana Explorer" width="640">
</p>

## Run it locally

It is a single static page, no build step.

```bash
git clone https://github.com/katamar-lang/isla-skills.git
cd isla-skills
npx serve .
```

Then open the local address in Chrome or Brave with your Solana wallet (Solflare, Phantom, Backpack…) set to **Solana Devnet**. Wallets don't connect on `file://` pages, so use a local server.

`npx serve` only serves the page. To also run the x402 skill store (`/api/skills/:id`) locally, use the Netlify CLI instead:

```bash
npx netlify-cli dev --dir . --functions netlify/functions
```

The facilitator is set with the environment variable `X402_FACILITATOR_URL` (default `https://facilitator.ultravioletadao.xyz`). `SOLANA_RPC_URL` changes the devnet RPC used to read community skills.

You need a little devnet SOL for network fees (use the **Get devnet SOL** button or https://faucet.solana.com) and devnet USDC to pay for skills (https://faucet.circle.com, choose Solana Devnet).

## Project files

| File | What it is |
|---|---|
| `index.html` | The whole app: vote, robot, skill store, payments |
| `netlify/functions/skills.mjs` | The x402 skill store: `GET /api/skills/:id` answers 402, then verifies and settles the payment through the facilitator and returns the skill |
| `web3.min.js` | Solana web3.js 1.95.3 (IIFE build) with a Buffer polyfill, bundled so the page works without external CDNs |
| `favicon.png`, `apple-touch-icon.png` | Browser icons |
| `assets/` | Cover, logo and a screenshot of the first payment |

## Roadmap

- [x] Community demo with a simulated robot and devnet payments
- [x] Payments in USDC (devnet), with SOL as an option
- [x] Skills and votes saved on Solana devnet, so everyone sees the same state
- [x] One wallet, one vote, signed with the wallet
- [ ] Solana program for the skill registry and pay-per-use
- [ ] A low-cost open-source robot arm running a real skill
- [x] Gasless USDC payments through an x402 facilitator
- [x] Any Solana wallet (Wallet Standard)
- [x] The robot pays on its own with x402, with a daily budget

## License

MIT. See [LICENSE](LICENSE).
