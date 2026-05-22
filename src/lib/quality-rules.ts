export const CORE_RULES: string[] = [
  '1. Cite sources on every factual claim. Use source IDs (S1, S2, ...). If a claim has no source, mark it [待验证]. No exceptions.',
  '2. Preserve conflicts. When sources disagree, state the disagreement explicitly. Do not smooth into a "balanced view" or "综合观点". Name who says what.',
  '3. Classify evidence weight. Tag each conclusion: Strong (multiple independent sources agree), Moderate (supported but with caveats or limited sources), Weak (single source, or source has clear bias), Contested (sources actively contradict each other).',
  '4. Distinguish source claims from inference. "来源说的" vs "我推断的" — mark inferences explicitly. If you\'re extrapolating, say so.',
  '5. Admit uncertainty. Don\'t fabricate confidence. If evidence is thin, say it\'s thin.',
  '6. Pre-publication check: scan the output once before delivery — did you hide any disagreement to make it read smoothly? If yes, restore the disagreement.',
];

export const RED_LINES: string[] = [
  '1. 口语测试: if you can\'t say it aloud naturally, rewrite.',
  '2. 零术语: no unexplained jargon.',
  '3. 短词优先: prefer short words.',
  '4. 一句一事: one idea per sentence.',
  '5. 具象优先: concrete over abstract.',
  '6. 理由先行: give reason before conclusion.',
  '7. 不说废话: no filler phrases.',
  '8. 信任读者: trust the reader\'s intelligence.',
  '9. 诚实: be honest about uncertainty.',
];

export const EVIDENCE_TAGS: string[] = [
  'Strong',
  'Moderate',
  'Weak',
  'Contested',
];

export const OUTPUT_TEMPLATE: string = `## Research Report: {{TOPIC}}

### Summary
[One-paragraph overview of findings]

### Findings

#### Finding 1: [Title]
[Content with source references S1, S2, ...]
[Evidence weight tag: [Strong/Moderate/Weak/Contested]]

#### Finding 2: [Title]
[Content with source references]
[Evidence weight tag]

[... more findings ...]

### Conflicts & Disagreements
[Explicit section when sources disagree — who says what]

### Inferences vs Source Claims
[Clearly marked section distinguishing "来源说的" from "我推断的"]

### Confidence & Caveats
[Honest assessment of evidence quality and gaps]

### Compliance Check
- Claims with sources: [count]
- Unverified claims [待验证]: [count]
- Inferences marked: [count]
- Conflicts documented: [count]
`;

export const COMPARE_OUTPUT_TEMPLATE: string = `## Comparison: {{TOPIC}}

### Agreement (N)
- [Strong] Claim [S1, S2]
- [Moderate] Claim [S3]

### Disagreement (N)
- [Contested] Topic: S1 says X, S2 says Y

### Gaps (N)
- [待验证] Claim — reason for uncertainty

### Bottom Line
One actionable sentence.

Evidence: N sources, M verified claims, K unverified claims

---

## Research Report: {{TOPIC}}

### Summary
[One paragraph]

### Findings
#### Finding 1: [Title]
[Content with S1, S2 references]
[Evidence weight: [Strong/Moderate/Weak/Contested]]

### Conflicts & Disagreements
[Who says what, with source references]

### Inferences vs Source Claims
[来源说: ... vs 我推断: ...]

### Confidence & Caveats
[Evidence quality assessment and gaps]

### Compliance Check
- Claims with sources: [count]
- Unverified claims [待验证]: [count]
- Inferences marked: [count]
- Conflicts documented: [count]
`;
