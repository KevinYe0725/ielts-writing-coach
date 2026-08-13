export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const objectStart = candidate.indexOf("{");
    const arrayStart = candidate.indexOf("[");
    const startCandidates = [objectStart, arrayStart].filter(
      (index) => index >= 0,
    );
    const start = Math.min(...startCandidates);
    if (!Number.isFinite(start))
      throw new Error("No JSON value was found in the provider response.");
    const opener = candidate[start];
    const closer = opener === "{" ? "}" : "]";
    const end = candidate.lastIndexOf(closer);
    if (end <= start)
      throw new Error("The provider response contained incomplete JSON.");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export function mockValueFromSchema(
  schema: Record<string, unknown>,
  depth = 0,
): unknown {
  if (depth > 12) return null;
  if ("const" in schema) return schema.const;
  if ("default" in schema) return schema.default;
  if (Array.isArray(schema.examples) && schema.examples.length > 0)
    return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length > 0)
    return schema.enum[0];
  if (Array.isArray(schema.anyOf) && schema.anyOf[0]) {
    return mockValueFromSchema(
      schema.anyOf[0] as Record<string, unknown>,
      depth + 1,
    );
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf[0]) {
    return mockValueFromSchema(
      schema.oneOf[0] as Record<string, unknown>,
      depth + 1,
    );
  }

  switch (schema.type) {
    case "object": {
      const properties = (schema.properties ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      const required = new Set(
        Array.isArray(schema.required)
          ? schema.required
          : Object.keys(properties),
      );
      return Object.fromEntries(
        Object.entries(properties)
          .filter(([key]) => required.has(key))
          .map(([key, value]) => [key, mockValueFromSchema(value, depth + 1)]),
      );
    }
    case "array": {
      const itemSchema = (schema.items ?? { type: "string" }) as Record<
        string,
        unknown
      >;
      const length = Math.max(Number(schema.minItems ?? 1), 1);
      return Array.from({ length }, () =>
        mockValueFromSchema(itemSchema, depth + 1),
      );
    }
    case "integer":
    case "number":
      return Number(schema.minimum ?? 0);
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return schema.format === "date-time"
        ? "2026-01-01T00:00:00.000Z"
        : "Mock response";
  }
}
