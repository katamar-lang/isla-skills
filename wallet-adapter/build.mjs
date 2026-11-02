import * as esbuild from "esbuild";
import path from "node:path";
const shim = { name: "web3-global", setup(b) {
  b.onResolve({ filter: /^@solana\/web3\.js$/ }, () => ({ path: path.resolve("web3-shim.js") }));
  b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: "rn-storage", namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}", loader: "js" }));
} };
await esbuild.build({ entryPoints: ["entry.js"], bundle: true, minify: true, format: "iife", platform: "browser", target: ["es2020"],
  outfile: "../wallet-adapter.min.js", plugins: [shim], define: { "process.env.NODE_ENV": '"production"', global: "window" }, legalComments: "none", logLevel: "warning" });
