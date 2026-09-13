import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/components/locale-provider";
import { mechanismChainTeachingFixture } from "@/lib/client/mock-service";
import { TeachingArticle } from "./teaching-article";

function render(placements: readonly (number | undefined)[]) {
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
        paperHref: "/lesson/paper?cycle=test",
      }),
    }),
  );
}

describe("teaching article flow", () => {
  it("places associated practice before the next explanation, with one practice anchor", () => {
    const html = render([1, 2, 3]);
    expect(html.indexOf("data-teaching-practice")).toBeLessThan(
      html.indexOf('id="build-the-mechanism-one-step-at-a-time"'),
    );
    expect(html.match(/id="teaching-practice-prompts"/g)).toHaveLength(1);
    expect(html.match(/data-teaching-continue/g)).toHaveLength(3);
    // No completion or answer is required to navigate to the paper.
    expect(html).toContain('href="/lesson/paper?cycle=test"');
    expect(html).not.toContain("data-teaching-reference-answer");
  });

  it("keeps old exercises after all article sections without duplicate anchors", () => {
    const html = render([]);
    expect(html.indexOf('id="teaching-practice-prompts"')).toBeGreaterThan(
      html.indexOf('id="transfer-the-method-to-a-new-topic"'),
    );
    expect(html.match(/id="teaching-practice-prompts"/g)).toHaveLength(1);
    expect(html.match(/\bdata-teaching-practice=/g)).toHaveLength(3);
  });
});
