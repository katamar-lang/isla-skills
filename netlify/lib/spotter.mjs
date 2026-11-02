/* Litter Spotter: Claude (Haiku, with vision) looks at one beach photo.
   The API key is the Netlify environment variable ANTHROPIC_API_KEY, used only here, on the server. */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

export const MODEL = "claude-haiku-5-5";
const TYPES = ["plastic_bottle", "plastic_bag", "cup_or_straw", "food_wrapper", "cigarette_butt", "can", "glass", "fishing_gear_or_rope", "styrofoam", "paper_or_cardboard", "other"];
export const SpotSchema = z.object({
  isBeach: z.boolean().describe("true if the photo shows a beach, sand, shore or similar outdoor ground"),
  summary: z.string().describe("One short sentence for the robot's log"),
  items: z.array(z.object({
    type: z.enum(TYPES),
    label: z.string().describe("Two to four words, e.g. 'blue bottle cap'"),
    count: z.number().int(),
    where: z.string().describe("Rough position in the photo, e.g. 'bottom left', 'near the water'"),
    confidence: z.enum(["high", "medium", "low"])
  })),
  unsure: z.object({
    itemIndex: z.number().int().describe("Index in items of the object you are least sure about"),
    question: z.string().describe("Short question for a person, e.g. 'Is the white object near the water litter or a shell?'"),
    litterOption: z.string().describe("Button text if it IS litter, e.g. 'Litter (plastic)'"),
    notLitterOption: z.string().describe("Button text if it is NOT litter, e.g. 'Shell'"),
    aiGuess: z.enum(["litter", "not_litter"])
  }).nullable().describe("Fill only when at least one item has low confidence; otherwise null")
});

const SYSTEM = `You are the eyes of Coco, a beach-cleaning robot in Florianópolis, Brazil.
Look at the photo and list the litter a cleanup robot should pick up: type, a short label, how many, rough position, and your confidence.
Natural things (shells, seaweed, wood, stones, footprints, animals) are not litter.
If you are genuinely unsure whether something is litter or natural (for example a white plastic fragment vs a shell), mark it with low confidence and fill "unsure" with one short question a person can answer with one tap. Otherwise set "unsure" to null.
If the photo is not a beach or shore, set isBeach to false and still list any litter you see.
Never describe people. Keep labels short.`;

let client = null;
export function setClaudeClient(c) { client = c; }
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error("ANTHROPIC_API_KEY is not set on the server"), { code: "no_key" });
  // The whole request must fit in the Netlify Function time limit, so no retries and a short timeout.
  return (client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 9000, maxRetries: 0 }));
}

export async function spotLitter(base64, mediaType) {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(SpotSchema) },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: "Beach patrol photo. What litter is here?" }
    ] }]
  });
  if (response.stop_reason === "refusal") throw Object.assign(new Error("The AI declined to look at this photo"), { code: "refusal" });
  const out = response.parsed_output;
  if (!out) throw Object.assign(new Error("The AI answer couldn't be read"), { code: "bad_output" });
  return clean(out);
}

/* Keep the result tidy and safe to show: limits, and an "unsure" only when it points to a real item. */
export function clean(out) {
  const items = (out.items || []).slice(0, 20).map(i => ({
    type: TYPES.includes(i.type) ? i.type : "other",
    label: String(i.label || i.type).slice(0, 40),
    count: Math.max(1, Math.min(200, Math.round(Number(i.count) || 1))),
    where: String(i.where || "").slice(0, 40),
    confidence: ["high", "medium", "low"].includes(i.confidence) ? i.confidence : "medium"
  }));
  let unsure = null;
  const u = out.unsure;
  if (u && Number.isInteger(u.itemIndex) && items[u.itemIndex]) {
    unsure = { itemIndex: u.itemIndex, question: String(u.question).slice(0, 140), litterOption: String(u.litterOption || "Litter").slice(0, 30),
      notLitterOption: String(u.notLitterOption || "Not litter").slice(0, 30), aiGuess: u.aiGuess === "not_litter" ? "not_litter" : "litter" };
  } else {
    const i = items.findIndex(x => x.confidence === "low");
    if (i >= 0) unsure = { itemIndex: i, question: `Is the ${items[i].label} (${items[i].where}) litter?`, litterOption: "Yes, litter", notLitterOption: "No, natural", aiGuess: "litter" };
  }
  return { isBeach: !!out.isBeach, summary: String(out.summary || "").slice(0, 160), items, unsure };
}
