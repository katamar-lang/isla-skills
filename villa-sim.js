/* Villa patrol pop-up: Coco drives through a 3D study model of the IslandDAO V5 villa.
   Coco is a simulated robot; the plan follows the owner's sketch (Nov 3). The room comes from
   Litter Spotter's answer (spot.place), so the photo itself says where Coco goes.

   Use:  VillaSim.isVilla(spot.place)                               -> true for a villa room
         VillaSim.open({ photo, place, reason, items, payments })    -> Promise, resolves when closed
         payments: [{ skill, units, sig }] real settled payments of this patrol (shown, never invented)
   three.js r128 is loaded from cdnjs/jsdelivr the first time the pop-up opens. Purely visual:
   no payments happen here. */
(function () {
  "use strict";

  /* ---------- the plan (metres on the owner's sketch grid: x right, z from the pool to the entrance) ---------- */
  var OX = 11, OZ = 26;
  function P(x, z) { return [x - OX, z - OZ]; }
  var ROOMS = {
    entrance:     { name: "Entrance",          r: [11, 41, 13.5, 46.5],  floor: "#ECE6DA", spot: [12.6, 45.2], node: "ENT" },
    billiards:    { name: "Billiards",         r: [4.5, 31, 10.5, 41],   floor: "#F1ECE3", spot: [9.3, 38.6],  node: "BIL" },
    tv_room:      { name: "TV room",           r: [4.5, 19.5, 10.5, 31], floor: "#F1ECE3", spot: [6.2, 28.4],  node: "TV" },
    living:       { name: "Big living room",   r: [10.5, 19.5, 15, 41],  floor: "#F4F0E8", spot: [11.6, 31.5], node: "SG" },
    small_living: { name: "Small living room", r: [15, 26.5, 21, 41],    floor: "#F4F0E8", spot: [19.2, 37],   node: "SP" },
    kitchen:      { name: "Kitchen",           r: [15, 15, 21, 26.5],    floor: "#F6F3EE", spot: [18.6, 17.6], node: "KIT" },
    dining:       { name: "Dining room",       r: [4.5, 15, 15, 19.5],   floor: "#F6F3EE", spot: [6.4, 17.2],  node: "DIN" },
    pool_terrace: { name: "Pool terrace",      r: [3, 6, 22, 15],        floor: "#E8DCC4", spot: [16.5, 13.6], node: "DECKE", outdoor: true },
    kiosk:        { name: "Kiosk",             r: [4.5, 7.6, 8, 11.6],   floor: "#D9C6A4", spot: [6.2, 10.4],  node: "KSK", outdoor: true },
    bbq:          { name: "BBQ terrace",       r: [10.5, 1.5, 15.5, 5.5],floor: "#E3D3B6", spot: [14.2, 3],    node: "BBQ", outdoor: true, y: 1.4 },
    garden:       { name: "Garden",            r: [-2, 15, 4.5, 45],     floor: "#B8D59A", spot: [1, 30.5],    node: "GW", outdoor: true }
  };
  var ALIAS = { reception: "living" };   // older answers
  var NODES = { DOCK: [12.6, 34.5], SG: [12.6, 28.5], PASW: [10.5, 25], TV: [7.5, 25], BIL: [7.5, 36.5], GW: [1.6, 25], GS: [1.6, 36], GAP3: [15, 39], SP: [18, 33.5], ENT: [12.2, 44],
    DIN2: [12.5, 17.4], DIN: [9, 17.3], KD: [16, 24], KIT: [18.5, 20.5], BIN: [19.4, 23.6], DECK: [9, 13.4], KSK: [6.3, 13.1], DECKE: [14, 13.5], STB: [8.5, 7.4], BBQ: [12.6, 3.4] };
  var NODE_Y = { BBQ: 1.4 };
  var EDGES = [["DOCK","SG"],["DOCK","ENT"],["DOCK","GAP3"],["GAP3","SP"],["SG","PASW"],["PASW","TV"],["TV","BIL"],["TV","GW"],["GW","GS"],["BIL","GS"],["SG","DIN2"],["DIN2","DIN"],["DIN","DECK"],["DECK","KSK"],["DECK","DECKE"],["DECK","STB"],["STB","BBQ"],["SG","KD"],["KD","KIT"],["KD","BIN"]];
  // Brazil's recycling colours (CONAMA 275)
  var BINS = { plastic: ["red", "#D93A3A"], paper: ["blue", "#2F6FD8"], metal: ["yellow", "#E8C21F"], glass: ["green", "#2E9E58"], general: ["grey", "#8A8F99"] };
  var TYPE_BIN = { plastic_bottle: "plastic", plastic_bag: "plastic", cup_or_straw: "plastic", food_wrapper: "plastic", styrofoam: "plastic", can: "metal", glass: "glass", paper_or_cardboard: "paper" };
  var SKILL_NAME = { "litter-spotter": "Litter Spotter", "human-reviewer": "Human Reviewer", "cleanup-planner": "Cleanup Planner" };

  var adj = {}; Object.keys(NODES).forEach(function (k) { adj[k] = []; });
  EDGES.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
  function d2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function route(from, to) {
    var d = {}, prev = {}, q = Object.keys(NODES); q.forEach(function (k) { d[k] = Infinity; }); d[from] = 0;
    while (q.length) { q.sort(function (a, b) { return d[a] - d[b]; }); var u = q.shift(); if (u === to) break;
      adj[u].forEach(function (v) { var n = d[u] + d2(NODES[u], NODES[v]); if (n < d[v]) { d[v] = n; prev[v] = u; } }); }
    var p = [], c = to; while (c) { p.unshift(c); c = prev[c]; } return p;
  }
  function reduce() { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- three.js, loaded once ---------- */
  var threeP = null;
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { no(new Error("load " + src)); }; document.head.appendChild(s); }); }
  function ensureThree() {
    if (window.THREE && THREE.OrbitControls) return Promise.resolve();
    // Served by this site (assets/three/, same r128 files), so it doesn't depend on a CDN during the demo;
    // the CDN is only a fallback.
    function pair(a, b) { return loadScript(a).then(function () { return window.THREE && THREE.OrbitControls ? null : loadScript(b); }); }
    return threeP || (threeP = pair("assets/three/three.min.js", "assets/three/OrbitControls.js")
      .catch(function () { return pair("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"); })
      .catch(function (e) { threeP = null; throw e; }));
  }

  /* ---------- styles ---------- */
  var CSS = [
    ".v3-back{position:fixed;inset:0;z-index:9999;background:rgba(12,14,30,.5);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:max(10px,env(safe-area-inset-top,0px)) max(10px,env(safe-area-inset-right,0px)) max(10px,env(safe-area-inset-bottom,0px)) max(10px,env(safe-area-inset-left,0px));animation:v3-in .3s ease both}",
    "@keyframes v3-in{from{opacity:0}to{opacity:1}}@keyframes v3-up{from{transform:translateY(30px)}to{transform:none}}",
    ".v3-win{width:min(1180px,100%);max-height:100%;overflow:auto;background:#F4F3FA;border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.4);display:grid;grid-template-columns:minmax(0,1fr) 300px;grid-template-rows:auto minmax(0,1fr);font-family:Geist,system-ui,-apple-system,'Segoe UI',sans-serif;color:#141B2D;animation:v3-up .4s cubic-bezier(.2,.9,.25,1) both}",
    ".v3-head{grid-column:1 / -1;display:flex;align-items:center;gap:10px;padding:12px 16px}",
    ".v3-head b{font-size:16px}.v3-head span{display:block;font:500 11px 'Geist Mono',ui-monospace,monospace;color:#3A4458}",
    ".v3-x{margin-left:auto;min-height:44px;padding:0 16px;border-radius:12px;border:1px solid rgba(20,27,45,.14);background:#fff;font:600 14px Geist,system-ui,sans-serif;color:#141B2D;cursor:pointer}",
    ".v3-stagebox{margin:0 0 12px 12px;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;background:radial-gradient(42% 38% at 6% 4%,rgba(236,206,140,.5),transparent 70%),radial-gradient(40% 36% at 96% 8%,rgba(226,104,104,.3),transparent 70%),radial-gradient(46% 40% at 4% 96%,rgba(150,140,232,.45),transparent 70%),radial-gradient(44% 38% at 60% 92%,rgba(150,236,226,.5),transparent 70%),#EEF0FA}",
    ".v3-stage{position:relative;flex:1;min-height:420px}",
    ".v3-stage canvas{display:block;width:100%;height:100%;position:absolute;inset:0;outline:none}",
    ".v3-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 14px Geist,system-ui,sans-serif;color:#3A4458;text-align:center;padding:20px}",
    ".v3-lbls{position:absolute;inset:0;pointer-events:none;overflow:hidden}",
    ".v3-rl{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;font:600 11px/1 Geist,system-ui,sans-serif;white-space:nowrap}",
    ".v3-rl span{background:rgba(255,255,255,.9);border:1px solid #fff;border-radius:999px;padding:4px 8px}.v3-rl i{display:block;width:1px;height:16px;background:rgba(20,27,45,.45)}",
    ".v3-rl.hot span{background:#141B2D;color:#fff;border-color:#141B2D}.v3-rl.tgt span{background:#E8A21F;border-color:#E8A21F}",
    ".v3-status{position:absolute;left:12px;bottom:12px;max-width:calc(100% - 24px);font:12.5px 'Geist Mono',ui-monospace,monospace;background:rgba(255,255,255,.9);border-radius:999px;padding:8px 13px;color:#3A4458}",
    ".v3-status b{color:#141B2D}",
    ".v3-cam{display:flex;justify-content:flex-end;gap:6px;padding:8px 10px 0}",
    ".v3-cam button{min-height:44px;padding:0 11px;border-radius:999px;border:1px solid rgba(20,27,45,.12);background:rgba(255,255,255,.9);font:500 12px Geist,system-ui,sans-serif;color:#141B2D;cursor:pointer}",
    ".v3-cam button[aria-pressed=true]{background:#141B2D;color:#fff}",
    ".v3-side{padding:0 12px 12px;display:flex;flex-direction:column;gap:10px;min-width:0}",
    ".v3-card{background:rgba(255,255,255,.75);border:1px solid #fff;border-radius:14px;padding:12px}",
    ".v3-lbl{font:500 10.5px 'Geist Mono',ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#5A6478}",
    ".v3-photo{display:flex;gap:10px;align-items:center;margin-top:6px}.v3-photo img{width:64px;height:64px;object-fit:cover;border-radius:10px}",
    ".v3-photo p{margin:0;font-size:13px;line-height:1.4;color:#3A4458}.v3-photo p b{color:#141B2D}",
    ".v3-steps{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}",
    ".v3-steps li{font:12.5px 'Geist Mono',ui-monospace,monospace;color:#5A6478;display:flex;gap:8px;align-items:center}",
    ".v3-steps li::before{content:'';width:9px;height:9px;border-radius:50%;background:#D6D3E2;flex-shrink:0}",
    ".v3-steps li.now{color:#7A4F00}.v3-steps li.now::before{background:#E8A21F}.v3-steps li.done{color:#0B7A52}.v3-steps li.done::before{background:#12A06A}",
    ".v3-pays{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;font:12px 'Geist Mono',ui-monospace,monospace}",
    ".v3-pays li{display:flex;justify-content:space-between;gap:8px}.v3-pays a{color:#5A45D8}",
    ".v3-map{display:block;width:100%;height:auto;margin-top:6px;border-radius:10px;background:rgba(255,255,255,.7)}",
    ".v3-note{margin:0;font-size:11.5px;line-height:1.45;color:#5A6478}",
    ".v3-toast{position:absolute;left:50%;top:12px;transform:translateX(-50%);background:rgba(255,255,255,.96);border-radius:12px;padding:8px 12px;font:600 13px Geist,system-ui,sans-serif;display:flex;gap:8px;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.18);white-space:nowrap;animation:v3-in .3s ease both}",
    ".v3-toast s{width:12px;height:12px;border-radius:3px;display:inline-block}",
    "@media (max-width:820px){.v3-win{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto}.v3-stagebox{margin:0 10px 10px}.v3-stage{flex:none;min-height:0;aspect-ratio:4/5}.v3-side{padding:0 10px 10px}.v3-rl{font-size:10px}.v3-mapcard{display:none}}",
    "@media (prefers-reduced-motion:reduce){.v3-back,.v3-win,.v3-toast{animation:none}}"
  ].join("\n");
  var cssDone = false;
  function injectCss() { if (cssDone) return; var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); cssDone = true; }

  /* ---------- the scene: built from the plan ---------- */
  function buildScene(T) {
    var scene = new T.Scene(), M = {};
    function mat(c, o) { var k = c + JSON.stringify(o || {}); return M[k] || (M[k] = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .6, metalness: 0 }, o || {}))); }
    var edgeMat = new T.LineBasicMaterial({ color: 0x2A3247, transparent: true, opacity: .32 });
    function outline(m) { m.add(new T.LineSegments(new T.EdgesGeometry(m.geometry, 30), edgeMat)); return m; }
    function box(w, h, d, c, x, y, z, o, noEdge) { var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); m.castShadow = !(o && o.transparent); m.receiveShadow = true; if (!noEdge) outline(m); scene.add(m); return m; }
    function pbox(x0, z0, x1, z1, h, c, y, o, noEdge) { var a = P(x0, z0), b = P(x1, z1); return box(b[0] - a[0], h, b[1] - a[1], c, (a[0] + b[0]) / 2, y || 0, (a[1] + b[1]) / 2, o, noEdge); }
    function pcyl(r1, r2, h, c, x, z, y, seg, o) { var p = P(x, z); var m = new T.Mesh(new T.CylinderGeometry(r1, r2, h, seg || 24), mat(c, o)); m.position.set(p[0], (y || 0) + h / 2, p[1]); m.castShadow = true; m.receiveShadow = true; outline(m); scene.add(m); return m; }
    function wall(x0, z0, x1, z1, glass) { var a = P(x0, z0), b = P(x1, z1), len = Math.hypot(b[0] - a[0], b[1] - a[1]), h = glass ? 2.4 : 1.25;
      var m = new T.Mesh(new T.BoxGeometry(len, h, .18), glass ? mat("#BFE3F0", { transparent: true, opacity: .26, roughness: .08 }) : mat("#FFFFFF", { roughness: .7 }));
      m.position.set((a[0] + b[0]) / 2, h / 2, (a[1] + b[1]) / 2); m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); m.castShadow = !glass; m.receiveShadow = true; outline(m); scene.add(m); }

    scene.add(new T.HemisphereLight(0xffffff, 0xd9d3c7, .82));
    var sun = new T.DirectionalLight(0xfff6e8, .78); sun.position.set(-18, 34, -12); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, far: 120 }); sun.shadow.bias = -.0004; scene.add(sun);
    var fill = new T.DirectionalLight(0xdfe6ff, .25); fill.position.set(20, 18, 26); scene.add(fill);
    var sf = new T.Mesh(new T.PlaneGeometry(240, 240), new T.ShadowMaterial({ opacity: .16 })); sf.rotation.x = -Math.PI / 2; sf.position.y = -.01; sf.receiveShadow = true; scene.add(sf);
    pbox(-3.5, 0, 23.5, 48, .25, "#F7F5F0", -.25);

    var floors = {};
    Object.keys(ROOMS).forEach(function (k) { var r = ROOMS[k]; if (k === "bbq") return; floors[k] = pbox(r.r[0], r.r[1], r.r[2], r.r[3], .06, r.floor, 0, { roughness: .85 }, true); });
    pbox(9.2, 9, 18, 12, .08, "#62C6E0", .01, { roughness: .15, metalness: .05 }); pbox(8.9, 8.7, 18.3, 12.3, .05, "#D9CCB2", 0, {}, true);
    floors.bbq = pbox(10.5, 1.5, 15.5, 5.5, 1.4, ROOMS.bbq.floor, 0, { roughness: .85 });
    for (var i = 0; i < 7; i++) { var t = i / 7, sp = P(8.4 + t * 2.2, 7.8 - t * 2.4); box(1.3, .2 * (i + 1), .42, "#E9DDC6", sp[0], 0, sp[1]); }

    wall(4.5, 15, 8, 15, true); wall(10, 15, 21, 15, true);
    wall(4.5, 15, 4.5, 24); wall(4.5, 26, 4.5, 35); wall(4.5, 37, 4.5, 41);
    wall(4.5, 41, 11, 41); wall(13.5, 41, 21, 41); wall(21, 15, 21, 41);
    wall(4.5, 19.5, 6, 19.5); wall(8, 19.5, 10.5, 19.5); wall(10.5, 19.5, 10.5, 23); wall(10.5, 27, 10.5, 41);
    wall(4.5, 31, 6.5, 31); wall(8.5, 31, 10.5, 31); wall(15, 26.5, 15, 37); wall(16.8, 26.5, 21, 26.5); wall(16.5, 15, 16.5, 21);
    wall(11, 41, 11, 46.5); wall(13.5, 41, 13.5, 46.5);
    [[8, 15], [12, 15], [16, 15], [4.5, 15], [21, 15]].forEach(function (p) { pcyl(.26, .26, 2.7, "#FFFFFF", p[0], p[1]); });

    pbox(5.6, 33.5, 8.6, 35.2, .8, "#6B3E26"); pbox(5.75, 33.65, 8.45, 35.05, .06, "#C0434B", .8);
    pbox(7.6, 38.6, 10.2, 39.6, .06, "#7A5638", .74); [[7.7, 38.7], [10.1, 38.7], [7.7, 39.5], [10.1, 39.5]].forEach(function (p) { pbox(p[0] - .04, p[1] - .04, p[0] + .04, p[1] + .04, .74, "#222"); });
    pbox(5, 40.2, 7, 40.7, 1, "#24262C");
    pbox(4.9, 21, 6, 26.5, .8, "#1F2229"); pbox(4.9, 26.5, 8.4, 27.6, .8, "#1F2229"); pbox(6.6, 22.6, 8.4, 24.6, .38, "#0F1115"); pbox(5.6, 22, 9.6, 29.6, .03, "#3A4050", 0, {}, true);
    pbox(10, 21.2, 10.35, 24, 1.1, "#111317", .55);
    pbox(11.2, 30, 14.6, 31.2, .75, "#F1EBDD"); pbox(13.4, 31.2, 14.6, 34, .75, "#F1EBDD"); pbox(11.8, 32, 13, 33.4, .38, "#C08A55");
    pbox(10.8, 20.2, 12.6, 20.8, .85, "#C08A55"); pbox(11.1, 20.3, 11.6, 20.4, .32, "#1C1F24", .85);
    var sc = P(13.8, 24.6);
    for (i = 0; i < 13; i++) { var a = i * .5, s = new T.Mesh(new T.BoxGeometry(1.1, .08, .38), mat("#EDE6D8")); s.position.set(sc[0] + Math.cos(a) * .55, .2 + i * .2, sc[1] + Math.sin(a) * .55); s.rotation.y = -a; s.castShadow = true; outline(s); scene.add(s); }
    pcyl(.08, .08, 2.8, "#B9B3A6", 13.8, 24.6);
    pbox(16.2, 36.4, 19.6, 37.4, .75, "#FBFAF6"); pbox(18.6, 33.4, 19.6, 36.4, .75, "#FBFAF6"); pbox(20.5, 33, 20.85, 36, 1, "#111317", .5);
    pbox(16.6, 18.4, 20, 19.4, .95, "#FFFFFF"); for (i = 0; i < 5; i++) pbox(16.9 + i * .65, 19.6, 17.3 + i * .65, 20, .7, "#C7A27A");
    pbox(17, 15.2, 20.8, 15.9, .95, "#F3EFE8"); pbox(20.1, 16.4, 20.8, 17.4, 2, "#C8CCD0", 0, { metalness: .4, roughness: .45 });
    var binSpots = {};
    Object.keys(BINS).forEach(function (k, j) { var z = 22.5 + j * .55; pbox(20.3, z - .22, 20.75, z + .22, .7, BINS[k][1]); binSpots[k] = [20.5, z]; });
    pcyl(1.15, 1.15, .07, "#F2EFE8", 8.8, 17.2, .74, 40); pcyl(.12, .26, .74, "#D9D2C4", 8.8, 17.2);
    for (i = 0; i < 8; i++) { var an = i / 8 * Math.PI * 2, cx = 8.8 + Math.cos(an) * 1.6, cz = 17.2 + Math.sin(an) * 1.6; pbox(cx - .22, cz - .22, cx + .22, cz + .22, .48, "#B07A4A"); }
    [[4.6, 7.7], [7.9, 7.7], [4.6, 11.5], [7.9, 11.5]].forEach(function (p) { pbox(p[0], p[1], p[0] + .18, p[1] + .18, 2.4, "#6B4B32"); });
    pbox(4.2, 7.3, 8.4, 12, .18, "#5A3E2A", 2.4); pbox(5.4, 9.2, 7.2, 10.2, .05, "#7A5638", .74);
    for (i = 0; i < 4; i++) pbox(10 + i * 1.9, 13.1, 11.6 + i * 1.9, 14.4, .32, "#2F4A8A");
    pcyl(1, 1, .48, "#B98B5B", 19.8, 13.4, 0, 28); pcyl(.92, .92, .12, "#2E3D55", 19.8, 13.4, .48, 28);
    pbox(13.6, 2.4, 14.4, 3, 1, "#26282C", 1.4);
    pbox(-1.2, 20, 1.6, 21.2, .06, "#6B4B32", .74); [[-1.1, 20.1], [1.5, 20.1], [-1.1, 21.1], [1.5, 21.1]].forEach(function (p) { pbox(p[0] - .04, p[1] - .04, p[0] + .04, p[1] + .04, .74, "#222"); });
    var tp = P(.2, 20.6), tent = new T.Mesh(new T.ConeGeometry(2.4, 1.2, 4), mat("#FFFFFF", { transparent: true, opacity: .5 })); tent.position.set(tp[0], 3, tp[1]); tent.rotation.y = Math.PI / 4; scene.add(tent);
    pcyl(1.2, 1.2, .5, "#FFFFFF", .6, 40, 0, 32); pcyl(1, 1, .05, "#7FD3E6", .6, 40, .5, 32);
    pbox(-3.4, 15, -2.4, 47.5, 1.7, "#5E8A4A"); pbox(-3.4, 6, 23.4, 6.6, 1.6, "#5E8A4A");
    pcyl(.7, .7, .04, "#E8A21F", 12.6, 34.5, 0, 36, { emissive: "#E8A21F", emissiveIntensity: .25 });

    // Coco
    var coco = new T.Group();
    var body = new T.Mesh(new T.BoxGeometry(.9, .72, .8), mat("#E8A21F", { roughness: .45, metalness: .1 })); body.position.y = .6; body.castShadow = true; outline(body); coco.add(body);
    var faceMesh = new T.Mesh(new T.BoxGeometry(.64, .36, .04), mat("#141B2D", { roughness: .3 })); faceMesh.position.set(0, .66, .41); coco.add(faceMesh);
    [-.14, .14].forEach(function (x) { var e = new T.Mesh(new T.SphereGeometry(.055, 12, 12), mat("#FFFFFF", { emissive: "#FFFFFF", emissiveIntensity: .9 })); e.position.set(x, .68, .44); coco.add(e); });
    var ant = new T.Mesh(new T.CylinderGeometry(.02, .02, .3, 8), mat("#141B2D")); ant.position.y = 1.12; coco.add(ant);
    var bulb = new T.Mesh(new T.SphereGeometry(.07, 12, 12), mat("#FF7A59", { emissive: "#FF7A59", emissiveIntensity: .8 })); bulb.position.y = 1.3; coco.add(bulb);
    [[-.4, .2], [.4, .2], [-.4, -.25], [.4, -.25]].forEach(function (p) { var w = new T.Mesh(new T.CylinderGeometry(.13, .13, .1, 16), mat("#141B2D")); w.rotation.z = Math.PI / 2; w.position.set(p[0], .13, p[1]); w.castShadow = true; coco.add(w); });
    var tray = new T.Mesh(new T.BoxGeometry(.56, .05, .4), mat("#141B2D")); tray.position.y = .98; coco.add(tray);
    scene.add(coco);
    return { scene: scene, mat: mat, outline: outline, floors: floors, coco: coco, body: body, bulb: bulb, binSpots: binSpots };
  }

  function makeItem(T, W, kind) {
    var g = new T.Group(), m;
    if (kind === "metal") { m = new T.Mesh(new T.CylinderGeometry(.08, .08, .22, 16), W.mat("#C8323C", { metalness: .5, roughness: .35 })); m.position.y = .11; g.add(m); }
    else if (kind === "paper") { m = new T.Mesh(new T.BoxGeometry(.5, .35, .4), W.mat("#C49A66")); m.position.y = .18; W.outline(m); g.add(m); }
    else if (kind === "glass") { m = new T.Mesh(new T.CylinderGeometry(.09, .1, .34, 14), W.mat("#3E9E6A", { transparent: true, opacity: .8, roughness: .15 })); m.position.y = .17; g.add(m); }
    else { m = new T.Mesh(new T.CylinderGeometry(.1, .1, .32, 14), W.mat("#9ED3EA", { transparent: true, opacity: .85, roughness: .15 })); m.position.y = .16; var cap = new T.Mesh(new T.CylinderGeometry(.05, .05, .06, 10), W.mat("#2F6FD8")); cap.position.y = .36; g.add(m, cap); }
    g.traverse(function (o) { o.castShadow = true; }); g.scale.setScalar(1.6); return g;
  }

  /* ---------- the pop-up ---------- */
  var openNow = null;
  function open(opts) {
    opts = opts || {};
    var place = ALIAS[opts.place] || opts.place;
    if (!ROOMS[place]) return Promise.resolve();
    if (openNow) openNow();
    injectCss();
    var items = (opts.items || []).filter(Boolean), clean = !items.length;
    var it = items.filter(function (i) { return i.box; })[0] || items[0] || null;
    var kind = it ? (TYPE_BIN[it.type] || "general") : "general", label = it ? (it.label || "item") : "";
    var room = ROOMS[place], closed = false, raf = 0, lastFocus = document.activeElement, resolveDone;
    var done = new Promise(function (r) { resolveDone = r; });
    var STEPS = clean ? ["Find the room", "Go there", "Check the room", "Back to the dock"] : ["Find the room", "Go there", "Pick it up", "Recycle", "Back to the dock"];
    var pays = (opts.payments || []).filter(function (p) { return p && p.units; });

    var back = document.createElement("div"); back.className = "v3-back";
    var win = document.createElement("div"); win.className = "v3-win";
    win.setAttribute("role", "dialog"); win.setAttribute("aria-modal", "true"); win.setAttribute("aria-label", "Coco in the villa");
    win.innerHTML =
      '<div class="v3-head"><div><b>Coco in the villa</b><span>simulated robot · 3D model of the IslandDAO V5 villa</span></div><button type="button" class="v3-x">Close</button></div>' +
      '<div class="v3-stagebox"><div class="v3-cam"><button type="button" data-v="follow" aria-pressed="true">Follow Coco</button><button type="button" data-v="whole" aria-pressed="false">Whole villa</button></div>' +
      '<div class="v3-stage"><div class="v3-msg">Loading the villa…</div><div class="v3-lbls"></div>' +
      '<div class="v3-status" aria-live="polite"><b>Found:</b> ' + esc(room.name) + '</div></div></div>' +
      '<div class="v3-side">' +
        '<div class="v3-card"><div class="v3-lbl">The photo</div><div class="v3-photo">' + (opts.photo ? '<img alt="The photo sent to Coco" src="' + esc(opts.photo) + '">' : '') +
          '<p><b>' + esc(room.name) + '</b>' + (opts.reason ? '<br>' + esc(String(opts.reason).slice(0, 120)) : '') + '<br>' + (clean ? 'No litter found.' : esc(label)) + '</p></div></div>' +
        '<div class="v3-card"><div class="v3-lbl">What Coco does</div><ol class="v3-steps">' + STEPS.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + '</ol></div>' +
        (pays.length ? '<div class="v3-card"><div class="v3-lbl">Paid by Coco this patrol</div><ul class="v3-pays">' + pays.map(function (p) {
          return '<li><span>' + esc(SKILL_NAME[p.skill] || p.skill) + '</span><span>' + (Number(p.units) / 1e6).toFixed(3) + ' USDC' + (p.sig ? ' · <a href="https://explorer.solana.com/tx/' + encodeURIComponent(p.sig) + '?cluster=devnet" target="_blank" rel="noopener">tx ↗</a>' : '') + '</span></li>'; }).join("") + '</ul></div>' : '') +
        '<div class="v3-card v3-mapcard"><div class="v3-lbl">Floor plan · route</div><canvas class="v3-map" width="260" height="280" aria-hidden="true"></canvas></div>' +
        '<p class="v3-note">Coco and this model are a simulation; the payments above are real (Solana devnet).</p>' +
      '</div>';
    back.appendChild(win); document.body.appendChild(back);
    var q = function (s) { return win.querySelector(s); };
    var stage = q(".v3-stage"), statusEl = q(".v3-status"), stepsEl = q(".v3-steps");
    function status(h) { statusEl.innerHTML = h; }
    function step(i) { stepsEl.querySelectorAll("li").forEach(function (li, j) { li.className = j < i ? "done" : j === i ? "now" : ""; }); }
    function toast(h) { var t = document.createElement("div"); t.className = "v3-toast"; t.innerHTML = h; stage.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }

    var R = null; // three.js state, filled when loaded
    function close() { if (closed) return; closed = true; openNow = null; cancelAnimationFrame(raf); removeEventListener("resize", onResize); document.removeEventListener("keydown", onKey);
      if (R) { R.renderer.dispose(); R.renderer.forceContextLoss && R.renderer.forceContextLoss(); }
      back.remove(); if (lastFocus && lastFocus.focus) lastFocus.focus(); resolveDone(); }
    openNow = close;
    function onKey(e) { if (e.key === "Escape") close(); }
    function onResize() { if (!R) return; var w = stage.clientWidth, h = stage.clientHeight; R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix(); }
    q(".v3-x").onclick = close; back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey); addEventListener("resize", onResize); q(".v3-x").focus();
    function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce() ? Math.min(ms, 200) : ms); }); }
    step(0);

    ensureThree().then(function () {
      if (closed) return;
      var T = window.THREE;
      q(".v3-msg").remove();
      var renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.outputEncoding = T.sRGBEncoding;
      stage.prepend(renderer.domElement);
      var W = buildScene(T), camera = new T.PerspectiveCamera(36, 1, .1, 400), controls = new T.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .47; controls.minDistance = 6; controls.maxDistance = 90;
      camera.position.set(25, 34, 45); controls.target.set(0, 0, 2);
      R = { renderer: renderer, camera: camera };
      onResize();

      // labels with leader lines
      var LBL = {}, lbls = q(".v3-lbls");
      Object.keys(ROOMS).forEach(function (k) { var d = document.createElement("div"); d.className = "v3-rl"; d.innerHTML = "<span></span><i></i>"; d.firstChild.textContent = ROOMS[k].name; lbls.appendChild(d); LBL[k] = d; });
      var S = { pos: NODES.DOCK.slice(), y: 0, node: "DOCK", path: [], faceTo: Math.PI, view: "follow", moveDone: null, target: place };
      var routeMesh = null, routeMat = new T.MeshBasicMaterial({ color: 0xE8A21F, transparent: true, opacity: .85 });
      function drawRoute(pts) { if (routeMesh) { W.scene.remove(routeMesh); routeMesh.geometry.dispose(); routeMesh = null; } if (pts.length < 2) return;
        var v = pts.map(function (p) { var a = P(p[0], p[1]); return new T.Vector3(a[0], (p[2] || 0) + .08, a[1]); });
        routeMesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(v, false, "catmullrom", .05), Math.max(20, v.length * 16), .06, 6, false), routeMat); W.scene.add(routeMesh); }
      function nodePt(k) { return NODES[k].concat([NODE_Y[k] || 0]); }
      function goPath(pts) { return new Promise(function (res) { S.path = pts.map(function (p) { return p.slice(); }); S.moveDone = res; drawRoute([[S.pos[0], S.pos[1], S.y]].concat(pts));
        if (reduce()) { var l = pts[pts.length - 1]; S.pos = [l[0], l[1]]; S.y = l[2] || 0; S.path = []; S.moveDone = null; res(); } }); }
      function goNode(k) { var p = route(S.node, k).slice(1).map(nodePt); S.node = k; return p.length ? goPath(p) : Promise.resolve(); }
      function approach() { var n = NODES[room.node], s = room.spot, dx = n[0] - s[0], dz = n[1] - s[1], d = Math.hypot(dx, dz) || 1, off = Math.min(.95, d); return [s[0] + dx / d * off, s[1] + dz / d * off, room.y || 0]; }
      function faceTo(x, z) { var p = P(x, z); S.faceTo = Math.atan2(p[0] - W.coco.position.x, p[1] - W.coco.position.z); }

      var sp = P(room.spot[0], room.spot[1]), item = null;
      var beacon = new T.Mesh(new T.CylinderGeometry(.05, .05, 5, 10), new T.MeshBasicMaterial({ color: 0xD9433B, transparent: true, opacity: .5 })); beacon.position.set(sp[0], (room.y || 0) + 2.5, sp[1]); W.scene.add(beacon);
      var ring = new T.Mesh(new T.TorusGeometry(.6, .045, 8, 40), new T.MeshBasicMaterial({ color: clean ? 0x12A06A : 0xD9433B })); ring.rotation.x = -Math.PI / 2; ring.position.set(sp[0], (room.y || 0) + .05, sp[1]); W.scene.add(ring);
      var scan = new T.Mesh(new T.ConeGeometry(.9, 2, 24, 1, true), new T.MeshBasicMaterial({ color: 0xE8A21F, transparent: true, opacity: .2, side: T.DoubleSide })); scan.visible = false; W.scene.add(scan);
      if (!clean) { item = makeItem(T, W, kind); item.position.set(sp[0], room.y || 0, sp[1]); W.scene.add(item); } else beacon.visible = false;

      var buttons = win.querySelectorAll(".v3-cam button");
      buttons.forEach(function (b) { b.onclick = function () { S.view = b.dataset.v; buttons.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); }; });
      controls.addEventListener("start", function () { S.view = "free"; buttons.forEach(function (x) { x.setAttribute("aria-pressed", "false"); }); });

      var mapC = q(".v3-map"), mx = mapC.getContext("2d");
      function drawMap() { var Wd = mapC.width, H = mapC.height, s = Math.min(Wd / 27, H / 48), ox = (Wd - 27 * s) / 2 + 3.5 * s, oz = (H - 48 * s) / 2 + .5 * s;
        function X(x) { return ox + x * s; } function Z(z) { return oz + z * s; }
        mx.clearRect(0, 0, Wd, H);
        Object.keys(ROOMS).forEach(function (k) { var r = ROOMS[k]; if (k === "garden" || k === "pool_terrace") return; mx.fillStyle = k === place ? "rgba(232,162,31,.35)" : "rgba(255,255,255,.95)"; mx.fillRect(X(r.r[0]), Z(r.r[1]), (r.r[2] - r.r[0]) * s, (r.r[3] - r.r[1]) * s); mx.strokeStyle = "rgba(20,27,45,.35)"; mx.strokeRect(X(r.r[0]) + .5, Z(r.r[1]) + .5, (r.r[2] - r.r[0]) * s, (r.r[3] - r.r[1]) * s); });
        mx.fillStyle = "rgba(98,198,224,.7)"; mx.fillRect(X(9.2), Z(9), 8.8 * s, 3 * s);
        if (S.path.length) { mx.strokeStyle = "#E8A21F"; mx.lineWidth = 2.5; mx.setLineDash([5, 4]); mx.beginPath(); mx.moveTo(X(S.pos[0]), Z(S.pos[1])); S.path.forEach(function (p) { mx.lineTo(X(p[0]), Z(p[1])); }); mx.stroke(); mx.setLineDash([]); }
        mx.fillStyle = "#E8A21F"; mx.strokeStyle = "#141B2D"; mx.lineWidth = 1.5; mx.beginPath(); mx.arc(X(S.pos[0]), Z(S.pos[1]), 5.5, 0, 7); mx.fill(); mx.stroke(); }

      var v3 = new T.Vector3(), clock = new T.Clock(), mapT = 0, SPEED = 2.4;
      function frame() {
        if (closed) return;
        var dt = Math.min(clock.getDelta(), .1), t = clock.elapsedTime; // up to .1 s so slow phones still move at the same speed
        if (S.path.length) { var g = S.path[0], dx = g[0] - S.pos[0], dz = g[1] - S.pos[1], L = Math.hypot(dx, dz);
          if (L < .04) { S.pos = [g[0], g[1]]; S.y = g[2] || 0; S.path.shift(); if (!S.path.length && S.moveDone) { var f = S.moveDone; S.moveDone = null; f(); } }
          else { var stp = Math.min(L, SPEED * dt); S.pos[0] += dx / L * stp; S.pos[1] += dz / L * stp; S.y += ((g[2] || 0) - S.y) * Math.min(1, stp / L); S.faceTo = Math.atan2(dx, dz); }
          W.body.position.y = .6 + Math.sin(t * 14) * .012; }
        var cp = P(S.pos[0], S.pos[1]); W.coco.position.set(cp[0], S.y, cp[1]);
        var a = S.faceTo - W.coco.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); W.coco.rotation.y += a * Math.min(1, dt * 7);
        W.bulb.material.emissiveIntensity = .5 + Math.abs(Math.sin(t * 3)) * .5;
        var k = 1 + Math.sin(t * 4) * .15; ring.scale.set(k, k, k);
        if (scan.visible) { scan.position.set((W.coco.position.x + sp[0]) / 2, .55 + S.y, (W.coco.position.z + sp[1]) / 2); scan.lookAt(sp[0], S.y, sp[1]); scan.rotateX(Math.PI / 2); scan.material.opacity = .14 + Math.abs(Math.sin(t * 9)) * .16; }
        Object.keys(W.floors).forEach(function (fk) { W.floors[fk].material = fk === S.target ? W.mat("#F6D58E", { roughness: .8, emissive: "#E8A21F", emissiveIntensity: .2 }) : W.mat(ROOMS[fk].floor, { roughness: .85 }); });
        if (S.view === "follow") { var goal = new T.Vector3(cp[0], S.y, cp[1]); controls.target.lerp(goal, .07); camera.position.lerp(goal.clone().add(camera.aspect < 1 ? new T.Vector3(11, 19, 21) : new T.Vector3(9, 13, 15)), .04); }
        else if (S.view === "whole") { controls.target.lerp(new T.Vector3(0, 0, 2), .06); camera.position.lerp(new T.Vector3(25, 34, 45), .05); }
        controls.update(); renderer.render(W.scene, camera);
        var w = stage.clientWidth, h = stage.clientHeight, here = null;
        Object.keys(ROOMS).forEach(function (rk) { var r = ROOMS[rk]; if (S.pos[0] >= r.r[0] && S.pos[0] <= r.r[2] && S.pos[1] >= r.r[1] && S.pos[1] <= r.r[3] && (!here || ROOMS[here].outdoor)) here = rk; });
        Object.keys(ROOMS).forEach(function (rk) { var r = ROOMS[rk], c = P((r.r[0] + r.r[2]) / 2, (r.r[1] + r.r[3]) / 2); v3.set(c[0], (r.y || 0) + 1.6, c[1]).project(camera);
          var el = LBL[rk], sx = (v3.x + 1) / 2 * w, sy = (1 - v3.y) / 2 * h; el.style.left = Math.min(Math.max(sx, 48), w - 48) + "px"; el.style.top = Math.max(sy, 40) + "px"; // keep the label inside the view el.style.display = (v3.z < 1 && sx > -60 && sx < w + 60 && sy > 0 && sy < h + 30) ? "" : "none";
          el.classList.toggle("hot", rk === here); el.classList.toggle("tgt", rk === S.target); });
        if (t - mapT > .1) { mapT = t; drawMap(); }
        raf = requestAnimationFrame(frame);
      }
      renderer.compile(W.scene, camera); frame();

      // the story: every step moves S; the scene, the labels and the map read S
      (async function play() {
        status("<b>Found:</b> " + esc(room.name) + (opts.reason ? " · " + esc(String(opts.reason).slice(0, 60)) : ""));
        await wait(1400); if (closed) return;
        step(1); var p = route(S.node, room.node).slice(1).map(nodePt); p.push(approach());
        status("<b>On the way</b> to the " + esc(room.name) + "…"); await goPath(p); S.node = room.node; if (closed) return;
        faceTo(room.spot[0], room.spot[1]); await wait(400); if (closed) return;
        step(2); scan.visible = true; status(clean ? "<b>Checking</b> the room…" : "<b>Picking up</b> the " + esc(label) + "…"); await wait(1500); scan.visible = false; if (closed) return;
        if (clean) {
          ring.visible = false; toast("All clean here. Nothing to pick up."); status("<b>All clean.</b> Nothing to pick up."); await wait(1600); if (closed) return;
          step(3); status("<b>Back</b> to the dock…"); await goNode("DOCK"); if (closed) return;
          drawRoute([]); S.target = null; step(4); status("<b>Docked.</b> The " + esc(room.name) + " is clean."); return;
        }
        W.scene.remove(item); item.position.set(0, 1.02, 0); item.scale.setScalar(1.1); W.coco.add(item); beacon.visible = false; ring.visible = false;
        toast('<s style="background:' + BINS[kind][1] + '"></s>Picked up: ' + esc(label));
        step(3); status("<b>Taking it</b> to the " + BINS[kind][0] + " bin in the kitchen…"); await goNode("BIN"); if (closed) return;
        var b = W.binSpots[kind]; faceTo(b[0], b[1]); await wait(500); W.coco.remove(item);
        toast('<s style="background:' + BINS[kind][1] + '"></s>Sorted into the ' + BINS[kind][0] + ' bin (' + kind + ')'); await wait(1200); if (closed) return;
        step(4); S.target = null; status("<b>Back</b> to the dock…"); await goNode("DOCK"); if (closed) return;
        drawRoute([]); step(5); faceTo(12.6, 40); status("<b>Done.</b> The " + esc(label) + " is in the " + BINS[kind][0] + " bin.");
      })();
    }).catch(function () {
      if (closed) return;
      q(".v3-msg").textContent = "The 3D villa couldn't load on this connection. Coco went to the " + room.name + (clean ? ": all clean." : " and picked up the " + label + ".");
      step(STEPS.length);
    });
    return done;
  }

  window.VillaSim = { preload: function () { ensureThree().catch(function () {}); }, isVilla: function (p) { return !!ROOMS[ALIAS[p] || p]; }, open: open, rooms: Object.keys(ROOMS) };
})();
