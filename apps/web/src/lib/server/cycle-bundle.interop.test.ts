import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  createDatabase,
  mixedReviewTask,
  newDomainId,
  question,
  rewriteTask,
  trainingCycle,
  user,
  writingAttempt,
} from "@iwc/db";
import {
  createCycleBundleArchive,
  readCycleBundleArchive,
  signCycleBundle,
} from "@iwc/exchange";
import type { CycleBundle } from "@iwc/learning-contracts";

import {
  buildCycleBundle,
  cycleBundleContentHash,
  importCycleBundle,
} from "./cycle-bundle";

const databaseUrl =
  process.env.IWC_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const skillPython =
  process.env.IWC_SKILL_PYTHON ??
  (spawnSync("python3.11", ["--version"]).status === 0
    ? "python3.11"
    : "python3");
const skillScript = fileURLToPath(
  new URL(
    "../../../../../.agents/skills/coach-ielts-writing/scripts/coach_state.py",
    import.meta.url,
  ),
);

function skill(workspace: string, ...args: string[]): unknown {
  const envelope = JSON.parse(
    execFileSync(
      skillPython,
      [skillScript, ...args, "--workspace", workspace],
      { encoding: "utf8" },
    ),
  ) as { ok: boolean; result: unknown };
  return envelope.result;
}

function skillImport(workspace: string, input: string): unknown {
  return skill(workspace, "import-bundle", "--input", input);
}

function skillExport(
  workspace: string,
  cycleId: string,
  output: string,
): CycleBundle {
  skill(
    workspace,
    "export-bundle",
    "--cycle-id",
    cycleId,
    "--include-content",
    "--output",
    output,
  );
  return output.endsWith(".zip")
    ? readCycleBundleArchive(readFileSync(output))
    : (JSON.parse(readFileSync(output, "utf8")) as CycleBundle);
}

