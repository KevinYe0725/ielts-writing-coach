import {
  EXERCISE_FORMS,
  type ExerciseEvaluationOutcome,
  type ExerciseItem,
  type ExerciseMappingPair,
  type ExerciseOption,
  type ExercisePresentation,
} from "@iwc/learning-contracts";

export interface ClosedExerciseJudgment {
  readonly outcome: ExerciseEvaluationOutcome;
  readonly passed: boolean;
  readonly validAnswer: boolean;
  readonly confidence: 1;
  readonly acceptedAnswers: readonly string[];
  readonly selectedBranchId?: string;
  readonly confusionId?: string;
  readonly feedbackZh: string;
  readonly feedbackEn: string;
  readonly evidence: readonly string[];
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function selectionText(answer: string): string {
  try {
    const parsed = object(JSON.parse(answer));
    return typeof parsed.text === "string" ? parsed.text : answer;
  } catch {
    return answer;
  }
}

function orderInsensitive(value: string): string {
  const normalized = normalizeText(value);
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => normalizeText(String(entry)))
        .sort()
        .join("|");
    }
    const entries = Object.entries(object(parsed));
    if (entries.length > 0) {
      return entries
        .map(
          ([key, entry]) =>
            `${normalizeText(key)}=>${normalizeText(String(entry))}`,
        )
        .sort()
        .join("|");
    }
  } catch {
    // The compact left=>right|left=>right wire form is intentionally human readable.
  }
  return normalized
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

function matchesSpotlight(
  answer: string,
  accepted: readonly string[],
): boolean {
  const selected = normalizeText(selectionText(answer));
  if (!selected) return false;
  return accepted.some((candidate) => {
    const target = normalizeText(selectionText(candidate));
    if (!target) return false;
    if (target.includes(selected) || selected.includes(target)) return true;
    const selectedTokens = new Set(selected.split(/\s+/).filter(Boolean));
    const targetTokens = new Set(target.split(/\s+/).filter(Boolean));
    const overlap = [...selectedTokens].filter((token) =>
      targetTokens.has(token),
    );
    return (
      overlap.length >=
      Math.ceil(Math.min(selectedTokens.size, targetTokens.size) / 2)
    );
  });
}

function deterministicMatch(
  answer: string,
  item: ExerciseItem,
  presentation: ExercisePresentation | null,
): boolean {
  if (item.grading.mode !== "DETERMINISTIC") return false;
  if (presentation?.form === "SPOTLIGHT") {
    return matchesSpotlight(answer, item.grading.acceptedAnswers);
  }
  const normalize =
    item.grading.normalization === "EXACT"
      ? (value: string) => value
      : item.grading.normalization === "ORDER_INSENSITIVE"
        ? orderInsensitive
        : normalizeText;
  const candidate = normalize(answer);
  return item.grading.acceptedAnswers.some(
    (accepted) => normalize(accepted) === candidate,
  );
}

/**
 * Returns null only for genuine rubric-scored output. Closed and branch items
 * are always judged locally so the same answer receives the same result even
 * when an AI provider is unavailable or changes model versions.
 */
export function judgeClosedExercise(input: {
  readonly item: ExerciseItem;
  readonly presentation?: ExercisePresentation | null;
  readonly answer: string;
}): ClosedExerciseJudgment | null {
  const { item, answer } = input;
  const presentation = input.presentation ?? null;
  if (item.grading.mode === "RUBRIC") return null;

  if (item.grading.mode === "UNSCORED_BRANCH") {
    const validAnswer = item.grading.branchIds.includes(answer);
    return {
      outcome: "NEUTRAL",
      passed: false,
      validAnswer,
      confidence: 1,
      acceptedAnswers: item.grading.branchIds,
      ...(validAnswer ? { selectedBranchId: answer } : {}),
      feedbackZh: validAnswer
        ? "已记录你的主要意思；这一步不判对错，后续表达题会沿此分支展开。"
        : "请选择本题提供的一个意思分支。",
      feedbackEn: validAnswer
        ? "Your primary intended meaning is saved. This step is unscored and changes the expression path that follows."
        : "Choose one of the meaning branches supplied by this item.",
      evidence: validAnswer ? [answer] : [],
    };
  }

  const passed = deterministicMatch(answer, item, presentation);
  const confusionId = presentation?.confusionByAnswer?.[answer];
  return {
    outcome: passed ? "PASS" : "FAIL",
    passed,
    validAnswer: true,
    confidence: 1,
    acceptedAnswers: item.grading.acceptedAnswers,
    ...(confusionId ? { confusionId } : {}),
    feedbackZh: passed
      ? presentation?.form === "SPOTLIGHT"
        ? "定位准确；选中完整问题片段或其中关键部分都可通过。"
        : "答案与本题公开的确定性答案规则一致。"
      : confusionId
        ? `这个选择对应易混点：${confusionId}`
        : "答案尚未命中本题的明确可接受答案。",
    feedbackEn: passed
      ? presentation?.form === "SPOTLIGHT"
        ? "The location is accurate; either the full span or a meaningful partial overlap is accepted."
        : "The answer matches this item's explicit deterministic answer rule."
      : confusionId
        ? `This answer reveals the recorded confusion: ${confusionId}`
        : "The answer does not yet match an explicit accepted answer.",
    evidence: passed ? [selectionText(answer)] : [],
  };
}

