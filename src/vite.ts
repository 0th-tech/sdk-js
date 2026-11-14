// The Vite settings the sdk's own dependencies need in a dapp's build

import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const CRYPTO_SHIM = fileURLToPath(new URL("./crypto-shim.ts", import.meta.url));

// Excluded from pre-bundling, so Vite serves them as the ESM and WASM they already ship
const UNBUNDLED = [
  "@aztec/bb.js",
  "@noir-lang/noir_js",
  "@noir-lang/acvm_js",
  "@noir-lang/noirc_abi",
  // The pre-bundler resolves imports before any plugin, so resolveId below only sees garaga's
  // crypto import when garaga is excluded
  "garaga",
];

// bb.js is excluded above, so its CommonJS deps are named here to be pre-bundled. Without this
// pino provides no named export and the page does not mount
const COMMONJS_DEPS = ["@aztec/bb.js > pino", "@aztec/bb.js > buffer"];

export type ZkLoginOptions = {
  // The name this package has in the dapp's package.json, which Vite's dependency paths start with
  sdk?: string;
  // Path of the verification key. It has no extension, so Vite must be told it is an asset
  vk?: string;
};

export function zkLogin({ sdk = "sdk", vk }: ZkLoginOptions = {}): Plugin {
  return {
    name: "zk-login",
    enforce: "pre",

    config: () => ({
      ...(vk && { assetsInclude: [vk] }),
      server: {
        // Cross-origin isolation, which bb.js needs to prove on several threads. Vite applies
        // these headers to its preview server as well
        headers: {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
        },
      },
      optimizeDeps: {
        exclude: UNBUNDLED,
        include: COMMONJS_DEPS.map((dep) => `${sdk} > ${dep}`),
      },
    }),

    // Garaga imports crypto at the top of its bundle, which a browser cannot resolve. The shim
    // is scoped to garaga because bb.js imports crypto for its randomness and needs the real one
    resolveId: (id, importer) =>
      id === "crypto" && importer?.includes("/garaga/")
        ? CRYPTO_SHIM
        : undefined,
  };
}
