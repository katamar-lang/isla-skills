# Hackathon plan · IslandHack v5 (decided Oct 31, 2026)

## The goal: WIN IslandHack v5

Every decision is judged by what a judge sees in a **2-minute demo**:
- **It works live**, with no errors, and the judge needs **no wallet**.
- **Understood in 10 seconds:** photo → 402 → payment → result.
- It's clearly **a robot in the physical world paying for skills**, not another AI agent (about 5 projects at the house are AI agents).
- **Nothing the page says is false.**
- **Real usage numbers:** photos analyzed, payments, USDC earned by skill makers.

If something doesn't help with that, it waits until after the hackathon.

This is the build spec for the hackathon. It replaces the earlier week-2 idea of an Anchor program. Deadline: **final submission by Nov 10, 2026** (not Nov 11). The owner builds and presents this project alone: no joint demos or partnerships with other projects.

## The new focus

**A skill is a service a robot calls and pays for on every use, with x402.**
If a skill were a file the robot downloads, it would pay once and use it forever, and pay-per-use would make no sense. So every skill is an API: the robot sends something (a photo, a reading), the skill answers, and the robot pays for that answer.

Pitch line:
> Robots are learning new skills through software, but there's no way to pay for a skill each time a robot uses it. Isla Skills is an app store for robot skills: each skill is a service the robot calls and pays per use, in USDC on Solana, with x402. No human approves anything. Skills can come from AI models and from people.

Why this matters against the other ~40 projects at the house: about five of them are "AI agents that pay" (pay-per-answer data, shopping agents, game agents). Isla Skills must read as **robots in the physical world** and **developers and people selling skills**, from the first sentence.

## What to build, in priority order

### 1. Coco's spending wallet (pays on its own)
- Coco gets a small devnet wallet with a **daily budget** (for example 1 USDC/day). The person's own wallet (Solflare, Phantom, Backpack… never assume Phantom) stays the main treasury and tops Coco up with a button.
- **Explain this to the owner and get her confirmation before creating it.**
- Coco pays skills without anyone tapping Confirm. If the budget runs out, Coco stops and says so.
- The demo must work for a visitor **with no wallet at all**: open the page, start, watch Coco work and pay.
- Never expose private keys or tokens in the repo, logs or chat.

### 2. x402 skill store (server)
- A Netlify Function per skill, e.g. `GET/POST /api/skills/:id`.
- Without payment: respond **402** with x402 v1 `paymentRequirements` (`scheme: "exact"`, `network: "solana-devnet"`, devnet USDC as `asset`, `payTo` = that skill's developer wallet, `maxAmountRequired` in USDC base units, `extra.feePayer` from the facilitator's `GET /supported`).
- With the `X-PAYMENT` header (base64 payment payload): call the facilitator's `/verify` and `/settle`; on success return the skill's result plus `X-PAYMENT-RESPONSE` with the transaction signature.
- Facilitator URL configurable by environment variable, default `https://facilitator.ultravioletadao.xyz`.
- **Plan B:** that facilitator returned `contract_call_failed` on devnet (see CLAUDE.md). Test end to end with Coco's wallet; if it still fails, try another facilitator that supports solana-devnet; if none works, the function verifies and submits the payment itself.
- Update `.github/workflows/deploy.yml` so functions deploy too.

### 3. Beach Patrol (the main demo)
Coco "patrols" Florianópolis beaches. One photo triggers a **chain of paid skills from different developers** (each skill has its own payout wallet):

1. **Litter Spotter** (AI): input a beach photo; output the litter found (type, count, rough position, confidence). Uses the **Claude API, Haiku model, with vision**. The key is the Netlify environment variable `ANTHROPIC_API_KEY`; it must only be used server-side, never in the browser or the repo.
2. **Human Reviewer** (a person, see section 5): only when Litter Spotter is unsure.
3. **Cleanup Planner**: input Litter Spotter's result; output a cleanup plan (order, recycling separation, estimated time, % recyclable).

Page:
- Button to take a photo with the phone camera or upload one. Also a "desk robot" mode: the computer's camera works as Coco's eyes.
- A timeline that shows each step: photo → 402 → paid → result, for every skill, each with an Explorer link.
- Public counters computed from Solana, not from the browser: photos analyzed, paid skill calls, USDC earned per developer. These are the traction numbers for the pitch.

