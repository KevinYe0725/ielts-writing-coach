import { parseExercisePresentation } from "@iwc/learning-core";

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Builds the learner-facing row without mutating the stored contract. Closed
 * answers stay server-side until an evaluation is returned; a meaning choice
 * may change only the prompt that follows.
 */
export function projectExerciseItemForDelivery<
  T extends {
    readonly prompt: Record<string, unknown>;
    readonly evaluationContract: Record<string, unknown>;
  },
>(
  item: T,
  input: {
    readonly semanticBranch?: string;
    readonly revisionBaseline?: string;
  },
): T {
  const presentation = parseExercisePresentation(
    item.evaluationContract.presentation ?? item.prompt.presentation,
  );
  if (!presentation) return item;
  const branchPrompt = input.semanticBranch
    ? presentation.branchPrompts?.[input.semanticBranch]
    : undefined;
  const clientPresentation =
    presentation.form === "EXPRESSION_MAP" &&
    (presentation.mappingPairs?.length ?? 0) > 1
      ? {
          ...presentation,
          mappingPairs: presentation.mappingPairs!.map((pair, index, all) => ({
            left: pair.left,
            right: all[(index + 1) % all.length]!.right,
          })),
        }
      : presentation;
  const rawCanonical = object(item.evaluationContract.canonicalItem);
  const rawGrading = object(rawCanonical.grading);
  const clientCanonical =
    rawGrading.mode === "DETERMINISTIC"
      ? {
          ...rawCanonical,
          grading: {
            mode: "DETERMINISTIC",
            normalization: rawGrading.normalization,
            acceptedAnswers: [],
          },
        }
      : rawCanonical;
  return {
    ...item,
    prompt: {
      ...item.prompt,
      presentation: clientPresentation,
      ...(branchPrompt ? { promptEn: branchPrompt } : {}),
      ...(input.revisionBaseline
        ? { revisionBaseline: input.revisionBaseline }
        : {}),
    },
    evaluationContract: {
      ...item.evaluationContract,
      presentation: clientPresentation,
      canonicalItem: clientCanonical,
    },
  };
}
