import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceContent } from './source-fetcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPrompt(filename: string): string {
  const promptPath = resolve(__dirname, `../../prompts/${filename}`);
  return readFileSync(promptPath, 'utf-8');
}

function formatSources(sources: SourceContent[]): string {
  return sources
    .map((s) => {
      const contentBlock = s.content
        ? s.content
        : '[Content could not be extracted from this URL]';
      return `## ${s.id}: ${s.title}\nURL: ${s.url}\n\n${contentBlock}`;
    })
    .join('\n\n---\n\n');
}

// --- Legacy research prompt (backward compat) ---

export function buildPrompt(topic: string, sources: SourceContent[]): string {
  const systemPrompt = loadPrompt('system-prompt.md');
  const sourceBlocks = formatSources(sources);

  return `${systemPrompt}

---

# Sources

${sourceBlocks}

---

# Research Task

Topic: **${topic}**

Analyze the above sources following the quality rules and produce a research report. Cite sources using S1, S2, etc. Mark unsourced claims with [待验证]. Preserve any disagreements between sources.
`;
}

// --- Compare prompt ---

export function buildComparePrompt(
  topic: string,
  sources?: SourceContent[],
  autoSource?: boolean,
): string {
  const systemPrompt = loadPrompt('compare-prompt.md');

  // Remove auto-source instructions if not applicable
  let prompt = systemPrompt;
  if (!autoSource) {
    // Strip the Source Discovery section for BYOK / manual source mode
    prompt = prompt.replace(/## Source Discovery \(auto-source mode\)[\s\S]*?(?=\n## |\n$)/, '').trimEnd();
  }

  let result = `${prompt}

---

# Comparison Task

Topic: **${topic}**
`;

  if (sources && sources.length > 0) {
    const sourceBlocks = formatSources(sources);
    result += `
# Sources

${sourceBlocks}

---

Compare the above sources following the quality rules. Cite sources using S1, S2, etc. Mark unsourced claims with [待验证]. Preserve any disagreements between sources. Produce both the Comparison Card and the Full Report separated by ---.
`;
  } else if (autoSource) {
    result += `
Search for relevant sources, then produce both the Comparison Card and the Full Report separated by ---.
`;
  }

  return result;
}

// --- Verify prompt ---

export function buildVerifyPrompt(
  text: string,
  sources: SourceContent[],
): string {
  const systemPrompt = loadPrompt('verify-prompt.md');
  const sourceBlocks = formatSources(sources);

  return `${systemPrompt}

---

# Text to Verify

${text}

---

# Sources

${sourceBlocks}

---

Verify every factual claim in the text against the provided sources. For each claim, mark it as [Verified], [Contradicted], [Unsupported], or [Inference] with the relevant source reference.
`;
}
