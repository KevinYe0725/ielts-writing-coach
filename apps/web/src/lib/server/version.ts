import { PROMPT_REGISTRY } from "@iwc/ai";
import { APPLICATION_VERSION } from "@iwc/config";
import { DATABASE_SCHEMA_VERSION } from "@iwc/db";
import {
  CONTRACT_VERSIONS,
  PROMPT_VERSIONS,
  RUBRIC_VERSIONS,
} from "@iwc/learning-contracts";

export const PLANNER_VERSION = "worker-canonical-planner@1.0.0" as const;

export function publicVersionDescriptor() {
  return {
    application: APPLICATION_VERSION,
    database_schema: DATABASE_SCHEMA_VERSION,
    contracts: CONTRACT_VERSIONS,
    exchange_schema: CONTRACT_VERSIONS.cycleBundle,
    planner: PLANNER_VERSION,
    prompts: {
      contracts: PROMPT_VERSIONS,
      registry: Object.fromEntries(
        Object.entries(PROMPT_REGISTRY).map(([task, prompt]) => [
          task,
          { prompt: prompt.version, rubric: prompt.rubricVersion },
        ]),
      ),
    },
    rubrics: RUBRIC_VERSIONS,
  } as const;
}
