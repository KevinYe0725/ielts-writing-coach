import { publicVersionDescriptor } from "@/lib/server/version";

// Next.js requires route-segment configuration to be a locally analyzable
// literal; re-exporting `dynamic` makes a production build reject the route.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(publicVersionDescriptor(), {
    headers: { "cache-control": "no-store" },
  });
}
