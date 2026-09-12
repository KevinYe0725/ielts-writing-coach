import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/locale-provider";
import { CourseRoadmapPreview } from "./roadmap-preview";

describe("course roadmap preview shell semantics", () => {
  it("does not add a nested main landmark inside the app shell", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        children: createElement(CourseRoadmapPreview),
      }),
    );
    expect(html.match(/<main\b/gu) ?? []).toHaveLength(0);
  });
});
