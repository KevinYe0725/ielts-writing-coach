import { WritingRoom } from "@/components/writing-room";
import {
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

export default async function RewritePage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const query = await searchParams;
  return (
    <WritingRoom
      cycleId={singleRouteParam(query, "cycle")}
      mode="rewrite"
      taskId={singleRouteParam(query, "task")}
    />
  );
}
