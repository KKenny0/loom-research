import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';

export type BackendType = 'claude-cli' | 'codex-cli' | 'byok-api';

export interface AIResponse {
  content: string;
  model: string;
  backend: BackendType;
}

export interface RouterOptions {
  /** If true, inject source discovery instructions for CLI backends */
  autoSource?: boolean;
}

/**
 * Resolve the actual executable path for a CLI command on Windows.
 * `where` returns both `claude` (shell script) and `claude.cmd` (Windows batch).
 * Node's execFile needs the .cmd variant on Windows.
 */
function resolveCmd(cmd: string): string | null {
  try {
    const result = execFileSync('where', [cmd], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5_000,
    });
    // On Windows, prefer .cmd variant
    const lines = result.trim().split(/\r?\n/);
    const cmdVariant = lines.find((l) => l.endsWith('.cmd'));
    return cmdVariant || lines[0] || null;
  } catch {
    return null;
  }
}

// --- CLI spawn helper ---

function spawnCLI(
  exePath: string,
  args: string[],
  workDir: string,
  timeout: number,
): string {
  // On Windows, .cmd files must be spawned via shell
  const useShell = process.platform === 'win32';
  const stdout = execFileSync(exePath, args, {
    cwd: workDir,
    encoding: 'utf-8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    shell: useShell,
    windowsHide: true,
  });
  return stdout.trim();
}

// --- Claude CLI ---

function spawnClaudeCLI(
  prompt: string,
  sources: Array<{ id: string; content: string }>,
  autoSource?: boolean,
): AIResponse {
  const workDir = join(tmpdir(), `loom-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });

  try {
    // Write full prompt content into CLAUDE.md (auto-loaded by Claude Code)
    const sourceBlocks = sources.length > 0
      ? sources.map((s) => `## ${s.id}\n${s.content || '[No content extracted]'}`).join('\n\n---\n\n')
      : '';

    const claudeMd = sourceBlocks
      ? `${prompt}\n\n# Sources\n\n${sourceBlocks}`
      : prompt;

    writeFileSync(join(workDir, 'CLAUDE.md'), claudeMd, 'utf-8');

    // For auto-source mode, allow web search tool
    const allowedTools = autoSource ? 'WebSearch,WebFetch' : 'none';

    // Keep -p argument short — the model will read CLAUDE.md automatically
    const exePath = resolveCmd('claude') || 'claude';
    const content = spawnCLI(exePath, [
      '-p', 'Read CLAUDE.md for the full task with quality rules and sources. Produce the output as specified.',
      '--allowedTools', allowedTools,
    ], workDir, 300_000);

    return { content, model: 'claude', backend: 'claude-cli' };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// --- Codex CLI ---

function spawnCodexCLI(
  prompt: string,
  sources: Array<{ id: string; content: string }>,
): AIResponse {
  const workDir = join(tmpdir(), `loom-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });

  try {
    if (sources.length > 0) {
      mkdirSync(join(workDir, 'sources'), { recursive: true });
      for (const s of sources) {
        writeFileSync(join(workDir, 'sources', `${s.id}.md`), s.content || '[No content extracted]', 'utf-8');
      }
    }

    const outputFile = join(workDir, 'output.md');
    const exePath = resolveCmd('codex') || 'codex';

    spawnCLI(exePath, [
      'exec',
      '--sandbox', 'read-only',
      '--ignore-rules',
      '--output-last-message', outputFile,
      prompt,
    ], workDir, 300_000);

    const content = readFileSync(outputFile, 'utf-8').trim();

    return { content, model: 'codex', backend: 'codex-cli' };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// --- BYOK API ---

async function callByokAPI(prompt: string): Promise<AIResponse> {
  const { resolveApiKey, resolveApiBase, resolveModel } = await import('./config.js');
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      'No AI backend available.\n' +
      'Install Claude CLI (claude) or Codex CLI (codex), or configure an API key:\n' +
      '  loom config set apiKey <your-key>\n' +
      'Optional: apiBase (default: https://api.openai.com/v1), model (default: gpt-4o).',
    );
  }

  const baseURL = resolveApiBase() || 'https://api.openai.com/v1';
  const model = resolveModel() || 'gpt-4o';

  const client = new OpenAI({ apiKey, baseURL });

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 16_384,
  });

  return {
    content: response.choices[0]?.message?.content || '',
    model,
    backend: 'byok-api',
  };
}

// --- Backend detection ---

function detectCLIBackend(): BackendType | null {
  if (resolveCmd('claude')) return 'claude-cli';
  if (resolveCmd('codex')) return 'codex-cli';
  return null;
}

// --- Main router ---

export async function routeToAI(
  prompt: string,
  sources: Array<{ id: string; content: string }>,
  options?: RouterOptions,
): Promise<AIResponse> {
  const cliBackend = detectCLIBackend();

  if (cliBackend === 'claude-cli') {
    console.log('Using Claude CLI backend...');
    return spawnClaudeCLI(prompt, sources, options?.autoSource);
  }

  if (cliBackend === 'codex-cli') {
    console.log('Using Codex CLI backend...');
    return spawnCodexCLI(prompt, sources);
  }

  console.log('No CLI detected, using BYOK API...');
  return callByokAPI(prompt);
}

/** Check if any CLI backend is available (without routing) */
export function hasCLIBackend(): boolean {
  return detectCLIBackend() !== null;
}
