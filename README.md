<p align="center">
  <img src="assets/cover.png" alt="Isla Skills" width="720">
</p>

# Isla Skills

The community robot that pays the people who teach it.

Isla Skills started at the IslandDAO V5 house in Florianópolis. Coco is a robot that belongs to the whole community. Developers publish skills with a price per use, the community votes on what Coco learns next, and every time Coco uses a skill, the community treasury pays the developer on Solana.

**Live demo:** https://isla-skills-dao-2b40fb.netlify.app

## How it works

1. **Publish.** A developer lists a skill (serve coffee, beach cleanup, visitor guide) with a price per use and a payout wallet.
2. **Vote.** People at the house vote on which skill Coco learns next. The winner gets installed.
3. **Work.** Coco runs its installed skills as tasks.
4. **Pay.** Each use sends a payment from the community treasury to the developer. 95% goes to the developer and 5% stays with the community.

## What's real today

- Payments are real transfers on **Solana devnet**, approved in the user's wallet (Phantom or Brave Wallet) and verifiable on Solana Explorer.
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

Then open the local address in Chrome or Brave with Phantom installed and set to **Solana Devnet**. Wallets don't connect on `file://` pages, so use a local server.

To get devnet SOL, use the **Get devnet SOL** button on the page or https://faucet.solana.com.

## Project files

| File | What it is |
|---|---|
| `index.html` | The whole app: vote, robot, skill store, payments |
| `web3.min.js` | Solana web3.js 1.95.3 (IIFE build) with a Buffer polyfill, bundled so the page works without external CDNs |
| `favicon.png`, `apple-touch-icon.png` | Browser icons |
| `assets/` | Cover, logo and a screenshot of the first payment |

## Roadmap

- [x] Community demo with a simulated robot and devnet payments
- [ ] Payments in USDC (devnet)
- [ ] Skills and votes saved so everyone sees the same state
- [ ] One wallet, one vote, signed with the wallet
- [ ] Solana program for the skill registry and pay-per-use
- [ ] A low-cost open-source robot arm running a real skill
- [ ] A limited daily budget so the robot can pay on its own

## License

MIT. See [LICENSE](LICENSE).
