// Fetch an AWS WAF challenge script for offline reverse engineering.
//
// Usage:
//   node fetch-challenge.mjs <pageUrl|challengeJsUrl> [outFile]
//
// If given a normal page URL, it fetches the HTML and extracts the
// `*.awswaf.com/.../challenge(.compact).js` <script src>. If given a direct
// *.awswaf.com .js URL it downloads it directly. Output defaults to
// samples/challenge.js (git-ignored).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

async function get(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const body = await res.text();
  return { status: res.status, body };
}

function extractChallengeSrc(html) {
  // e.g. https://b2037b2ab8ee.edge.sdk.awswaf.com/.../challenge.compact.js
  const m = html.match(
    /https?:\/\/[^"'\s]*awswaf\.com\/[^"'\s]*challenge[^"'\s]*\.js/i,
  );
  return m ? m[0] : null;
}

async function main() {
  const input = process.argv[2];
  const out = process.argv[3] || "samples/challenge.js";
  if (!input) {
    console.error("usage: node fetch-challenge.mjs <pageUrl|challengeJsUrl> [outFile]");
    process.exit(1);
  }

  let jsUrl = input;
  if (!/awswaf\.com/i.test(input) || !/\.js(\?|$)/i.test(input)) {
    console.log(`[*] fetching page ${input}`);
    const { status, body } = await get(input);
    console.log(`    status=${status} len=${body.length}`);
    const src = extractChallengeSrc(body);
    if (!src) {
      console.error("[!] no *.awswaf.com challenge script found on that page");
      process.exit(2);
    }
    jsUrl = src;
    console.log(`[*] discovered challenge script: ${jsUrl}`);
  }

  console.log(`[*] downloading ${jsUrl}`);
  const { status, body } = await get(jsUrl);
  console.log(`    status=${status} bytes=${body.length}`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, body);
  console.log(`[+] saved -> ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
