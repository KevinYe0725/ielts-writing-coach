import type { QuestionTopic, QuestionType } from "../client/types";

const EXPOSURE_COOLDOWN_MS = 72 * 60 * 60 * 1000;

export interface RecommendationCandidate {
  id: string;
  type: QuestionType;
  topic: QuestionTopic;
  visibility?: "public" | "private";
}

export interface RankedQuestion extends RecommendationCandidate {
  score: number;
}

export function exposureCutoff(now: Date): Date {
  return new Date(now.getTime() - EXPOSURE_COOLDOWN_MS);
}

export function rankQuestionCandidates(input: {
  candidates: readonly RecommendationCandidate[];
  priorCycles: readonly RecommendationCandidate[];
  recentCycles: readonly RecommendationCandidate[];
}): RankedQuestion[] {
  const usedQuestionIds = new Set(input.priorCycles.map((cycle) => cycle.id));
  const typeCounts = countBy(input.priorCycles, (cycle) => cycle.type);
  const topicCounts = countBy(input.priorCycles, (cycle) => cycle.topic);
  const recent = input.recentCycles;
  const recentTypes = new Set(recent.map((cycle) => cycle.type));
  const recentTopics = new Set(recent.map((cycle) => cycle.topic));

  return input.candidates
    .filter((candidate) => candidate.visibility !== "private")
    .filter((candidate) => !usedQuestionIds.has(candidate.id))
    .map((candidate) => ({
      ...candidate,
      score:
        40 / (1 + (typeCounts.get(candidate.type) ?? 0)) +
        35 / (1 + (topicCounts.get(candidate.topic) ?? 0)) +
        (recentTypes.has(candidate.type) ? 0 : 15) +
        (recentTopics.has(candidate.topic) ? 0 : 10),
    }))
    .sort(compareRankedQuestions);
}

export function selectTopBucket(
  ranked: readonly RankedQuestion[],
  randomIndex: (upperExclusive: number) => number,
): RankedQuestion | null {
  if (ranked.length === 0) return null;
  const sorted = [...ranked].sort(compareRankedQuestions);
  const first = sorted[0];
  if (!first) return null;
  const bestScore = first.score;
  const bucket = sorted.filter((candidate) => bestScore - candidate.score <= 5);
  if (bucket.length === 0) return null;
  const index = randomIndex(bucket.length);
  if (!Number.isInteger(index) || index < 0 || index >= bucket.length) {
    throw new RangeError("randomIndex must return an index within the top bucket");
  }
  return bucket[index] ?? null;
}

function countBy<T, K>(values: readonly T[], key: (value: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return counts;
}

function compareRankedQuestions(a: RankedQuestion, b: RankedQuestion): number {
  return b.score - a.score || a.id.localeCompare(b.id);
}
