# AGENTS.md — loom

Source-grounded comparison and verification tool. A Node.js CLI that compares multiple sources on a topic (detecting agreements, disagreements, and gaps) or verifies an existing text against provided sources.

## Stack

- Runtime: Node.js (ESM, ES2024 target)
- Language: TypeScript (strict mode, NodeNext module resolution)
- CLI: Commander.js
- HTML extraction: @mozilla/readability + jsdom
- AI: OpenAI SDK (BYOK), Claude CLI, or Codex CLI
- Build: `tsc` → `dist/`

## Project Structure

```
src/
  cli.ts                    Entry point. Commander setup, config/compare/verify subcommands
  lib/
    source-fetcher.ts       Fetch URLs, extract readable text via Readability
    prompt-builder.ts       Build prompts for compare, verify, and legacy research modes
    ai-router.ts            3-tier backend detection: claude → codex → BYOK API
    output-processor.ts     Dual-layer output (card + report), compliance checker
    quality-rules.ts        Quality rule constants and output templates
    config.ts               Local config CRUD, credential resolution
prompts/
  compare-prompt.md         Compare mode system prompt (dual-layer output)
  verify-prompt.md          Verify mode system prompt (claim verification)
  system-prompt.md          Legacy research mode system prompt (backward compat)
```

## Commands

### compare (default)

```bash
loom compare "React vs Vue for enterprise"            # auto-source via CLI backend
loom compare "React vs Vue" -s url1 url2 url3         # manual source URLs
loom compare "X" -o report.md                          # card → stdout, report → file
loom compare "X" --full                                # card + report → stdout
```

### verify

```bash
loom verify report.md -s url1 url2 url3               # verify file against sources
cat output.txt | loom verify - -s url1 url2            # verify stdin
loom verify file.md -s url1 url2 -o check.json         # output to file
```

### config (unchanged)

```bash
loom config set apiKey <key>
loom config list
loom config reset
```

## Pipeline (compare)

1. **Detect mode** — If `-s` URLs provided: fetch via source-fetcher. If no URLs but CLI backend detected: auto-source mode (AI searches for sources). If neither: show error with 3 options.
2. **Build prompt** — `buildComparePrompt()` loads compare-prompt.md, optionally injects auto-source instructions, formats sources.
3. **Route to AI** — `routeToAI()` tries claude CLI → codex CLI → BYOK API. For auto-source, allows web search tools.
4. **Process output** — `processOutput()` with mode='compare': splits on `---` into card (stdout) + report (file/`--full`). Runs compliance check on full output.

## Pipeline (verify)

1. **Read text** — Read from file or stdin.
2. **Fetch sources** — `fetchSources(urls)` extracts content from provided URLs.
3. **Build prompt** — `buildVerifyPrompt()` loads verify-prompt.md + text + sources.
4. **Route to AI** — Standard 3-tier routing. No auto-source (verify always needs explicit source URLs).
5. **Process output** — Flat output with verification summary (no card/report split needed).

## Config System

Local file-based config, sandbox-scoped to the tool:

- Windows: `%APPDATA%/loom/config.json`
- Unix: `~/.loom/config.json`

Keys: `apiKey`, `apiBase`, `model`. Resolution priority: explicit CLI flag > env var (`LOOM_API_KEY`, `LOOM_API_BASE`, `LOOM_MODEL`) > config file.

Commands: `config set <key> <value>`, `config get <key>`, `config delete <key>`, `config list`, `config reset`.

## Key Design Decisions

- **Quality rules are not configurable.** The 6 core rules and 9 red lines are hardcoded in prompt files. Research integrity doesn't have settings.
- **3-tier backend detection.** Local CLIs (claude, codex) are preferred over API calls because they're already authenticated and have web search capabilities.
- **Auto-source mode for CLI backends.** Claude CLI and Codex CLI have web browsing; the prompt instructs AI to search for sources. BYOK mode requires explicit `-s` URLs.
- **Dual-layer output for compare.** Card (quick scan, always stdout) + Report (depth, file or `--full`). Split on `---` separator in AI output.
- **Compliance is a hard check.** `output-processor.ts` counts evidence tags, source references, and [待验证] markers. The compliance report is always appended.
- **Commander hidden default command.** `compare` is the default hidden command — `loom "React vs Vue"` works the same as `loom compare "React vs Vue"`.

## Development

```bash
pnpm install
pnpm dev -- compare "topic" -s https://example.com    # run compare via tsx
pnpm dev -- verify file.md -s https://example.com     # run verify via tsx
pnpm dev -- config set apiKey <key>                    # set config
pnpm build                                             # tsc → dist/
```

No test framework set up yet. Manual verification: run the CLI with real URLs and check the compliance report at the bottom of output.
