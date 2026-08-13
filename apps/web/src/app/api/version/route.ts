import { publicVersionDescriptor } from "@/lib/server/version";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(publicVersionDescriptor(), {
    headers: { "cache-control": "no-store" },
  });
}
