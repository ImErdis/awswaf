# AGENTS.md

## Cursor Cloud specific instructions

This repo is an **AWS WAF challenge solver**. There is no long-running server; the
"applications" are short-lived CLI/library runs that generate an `aws-waf-token`.
Three parallel components:

| Component | Path | Role | Build / run |
| --- | --- | --- | --- |
| Go solver | `main.go`, `internal/aws/**` | Main product | `go build ./...`, `go vet ./...`, `go run .` |
| Python port | `python/**` | Alternate implementation | `cd python && python3 main.py` |
| `deobf.js` | `deobf.js` | Dev tool to de-obfuscate AWS `challenge.js`/`captcha.js` | `node deobf.js <in.js>` |
| RE toolkit | `re/**` | Stronger JS reverse-engineering pipeline (webcrack + synchrony + prettier) for porting new challenge types | `cd re && npm install && node deobf.mjs <in.js>` |

Dependencies are already installed by the startup update script (`go mod download`,
`npm install`, and `pip3 install curl_cffi pyscrypt cryptography` — the Python deps
are not captured in any requirements file in the repo).

### Non-obvious gotchas

- **Working directory matters for the fingerprint step.** The Go code reads
  `webgl.json` via a *relative* path in `internal/aws/fingerprint.go` `init()`, so
  `go run .` / `go run ./...` must be launched from the repo root. The Python port
  reads `../webgl.json`, so it must be launched from inside `python/`. Running from
  the wrong directory panics/`FileNotFoundError` before any network call.
- **Live targets can panic — this is not an environment problem.** `go run .`
  (and `python/main.py`) hit real sites (HuggingFace / Binance). If the target
  currently serves the `mp_verify` challenge type
  (`ha9faaffd31b4d5ede2a2e19d2d7fd525f66fee61911511960dcbb52d3c48ce25`), the solver
  panics with `unknown challengeType: ...` because only the two hash-based PoW types
  are implemented. Reaching that point already proves the TLS request + challenge
  parsing worked.
- **Captcha (image) solving needs a Gemini API key.** `internal/aws/captcha/ai.go`
  calls `genai.NewClient(ctx, nil)`, which reads `GEMINI_API_KEY` / `GOOGLE_API_KEY`
  from the environment. The token/"invisible" PoW solve does NOT need it; only the
  `Captcha`-type flow does.
- `deobf.js` reads `in.js` by default (or `argv[2]`) and writes `out.js`. `in.js` /
  `out.js` are git-ignored and not shipped; the tool is tuned to a specific
  obfuscation pattern, so it exits with "Failed to detect necessary components" on
  arbitrary input. For general-purpose deobfuscation use the `re/` toolkit instead.
- **`re/` reverse-engineering toolkit is NOT installed by the cloud update script**
  (it pulls the native `isolated-vm` addon via `webcrack`). Install on demand with
  `cd re && npm install` (needs Node 22/24). `re/node_modules` and `re/samples` are
  git-ignored. See `re/README.md` for the full workflow and current `mp_verify`
  findings. Only the two hash-based PoW challenge types are implemented in the
  solver; live AWS WAF targets currently serve the unimplemented `mp_verify`
  (`ha9faaff…`) type, which needs a `solution_metadata` field in the verify body.

### Quick sanity check (no network, no API key)

The core token-generation primitives are pure/local and can be exercised directly:
- Go: `aws.SolveChallenge` (PoW), `aws.GetFP` (fingerprint + AES-GCM), `aws.Encrypt`/`aws.Decrypt`.
- Python: `awswaf.verify.hash_pow` / `compute_scrypt_nonce`, `awswaf.fingerprint.get_fp`, `awswaf.crypto.encrypt`/`decrypt`.
Both implementations produce identical PoW nonces for the same input/difficulty.
