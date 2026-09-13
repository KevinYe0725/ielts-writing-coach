import type {
  TeachingPracticePrompt,
  TeachingSectionMarkdown,
} from "@/lib/client/types";

export type TeachingPage =
  | {
      kind: "knowledge";
      sectionIndex: number;
      chunkIndex: number;
      chunkCount: number;
      markdown: string;
      pointTitleZh: string;
      pointTitleEn: string;
    }
  | {
      kind: "practice";
      sectionIndex?: number;
      practicePrompts: readonly TeachingPracticePrompt[];
    }
  | { kind: "finish" };

type PracticePlacement = {
  bySection: readonly (readonly TeachingPracticePrompt[])[];
  trailing: readonly TeachingPracticePrompt[];
};

export function splitTeachingMarkdown(
  markdown: string,
  maxCharacters = 440,
): string[] {
  const rawBlocks = markdown
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean);
  const blocks: string[] = [];
  for (let index = 0; index < rawBlocks.length; index += 1) {
    const block = rawBlocks[index]!;
    // A heading names the point immediately below it. Keep that pair together
    // so pagination never leaves a dangling heading at the bottom of a page.
    if (/^#{1,6}\s+/u.test(block) && rawBlocks[index + 1]) {
      blocks.push(`${block}\n\n${rawBlocks[index + 1]}`);
      index += 1;
    } else {
      blocks.push(block);
    }
  }
  if (blocks.length === 0) return [markdown];

  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (current && candidate.length > maxCharacters) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  const trailing = chunks.at(-1);
  const previous = chunks.at(-2);
  if (maxCharacters >= 120 && trailing && previous && trailing.length < 120) {
    chunks.splice(-2, 2, `${previous}\n\n${trailing}`);
  }
  return chunks;
}

function cleanMarkdownTitle(value: string): string {
  return value
    .replace(/^#{1,6}\s+/u, "")
    .replace(/[*_`]/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/[。！？.!?]+$/u, "")
    .trim();
}

function firstSentence(markdown: string): string {
  const line = markdown
    .split("\n")
    .map((value) => cleanMarkdownTitle(value.replace(/^[-*>]\s*/u, "")))
    .find((value) => value.length > 0 && !/^\d+\.\s/u.test(value));
  if (!line) return "";
  const sentence = line.split(/[。！？.!?]/u)[0]?.trim() ?? line;
  return sentence.length > 36 ? `${sentence.slice(0, 36)}…` : sentence;
}

function pointTitle(
  markdown: string,
  section: TeachingSectionMarkdown,
  chunkIndex: number,
): { zh: string; en: string } {
  const heading = markdown.match(/^#{1,6}\s+(.+)$/mu)?.[1];
  const leadingStrong = markdown.match(/^\*\*([^*]+)\*\*/u)?.[1];
  const strong =
    leadingStrong ??
    [...markdown.matchAll(/\*\*([^*\n]+)\*\*/gu)]
      .map((match) => ({
        value: match[1] ?? "",
        linePrefix: markdown
          .slice(0, match.index ?? 0)
          .split("\n")
          .at(-1),
      }))
      .find(
        ({ value, linePrefix }) =>
          value.length >= 6 && !/^\s*\d+\.\s/u.test(linePrefix ?? ""),
      )?.value;
  const candidate = cleanMarkdownTitle(
    heading ?? strong ?? firstSentence(markdown),
  );
  if (!candidate) {
    return {
      zh:
        chunkIndex === 0
          ? section.titleZh
          : `${section.titleZh} · 第${chunkIndex + 1}个要点`,
      en:
        chunkIndex === 0
          ? section.titleEn
          : `${section.titleEn} · Point ${chunkIndex + 1}`,
    };
  }

  const hasChinese = /[\u3400-\u9fff]/u.test(candidate);
  return hasChinese
    ? { zh: candidate, en: section.titleEn }
    : { zh: section.titleZh, en: candidate };
}

export function buildTeachingPages(
  sections: readonly TeachingSectionMarkdown[],
  placement: PracticePlacement,
  maxCharacters = 440,
): TeachingPage[] {
  const pages: TeachingPage[] = [];
  sections.forEach((section, sectionIndex) => {
    const chunks = splitTeachingMarkdown(section.markdown, maxCharacters);
    chunks.forEach((markdown, chunkIndex) => {
      const titles = pointTitle(markdown, section, chunkIndex);
      pages.push({
        kind: "knowledge",
        sectionIndex,
        chunkIndex,
        chunkCount: chunks.length,
        markdown,
        pointTitleZh: titles.zh,
        pointTitleEn: titles.en,
      });
    });
    const sectionPractice = placement.bySection[sectionIndex] ?? [];
    if (sectionPractice.length > 0) {
      pages.push({
        kind: "practice",
        sectionIndex,
        practicePrompts: sectionPractice,
      });
    }
  });
  if (placement.trailing.length > 0) {
    pages.push({ kind: "practice", practicePrompts: placement.trailing });
  }
  pages.push({ kind: "finish" });
  return pages;
}