export function exerciseWordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function isSubstantiveRevision(before: string, after: string): boolean {
  const left = normalizeText(before);
  const right = normalizeText(after);
  if (!left || !right || left === right) return false;
  const beforeTokens = left.split(/\s+/);
  const afterTokens = right.split(/\s+/);
  const maximum = Math.max(beforeTokens.length, afterTokens.length);
  let changed = Math.abs(beforeTokens.length - afterTokens.length);
  for (
    let index = 0;
    index < Math.min(beforeTokens.length, afterTokens.length);
    index += 1
  ) {
    if (beforeTokens[index] !== afterTokens[index]) changed += 1;
  }
  return changed >= Math.max(2, Math.ceil(maximum * 0.02));
}

function option(value: unknown): ExerciseOption | null {
  const candidate = object(value);
  return typeof candidate.id === "string" &&
    typeof candidate.labelZh === "string" &&
    typeof candidate.labelEn === "string"
    ? {
        id: candidate.id,
        labelZh: candidate.labelZh,
        labelEn: candidate.labelEn,
      }
    : null;
}

function mappingPair(value: unknown): ExerciseMappingPair | null {
  const candidate = object(value);
  return typeof candidate.left === "string" &&
    typeof candidate.right === "string"
    ? { left: candidate.left, right: candidate.right }
    : null;
}

/** Parse DB JSON defensively; malformed presentation never grants a pass. */
export function parseExercisePresentation(
  value: unknown,
): ExercisePresentation | null {
  const candidate = object(value);
  if (
    !EXERCISE_FORMS.includes(candidate.form as (typeof EXERCISE_FORMS)[number])
  ) {
    return null;
  }
  const responseModes = [
    "span",
    "choice",
    "mapping",
    "slots",
    "sentence",
    "chain",
    "paragraph",
    "revision",
  ] as const;
  if (
    !responseModes.includes(
      candidate.responseMode as (typeof responseModes)[number],
    )
  ) {
    return null;
  }
  const options = Array.isArray(candidate.options)
    ? candidate.options
        .map(option)
        .filter((entry): entry is ExerciseOption => entry !== null)
    : [];
  const mappingPairs = Array.isArray(candidate.mappingPairs)
    ? candidate.mappingPairs
        .map(mappingPair)
        .filter((entry): entry is ExerciseMappingPair => entry !== null)
    : [];
  const confusionByAnswer = Object.fromEntries(
    Object.entries(object(candidate.confusionByAnswer)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const branchPrompts = Object.fromEntries(
    Object.entries(object(candidate.branchPrompts)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return {
    form: candidate.form as ExercisePresentation["form"],
    responseMode:
      candidate.responseMode as ExercisePresentation["responseMode"],
    ...(typeof candidate.sourceText === "string"
      ? { sourceText: candidate.sourceText }
      : {}),
    ...(options.length > 0 ? { options } : {}),
    ...(mappingPairs.length > 0 ? { mappingPairs } : {}),
    ...(strings(candidate.slotLabels).length > 0
      ? { slotLabels: strings(candidate.slotLabels) }
      : {}),
    ...(Object.keys(confusionByAnswer).length > 0 ? { confusionByAnswer } : {}),
    ...(Object.keys(branchPrompts).length > 0 ? { branchPrompts } : {}),
    ...(typeof candidate.revisionSourceItemId === "string"
      ? { revisionSourceItemId: candidate.revisionSourceItemId }
      : {}),
    ...(typeof candidate.minimumWords === "number"
      ? { minimumWords: candidate.minimumWords }
      : {}),
    ...(typeof candidate.maximumWords === "number"
      ? { maximumWords: candidate.maximumWords }
      : {}),
    ...(strings(candidate.selfCheckPrompts).length > 0
      ? { selfCheckPrompts: strings(candidate.selfCheckPrompts) }
      : {}),
  };
}
