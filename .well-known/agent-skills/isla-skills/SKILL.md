---
name: isla-skills
description: Call and pay robot skills on Isla Skills (an x402 skill store on Solana devnet). Use when an agent needs to find litter in a photo of a room, get a human to settle an unsure answer, or turn a litter list into a cleanup plan, and can pay a few cents of devnet USDC per call.
---

# Isla Skills

Isla Skills is an app store for robot skills: <https://isla-skills-dao-2b40fb.netlify.app>. Each skill is an HTTP service that you pay per call, in devnet USDC on Solana, with the x402 protocol (v1, scheme `exact`, network `solana-devnet`). Devnet only: test USDC, never real money. Get devnet USDC at https://faucet.circle.com (Solana Devnet).

## Skills

| id | what it does | price |
|---|---|---|
| `litter-spotter` | AI: says which room of the IslandDAO V5 villa a photo shows and lists the litter, with a confidence and a rough box for each item | 0.01 USDC |
| `human-reviewer` | a real person answers when the AI is unsure; the person who answers is paid | 0.005 USDC |
| `cleanup-planner` | turns a litter list into a cleanup plan: order, recycling bin (Brazil's colours), minutes, % recyclable | 0.002 USDC |

Live list with prices and payout wallets: `GET https://isla-skills-dao-2b40fb.netlify.app/api/coco` (field `skills`).

## Calling a skill

1. `POST https://isla-skills-dao-2b40fb.netlify.app/api/skills/{id}` with `Content-Type: application/json` and the body below. Without payment the answer is **402** with `{"x402Version":1,"accepts":[...]}`. Read `accepts[0]`: `maxAmountRequired` (USDC base units, 6 decimals), `payTo` (the skill maker's wallet), `asset` (devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`), `extra.feePayer` (the facilitator pays the network fee).
2. Build a Solana transaction with one USDC `transferChecked` of exactly `maxAmountRequired` from your wallet to `payTo`, with the facilitator as fee payer. Sign it with your wallet and wrap it as an x402 v1 `exact` payment payload for `solana-devnet`. Send the same request again with the base64 payload in the `X-PAYMENT` header.
3. **200**: the body has `result` and `payment.transaction`; the `X-PAYMENT-RESPONSE` header has the settlement. If the skill fails, the payment is not settled. Sending the same `X-PAYMENT` again returns the saved result (`X-Replay: 1`) and never charges twice.

Bodies:

- `cleanup-planner`: `{"items":[{"type":"can","label":"soda can","count":2,"where":"table"}]}`. Types: plastic_bottle, plastic_bag, cup_or_straw, food_wrapper, cigarette_butt, can, glass, fishing_gear_or_rope, styrofoam, paper_or_cardboard, other.
- `litter-spotter`: `{"image":"data:image/jpeg;base64,..."}` (JPEG, PNG or WebP, at most about 650 KB; 5 photos per visitor a day). The result has `place`, `items`, and `unsure` + `spotId` when it wants a person to check one item.
- `human-reviewer`: `{"spotId":"..."}` starts a review (202 `{reviewId}`); then poll `{"reviewId":"..."}` every 2 s: 202 waiting, **402** once a person answered (pay it like any skill), 410 after 20 s (nobody answered: use the AI's guess, nothing to pay). `{"reviewId":"...","cancel":true}` stops waiting.

## Without paying

- MCP server (Streamable HTTP): `https://isla-skills-dao-2b40fb.netlify.app/mcp`, read-only tools `list_skills`, `get_skill`, `get_coco_wallet`, `get_usage_stats`.
- OpenAPI: `https://isla-skills-dao-2b40fb.netlify.app/openapi.json`. Usage read from Solana: `GET https://isla-skills-dao-2b40fb.netlify.app/api/stats`.
