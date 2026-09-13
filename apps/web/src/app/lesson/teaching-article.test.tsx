import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/components/locale-provider";
import { mechanismChainTeachingFixture } from "@/lib/client/mock-service";
import { TeachingArticle } from "./teaching-article";

function render(
  placements: readonly (number | undefined)[],
  initialStep?: number,
) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      children: createElement(TeachingArticle, {
        data: {
          ...mechanismChainTeachingFixture,
          practicePrompts: mechanismChainTeachingFixture.practicePrompts.map(
            (prompt, i) => {
              const result = { ...prompt };
              delete result.afterSection;
              const position = placements[i];
              if (position !== undefined) result.afterSection = position;
              return result;
            },
          ),
        },
        feedbackHref: "/feedback?cycle=test",
        initialStep,
        paperHref: "/lesson/paper?cycle=test",
      }),
    }),
  );
}

describe("teaching article flow", () => {
  it("shows one teaching step and keeps its associated practice in the step", () => {
    const html = render([1, 2, 3]);
    expect(html).toContain("data-teaching-player");
    expect(html).toContain('data-teaching-step="1"');
    expect(html).toContain("data-teaching-step-next");
    expect(html.match(/id="teaching-practice-prompts"/g)).toHaveLength(1);
    expect(html.match(/data-teaching-continue/g)).toHaveLength(1);
    expect(html).not.toContain('id="build-the-mechanism-one-step-at-a-time"');
    expect(html).not.toContain("data-teaching-reference-answer");
    expect(render([1, 2, 3], 99)).toContain('href="/lesson/paper?cycle=test"');
  });

  it("keeps trailing exercises in their own step without duplicate anchors", () => {
    const html = render([], 5);
    expect(html.match(/id="teaching-practice-prompts"/g)).toHaveLength(1);
    expect(html.match(/\bdata-teaching-practice=/g)).toHaveLength(3);
  });
});
