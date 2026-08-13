import { readServerEnvironment } from "@iwc/config";
import { QUESTION_BANK } from "@iwc/question-bank";

import { createDatabase } from "./index";
import { instanceConfiguration, question } from "./schema";

const environment = readServerEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await db.insert(instanceConfiguration).values({
    deploymentMode: environment.DEPLOYMENT_MODE,
    defaultLocale: "zh-CN",
  });
  await db
    .insert(question)
    .values(
      QUESTION_BANK.map((item) => ({
        externalId: item.id,
        source: item.origin,
        visibility: "public",
        ieltsTrack: "academic",
        questionType: item.type,
        topic: item.topic,
        prompt: item.prompt,
        attribution: "IELTS Writing Coach original open question bank",
        bankVersion: "1.0.0",
      })),
    )
    .onConflictDoNothing({ target: question.externalId });
} finally {
  await pool.end();
}
