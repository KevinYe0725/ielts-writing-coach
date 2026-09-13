import { FeedbackPage, type FeedbackView } from "../page";
import type { LearningSearchParams } from "@/lib/client/learning-route";

export default function FeedbackComparePage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const view: FeedbackView = "compare";
  return <FeedbackPage searchParams={searchParams} view={view} />;
}
