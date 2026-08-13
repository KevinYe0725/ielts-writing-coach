import { ApiProblem } from "./problem";

export async function readBoundedRequestBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw tooLargeProblem(maximumBytes);
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel("request body limit exceeded");
        throw tooLargeProblem(maximumBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function tooLargeProblem(maximumBytes: number): ApiProblem {
  return new ApiProblem({
    title: "Import too large",
    status: 413,
    code: "IMPORT_TOO_LARGE",
    detail: `CycleBundle imports cannot exceed ${Math.floor(maximumBytes / 1_048_576)} MiB.`,
  });
}
