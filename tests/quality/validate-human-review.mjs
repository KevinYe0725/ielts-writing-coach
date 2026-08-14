import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(
  dirname(dirname(fileURLToPath(import.meta.url))),
);
const protocolPath = join(
  repositoryRoot,
  "tests/human-review/v1/review-plan.json",
);
const essayCorpusPath = join(
  repositoryRoot,
  "tests/benchmarks/v1/essay-samples.json",
);
const runPath = process.argv[2];

if (runPath === undefined) {
  throw new Error(
    "Usage: node tests/quality/validate-human-review.mjs <completed-run.json>",
  );
}
if (!existsSync(runPath)) {
  console.error(
    `A completed human-review run is required at ${runPath}. Copy tests/human-review/v1/review-run.template.json, complete the review protocol, and do not mark it COMPLETE until both independent reviews and adjudication are recorded.`,
  );
  process.exit(1);
}

const protocol = JSON.parse(readFileSync(protocolPath, "utf8"));
const essayCorpus = JSON.parse(readFileSync(essayCorpusPath, "utf8"));
const run = JSON.parse(readFileSync(runPath, "utf8"));
const failures = [];
const requireCondition = (condition, message) => {
  if (!condition) failures.push(message);
};
const nonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;
const validDate = (value) =>
  nonEmptyString(value) && Number.isFinite(Date.parse(value));
const validProbability = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;
const validIeltsBand = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 9 &&
  Number.isInteger(value * 2);
const unique = (values) => new Set(values).size === values.length;
const countBySkill = (records) =>
  records.reduce((counts, record) => {
    counts.set(record.skillId, (counts.get(record.skillId) ?? 0) + 1);
    return counts;
  }, new Map());
const coversSkills = (records, requiredSkills, minimum) => {
  const counts = countBySkill(records);
  return requiredSkills.every(
    (skillId) => (counts.get(skillId) ?? 0) >= minimum,
  );
};
const hasTwoIndependentLabels = (record, reviewerIds) =>
  Array.isArray(record.reviews) &&
  record.reviews.length >= 2 &&
  unique(record.reviews.map((review) => review.reviewerId)) &&
  record.reviews.every(
    (review) =>
      reviewerIds.has(review.reviewerId) &&
      review.independent === true &&
      validDate(review.reviewedAt),
  );
const generatedReviewHasJudgment = (review, criteria) =>
  criteria.every(
    (criterion) => typeof review.labels?.[criterion] === "boolean",
  ) && nonEmptyString(review.rationale);
const openReviewHasJudgment = (review) =>
  typeof review.pass === "boolean" && nonEmptyString(review.rationale);
const essayReviewHasJudgment = (review) =>
  validIeltsBand(review.overallBand) &&
  ["TR", "CC", "LR", "GRA"].every(
    (criterion) =>
      validIeltsBand(review.criteria?.[criterion]?.band) &&
      nonEmptyString(review.criteria?.[criterion]?.rationale),
  );

requireCondition(
  run.protocolVersion === protocol.protocolVersion,
  "protocolVersion must match the locked review plan",
);
requireCondition(run.status === "COMPLETE", "status must be COMPLETE");
requireCondition(
  validDate(run.startedAt),
  "startedAt must be an ISO date-time",
);
requireCondition(
  validDate(run.completedAt),
  "completedAt must be an ISO date-time",
);
requireCondition(
  Date.parse(run.completedAt) >= Date.parse(run.startedAt),
  "completedAt must not precede startedAt",
);
for (const field of [
  "runId",
  "provider",
  "modelId",
  "promptVersion",
  "rubricVersion",
  "corpusVersion",
]) {
  requireCondition(nonEmptyString(run[field]), `${field} must be recorded`);
}
requireCondition(
  String(run.provider).toLowerCase() !== "mock",
  "human quality evidence must use a real provider, not Mock",
);
requireCondition(
  Array.isArray(run.reviewers) && run.reviewers.length >= 2,
  "at least two reviewers are required",
);
const reviewerIds = new Set(
  (run.reviewers ?? []).map((reviewer) => reviewer.id),
);
requireCondition(
  reviewerIds.size === (run.reviewers ?? []).length &&
    [...reviewerIds].every(nonEmptyString),
  "reviewer IDs must be non-empty and unique",
);
requireCondition(
  (run.reviewers ?? []).every(
    (reviewer) =>
      nonEmptyString(reviewer.qualification) &&
      reviewer.consentToPublishDeidentifiedReview === true,
  ),
  "each reviewer must record a qualification and publication consent",
);

