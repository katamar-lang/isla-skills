/* Isla Skills · any Solana wallet, shared by index.html and review.html.
   Uses the official Solana wallet adapter (anza-xyz/wallet-adapter) without React, from
   wallet-adapter.min.js: Wallet Standard discovery, StandardWalletAdapter for connect/sign/send,
   and the Mobile Wallet Adapter on Android. Older injected providers are a fallback.
   Load order: web3.min.js → wallet-adapter.min.js → wallet.js. */
(function () {
  const W = window.solanaWeb3, SWA = window.SolanaWalletAdapter;
  const CHAIN = "solana:devnet";
  const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", USDC_DECIMALS = 6;
  const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
  const pk = a => new W.PublicKey(a);
  const listeners = [];
  const emit = () => listeners.forEach(cb => { try { cb(); } catch (e) {} });

  /* ---- Mobile Wallet Adapter: on Android, the wallet app installed on the phone ---- */
  try {
    SWA.registerMwa({
      appIdentity: { name: "Isla Skills", uri: location.origin, icon: "favicon.png" },
      authorizationCache: SWA.createDefaultAuthorizationCache(),
      chains: [CHAIN],
      chainSelector: SWA.createDefaultChainSelector(),
      onWalletNotFound: SWA.createDefaultWalletNotFoundHandler()
    });
  } catch (e) {}

  /* ---- Wallet Standard discovery (official) ---- */
  const registry = SWA.getWallets();
  const adapters = new Map();
  function standardAdapters() {
    const out = [];
    for (const w of registry.get()) {
      try { // one badly made wallet must not hide the others
        if (!SWA.isWalletAdapterCompatibleStandardWallet(w)) continue;
        if (!adapters.has(w)) adapters.set(w, new SWA.StandardWalletAdapter({ wallet: w }));
        out.push(adapters.get(w));
      } catch (e) {}
    }
    return out;
  }
  registry.on("register", emit);
  registry.on("unregister", emit);
  const label = a => (a.name === SWA.SolanaMobileWalletAdapterWalletName ? "Wallet app on this phone" : a.name);

  function list() {
    const out = standardAdapters().map(a => ({ key: "std:" + a.name, name: label(a), p: a, std: true }));
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
  function watch(w) {
    if (!w || watched.has(w.p)) return; watched.add(w.p);
    const mine = () => picked() && picked().p === w.p;
    try {
      if (w.std) {
        w.p.on("connect", k => { if (mine()) { owner = k || null; emit(); } }); // also fires when the account changes
        w.p.on("disconnect", () => { if (mine()) { owner = null; emit(); } });
      } else if (w.p.on) w.p.on("accountChanged", k => { if (mine()) { owner = k || null; emit(); } });
    } catch (e) {}
  }

  /* Phones without a wallet in the browser (iPhone, or no wallet app): reopen the page inside one. */
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

  /* Waits for the transaction by asking every 700 ms (works everywhere, no websocket needed). */
  async function confirm(conn, sig, ms = 45000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const st = (await conn.getSignatureStatuses([sig])).value[0];
      if (st && st.err) throw new Error("transaction failed on Solana");
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
      await new Promise(r => setTimeout(r, 700));
    }
    throw new Error("block height exceeded: not confirmed in time");
  }
  /* Signs and sends with the chosen wallet. The adapter picks the devnet chain from the connection. */
  async function sendTx(conn, t) {
    const w = picked();
    const bh = await conn.getLatestBlockhash();
    t.feePayer = owner; t.recentBlockhash = bh.blockhash;
    let sig;
    if (w.std) sig = await w.p.sendTransaction(t, conn);
    else if (w.p.signAndSendTransaction) { const r = await w.p.signAndSendTransaction(t); sig = typeof r === "string" ? r : r.signature; }
    else { const signed = await w.p.signTransaction(t); sig = await conn.sendRawTransaction(signed.serialize()); }
    return confirm(conn, sig);
  }
  /* Turns wallet and network errors into plain sentences. */
  function explain(e) {
    const m = String(e && (e.message || (e.error && e.error.message)) || e), n = picked() ? picked().name : "your wallet";
    if (/reject|denied|cancel|declined/i.test(m)) return `Cancelled in ${n}.`;
    if (/expired|block height exceeded|blockhash|not found/i.test(m)) return `The transaction didn't reach Solana devnet. Switch ${n} to <b>Devnet</b> and try again.`;
    if (/insufficient|no record of a prior credit|debit an account/i.test(m)) return `${n} needs a little free devnet SOL for the network fee: <a href="https://faucet.solana.com" target="_blank" rel="noopener">faucet.solana.com</a>.`;
    return "Something went wrong: " + m.slice(0, 140).replace(/[<>&]/g, "");
  }

  window.IslaWallet = {
    USDC_MINT, ataOf, createAtaIdempotentIx, transferCheckedIx, usdcUnits, sendTx, confirm, explain, openInLinks,
    list: () => list().map(x => ({ key: x.key, name: x.name })),
    choose(key) { chosen = key; emit(); },
    name: () => (picked() ? picked().name : "your wallet"),
    get owner() { return owner; },
    available: () => !!picked(),
    onChange(cb) { listeners.push(cb); },
    async connect(opts) {
      const w = picked(); if (!w) throw new Error("NO_WALLET");
      watch(w);
      if (w.std) { await (opts && opts.onlyIfTrusted ? w.p.autoConnect() : w.p.connect()); owner = w.p.publicKey; }
      else { const r = await w.p.connect(opts); owner = (r && r.publicKey) || w.p.publicKey || null; }
      if (!owner) throw new Error("no key");
      emit(); return owner;
    },
    async connectSilently() {
      const w = picked();
      if (!w || (w.std && w.p.name === SWA.SolanaMobileWalletAdapterWalletName)) return null; // never open the phone wallet by itself
      try { return await Promise.race([this.connect({ onlyIfTrusted: true }), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 1500))]); } catch (e) { return null; }
    },
    async disconnect() { const w = picked(); try { w && w.p.disconnect && await w.p.disconnect(); } catch (e) {} owner = null; emit(); }
  };
})();
