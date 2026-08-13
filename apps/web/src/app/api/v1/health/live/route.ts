export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { status: "live", service: "ielts-writing-coach-web" },
    { status: 200 },
  );
}