const generated = run.generatedItems ?? [];
const generatedPlan = protocol.generatedItemReview;
requireCondition(
  generated.length >= generatedPlan.minimumItems,
  `generatedItems must include at least ${generatedPlan.minimumItems} records`,
);
requireCondition(
  unique(generated.map((record) => record.sampleId)),
  "generated item sample IDs must be unique",
);
requireCondition(
  coversSkills(
    generated,
    generatedPlan.requiredSkillIds,
    generatedPlan.minimumPerSkill,
  ),
  `generatedItems must include at least ${generatedPlan.minimumPerSkill} records for every fixed skill`,
);

for (const record of generated) {
  requireCondition(
    nonEmptyString(record.sampleId),
    "generated sampleId is required",
  );
  requireCondition(
    generatedPlan.requiredSkillIds.includes(record.skillId),
    `${record.sampleId}: unknown skillId`,
  );
  requireCondition(
    nonEmptyString(record.itemType) && nonEmptyString(record.prompt),
    `${record.sampleId}: itemType and prompt are required`,
  );
  requireCondition(
    hasTwoIndependentLabels(record, reviewerIds),
    `${record.sampleId}: two independent dated reviews are required`,
  );
  requireCondition(
    (record.reviews ?? []).every((review) =>
      generatedReviewHasJudgment(review, generatedPlan.requiredCriteria),
    ),
    `${record.sampleId}: independent generated-item reviews must include all four labels and a rationale`,
  );
  requireCondition(
    generatedPlan.requiredCriteria.every(
      (criterion) => typeof record.adjudicated?.[criterion] === "boolean",
    ),
    `${record.sampleId}: every adjudicated criterion must be boolean`,
  );
  const expectedAccepted = generatedPlan.requiredCriteria.every(
    (criterion) => record.adjudicated?.[criterion] === true,
  );
  requireCondition(
    record.adjudicated?.accepted === expectedAccepted,
    `${record.sampleId}: accepted must equal ALL_REQUIRED_CRITERIA_PASS`,
  );
  requireCondition(
    nonEmptyString(record.adjudicated?.adjudicatorId) &&
      reviewerIds.has(record.adjudicated.adjudicatorId) &&
      validDate(record.adjudicated?.adjudicatedAt),
    `${record.sampleId}: adjudicator and adjudicatedAt are required`,
  );
}

const acceptedGenerated = generated.filter(
  (record) => record.adjudicated?.accepted === true,
).length;
requireCondition(
  acceptedGenerated > 0 && acceptedGenerated < generated.length,
  "generated-item review must retain both accepted and rejected samples",
);
const generatedRate =
  generated.length === 0 ? 0 : acceptedGenerated / generated.length;
requireCondition(
  generatedRate >= generatedPlan.minimumAcceptanceRate,
  `generated-item acceptance rate ${generatedRate.toFixed(4)} is below ${generatedPlan.minimumAcceptanceRate}`,
);

const openResponses = run.openResponses ?? [];
const openPlan = protocol.openResponseReview;
requireCondition(
  validDate(run.openResponsePassThresholdsDeclaredAt) &&
    Date.parse(run.openResponsePassThresholdsDeclaredAt) <=
      Date.parse(run.startedAt),
  "open-response pass thresholds must be versioned before model execution",
);
requireCondition(
  openResponses.length >= openPlan.minimumResponses,
  `openResponses must include at least ${openPlan.minimumResponses} records`,
);
requireCondition(
  unique(openResponses.map((record) => record.sampleId)),
  "open-response sample IDs must be unique",
);
requireCondition(
  coversSkills(
    openResponses,
    openPlan.requiredSkillIds,
    openPlan.minimumPerSkill,
  ),
  `openResponses must include at least ${openPlan.minimumPerSkill} records for every fixed skill`,
);
requireCondition(
  new Set(openResponses.map((record) => record.level)).size ===
    openPlan.responseLevels.length &&
    openPlan.responseLevels.every((level) =>
      openResponses.some((record) => record.level === level),
    ),
  "openResponses must cover both sentence and paragraph levels",
);
for (const record of openResponses) {
  requireCondition(
    hasTwoIndependentLabels(record, reviewerIds),
    `${record.sampleId}: two independent dated reviews are required`,
  );
  requireCondition(
    (record.reviews ?? []).every(openReviewHasJudgment),
    `${record.sampleId}: independent open-response reviews must include pass and rationale`,
  );
  requireCondition(
    typeof record.adjudicated?.pass === "boolean" &&
      typeof record.modelJudgment?.pass === "boolean",
    `${record.sampleId}: adjudicated and model pass judgments are required`,
  );
  requireCondition(
    nonEmptyString(record.adjudicated?.rationale) &&
      nonEmptyString(record.modelJudgment?.evidence),
    `${record.sampleId}: adjudicated rationale and model evidence are required`,
  );
  requireCondition(
    nonEmptyString(record.prompt) &&
      nonEmptyString(record.answer) &&
      nonEmptyString(record.modelJudgment?.evidence) &&
      record.answer.includes(record.modelJudgment.evidence) &&
      typeof record.modelJudgment?.confidence === "number",
    `${record.sampleId}: open-response prompt, answer, and exact model evidence are required`,
  );
  requireCondition(
    validProbability(record.modelJudgment?.confidence),
    `${record.sampleId}: model confidence must be between 0 and 1`,
  );
  requireCondition(
    nonEmptyString(record.adjudicated?.adjudicatorId) &&
      reviewerIds.has(record.adjudicated.adjudicatorId) &&
      validDate(record.adjudicated?.adjudicatedAt),
    `${record.sampleId}: open-response adjudicator and adjudicatedAt are required`,
  );
}
requireCondition(
  openResponses.some((record) => record.adjudicated?.pass === true) &&
    openResponses.some((record) => record.adjudicated?.pass === false),
  "open-response review must include both pass and fail cases",
);

