import { notFound } from "next/navigation";
import { TeachingDesignPreview } from "./teaching-design-preview";

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") notFound();
  const query = await searchParams;
  return (
    <TeachingDesignPreview
      initialView={query.view === "focus" ? "focus" : "workbench"}
    />
  );
}
