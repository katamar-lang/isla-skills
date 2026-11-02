/* Isla Skills · any Solana wallet (Solflare, Phantom, Backpack…), shared by index.html and review.html.
   Wallet Standard: every compatible wallet announces itself with two browser events, so no wallet is
   hard-coded. Older injected providers are a fallback. Needs web3.min.js (window.solanaWeb3 + Buffer). */
(function () {
  const W = window.solanaWeb3;
  const CHAIN = "solana:devnet";
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", USDC_DECIMALS = 6;
  const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  const pk = a => new W.PublicKey(a);
  const listeners = [];
  const emit = () => listeners.forEach(cb => { try { cb(); } catch (e) {} });

  /* ---- Wallet Standard discovery ---- */
  const stdWallets = [], adapters = new Map();
  function addStdWallet(w) {
    try {
      if (!w || stdWallets.includes(w)) return;
      const f = w.features || {};
      const solana = (w.chains || []).some(c => String(c).startsWith("solana:"));
      if (!solana || !f["standard:connect"] || !(f["solana:signTransaction"] || f["solana:signAndSendTransaction"])) return;
      stdWallets.push(w); emit();
    } catch (e) {}
  }
  const api = { register: (...ws) => { ws.forEach(addStdWallet); return () => {}; } };
  window.addEventListener("wallet-standard:register-wallet", e => { try { e.detail(api); } catch (err) {} });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api })); } catch (e) {}

  function b58encode(bytes) {
    let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
    let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
    for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
    return s;
  }
  /* Gives a Wallet Standard wallet the shape of the older providers. */
  function adapter(w) {
    if (adapters.has(w)) return adapters.get(w);
    const f = w.features; let acct = null;
    const pick = accs => (accs || []).find(a => !a.chains || a.chains.some(c => String(c).startsWith("solana:"))) || null;
    const bytes = t => t.serialize({ requireAllSignatures: false, verifySignatures: false });
    const a = {
      publicKey: null,
      async connect(opts) {
        const r = await f["standard:connect"].connect(opts && opts.onlyIfTrusted ? { silent: true } : undefined);
        acct = pick(r && r.accounts && r.accounts.length ? r.accounts : w.accounts);
        if (!acct) throw new Error("no account");
        a.publicKey = new W.PublicKey(acct.address); return { publicKey: a.publicKey };
      },
      async disconnect() { acct = null; a.publicKey = null; if (f["standard:disconnect"]) await f["standard:disconnect"].disconnect(); },
      on(ev, cb) {
        if (ev !== "accountChanged" || !f["standard:events"]) return;
        f["standard:events"].on("change", ch => { if (!ch || !ch.accounts) return; acct = pick(ch.accounts); a.publicKey = acct ? new W.PublicKey(acct.address) : null; cb(a.publicKey); });
      }
    };
    if (f["solana:signTransaction"]) a.signTransaction = async t => {
      const [out] = await f["solana:signTransaction"].signTransaction({ account: acct, transaction: bytes(t), chain: CHAIN });
      return W.Transaction.from(out.signedTransaction);
    };
    if (f["solana:signAndSendTransaction"]) a.signAndSendTransaction = async t => {
      const [out] = await f["solana:signAndSendTransaction"].signAndSendTransaction({ account: acct, transaction: bytes(t), chain: CHAIN });
      return { signature: typeof out.signature === "string" ? out.signature : b58encode(out.signature) };
    };
    adapters.set(w, a); return a;
  }
  function list() {
    const out = stdWallets.map(w => ({ key: "std:" + w.name, name: w.name, p: adapter(w) }));
    const has = n => out.some(x => x.name.toLowerCase().includes(n));
    const ph = window.phantom && window.phantom.solana;
    if (!has("solflare") && window.solflare && window.solflare.isSolflare) out.push({ key: "solflare", name: "Solflare", p: window.solflare });
    if (!has("phantom") && ph && ph.isPhantom && !ph.isBraveWallet) out.push({ key: "phantom", name: "Phantom", p: ph });
    if (!has("backpack") && window.backpack && (window.backpack.isBackpack || window.backpack.connect)) out.push({ key: "backpack", name: "Backpack", p: window.backpack });
    if (!has("brave") && window.braveSolana) out.push({ key: "brave", name: "Brave Wallet", p: window.braveSolana });
    if (!out.length && window.solana && window.solana.connect) out.push({ key: "other", name: window.solana.isSolflare ? "Solflare" : window.solana.isPhantom ? "Phantom" : "Solana wallet", p: window.solana });
    return out;
  }
  let chosen = null, owner = null;
  const picked = () => { const l = list(); return l.find(x => x.key === chosen) || l[0] || null; };
  const watched = new WeakSet();
  function watch(p) {
    if (!p || watched.has(p)) return; watched.add(p);
    try { p.on && p.on("accountChanged", k => { if (!picked() || picked().p !== p) return; owner = k || null; emit(); }); } catch (e) {}
  }
  const keyFrom = (r, p) => (r && r.publicKey) || (p && p.publicKey) || null;

  /* Phones have no wallet in the browser: these links reopen the page inside a wallet app. */
  function openInLinks() {
    const u = encodeURIComponent(location.origin + location.pathname), r = encodeURIComponent(location.origin);
    return `<a class="openin" href="https://solflare.com/ul/v1/browse/${u}?ref=${r}" target="_blank" rel="noopener">Open in Solflare</a>` +
      `<a class="openin" href="https://phantom.app/ul/browse/${u}?ref=${r}" target="_blank" rel="noopener">Open in Phantom</a>` +
      `<a class="openin" href="https://backpack.app/ul/v1/browse/${u}?ref=${r}" target="_blank" rel="noopener">Open in Backpack</a>`;
  }

  /* ---- USDC (devnet) instructions, checked against @solana/spl-token ---- */
  const ataOf = o => W.PublicKey.findProgramAddressSync([o.toBuffer(), pk(TOKEN_PROGRAM).toBuffer(), pk(USDC_MINT).toBuffer()], pk(ATA_PROGRAM))[0];
  function createAtaIdempotentIx(payer, ata, o) {
    return new W.TransactionInstruction({ programId: pk(ATA_PROGRAM), data: Uint8Array.from([1]), keys: [
      { pubkey: payer, isSigner: true, isWritable: true }, { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: o, isSigner: false, isWritable: false }, { pubkey: pk(USDC_MINT), isSigner: false, isWritable: false },
      { pubkey: W.SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: pk(TOKEN_PROGRAM), isSigner: false, isWritable: false }] });
  }
  function transferCheckedIx(src, dst, o, amount) {
    const data = new Uint8Array(10); data[0] = 12;
    let a = BigInt(amount); for (let i = 0; i < 8; i++) { data[1 + i] = Number(a & 255n); a >>= 8n; }
    data[9] = USDC_DECIMALS;
    return new W.TransactionInstruction({ programId: pk(TOKEN_PROGRAM), data, keys: [
      { pubkey: src, isSigner: false, isWritable: true }, { pubkey: pk(USDC_MINT), isSigner: false, isWritable: false },
      { pubkey: dst, isSigner: false, isWritable: true }, { pubkey: o, isSigner: true, isWritable: false }] });
  }
  async function usdcUnits(conn, o) { try { const r = await conn.getTokenAccountBalance(ataOf(o)); return Number(r.value.amount); } catch (e) { return 0; } }

  async function sendTx(conn, t) {
    const bh = await conn.getLatestBlockhash();
    t.feePayer = owner; t.recentBlockhash = bh.blockhash;
    const w = picked().p; let sig;
    if (w.signAndSendTransaction) { const r = await w.signAndSendTransaction(t); sig = typeof r === "string" ? r : r.signature; }
    else { const signed = await w.signTransaction(t); sig = await conn.sendRawTransaction(signed.serialize()); }
    await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
    return sig;
  }
  /* Turns wallet and network errors into plain sentences. */
  function explain(e) {
    const m = String(e && e.message || e), n = picked() ? picked().name : "your wallet";
    if (/reject|denied|cancel/i.test(m)) return `Cancelled in ${n}.`;
    if (/expired|block height exceeded|blockhash|not found/i.test(m)) return `The transaction didn't reach Solana devnet. Switch ${n} to <b>Devnet</b> and try again.`;
    if (/insufficient|no record of a prior credit|debit an account/i.test(m)) return `${n} needs a little free devnet SOL for the network fee: <a href="https://faucet.solana.com" target="_blank" rel="noopener">faucet.solana.com</a>.`;
    return "Something went wrong: " + m.slice(0, 140).replace(/[<>&]/g, "");
  }

  window.IslaWallet = {
    USDC_MINT, ataOf, createAtaIdempotentIx, transferCheckedIx, usdcUnits, sendTx, explain, openInLinks, b58encode,
    list: () => list().map(x => ({ key: x.key, name: x.name })),
    choose(key) { chosen = key; emit(); },
    name: () => (picked() ? picked().name : "your wallet"),
    get owner() { return owner; },
    available: () => !!picked(),
    onChange(cb) { listeners.push(cb); },
    async connect(opts) {
      const w = picked(); if (!w) throw new Error("NO_WALLET");
      const r = await w.p.connect(opts); owner = keyFrom(r, w.p); if (!owner) throw new Error("no key");
      watch(w.p); emit(); return owner;
    },
    async connectSilently() { try { return await Promise.race([this.connect({ onlyIfTrusted: true }), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 1500))]); } catch (e) { return null; } },
    async disconnect() { const w = picked(); try { w && w.p.disconnect && await w.p.disconnect(); } catch (e) {} owner = null; emit(); }
  };
})();
