import { WritingRoom } from "@/components/writing-room";
import {
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

export default async function WritePage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const query = await searchParams;
  return (
    <WritingRoom
      cycleId={singleRouteParam(query, "cycle")}
      mode="first"
      taskId={null}
    />
  );
}
