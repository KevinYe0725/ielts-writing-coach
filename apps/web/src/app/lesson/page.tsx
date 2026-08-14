"use client";

import { use, useCallback } from "react";

import { useLocale } from "@/components/locale-provider";
import { ActionLink, Card, Skeleton } from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { useFocusedPackageRecovery } from "@/components/use-focused-package-recovery";
import { LearningClientError, learningClient } from "@/lib/client";
import {
  learningRouteHref,
  singleRouteParam,
  type LearningSearchParams,
} from "@/lib/client/learning-route";

import { TeachingArticle } from "./teaching-article";

export default function FocusedTeachingPage({
  searchParams,
}: {
  searchParams: Promise<LearningSearchParams>;
}) {
  const query = use(searchParams);
  const cycleId = singleRouteParam(query, "cycle");
  const lessonId = singleRouteParam(query, "lesson");
  const { text } = useLocale();
  const loader = useCallback(
    () =>
      cycleId && lessonId
        ? learningClient.getFocusedTeaching(cycleId, lessonId)
        : Promise.reject(
            new LearningClientError(
              "This teaching module is missing its identity. Open it from Today.",
              { status: 400, code: "LEARNING_ROUTE_IDENTITY_REQUIRED" },
            ),
          ),
    [cycleId, lessonId],
  );
  const { data, error, loading, retry } = useDemoResource(loader);
  const replace = useCallback(
    (targetLessonId: string) =>
      learningClient.replaceLegacyLesson(targetLessonId),
    [],
  );
  const recoveryState = useFocusedPackageRecovery({
    available: Boolean(data),
    error,
    lessonId,
    refresh: retry,
    replace,
  });
  const feedbackHref = cycleId
    ? learningRouteHref("/feedback", { cycleId })
    : "/today";
  const writingHref = cycleId
    ? learningRouteHref("/write", { cycleId })
    : "/write";

  if (!data) {
    if (loading && !error && recoveryState === "IDLE") {
      return (
        <Skeleton
          label={text("正在准备专项教学", "Preparing focused teaching")}
        />
      );
    }

    const preparing = recoveryState === "PREPARING";
    return (
      <Card className="transfer-result-card" role="status">
        <h1>
          {preparing
            ? text("正在为你准备专项教学", "Preparing your focused teaching")
            : text(
                "专项教学会继续准备",
                "Your focused teaching will keep preparing",
              )}
        </h1>
        <p>
          {preparing
            ? text(
                "你的原有学习记录已保留。完成后，这里会自动显示教学内容和训练卷。",
                "Your earlier learning record is safe. This page will show the teaching and paper automatically when they are ready.",
              )
            : text(
                "你的原有学习记录已保留。你可以先查看批改报告或继续写作，稍后回来即可。",
                "Your earlier learning record is safe. You can review feedback or keep writing, then return later.",
              )}
        </p>
        <div className="completion-actions">
          <ActionLink href={feedbackHref}>
            {text("查看批改报告", "View feedback")}
          </ActionLink>
          <ActionLink href={writingHref} variant="secondary">
            {text("继续写作", "Keep writing")}
          </ActionLink>
        </div>
      </Card>
    );
  }

  return (
    <TeachingArticle
      data={data}
      feedbackHref={learningRouteHref("/feedback", {
        cycleId: data.cycleId,
        lessonId: data.id,
      })}
      paperHref={learningRouteHref("/lesson/paper", {
        cycleId: data.cycleId,
        lessonId: data.id,
      })}
    />
  );
}
