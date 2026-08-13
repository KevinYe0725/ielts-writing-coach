export type LearningSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function singleRouteParam(
  searchParams: LearningSearchParams,
  name: string,
): string | null {
  const value = searchParams[name];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function learningRouteHref(
  pathname: string,
  identity: {
    cycleId?: string | null;
    lessonId?: string | null;
    taskId?: string | null;
  },
): string {
  const searchParams = new URLSearchParams();
  if (identity.cycleId) searchParams.set("cycle", identity.cycleId);
  if (identity.lessonId) searchParams.set("lesson", identity.lessonId);
  if (identity.taskId) searchParams.set("task", identity.taskId);
  const query = searchParams.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}
