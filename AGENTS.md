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
- **Three challenge types are implemented:** scrypt PoW
  (`h72f957…`), sha256 PoW (`h7b0c470…`), and NetworkBandwidth / `mp_verify`
  (`ha9faaff…`). `mp_verify` is special: the solution is the base64 of a zeroed
  buffer sized by difficulty (`{1:1KB,2:10KB,3:100KB,4:1MB,5:10MB}`), and it is
  submitted as `multipart/form-data` to `{host}/mp_verify` with fields
  `solution_metadata` (the normal verify JSON with `solution` nulled) and
  `solution_data` (the base64). See `internal/aws/pow.go` `SolveBandwidth` +
  `internal/aws/aws.go` `VerifyMp` (Go) and `python/awswaf/verify.py`
  `solve_bandwidth` + `aws.py` `verify_mp` (Python). Any *other* unhandled type
  still panics/raises with `unknown challengeType` — port it via the `re/` toolkit.
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
  git-ignored. See `re/README.md` for the full workflow. Use it to port any future
  challenge type AWS introduces (the `mp_verify`/NetworkBandwidth type was ported
  this way).

### Quick sanity check (no network, no API key)

The core token-generation primitives are pure/local and can be exercised directly:
- Go: `aws.SolveChallenge` (PoW), `aws.GetFP` (fingerprint + AES-GCM), `aws.Encrypt`/`aws.Decrypt`.
- Python: `awswaf.verify.hash_pow` / `compute_scrypt_nonce`, `awswaf.fingerprint.get_fp`, `awswaf.crypto.encrypt`/`decrypt`.
Both implementations produce identical PoW nonces for the same input/difficulty.
