// Locate AWS WAF challenge-type handlers in a (deobfuscated) challenge.js.
//
// Usage:
//   node find-handlers.mjs <file.js>
//
// Prints, for each known challenge-type hash, the surrounding source context,
// plus a scan for the algorithm primitives each solver needs (scrypt / sha256 /
// bandwidth buffer / solution_metadata), so you can quickly see which routine
// implements the currently-served challenge (e.g. mp_verify / ha9faaff...).

import { readFile } from "node:fs/promises";

const TYPES = {
  h72f957df656e80ba55f5d8ce2e8c7ccb59687dba3bfb273d54b08a261b2f3002:
    "scrypt PoW (implemented in repo)",
  h7b0c470f0cfe3a80a9e26526ad185f484f6817d0832712a4a37a908786a6a67f:
    "sha256 PoW (implemented in repo)",
  ha9faaffd31b4d5ede2a2e19d2d7fd525f66fee61911511960dcbb52d3c48ce25:
    "mp_verify (NOT implemented)",
};

const PRIMITIVES = [
  "scrypt",
  "pbkdf2",
  "sha256",
  "SHA-256",
  "digest",
  "subtle",
  "solution_metadata",
  "difficulty",
  "memory",
  "ArrayBuffer",
  "Uint8Array",
  "performance.now",
  "bandwidth",
  "Bandwidth",
  "fetch(",
  "Worker",
  "postMessage",
];

function contexts(s, needle, radius = 220, max = 3) {
  const out = [];
  let i = 0;
  while (out.length < max) {
    const idx = s.indexOf(needle, i);
    if (idx === -1) break;
    const a = Math.max(0, idx - radius);
    const b = Math.min(s.length, idx + needle.length + radius);
    out.push(s.slice(a, b).replace(/\s+/g, " "));
    i = idx + needle.length;
  }
  return out;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node find-handlers.mjs <file.js>");
    process.exit(1);
  }
  const s = await readFile(file, "utf8");
  console.log(`# handler scan for ${file} (${s.length} bytes)\n`);

  console.log("== challenge-type hashes ==");
  for (const [hash, label] of Object.entries(TYPES)) {
    const n = s.split(hash).length - 1;
    console.log(`\n[${label}] hash=${hash} occurrences=${n}`);
    for (const c of contexts(s, hash)) console.log("   …" + c + "…");
  }

  console.log("\n== primitive frequency ==");
  for (const p of PRIMITIVES) {
    const n = s.split(p).length - 1;
    if (n) console.log(`   ${String(n).padStart(4)}  ${p}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
