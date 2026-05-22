import { EVIDENCE_TAGS } from './quality-rules.js';

export interface ProcessedOutput {
  raw: string;
  card: string;
  report: string;
  compliance: {
    hasEvidenceTags: boolean;
    hasConflictSection: boolean;
    unverifiedCount: number;
    sourceRefCount: number;
  };
  /** Card + report + compliance (for file output or --full) */
  rendered: string;
}

const CONFLICT_PATTERNS = [
  /^#{1,3}\s.*(?:冲突|矛盾|disagree|conflict|争议|分歧)/im,
  /^#{1,3}\s.*(?:谁说了什么|who says what)/im,
];

/** Split AI output on first `---` separator into card and report sections */
function splitCardReport(raw: string): { card: string; report: string } {
  // Match a line that is just --- (possibly with whitespace)
  const separatorIndex = raw.search(/\n---\s*\n/);

  if (separatorIndex === -1) {
    // No separator found — treat everything as report, extract a card from the beginning
    return { card: '', report: raw.trim() };
  }

  const card = raw.slice(0, separatorIndex).trim();
  const report = raw.slice(separatorIndex).replace(/^---\s*\n*/, '').trim();

  return { card, report };
}

function checkCompliance(raw: string): ProcessedOutput['compliance'] {
  // Evidence tags: [Strong], [Moderate], [Weak], [Contested]
  const tagPattern = new RegExp(`\\[(${EVIDENCE_TAGS.join('|')})\\]`, 'g');
  const tagMatches = raw.match(tagPattern);
  const hasEvidenceTags = (tagMatches?.length ?? 0) > 0;

  // Conflict section
  const hasConflictSection = CONFLICT_PATTERNS.some((p) => p.test(raw));

  // [待验证] markers
  const unverifiedMatches = raw.match(/\[待验证\]/g);
  const unverifiedCount = unverifiedMatches?.length ?? 0;

  // Source references S1, S2, etc.
  const sourceMatches = raw.match(/\bS\d+\b/g);
  const sourceRefCount = sourceMatches?.length ?? 0;

  return {
    hasEvidenceTags,
    hasConflictSection,
    unverifiedCount,
    sourceRefCount,
  };
}

function buildComplianceSummary(compliance: ProcessedOutput['compliance']): string {
  const checks: string[] = [];

  checks.push(compliance.hasEvidenceTags ? '✓ Evidence weight tags present' : '✗ Missing evidence weight tags');
  checks.push(compliance.hasConflictSection ? '✓ Conflict/disagreement section present' : '✗ Missing conflict section');
  checks.push(`Unverified claims [待验证]: ${compliance.unverifiedCount}`);
  checks.push(`Source references: ${compliance.sourceRefCount}`);

  const score = [compliance.hasEvidenceTags, compliance.hasConflictSection].filter(Boolean).length;
  checks.push(`Compliance score: ${score}/2`);

  return checks.join('\n');
}

export interface ProcessOptions {
  /** 'compare' for dual-layer split, 'verify' or 'research' for flat output */
  mode?: 'compare' | 'verify' | 'research';
}

export function processOutput(raw: string, options?: ProcessOptions): ProcessedOutput {
  const mode = options?.mode || 'research';
  const compliance = checkCompliance(raw);

  if (mode === 'compare') {
    const { card, report } = splitCardReport(raw);
    const summary = buildComplianceSummary(compliance);

    const fullReport = report
      ? `${card}\n\n---\n\n${report}\n\n---\n\n## Loom Compliance Report\n\n${summary}`
      : `${raw}\n\n---\n\n## Loom Compliance Report\n\n${summary}`;

    return {
      raw,
      card,
      report,
      compliance,
      rendered: fullReport,
    };
  }

  // verify / research: flat output
  const summary = buildComplianceSummary(compliance);
  const rendered = `${raw}

---

## Loom Compliance Report

${summary}
`;

  return { raw, card: raw, report: raw, compliance, rendered };
}