const essayAdjudications = run.essayAdjudications ?? [];
requireCondition(
  essayAdjudications.length === protocol.essayAdjudication.requiredEssays,
  `essayAdjudications must include exactly ${protocol.essayAdjudication.requiredEssays} records`,
);
requireCondition(
  unique(essayAdjudications.map((record) => record.essayId)),
  "essay adjudication IDs must be unique",
);
const lockedEssayIds = essayCorpus.map((record) => record.id).sort();
const reviewedEssayIds = essayAdjudications
  .map((record) => record.essayId)
  .sort();
requireCondition(
  JSON.stringify(reviewedEssayIds) === JSON.stringify(lockedEssayIds),
  "essay adjudications must use the locked benchmark essay IDs",
);
for (const record of essayAdjudications) {
  requireCondition(
    hasTwoIndependentLabels(record, reviewerIds),
    `${record.essayId}: two independent dated essay reviews are required`,
  );
  requireCondition(
    (record.reviews ?? []).every(essayReviewHasJudgment),
    `${record.essayId}: independent essay reviews must include four criterion bands, rationales, and overall band`,
  );
  requireCondition(
    (record.reviews ?? []).every(
      (review) =>
        validIeltsBand(review.overallBand) &&
        ["TR", "CC", "LR", "GRA"].every((criterion) =>
          validIeltsBand(review.criteria?.[criterion]?.band),
        ),
    ),
    `${record.essayId}: essay review bands must use IELTS half-band values from 0 to 9`,
  );
  requireCondition(
    ["TR", "CC", "LR", "GRA"].every(
      (criterion) =>
        validIeltsBand(record.adjudicated?.criteria?.[criterion]?.band) &&
        nonEmptyString(record.adjudicated?.criteria?.[criterion]?.rationale),
    ),
    `${record.essayId}: adjudicated TR/CC/LR/GRA band and rationale are required`,
  );
  requireCondition(
    validIeltsBand(record.adjudicated?.overallBand),
    `${record.essayId}: adjudicated overallBand is required`,
  );
  requireCondition(
    nonEmptyString(record.adjudicated?.adjudicatorId) &&
      reviewerIds.has(record.adjudicated.adjudicatorId) &&
      validDate(record.adjudicated?.adjudicatedAt),
    `${record.essayId}: essay adjudicator and adjudicatedAt are required`,
  );
}

const expectedSummary = {
  generatedItemDenominator: generated.length,
  generatedItemAccepted: acceptedGenerated,
  generatedItemAcceptanceRate: generatedRate,
  openResponseDenominator: openResponses.length,
  essayDenominator: essayAdjudications.length,
};
for (const [field, value] of Object.entries(expectedSummary)) {
  requireCondition(
    Math.abs((run.summary?.[field] ?? Number.NaN) - value) < 1e-12,
    `summary.${field} must equal the computed value ${value}`,
  );
}
requireCondition(
  Array.isArray(run.limitations) &&
    run.limitations.some((text) =>
      String(text).toLowerCase().includes("not official ielts"),
    ),
  "the completed report must retain the not-official-IELTS caveat",
);

if (failures.length > 0) {
  console.error(
    `Human review is not release-ready (${failures.length} issue(s)):`,
  );
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Human review ${run.runId} is internally consistent: ${acceptedGenerated}/${generated.length} generated items accepted; ${openResponses.length} open responses and ${essayAdjudications.length} essays adjudicated.`,
  );
}