describe.skipIf(!databaseUrl)(
  "Web ↔ Skill CycleBundle interoperability",
  () => {
    const { db, pool } = createDatabase(databaseUrl!);
    const createdUsers: string[] = [];
    const workspaces: string[] = [];

    afterAll(async () => {
      await pool.end();
    });

    afterEach(async () => {
      for (const id of createdUsers.splice(0)) {
        await db.delete(user).where(eq(user.id, id));
      }
      for (const workspace of workspaces.splice(0)) {
        rmSync(workspace, { recursive: true, force: true });
      }
    });

    async function createUser(label: string): Promise<string> {
      const suffix = newDomainId();
      const userId = `${label}-${suffix}`;
      createdUsers.push(userId);
      await db.insert(user).values({
        id: userId,
        name: "CycleBundle Interop",
        email: `${suffix}@example.test`,
        role: "learner",
      });
      return userId;
    }

    function workspace(): string {
      const path = mkdtempSync(join(tmpdir(), "iwc-interop-"));
      workspaces.push(path);
      return path;
    }

    it("round-trips Web → Skill append → Web for UUIDv7 private questions and ZIP", async () => {
      const userId = await createUser("web-skill-web");
      const questionId = newDomainId();
      const cycleId = newDomainId();
      const started = new Date("2026-08-13T10:00:00.000Z");
      await db.insert(question).values({
        id: questionId,
        externalId: `private-${questionId}`,
        ownerId: userId,
        source: "private_test",
        visibility: "private",
        questionType: "opinion",
        topic: "education",
        prompt: "Should primary schools begin foreign-language teaching early?",
        instructions: "Write at least 250 words in 40 minutes.",
      });
      await db.insert(trainingCycle).values({
        id: cycleId,
        userId,
        questionId,
        schemaVersion: "1.0.0",
        timezone: "Asia/Shanghai",
        createdAt: started,
        updatedAt: started,
      });
      await db.insert(rewriteTask).values({
        cycleId,
        userId,
        availableAt: new Date("2026-08-14T10:00:00.000Z"),
        abstractChecklist: [],
      });
      await db.insert(mixedReviewTask).values({
        sourceCycleId: cycleId,
        userId,
        dueAt: new Date("2026-08-27T10:00:00.000Z"),
      });

      const first = await buildCycleBundle(db, userId, cycleId);
      expect(first.manifest).toMatchObject({
        revision: 1,
        parentRevision: null,
      });
      const root = workspace();
      const webZip = join(root, "from-web.iwc-bundle.zip");
      writeFileSync(webZip, createCycleBundleArchive(first));
      skillImport(root, webZip);

      skill(
        root,
        "transition",
        "--cycle-id",
        cycleId,
        "--to",
        "ATTEMPT_1_ACTIVE",
      );
      const essay = join(root, "v1.txt");
      writeFileSync(
        essay,
        "Early language lessons can broaden children's cultural awareness and make later study easier.",
      );
      skill(
        root,
        "save-attempt",
        "--cycle-id",
        cycleId,
        "--version",
        "1",
        "--input",
        essay,
        "--started-at",
        "2026-08-13T10:05:00.000Z",
        "--submitted-at",
        "2026-08-13T10:35:00.000Z",
      );
      skill(root, "transition", "--cycle-id", cycleId, "--to", "SUBMITTED");
      const skillZip = join(root, "from-skill.iwc-bundle.zip");
      const appended = skillExport(root, cycleId, skillZip);
      expect(appended.manifest).toMatchObject({
        revision: 2,
        parentRevision: 1,
      });
      expect(appended.attempts).toHaveLength(1);

      const imported = await importCycleBundle(db, userId, appended);
      expect(imported).toMatchObject({ imported: true, idempotent: false });
      await expect(
        importCycleBundle(db, userId, appended),
      ).resolves.toMatchObject({
        imported: false,
        idempotent: true,
      });
      const reexported = await buildCycleBundle(db, userId, cycleId);
      expect(reexported.manifest).toMatchObject({
        revision: 2,
        parentRevision: 1,
      });
      expect(cycleBundleContentHash(reexported)).toBe(
        cycleBundleContentHash(appended),
      );

      const immutablePrompt = reexported.cycle.question.prompt;
      const conflicting = signCycleBundle({
        ...reexported,
        manifest: {
          ...reexported.manifest,
          bundleId: newDomainId(),
          exportedAt: "2026-08-13T11:00:00.000Z",
          revision: 3,
          parentRevision: 2,
        },
        cycle: {
          ...reexported.cycle,
          question: {
            ...reexported.cycle.question,
            prompt: "A different immutable prompt",
          },
          updatedAt: "2026-08-13T11:00:00.000Z",
        },
      });
      await expect(
        importCycleBundle(db, userId, conflicting),
      ).rejects.toMatchObject({
        problem: { code: "BUNDLE_CONFLICT", status: 409 },
      });
      await expect(
        importCycleBundle(db, userId, conflicting),
      ).rejects.toMatchObject({
        problem: { code: "BUNDLE_CONFLICT", status: 409 },
      });
      const preserved = await buildCycleBundle(db, userId, cycleId);
      expect(preserved.cycle.question.prompt).toBe(immutablePrompt);
      expect(preserved.manifest.revision).toBe(2);
    });

    it("round-trips Skill → Web append → Skill as JSON with monotonic revisions", async () => {
      const userId = await createUser("skill-web-skill");
      const root = workspace();
      skill(root, "init", "--timezone", "Asia/Shanghai");
      const created = skill(
        root,
        "new-cycle",
        "--question",
        "Should employers allow most staff to work remotely?",
      ) as { cycle_id: string; question_id: string };
      const cycleId = created.cycle_id;
      const originalJson = join(root, "skill-original.json");
      const original = skillExport(root, cycleId, originalJson);
      expect(original.manifest).toMatchObject({
        revision: 1,
        parentRevision: null,
      });
      await importCycleBundle(db, userId, original);

      const attemptId = newDomainId();
      await db.insert(writingAttempt).values({
        id: attemptId,
        cycleId,
        userId,
        kind: "version_1",
        content:
          "Remote work can reduce commuting time, although teams still need deliberate communication routines.",
        wordCount: 13,
        lockedAt: new Date("2026-08-13T12:40:00.000Z"),
        submittedAt: new Date("2026-08-13T12:40:00.000Z"),
        createdAt: new Date("2026-08-13T12:00:00.000Z"),
      });
      await db
        .update(trainingCycle)
        .set({
          status: "SUBMITTED",
          updatedAt: new Date("2026-08-13T12:40:00.000Z"),
        })
        .where(eq(trainingCycle.id, cycleId));
      const updated = await buildCycleBundle(db, userId, cycleId);
      expect(updated.manifest).toMatchObject({
        revision: 2,
        parentRevision: 1,
      });
      const webJson = join(root, "web-updated.json");
      writeFileSync(webJson, JSON.stringify(updated));
      skillImport(root, webJson);
      expect(skillImport(root, webJson)).toMatchObject({ idempotent: true });
      const finalJson = join(root, "skill-final.json");
      const final = skillExport(root, cycleId, finalJson);
      expect(final.manifest).toMatchObject({ revision: 2, parentRevision: 1 });
      expect(cycleBundleContentHash(final)).toBe(
        cycleBundleContentHash(updated),
      );

      const conflicting = signCycleBundle({
        ...final,
        manifest: {
          ...final.manifest,
          bundleId: newDomainId(),
          exportedAt: "2026-08-13T13:00:00.000Z",
          revision: 3,
          parentRevision: 2,
        },
        cycle: {
          ...final.cycle,
          question: {
            ...final.cycle.question,
            instructions: "Changed instructions",
          },
          updatedAt: "2026-08-13T13:00:00.000Z",
        },
      });
      const conflictPath = join(root, "skill-conflict.json");
      writeFileSync(conflictPath, JSON.stringify(conflicting));
      const failed = spawnSync(
        skillPython,
        [
          skillScript,
          "import-bundle",
          "--input",
          conflictPath,
          "--workspace",
          root,
        ],
        { encoding: "utf8" },
      );
      expect(failed.status).not.toBe(0);
      expect(failed.stderr).toContain("/cycle/question");
      expect(
        readFileSync(
          join(root, ".coach-ielts-writing/cycles", cycleId, "question.md"),
          "utf8",
        ),
      ).toContain("Should employers allow most staff to work remotely?");
    });
  },
);
