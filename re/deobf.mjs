// Deobfuscation pipeline for AWS WAF challenge.js (obfuscator.io family).
//
// Usage:
//   node deobf.mjs <input.js> [output.js]
//
// Runs webcrack (string-array rotation, control-flow unflattening, proxy
// inlining, constant folding, dead-code removal via an isolated-vm sandbox),
// then formats with prettier. webcrack is the primary tool; if it throws we
// fall back to synchrony (the `deobfuscator` package).

import { readFile, writeFile } from "node:fs/promises";
import { webcrack } from "webcrack";
import prettier from "prettier";

async function tryWebcrack(code) {
  const result = await webcrack(code);
  return result.code;
}

async function trySynchrony(code) {
  const mod = await import("deobfuscator");
  const Deobfuscator = mod.Deobfuscator || mod.default?.Deobfuscator;
  if (!Deobfuscator) throw new Error("synchrony Deobfuscator export not found");
  const d = new Deobfuscator();
  return await d.deobfuscateSource(code);
}

async function main() {
  const input = process.argv[2];
  const out = process.argv[3] || input.replace(/\.js$/, "") + ".deobf.js";
  if (!input) {
    console.error("usage: node deobf.mjs <input.js> [output.js]");
    process.exit(1);
  }

  const code = await readFile(input, "utf8");
  console.log(`[*] input ${input} (${code.length} bytes)`);

  let deobf;
  const t0 = Date.now();
  try {
    console.log("[*] running webcrack...");
    deobf = await tryWebcrack(code);
    console.log(`    webcrack ok in ${Date.now() - t0}ms -> ${deobf.length} bytes`);
  } catch (e) {
    console.warn(`[!] webcrack failed: ${e.message}\n[*] falling back to synchrony...`);
    deobf = await trySynchrony(code);
    console.log(`    synchrony ok -> ${deobf.length} bytes`);
  }

  try {
    deobf = await prettier.format(deobf, { parser: "babel" });
  } catch (e) {
    console.warn(`[!] prettier format skipped: ${e.message}`);
  }

  await writeFile(out, deobf);
  console.log(`[+] wrote ${out} (${deobf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
