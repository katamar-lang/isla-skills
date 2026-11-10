# Isla Skills: the skill store for robots

Robots call skills as APIs and pay per use in USDC on Solana, with x402. No human approves the payment. Skills come from AI models and from people. **Solana devnet only: test USDC. Don't send real money.**

Web page: <https://isla-skills-dao-2b40fb.netlify.app/> · Source: <https://github.com/katamar-lang/isla-skills> · For agents: [llms.txt](https://isla-skills-dao-2b40fb.netlify.app/llms.txt), [OpenAPI](https://isla-skills-dao-2b40fb.netlify.app/openapi.json), [MCP server](https://isla-skills-dao-2b40fb.netlify.app/mcp)

## The skills

Each skill is an independent paid service with its own payout wallet. 100% of each price goes to the skill's maker.

| Skill | Kind | What it does | Price per use |
|---|---|---|---|
| Litter Spotter | AI (Claude Haiku with vision) | Looks at a photo, says which room of the villa it shows, and lists the litter it sees with a confidence for each item | 0.01 USDC |
| Human Reviewer | A person | A real person answers when the AI isn't sure, from anywhere, and gets paid for each review | 0.005 USDC, to whoever answers |
| Cleanup Planner | Rules | Turns the litter list into a cleanup plan: order, recycling bins, time and % recyclable | 0.002 USDC |

Publishing your own skill: coming soon.

## Robot #1: Coco

Coco is a cleaning robot in the IslandDAO V5 villa in Florianópolis. It is simulated for now: a phone camera plays its eyes. Coco has its own wallet on Solana devnet with a daily budget (1 USDC), and pays each skill on its own:

1. A skill names its price with HTTP `402 Payment Required`.
2. Coco's wallet signs the payment on its own, within its daily budget.
3. The USDC goes straight to the skill's maker. Coco never pays itself.

## Clean Sweep (the demo)

Take a photo of a room in the villa on the web page. Coco pays Litter Spotter to find the room and the litter, asks a person (Human Reviewer) when the AI isn't sure, then pays Cleanup Planner for a plan. Every payment is a real devnet USDC transfer with a Solana Explorer link. When the photo is a villa room, a 3D model of the villa shows Coco driving there, picking the litter up and taking it to the right recycling bin (that part is a visual simulation).

## Use the skills from your own agent

`POST https://isla-skills-dao-2b40fb.netlify.app/api/skills/{id}` answers `402` with x402 v1 payment requirements (scheme `exact`, network `solana-devnet`). Pay with your own devnet wallet in the `X-PAYMENT` header and get the result. Step by step: [SKILL.md](https://isla-skills-dao-2b40fb.netlify.app/.well-known/agent-skills/isla-skills/SKILL.md).

## Earn by helping robots

When Coco's AI isn't sure what it sees, it asks a person. Answer from anywhere with one tap at [/review](https://isla-skills-dao-2b40fb.netlify.app/review), with any Solana wallet (Solflare, Phantom, Backpack…), and Coco pays you in devnet USDC for each review.

## Live numbers

Read from Solana devnet, not from a browser: [GET /api/stats](https://isla-skills-dao-2b40fb.netlify.app/api/stats) (photos analyzed, paid skill calls, USDC paid to skill makers, people paid for reviews).

Built for IslandHack v5 (IslandDAO, Florianópolis).
