import type { LearningDestinations } from "./learning-navigation";

const resourceRoutes = {
  write: "/write",
  feedback: "/feedback",
  lesson: "/lesson",
  rewrite: "/rewrite",
  compare: "/compare",
  transfer: "/transfer",
} as const;

interface WorkspaceDestinations extends LearningDestinations {
  essays: string;
  cycleId: string | null;
}

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

function resourceUrl(
  key: keyof typeof resourceRoutes,
  href: unknown,
): URL | null {
  const url = localUrl(href);
  if (
    !url ||
    url.pathname !== resourceRoutes[key] ||
    !url.searchParams.get("cycle")
  )
    return null;
  const requiredId =
    key === "lesson"
      ? "lesson"
      : key === "rewrite" || key === "transfer"
        ? "task"
        : null;
  return requiredId && !url.searchParams.get(requiredId) ? null : url;
}

export function workspaceDestinations(
  currentHref: string,
  cached: LearningDestinations | null,
): WorkspaceDestinations {
  const links: WorkspaceDestinations = {
    cycleId: null,
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
  const validResources = entries.map(
    ([key]) => [key, resourceUrl(key, cached?.[key])] as const,
  );
  // A resource route without an identity is still resolving its current essay.
  // Global pages may continue one consistent recent essay from the saved links.
  links.cycleId =
    current?.searchParams.get("cycle") ||
    (!active
      ? (validResources
          .find(([, url]) => url)?.[1]
          ?.searchParams.get("cycle") ?? null)
      : null);

  for (const [key, url] of validResources) {
    if (key === active) {
      links[key] = currentHref;
      continue;
    }
    if (
      !links.cycleId ||
      !url ||
      url.searchParams.get("cycle") !== links.cycleId
    )
      continue;
    links[key] = cached?.[key] ?? null;
  }
  return links;
}
