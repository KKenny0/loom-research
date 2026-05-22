# CLAUDE.md — loom

Source-grounded comparison and verification CLI. Two main commands: `compare` (compare sources on a topic, auto-source or manual) and `verify` (check an existing text against sources). Dual-layer output: comparison card (stdout) + detailed report (file).

## Architecture

```
CLI (src/cli.ts)
  ├── detectMode()        ← no -s + no CLI backend → error with 3 options
  ├── fetchSources()      ← source-fetcher.ts (Readability + JSDOM) — only if -s provided
  ├── buildComparePrompt() / buildVerifyPrompt()
  │     ← prompt-builder.ts + prompts/compare-prompt.md or verify-prompt.md
  ├── routeToAI()         ← ai-router.ts (3-tier: claude CLI → codex CLI → BYOK API)
  │     auto-source: allows web search tools for CLI backends
  └── processOutput()     ← output-processor.ts (card/report split + compliance check)
```

Config lives in `src/lib/config.ts` — sandbox-style local file at `%APPDATA%/loom/config.json` (Win) or `~/.loom/config.json` (Unix). Credential priority: CLI flag > env var > config file.

## Commands

```bash
pnpm dev -- compare "topic" -s <url1> <url2>           # manual sources
pnpm dev -- compare "topic"                             # auto-source (needs CLI backend)
pnpm dev -- compare "topic" -o report.md                # card → stdout, report → file
pnpm dev -- compare "topic" --full                      # card + report → stdout
pnpm dev -- verify file.md -s <url1> <url2>             # verify file
pnpm dev -- config set apiKey <key>                     # BYOK setup
pnpm dev -- config list                                 # show config (apiKey masked)
pnpm dev -- config reset                                # wipe all config
```

## Conventions

- ESM only (`"type": "module"`, NodeNext module resolution)
- TS strict mode, ES2024 target
- No test framework yet — verify manually with `pnpm dev`
- Build: `tsc` → `dist/`

## Quality Rules Are Sacred

The 6 core rules and 9 red lines in `prompts/compare-prompt.md` and `prompts/verify-prompt.md` define what this tool produces. Do not relax, reorder, or summarize them. If a change touches quality rules, the output template, or compliance checks, it must preserve the contract: source citations (S1, S2), evidence tags ([Strong]/[Moderate]/[Weak]/[Contested]), conflict section, and [待验证] markers.

## AI Backend Router

`ai-router.ts` tries backends in order: `claude` CLI → `codex` CLI → BYOK OpenAI-compatible API.

- **Auto-source mode** (compare without `-s`): Only available with CLI backends. Claude CLI gets `--allowedTools WebSearch,WebFetch`. Prompt includes source discovery instructions.
- **Manual source mode** (compare with `-s`, verify): Sources fetched by source-fetcher, sent to any backend.
- **Claude CLI** writes a temporary `CLAUDE.md` in a temp directory to bypass Windows command-line length limits.
- **Codex CLI** writes source files to a temp `sources/` dir.

Do not change the detection order without reason — it's intentional that local CLIs take priority over API calls.

## Dual-Layer Output (compare)

`output-processor.ts` splits AI output on the first `---` separator:
- **Card** (everything before `---`) → always stdout
- **Report** (everything after `---`) → file (`-o`) or stdout (`--full`)
- If no `---` found, full output to stdout (graceful degradation)

Compliance report is appended to the full rendered output (file or `--full`).

## Config Security

- `config list` and `config get` always mask apiKey as `***`
- Config directory is tool-scoped, not global — `config reset` deletes the entire directory
- `resolveApiKey()` in config.ts never logs the key
- Do not add logging that prints raw API keys

## Commander Pattern

The compare command uses `program.command('compare', { isDefault: true, hidden: true })` because a root-level required positional argument (`<topic>`) conflicts with subcommands — Commander would eat `config` or `verify` as the topic string. Do not flatten this back to the root program.

## Error Handling

When no CLI backend detected AND no `-s` provided, show:
```
Error: No AI backend detected and no source URLs provided.

  Options:
    1. Install Claude CLI or Codex CLI for auto-source search
    2. Provide source URLs: loom compare "X" -s url1 url2 url3
    3. Configure BYOK API key: loom config set apiKey <key>
```
