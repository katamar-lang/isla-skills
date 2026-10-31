/* Creates the server wallets for Isla Skills on YOUR computer, so no key passes through anyone else.
   Run:  node scripts/new-keys.mjs
   Then paste each line in Netlify → Site configuration → Environment variables (mark them secret).
   Devnet only. Never commit, share or paste these values in a chat. */
import { generateKeyPairSync } from "node:crypto";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = bytes => { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b) break; s = "1" + s; } return s; };
function wallet() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { secret: JSON.stringify([...seed, ...pub]), address: b58(pub) };
}
const coco = wallet(), sponsor = wallet();
console.log("# Coco's wallet (pays the skills). Top it up with devnet USDC from your own wallet.");
console.log("# Address: " + coco.address);
console.log("COCO_SECRET_KEY=" + coco.secret);
console.log("");
console.log("# Sponsor wallet (pays tiny network fees to open USDC accounts, and plan B fees). Send it 1 devnet SOL.");
console.log("# Address: " + sponsor.address);
console.log("SPONSOR_SECRET_KEY=" + sponsor.secret);
