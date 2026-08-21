# AWS WAF challenge.js — reverse-engineering toolkit

Tooling to reverse-engineer AWS WAF's obfuscated `challenge(.compact).js` so new
challenge types (currently the unimplemented **`mp_verify`** /
`ha9faaffd31b4d5ede2a2e19d2d7fd525f66fee61911511960dcbb52d3c48ce25`) can be ported
into the Go/Python solvers.

This is a **dev-only toolkit**. It is intentionally isolated from the root project
(its own `package.json`) so the main `npm install` / cloud update script stays lean
— `webcrack` pulls in the native `isolated-vm` addon. Install on demand:

```bash
cd re
npm install
```

Requires Node 22 or 24 (webcrack/isolated-vm requirement — the repo already targets
Node 22).

## What actual JS REs use (and what's set up here)

AWS WAF's `challenge.js` is obfuscated with the **javascript-obfuscator / obfuscator.io**
toolchain (string-array rotation with `a0_0x…` accessors, control-flow flattening,
proxy-function wrappers, self-defending/anti-debug traps). The community-standard
workflow, now wired up here:

| Stage | Tool | Here |
| --- | --- | --- |
| Static deobfuscation | [`webcrack`](https://github.com/j4k0xb/webcrack) (primary), [`synchrony`/`deobfuscator`](https://github.com/relative/synchrony) (fallback) | `deobf.mjs` |
| Formatting | `prettier` | `deobf.mjs` |
| Handler location | grep/AST over challenge-type hashes + primitives | `find-handlers.mjs` |
| Dynamic extraction | run the bundle in a Node `vm` / `isolated-vm` sandbox to pull the AES key + type→solver map at runtime | (see "Next steps") |

Prior art worth reading (other people solving the same WAF): `Switch3301/Aws-Waf-Solver`,
`Gunpointx/AWS-WAF-Solver` (pure Go, dynamic key extraction), and
`glizzykingdreko/AWS-WAF-Deobfuscator`. They confirm AWS WAF PoW comes in a small set
of types: **Hashcash-Scrypt**, **Hashcash-SHA256**, and **NetworkBandwidth** (solution
is a zeroed buffer), plus the newer managed `mp_verify`.

## Usage

```bash
# 1) Grab the live obfuscated script from any AWS-WAF-protected page
node fetch-challenge.mjs "https://www.stubhub.com/" samples/challenge.compact.js

# 2) Deobfuscate (webcrack -> prettier); falls back to synchrony on failure
node deobf.mjs samples/challenge.compact.js samples/challenge.deobf.js

# 3) Locate the challenge-type handlers + solver primitives
node find-handlers.mjs samples/challenge.deobf.js
```

`samples/` and `node_modules/` are git-ignored.

## Current findings on `mp_verify` (`ha9faaff…`)

From `challenge.compact.js` (543 KB obfuscated → ~871 KB deobfuscated via webcrack):

- The challenge object for this type is built with **`difficulty = 2`** and
  **`memory = 128`** (a scrypt parameter), alongside `challenge` and the type hash.
- The verify payload for this type requires an extra **`solution_metadata`** field
  that the repo's current `Verify` struct does not send.
- The solver is **async** (`__awaiter`/`__generator`) and the file uses
  `Worker`/`postMessage` (PoW offloaded to a Web Worker), plus `crypto.subtle.digest`
  (`SHA-256`) and scrypt (`memory`, `dkLen`) primitives.
- The two already-implemented types resolve to `hashcashSha2` (SHA-256 PoW loop) and
  the scrypt hashcash routine; `mp_verify` is the third, still-unported type.

## Next steps to implement `mp_verify` in the solver

1. In the deobfuscated file, isolate the function selected for the `ha9faaff…` type
   (trace the `challenge_type → solver` dispatch map) and read exactly how it derives
   `solution` and populates `solution_metadata` from `challenge.input`, `checksum`,
   `difficulty`, and `memory=128`.
2. Add `SolutionMetadata` (json `solution_metadata`) to `internal/aws/structs.go`
   `Verify`, populate it in `BuildPayload`, and add the solve function to
   `SolveChallenge` in `internal/aws/crypto.go` (mirror in Python
   `awswaf/verify.py` `CHALLENGE_TYPES` + `build_payload`).
3. Validate end-to-end against a live target until `/verify` returns a token and the
   re-request is accepted.
