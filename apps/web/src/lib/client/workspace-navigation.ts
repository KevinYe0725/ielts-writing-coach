import type { LearningDestinations } from "./learning-navigation";

const resourceRoutes = {
  write: "/write",
  feedback: "/feedback",
  lesson: "/lesson",
  rewrite: "/rewrite",
  compare: "/compare",
  transfer: "/transfer",
} as const;

function localUrl(href: unknown): URL | null {
  if (
    typeof href !== "string" ||
    !href.startsWith("/") ||
    href.startsWith("//")
  )
    return null;
  try {
    const url = new URL(href, "https://workspace.local");
    return url.origin === "https://workspace.local" ? url : null;
  } catch {
    return null;
  }
}

export function workspaceDestinations(
  currentHref: string,
  cached: LearningDestinations | null,
): LearningDestinations & { essays: string } {
  const links: LearningDestinations & { essays: string } = {
    today: "/today",
    essays: "/essays",
    growth: "/growth",
    settings: "/settings",
    write: null,
    feedback: null,
    lesson: null,
    rewrite: null,
    compare: null,
    transfer: null,
  };
  const current = localUrl(currentHref);
  const entries = Object.entries(resourceRoutes) as Array<
    [keyof typeof resourceRoutes, string]
  >;
  const active = entries.find(
    ([, route]) =>
      current?.pathname === route ||
      (route === "/lesson" && current?.pathname === "/lesson/paper"),
  )?.[0];
  // A resource route without an identity is still resolving its current essay.
  // Global pages may continue one consistent recent essay from the saved links.
  const cycle =
    current?.searchParams.get("cycle") ||
    (!active
      ? entries
          .map(([key]) => localUrl(cached?.[key])?.searchParams.get("cycle"))
          .find(Boolean)
      : null);

  for (const [key, route] of entries) {
    if (key === active) {
      links[key] = currentHref;
      continue;
    }
    const href = cached?.[key];
    const url = localUrl(href);
    if (
      !cycle ||
      !url ||
      url.pathname !== route ||
      url.searchParams.get("cycle") !== cycle
    )
      continue;
    const requiredId =
      key === "lesson"
        ? "lesson"
        : key === "rewrite" || key === "transfer"
          ? "task"
          : null;
    if (requiredId && !url.searchParams.get(requiredId)) continue;
    links[key] = href ?? null;
  }
  return links;
}
