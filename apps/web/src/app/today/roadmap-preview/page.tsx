import { notFound } from "next/navigation";

import { CourseRoadmapPreview } from "./roadmap-preview";

export default function RoadmapPreviewPage() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") notFound();
  return <CourseRoadmapPreview />;
}
