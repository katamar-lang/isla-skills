/* Cleanup Planner: rules, no AI. Bins follow Brazil's recycling colours (CONAMA 275). */
const RULES = {
  plastic_bottle: { bin: "Red · plastic", recyclable: true, secs: 15, order: 3 },
  plastic_bag: { bin: "Red · plastic", recyclable: true, secs: 20, order: 3 },
  cup_or_straw: { bin: "Gray · not recyclable", recyclable: false, secs: 15, order: 3 },
  food_wrapper: { bin: "Gray · not recyclable", recyclable: false, secs: 15, order: 3 },
  cigarette_butt: { bin: "Gray · not recyclable", recyclable: false, secs: 10, order: 2 },
  can: { bin: "Yellow · metal", recyclable: true, secs: 15, order: 3 },
  glass: { bin: "Green · glass", recyclable: true, secs: 30, order: 1, note: "Sharp: pick up first, with tongs" },
  fishing_gear_or_rope: { bin: "Gray · not recyclable", recyclable: false, secs: 60, order: 1, note: "Can trap animals: pick up first" },
  styrofoam: { bin: "Gray · not recyclable", recyclable: false, secs: 25, order: 2, note: "Breaks into small pieces: use a bag" },
  paper_or_cardboard: { bin: "Blue · paper", recyclable: true, secs: 10, order: 3 },
  other: { bin: "Gray · not recyclable", recyclable: false, secs: 20, order: 3 }
};
export function planCleanup(items) {
  const list = (Array.isArray(items) ? items : []).slice(0, 20).map(i => ({
    type: RULES[i && i.type] ? i.type : "other", label: String((i && i.label) || "item").slice(0, 40),
    count: Math.max(1, Math.min(200, Math.round(Number(i && i.count) || 1))), where: String((i && i.where) || "").slice(0, 40)
  }));
  if (!list.length) return { steps: [], minutes: 0, recyclablePercent: 0, bins: [], message: "Nothing to pick up here. Coco moves on." };
  const total = list.reduce((a, i) => a + i.count, 0);
  const recyclable = list.reduce((a, i) => a + (RULES[i.type].recyclable ? i.count : 0), 0);
  const steps = list.map(i => ({ ...i, ...RULES[i.type] })).sort((a, b) => a.order - b.order)
    .map((i, n) => ({ n: n + 1, action: `Pick up ${i.count} × ${i.label}${i.where ? " (" + i.where + ")" : ""}`, bin: i.bin, note: i.note || null }));
  const secs = 120 + list.reduce((a, i) => a + i.count * RULES[i.type].secs, 0);
  const bins = [...new Set(steps.map(s => s.bin))];
  return { steps, minutes: Math.ceil(secs / 60), recyclablePercent: Math.round(recyclable / total * 100), items: total, bins };
}
