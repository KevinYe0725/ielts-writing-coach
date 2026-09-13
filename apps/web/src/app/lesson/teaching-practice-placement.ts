/** Placement is presentation metadata, never a reason to discard an exercise. */
export function placeTeachingPractices<
  T extends { readonly id: string; readonly afterSection?: number | undefined },
>(
  prompts: readonly T[],
  sectionCount: number,
): { bySection: T[][]; trailing: T[] } {
  const bySection: T[][] = Array.from({ length: sectionCount }, () => []);
  const trailing: T[] = [];
  for (const prompt of prompts) {
    const position = prompt.afterSection;
    if (
      typeof position === "number" &&
      Number.isInteger(position) &&
      position >= 1 &&
      position <= sectionCount
    ) {
      bySection[position - 1]!.push(prompt);
    } else {
      trailing.push(prompt);
    }
  }
  return { bySection, trailing };
}
