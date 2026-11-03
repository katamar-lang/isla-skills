/* Villa patrol: a pop-up that plays Coco moving through the IslandDAO V5 villa.
   Coco is a simulated robot. The room photos are real (assets/villa/). The place
   comes from Litter Spotter's answer (spot.place), so the photo itself says where to go.

   Use:  VillaSim.isVilla(spot.place)                    -> true for a villa room
         VillaSim.open({ photo, place, reason, items })  -> Promise, resolves when closed
   No dependencies. Styles are injected once. */
(function () {
  "use strict";

  var ROOMS = {
    pool_terrace: { name: "Pool terrace", frames: ["exterior", "pool"], box: [0, 0, 200, 36] },
    dining:       { name: "Dining room", frames: ["diningwide", "dining"], box: [0, 40, 62, 40] },
    kitchen:      { name: "Kitchen", frames: ["kitchen", "kitchenview"], box: [66, 40, 70, 40] },
    laundry:      { name: "Laundry · bins", frames: ["laundry"], box: [140, 40, 60, 40] },
    living:       { name: "Living room", frames: ["living", "livingtv", "lounge"], box: [0, 84, 96, 30] },
    reception:    { name: "Reception", frames: ["reception"], box: [100, 84, 100, 30] },
    tv_room:      { name: "TV room", frames: ["blacksofa", "tvroom"], box: [0, 118, 96, 30] },
    billiards:    { name: "Billiards & cowork", frames: ["billiards"], box: [100, 118, 100, 30] },
    garden:       { name: "Garden work table", frames: ["tvroom"], box: [0, 152, 96, 26] }
  };
  var LINKS = [["pool_terrace", "dining"], ["dining", "kitchen"], ["kitchen", "laundry"], ["kitchen", "living"],
    ["living", "reception"], ["reception", "tv_room"], ["tv_room", "billiards"], ["tv_room", "garden"]];
  var DOCK = "reception", BINS_ROOM = "laundry";
  // Brazil's recycling colours (CONAMA 275)
  var BIN = {
    plastic: { name: "red bin · plastic", color: "#D93A3A" }, paper: { name: "blue bin · paper", color: "#2F6FD8" },
    metal: { name: "yellow bin · metal", color: "#E8C21F" }, glass: { name: "green bin · glass", color: "#2E9E58" },
    general: { name: "grey bin · non-recyclable", color: "#8A8F99" }
  };
  var TYPE_BIN = { plastic_bottle: "plastic", plastic_bag: "plastic", cup_or_straw: "plastic", food_wrapper: "plastic",
    styrofoam: "plastic", can: "metal", glass: "glass", paper_or_cardboard: "paper" };

  var adj = {};
  Object.keys(ROOMS).forEach(function (k) { adj[k] = []; });
  LINKS.forEach(function (l) { adj[l[0]].push(l[1]); adj[l[1]].push(l[0]); });
  function route(from, to) {
    var prev = {}, q = [from]; prev[from] = null;
    while (q.length) { var u = q.shift(); if (u === to) break;
      adj[u].forEach(function (v) { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
    var p = [], c = to; while (c) { p.unshift(c); c = prev[c]; } return p;
  }
  function frameUrl(f) { return "assets/villa/" + f + ".jpg"; }
  function reduce() { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce() ? Math.min(ms, 200) : ms); }); }

  var CSS = [
    ".vs-back{position:fixed;inset:0;z-index:9999;background:rgba(12,14,30,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px));animation:vs-in .3s ease both}",
    "@keyframes vs-in{from{opacity:0}to{opacity:1}}",
    ".vs-win{width:min(980px,100%);max-height:100%;overflow:auto;background:#F7F6FC;border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.4);display:flex;flex-direction:column;font-family:Geist,system-ui,-apple-system,'Segoe UI',sans-serif;color:#141B2D;animation:vs-up .4s cubic-bezier(.2,.9,.25,1) both}",
    "@keyframes vs-up{from{transform:translateY(40px)}to{transform:none}}",
    ".vs-head{display:flex;align-items:center;gap:10px;padding:12px 16px}",
    ".vs-head b{font-size:16px}.vs-head span{font:500 11px 'Geist Mono',ui-monospace,monospace;color:#3A4458}",
    ".vs-x{margin-left:auto;height:38px;padding:0 14px;border-radius:12px;border:1px solid #E2DFF0;background:#fff;font:600 13px inherit;color:#141B2D;cursor:pointer}",
    ".vs-stage{position:relative;aspect-ratio:1082/520;background:#0B0F16;overflow:hidden;margin:0 12px;border-radius:16px}",
    ".vs-layer{position:absolute;inset:0;background:#0B0F16 center/cover no-repeat;opacity:0;transform:scale(1.02);transition:opacity .9s ease}",
    ".vs-layer.on{opacity:1}.vs-layer.dolly{transition:opacity .9s ease,transform 3s cubic-bezier(.25,.1,.25,1)}",
    ".vs-photo{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0B0F16}.vs-photo.on{display:flex}",
    ".vs-pbox{position:relative;max-width:100%;max-height:100%}.vs-pbox img{display:block;max-width:100%;max-height:100%}",
    ".vs-det{position:absolute;border:2px solid #E8A21F;border-radius:6px;transition:all .9s cubic-bezier(.5,0,.2,1)}",
    ".vs-det i{position:absolute;left:-2px;top:-22px;background:#E8A21F;color:#141B2D;font:600 11px 'Geist Mono',monospace;font-style:normal;padding:2px 6px;border-radius:5px;white-space:nowrap}",
    ".vs-det.grab{left:50%!important;top:100%!important;width:0!important;height:0!important;opacity:0}",
    ".vs-vign{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(5,8,14,.55) 100%)}",
    ".vs-hud{position:absolute;inset:0;pointer-events:none;color:#fff;font-family:'Geist Mono',ui-monospace,monospace;text-shadow:0 1px 6px rgba(0,0,0,.6)}",
    ".vs-c{position:absolute;width:22px;height:22px;border:0 solid rgba(255,255,255,.85)}",
    ".vs-c1{left:12px;top:12px;border-width:2px 0 0 2px}.vs-c2{right:12px;top:12px;border-width:2px 2px 0 0}.vs-c3{left:12px;bottom:12px;border-width:0 0 2px 2px}.vs-c4{right:12px;bottom:12px;border-width:0 2px 2px 0}",
    ".vs-rec{position:absolute;left:20px;top:18px;font-size:11px;letter-spacing:.08em;display:flex;gap:6px;align-items:center}",
    ".vs-rec i{width:7px;height:7px;border-radius:50%;background:#FF5A4E;animation:vs-blink 1.2s steps(2) infinite}@keyframes vs-blink{50%{opacity:.2}}",
    ".vs-where{position:absolute;right:20px;top:16px;text-align:right}.vs-where b{display:block;font:600 17px Geist,system-ui,sans-serif}.vs-where small{font-size:11px;opacity:.9}",
    ".vs-status{position:absolute;left:18px;bottom:16px;font-size:12px;background:rgba(11,15,22,.6);border-radius:999px;padding:6px 11px;max-width:58%}",
    ".vs-map{position:absolute;right:16px;bottom:14px;width:160px;background:rgba(255,255,255,.88);border-radius:10px;padding:5px}.vs-map svg{display:block;width:100%;height:auto}",
    ".vs-scan{position:absolute;left:0;right:0;height:2px;background:#fff;box-shadow:0 0 22px 6px rgba(232,162,31,.6);display:none;animation:vs-sweep 1.5s ease-in-out infinite alternate}@keyframes vs-sweep{from{top:5%}to{top:94%}}",
    ".vs-toast{position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(255,255,255,.95);color:#141B2D;border-radius:12px;padding:8px 12px;font:600 13px Geist,system-ui,sans-serif;display:flex;gap:8px;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.3);animation:vs-in .3s ease both;white-space:nowrap}",
    ".vs-toast s{width:12px;height:12px;border-radius:3px;display:inline-block;text-decoration:none}",
    ".vs-steps{display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px 16px}",
    ".vs-step{font:500 12px 'Geist Mono',ui-monospace,monospace;border-radius:999px;padding:6px 10px;background:#ECEAF4;color:#3A4458}",
    ".vs-step.now{background:#FCF0D6;color:#8A5A00}.vs-step.done{background:#E3F6EE;color:#0B7A52}",
    ".vs-note{padding:0 16px 14px;font-size:12px;color:#3A4458;margin:0}",
    "@media (max-width:640px){.vs-stage{margin:0 8px;aspect-ratio:3/4}.vs-map{width:92px;right:10px;bottom:10px;padding:3px}.vs-map text{display:none}.vs-where{right:16px;top:14px;max-width:60%}.vs-where b{font-size:15px}.vs-where small{font-size:10px}.vs-status{font-size:11px;max-width:58%;left:14px;bottom:14px}.vs-rec{left:16px;top:16px}.vs-head{padding:10px 12px}.vs-steps{padding:10px 12px 12px}}",
    "@media (prefers-reduced-motion:reduce){.vs-back,.vs-win,.vs-toast{animation:none}.vs-layer,.vs-layer.dolly,.vs-det{transition:opacity .2s}.vs-scan,.vs-rec i{animation:none}}"
  ].join("\n");

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  var cssDone = false;
  function injectCss() { if (cssDone) return; var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); cssDone = true; }
  Object.keys(ROOMS).forEach(function (k) { ROOMS[k].frames.forEach(function (f) { var i = new Image(); i.src = frameUrl(f); }); });

  function open(opts) {
    opts = opts || {};
    var place = ROOMS[opts.place] ? opts.place : null;
    if (!place) return Promise.resolve();
    injectCss();
    var items = (opts.items || []).filter(function (i) { return i; });
    var item = items.filter(function (i) { return i.box; })[0] || items[0] || { label: "item" };
    var binKey = TYPE_BIN[item.type] || "general", bin = BIN[binKey];
    var lastFocus = document.activeElement, closed = false, resolveDone;
    var done = new Promise(function (r) { resolveDone = r; });

    var back = el("div", "vs-back");
    var win = el("div", "vs-win");
    win.setAttribute("role", "dialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-label", "Coco's villa patrol");
    win.innerHTML =
      '<div class="vs-head"><div><b>Coco in the villa</b><br><span>simulated robot · real villa photos</span></div><button type="button" class="vs-x">Close</button></div>' +
      '<div class="vs-stage"><div class="vs-layer"></div><div class="vs-layer"></div>' +
      '<div class="vs-photo"><div class="vs-pbox"><img alt="The photo sent to Coco"><div class="vs-det" hidden><i></i></div></div></div>' +
      '<div class="vs-scan"></div><div class="vs-vign"></div>' +
      '<div class="vs-hud"><div class="vs-c vs-c1"></div><div class="vs-c vs-c2"></div><div class="vs-c vs-c3"></div><div class="vs-c vs-c4"></div>' +
      '<div class="vs-rec"><i></i>COCO CAM</div><div class="vs-where"><b>Photo</b><small>locating</small></div>' +
      '<div class="vs-status" aria-live="polite">Reading where the photo was taken…</div>' +
      '<div class="vs-map"><svg viewBox="0 0 200 180" aria-hidden="true"></svg></div></div></div>' +
      '<div class="vs-steps"></div>' +
      '<p class="vs-note">Coco is simulated. The place comes from the photo itself: Litter Spotter recognised the room.</p>';
    back.appendChild(win); document.body.appendChild(back);
    var q = function (s) { return win.querySelector(s); };
    var layers = win.querySelectorAll(".vs-layer"), front = 0, stage = q(".vs-stage");
    var img = q(".vs-pbox img"), det = q(".vs-det"), scan = q(".vs-scan");
    img.src = opts.photo || "";

    function close() { if (closed) return; closed = true; document.removeEventListener("keydown", onKey); back.remove(); if (lastFocus && lastFocus.focus) lastFocus.focus(); resolveDone(); }
    function onKey(e) { if (e.key === "Escape") close(); if (e.key === "Tab") { e.preventDefault(); q(".vs-x").focus(); } }
    q(".vs-x").onclick = close; back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey); q(".vs-x").focus();

    // mini map
    var NS = "http://www.w3.org/2000/svg", svg = q(".vs-map svg");
    function center(k) { var b = ROOMS[k].box; return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }
    Object.keys(ROOMS).forEach(function (k) {
      var b = ROOMS[k].box, r = document.createElementNS(NS, "rect");
      r.setAttribute("x", b[0] + 1); r.setAttribute("y", b[1] + 1); r.setAttribute("width", b[2] - 2); r.setAttribute("height", b[3] - 2); r.setAttribute("rx", 4);
      r.setAttribute("fill", "#F1EFF8"); r.setAttribute("stroke", "#C9C3E2"); r.setAttribute("data-k", k);
      var t = document.createElementNS(NS, "text"); t.setAttribute("x", b[0] + b[2] / 2); t.setAttribute("y", b[1] + b[3] / 2 + 3);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "8"); t.setAttribute("fill", "#3A4458"); t.setAttribute("font-family", "sans-serif");
      t.textContent = ROOMS[k].name.split(" ")[0]; svg.appendChild(r); svg.appendChild(t);
    });
    var trail = document.createElementNS(NS, "polyline"); trail.setAttribute("fill", "none"); trail.setAttribute("stroke", "#5A3FD6"); trail.setAttribute("stroke-width", "2"); trail.setAttribute("stroke-dasharray", "3 3"); svg.appendChild(trail);
    var pin = document.createElementNS(NS, "circle"); pin.setAttribute("r", "5"); pin.setAttribute("fill", "#5A3FD6"); var pc = center(place); pin.setAttribute("cx", pc[0]); pin.setAttribute("cy", pc[1]); svg.appendChild(pin);
    var dot = document.createElementNS(NS, "circle"); dot.setAttribute("r", "5.5"); dot.setAttribute("fill", "#E8A21F"); dot.setAttribute("stroke", "#141B2D"); dot.setAttribute("stroke-width", "1.5"); svg.appendChild(dot);
    var here = DOCK, pts = [];
    function setDot(k) { var c = center(k); dot.setAttribute("cx", c[0]); dot.setAttribute("cy", c[1]); pts.push(c.join(",")); trail.setAttribute("points", pts.join(" "));
      svg.querySelectorAll("rect").forEach(function (r) { r.setAttribute("fill", r.getAttribute("data-k") === k ? "#FCF0D6" : "#F1EFF8"); }); }
    setDot(here);

    function hud(room, sub, status) { if (room != null) q(".vs-where b").textContent = room; if (sub != null) q(".vs-where small").textContent = sub; if (status != null) q(".vs-status").textContent = status; }
    function show(frame, dolly) {
      q(".vs-photo").classList.remove("on");
      var next = layers[1 - front], cur = layers[front];
      next.classList.remove("dolly"); next.style.transform = "scale(1.02)"; next.style.backgroundImage = 'url("' + frameUrl(frame) + '")';
      void next.offsetWidth; next.classList.add("on"); cur.classList.remove("on");
      if (dolly && !reduce()) { next.classList.add("dolly"); requestAnimationFrame(function () { next.style.transform = "scale(1.22)"; }); }
      front = 1 - front;
    }
    function showPhoto(withBox) {
      q(".vs-photo").classList.add("on");
      if (withBox && item.box) { det.hidden = false; det.classList.remove("grab"); det.style.left = item.box.x * 100 + "%"; det.style.top = item.box.y * 100 + "%"; det.style.width = item.box.w * 100 + "%"; det.style.height = item.box.h * 100 + "%"; det.querySelector("i").textContent = item.label || "item"; }
      else det.hidden = true;
    }
    function toast(html) { var t = el("div", "vs-toast", html); stage.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
    var STEPS = ["Find the room", "Go there", "Pick it up", "Recycle", "Back to dock"], stepsEl = q(".vs-steps");
    STEPS.forEach(function (s) { stepsEl.appendChild(el("span", "vs-step", esc(s))); });
    function stepState(i) { stepsEl.querySelectorAll(".vs-step").forEach(function (s, j) { s.className = "vs-step" + (j < i ? " done" : j === i ? " now" : ""); }); }

    async function walk(to, label) {
      var p = route(here, to);
      for (var i = 1; i < p.length; i++) {
        if (closed) return;
        var k = p[i], r = ROOMS[k], last = i === p.length - 1; setDot(k);
        hud(r.name, last ? "arrived" : "passing through · next: " + ROOMS[p[i + 1]].name, label);
        var frames = last ? r.frames : [r.frames[0]];
        for (var j = 0; j < frames.length; j++) { if (closed) return; show(frames[j], true); await wait(last && j === frames.length - 1 ? 1700 : 1400); }
      }
      here = to;
    }

    (async function play() {
      stepState(0); showPhoto(true); scan.style.display = "block";
      hud("Photo", "matching to the villa map", "Reading where the photo was taken…");
      await wait(1600); if (closed) return; scan.style.display = "none";
      hud(ROOMS[place].name, "found in the photo", opts.reason ? String(opts.reason).slice(0, 110) : "Litter Spotter recognised this room.");
      await wait(1800); if (closed) return;
      stepState(1);
      if (place !== here) await walk(place, "On the way to the " + ROOMS[place].name.toLowerCase()); if (closed) return;
      stepState(2); showPhoto(true); hud(ROOMS[place].name, "picking it up", "Picking up the " + (item.label || "item") + "…");
      await wait(1200); if (closed) return; det.classList.add("grab"); await wait(1000); if (closed) return;
      toast('<s style="background:' + bin.color + '"></s>Picked up: ' + esc(item.label || "item"));
      stepState(3); await walk(BINS_ROOM, "Taking it to the " + bin.name); if (closed) return;
      toast('<s style="background:' + bin.color + '"></s>Sorted into the ' + esc(bin.name)); await wait(1400); if (closed) return;
      stepState(4); await walk(DOCK, "Heading back to the dock"); if (closed) return;
      stepState(5); hud("Reception", "docked · charging", "Done. The " + (item.label || "item") + " is in the " + bin.name + ".");
    })();
    return done;
  }

  window.VillaSim = { isVilla: function (p) { return !!ROOMS[p] && p !== "laundry"; }, open: open, rooms: Object.keys(ROOMS) };
})();
