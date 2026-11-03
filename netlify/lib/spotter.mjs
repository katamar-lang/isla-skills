/* Litter Spotter: Claude (Haiku, with vision) looks at one photo (a room of the IslandDAO V5 villa, or anywhere).
   The API key is the Netlify environment variable ANTHROPIC_API_KEY, used only here, on the server. */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

export const MODEL = "claude-haiku-5-5";
/* Where the photo was taken: the beach, a room of the IslandDAO V5 villa (for the villa simulation), or somewhere else. */
export const PLACES = ["beach", "pool_terrace", "dining", "kitchen", "living", "reception", "tv_room", "billiards", "garden", "other"];
const VILLA = PLACES.filter(p => p !== "beach" && p !== "other");
const TYPES = ["plastic_bottle", "plastic_bag", "cup_or_straw", "food_wrapper", "cigarette_butt", "can", "glass", "fishing_gear_or_rope", "styrofoam", "paper_or_cardboard", "other"];
export const SpotSchema = z.object({
  isBeach: z.boolean().describe("true if the photo shows a beach, sand, shore or similar outdoor ground"),
  place: z.enum(PLACES).describe("Where the photo was taken: 'beach', one of the villa rooms, or 'other'"),
  placeReason: z.string().describe("One short sentence with the visual clues for the place, e.g. 'Red billiards table and cue rack'"),
  summary: z.string().describe("One short sentence for the robot's log"),
  items: z.array(z.object({
    type: z.enum(TYPES),
    label: z.string().describe("Two to four words, e.g. 'blue bottle cap'"),
    count: z.number().int(),
    where: z.string().describe("Rough position in the photo, e.g. 'bottom left', 'near the water'"),
    box: z.object({
      x: z.number().describe("Left edge, as a fraction of the image width (0 to 1)"),
      y: z.number().describe("Top edge, as a fraction of the image height (0 to 1)"),
      w: z.number().describe("Width, as a fraction of the image width"),
      h: z.number().describe("Height, as a fraction of the image height")
    }).nullable().describe("Rough box around the item (around all of them if count > 1); null if you can't place it"),
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

const SYSTEM = `You are the eyes of Coco, a cleaning robot that works in the IslandDAO V5 villa in Florianópolis, Brazil.
Look at the photo and list the litter a cleanup robot should pick up: type, a short label, how many, rough position, a rough box around it, and your confidence.
Natural things (shells, seaweed, wood, stones, footprints, animals) are not litter.
If you are genuinely unsure whether something is litter or natural (for example a white plastic fragment vs a shell), mark it with low confidence and fill "unsure" with one short question a person can answer with one tap. Otherwise set "unsure" to null.
If the photo is not a beach or shore, set isBeach to false and still list any litter you see.
Coco also works inside the IslandDAO V5 villa. If the photo was taken there, set "place" to the room it shows:
- pool_terrace: outdoor pool deck, blue sun loungers, wooden gazebo, black BBQ grill, beige tiles, white columns, round wicker sofa, palm trees
- dining: round white dining table with wooden chairs, glass walls looking at the pool, white round columns
- kitchen: white kitchen, long island with wooden high stools, built-in grill, steel fridge, cream cabinets
- living: bright living room, cream L-shaped sofa, blue abstract paintings, TV on a white wall, wooden coffee table, glass doors to the lawn
- reception: entrance hall, marble floor with a compass-rose inlay, white door with a digital lock, spiral staircase, wooden console with a tablet and printer, steps
- tv_room: black leather sofa, glossy black coffee table, black-and-white geometric rug, black TV stand, tall dark vases, sheer white curtains, glass doors to the garden
- billiards: red billiards table, cue rack, round mirrors, long wooden coworking table with laptops, shelf with fitness gear
- garden: lawn and tall hedges, outdoor wooden work table under a white tent
Use "beach" for a beach or shore and "other" for anywhere else. Inside the villa, things in use (cables plugged in, bags, towels, laptops) are not litter; discarded cups, bottles, cans, wrappers and paper are.
Inside the villa, look carefully at the whole photo, including the floor, tables, the pool edge, corners and the background. Report small or distant objects that could be litter (bottles, cans, cups, straws, wrappers, napkins, paper, plastic bags), even if they are tiny, partly hidden or blurry: give them low confidence instead of leaving them out. When you are not sure whether such an object is litter or still in use, put it in "items" with low confidence and fill "unsure" with a one-tap question for a person (e.g. "Is the cup on the pool edge litter or still in use?", options "Litter" / "Still in use"). Only answer with no items when the room really looks clean.
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
      { type: "text", text: "Photo for Coco (usually a room of the IslandDAO V5 villa). Where is it, and what litter is here?" }
    ] }]
  });
  if (response.stop_reason === "refusal") throw Object.assign(new Error("The AI declined to look at this photo"), { code: "refusal" });
  const out = response.parsed_output;
  if (!out) throw Object.assign(new Error("The AI answer couldn't be read"), { code: "bad_output" });
  return clean(out);
}

/* A box inside the photo (fractions 0–1), at least a little visible; anything else is dropped. */
export function cleanBox(b) {
  if (!b || typeof b !== "object") return null;
  const n = v => (typeof v === "number" && isFinite(v) ? v : NaN);
  let x = n(b.x), y = n(b.y), w = n(b.w), h = n(b.h);
  if ([x, y, w, h].some(isNaN)) return null;
  x = Math.min(Math.max(x, 0), 0.98); y = Math.min(Math.max(y, 0), 0.98);
  w = Math.min(Math.max(w, 0.02), 1 - x); h = Math.min(Math.max(h, 0.02), 1 - y);
  const r = v => Math.round(v * 1000) / 1000;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

/* Keep the result tidy and safe to show: limits, and an "unsure" only when it points to a real item. */
export function clean(out) {
  const items = (out.items || []).slice(0, 20).map(i => ({
    type: TYPES.includes(i.type) ? i.type : "other",
    label: String(i.label || i.type).slice(0, 40),
    count: Math.max(1, Math.min(200, Math.round(Number(i.count) || 1))),
    where: String(i.where || "").slice(0, 40),
    box: cleanBox(i.box),
    confidence: ["high", "medium", "low"].includes(i.confidence) ? i.confidence : "medium"
  }));
  let unsure = null;
  const u = out.unsure;
  if (u && Number.isInteger(u.itemIndex) && items[u.itemIndex]) {
    unsure = { itemIndex: u.itemIndex, question: String(u.question).slice(0, 140), litterOption: String(u.litterOption || "Litter").slice(0, 30),
      notLitterOption: String(u.notLitterOption || "Not litter").slice(0, 30), aiGuess: u.aiGuess === "not_litter" ? "not_litter" : "litter" };
  } else {
    const i = items.findIndex(x => x.confidence === "low");
    if (i >= 0) unsure = { itemIndex: i, question: `Is the ${items[i].label} (${items[i].where}) litter?`, litterOption: "Yes, litter",
      notLitterOption: VILLA.includes(out.place) ? "No, still in use" : "No, natural", aiGuess: "litter" };
  }
  const place = PLACES.includes(out.place) ? out.place : (out.isBeach ? "beach" : "other");
  return { isBeach: !!out.isBeach, place, placeReason: String(out.placeReason || "").slice(0, 140), summary: String(out.summary || "").slice(0, 160), items, unsure };
}
