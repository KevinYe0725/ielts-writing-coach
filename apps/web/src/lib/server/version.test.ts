import { describe, expect, it } from "vitest";

import { AI_TASK_KINDS } from "@iwc/ai";
import { APPLICATION_VERSION } from "@iwc/config";
import { DATABASE_SCHEMA_VERSION } from "@iwc/db";

import { publicVersionDescriptor } from "./version";

describe("public version descriptor", () => {
  it("publishes every compatibility dimension without provider details", () => {
    const descriptor = publicVersionDescriptor();
    expect(descriptor.application).toBe(APPLICATION_VERSION);
    expect(descriptor.database_schema).toBe(DATABASE_SCHEMA_VERSION);
    expect(descriptor.exchange_schema).toBe("1.0.0");
    expect(descriptor.planner).toContain("@1.0.0");
    expect(Object.keys(descriptor.prompts.registry).sort()).toEqual(
      [...AI_TASK_KINDS].sort(),
    );
    expect(descriptor.prompts.registry.teaching_practice_analysis).toEqual({
      prompt: "2.0.0",
      rubric: "iwc-teaching-practice-analysis-atoms-2.0.0",
    });
    expect(JSON.stringify(descriptor)).not.toMatch(/api[_-]?key|secret/i);
  });
});