### 4. Remove the community vote
Remove the "Community vote" panel, close-round button, "See all votes on Solana" link, the board/memo vote code, and every mention in the page, README and CLAUDE.md. Skills already published on the board may stay in the store only if that's easy.

### 5. "Ask a human" (Human Reviewer skill)
- When Litter Spotter has low confidence ("litter or a shell?"), Coco calls **Human Reviewer**.
- A simple page (e.g. `/review`): the reviewer connects any Solana wallet, sees pending photos with the AI's question, answers with one tap.
- When the reviewer answers, Coco pays that review with x402 (`payTo` = reviewer's wallet). The final result uses the human answer.
- If nobody answers in about 20 seconds (changed from 60 on Nov 2, plus a "Skip, use the AI's guess" button), Coco continues with the AI answer and pays nothing.
- Store pending reviews simply (e.g. Netlify Blobs) and explain the choice to the owner.
- Copy on the page: "Earn by helping robots, from anywhere." Talk about work and fair pay, never charity.
- Long-term vision (roadmap only, not for this hackathon): people with limited mobility operate robots remotely and get paid per task, like the DAWN Avatar Robot Café in Tokyo.

### 6. Fix claims that aren't true today
- "5% stays with the community": today that 5% is simply not sent. Send it to a real community treasury wallet, or change the text.
- "Community treasury" shows whoever's wallet is connected: label it "Your wallet".
- Skill usage and earnings must come from Solana, not from one browser.

### 7. Any Solana wallet
Use the Solana Wallet Standard so any compatible wallet appears in a picker. Keep "Open in Phantom / Open in Solflare" deep links for phones. Copy should say "your Solana wallet (Solflare, Phantom, Backpack…)", never present Phantom as the main one.

## Not before the Nov 10 submission
- Anchor/Rust program (roadmap).
- Mainnet with real money.
- A physical robot arm (roadmap).

## Working rules
- Explain everything to the owner **in Spanish, simply, step by step**.
- Test each step before pushing, and say clearly what was tested and what wasn't.
- Public copy (page, README, posts) in English.
- Don't add names of other people from the house.
- When something here is done, tick it in this file and update CLAUDE.md.

## Decisions taken with the owner (Oct 31)
- **One Coco, on the server.** Its devnet key is the Netlify secret `COCO_SECRET_KEY`; the server enforces a daily budget of 1 USDC. Visitors need no wallet. The owner tops Coco up from her own wallet.
- **AI cost limits:** 100 photos a day in total, 5 per visitor (hashed IP + day), checked before any payment or AI call. The page says clearly when a limit is reached.
- **Coco and every skill have different wallets**, shown side by side on the page. Coco's wallet service refuses to pay its own address.
- **The 5% "community" share is gone from the copy**: there is no community treasury wallet, so 100% of each price goes to the skill's maker.
- **Storage for reviews:** Netlify Blobs at first; on Vercel, Upstash Redis (free).
- **Nov 1: hosting.** Netlify's free credits ran out; the team now has a paid Netlify plan, so the site stays on Netlify. The code also runs on Vercel (free) as a fallback. The AI for Litter Spotter still needs a key without paying (organizers' credits or a free tier): decision pending.

## Checklist
- [x] Coco's spending wallet with daily budget (owner confirmed: server-side, 1 USDC/day)
- [x] x402 skill store working end to end on devnet · real test Nov 1: Ultravioleta, PayAI and plan B (`local`) all settled real payments (Cleanup Planner + Human Reviewer). Still to check on the live site: Litter Spotter with the real Claude key, and timing inside Netlify
- [x] Beach Patrol: Litter Spotter + Cleanup Planner, chained payments, camera/upload/desk-robot camera
- [x] Community vote removed
- [x] Ask a human: /review page, paid reviews, 20 s fallback + Skip button
- [x] Untrue claims fixed (no 5% claim, "Coco's wallet" vs skill wallets, numbers from Solana)
- [x] Wallet Standard
- [x] Public usage counters from Solana (`/api/stats`)
- [x] README rewritten for the new focus
- [ ] Real beach photos from Florianópolis in `assets/samples/beach-1.jpg` … `beach-3.jpg` (so judges can try without a camera)
- [x] Netlify environment variables complete; first live patrol on Nov 2 (Claude + a real reviewer + Cleanup Planner, paid on devnet)
- [ ] AI key for Litter Spotter without paying (organizers' credits or a free tier)
