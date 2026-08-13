import { validateContract, type RewritePacket } from "@iwc/learning-contracts";

export interface RewriteLeakageIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface RewriteLeakageValidationResult {
  readonly valid: boolean;
  readonly issues: readonly RewriteLeakageIssue[];
}

const forbiddenKeyPattern =
  /(?:attempt(?:V?1|One)|version(?:V?1|One)|originalEssay|originalDraft|feedback|modelAnswer|sampleEssay|corrected(?:Essay|Sentence)|referenceAnswer|targetPhrase|lessonAnswer|explanation|rubricEvidence)/i;

function normalize(text: string): string {
  return text.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

function visit(
  value: unknown,
  path: string,
  issues: RewriteLeakageIssue[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}/${index}`, issues));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`;
    if (forbiddenKeyPattern.test(key)) {
      issues.push({
        code: "FORBIDDEN_FIELD",
        path: childPath,
        message:
          "Rewrite packets may contain only the question, timing controls, and up to three abstract self-check targets.",
      });
    }
    visit(child, childPath, issues);
  }
}

export function validateRewritePacketLeakage(
  packet: unknown,
  options: { readonly forbiddenSourceFragments?: readonly string[] } = {},
): RewriteLeakageValidationResult {
  const issues: RewriteLeakageIssue[] = [];
  const schemaResult = validateContract("rewritePacket", packet);
  for (const issue of schemaResult.issues) {
    issues.push({
      code: `SCHEMA_${issue.keyword.toUpperCase()}`,
      path: issue.instancePath || "/",
      message: issue.message,
    });
  }
  visit(packet, "", issues);

  if (schemaResult.valid) {
    const rewritePacket = packet as RewritePacket;
    const visibleText = normalize(
      [
        rewritePacket.question.prompt,
        rewritePacket.question.instructions,
        ...rewritePacket.selfCheck.abstractTargets,
      ].join("\n"),
    );
    for (const fragment of options.forbiddenSourceFragments ?? []) {
      const normalizedFragment = normalize(fragment);
      if (
        normalizedFragment.length >= 12 &&
        visibleText.includes(normalizedFragment)
      ) {
        issues.push({
          code: "SOURCE_FRAGMENT_LEAK",
          path: "/",
          message:
            "The packet repeats protected Version 1, feedback, correction, or model-answer text.",
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
