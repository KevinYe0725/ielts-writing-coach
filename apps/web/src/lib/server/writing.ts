export function countEssayWords(content: string): number {
  const matches = content
    .trim()
    .match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}

export function parseRevisionHeader(header: string | null): number {
  if (!header) return Number.NaN;
  const normalized = header.replace(/^W\//, "").replaceAll('"', "").trim();
  return Number(normalized);
}

export function revisionEtag(revision: number): string {
  return `W/"${revision}"`;
}
