# wallet-adapter.min.js

The pages use the official Solana wallet adapter ([anza-xyz/wallet-adapter](https://github.com/anza-xyz/wallet-adapter)) without React:

- `@wallet-standard/app` finds every Wallet Standard wallet (Solflare, Phantom, Backpack…)
- `StandardWalletAdapter` connects, signs and sends
- `@solana-mobile/wallet-standard-mobile` adds the Mobile Wallet Adapter on Android, so a phone browser can use the wallet app installed on the phone

`@solana/web3.js` is not bundled: the build points it to `window.solanaWeb3` from `../web3.min.js`, which must load first.

Rebuild (only when changing versions):

```bash
cd wallet-adapter
npm install --legacy-peer-deps
npm run build
```
