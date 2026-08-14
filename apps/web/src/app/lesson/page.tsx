"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/components/locale-provider";
import { ActionLink, Button, Card, Skeleton } from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
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
  const router = useRouter();
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
  const [replacing, setReplacing] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);

  if (loading || !data) {
    if (error) {
      const needsReplacement =
        error instanceof LearningClientError &&
        error.code === "FOCUSED_TEACHING_REPLACEMENT_REQUIRED";
      return (
        <Card className="transfer-result-card">
          <h1>
            {needsReplacement
              ? text(
                  "这份旧训练需要补上专项教学",
                  "This earlier paper needs focused teaching",
                )
              : text("专项教学暂不可用", "Focused teaching unavailable")}
          </h1>
          <p>
            {needsReplacement
              ? text(
                  "系统会保留原作文和批改依据，重新生成“专项教学＋完整训练卷”，避免你在没有学会方法前直接做题。",
                  "Your essay and diagnosis will be preserved while the teaching module and complete paper are regenerated.",
                )
              : error.message}
          </p>
          {replacementError ? (
            <p className="error-text">{replacementError}</p>
          ) : null}
          <div className="completion-actions">
            {needsReplacement && lessonId ? (
              <Button
                disabled={replacing}
                onClick={() => {
                  setReplacing(true);
                  setReplacementError(null);
                  void learningClient
                    .replaceLegacyLesson(lessonId)
                    .then(() => router.push("/today"))
                    .catch((cause) => {
                      setReplacementError(
                        cause instanceof Error
                          ? cause.message
                          : text(
                              "生成失败，请稍后再试。",
                              "Generation failed.",
                            ),
                      );
                    })
                    .finally(() => setReplacing(false));
                }}
              >
                {replacing
                  ? text("正在生成新版内容…", "Generating…")
                  : text(
                      "生成专项教学和新版训练卷",
                      "Generate teaching and a new paper",
                    )}
              </Button>
            ) : (
              <Button onClick={retry} variant="secondary">
                {text("重试", "Try again")}
              </Button>
            )}
            <ActionLink href="/today">
              {text("返回今日计划", "Return to Today")}
            </ActionLink>
          </div>
        </Card>
      );
    }

    return (
      <Skeleton
        label={text("正在准备专项教学", "Preparing focused teaching")}
      />
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
