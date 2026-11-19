# Earn by helping robots, from anywhere

When a robot's AI isn't sure what it sees, it asks a person. You look at the photo, answer with one tap, and the robot pays you in USDC on Solana for that review. This is the **Human Reviewer** skill on [Isla Skills](https://isla-skills-dao-2b40fb.netlify.app/). **Solana devnet only: test USDC.**

Web page: <https://isla-skills-dao-2b40fb.netlify.app/review>

## How it works

1. Connect your Solana wallet (Solflare, Phantom, Backpack…) set to **Devnet**. You don't sign anything to review: the wallet only tells the robot where to send your pay.
2. Photos waiting for a person appear with the AI's question, for example "Is the cup on the pool edge litter or still in use?".
3. Answer with one tap. If you answer within 20 seconds, the robot pays you 0.005 devnet USDC with x402. You can see each payment on Solana Explorer.

## For agents

- Photos waiting for a person: [GET /api/reviews](https://isla-skills-dao-2b40fb.netlify.app/api/reviews)
- Answer: `POST /api/reviews/{id}/answer` with `{"answer": "litter" | "not_litter", "wallet": "<your Solana address>"}`
- Full API: [openapi.json](https://isla-skills-dao-2b40fb.netlify.app/openapi.json)
