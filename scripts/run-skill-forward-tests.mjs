#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const skillSource = resolve(root, ".agents/skills/coach-ielts-writing");
const outputPath = resolve(
  root,
  process.env.IWC_FORWARD_OUTPUT ?? "tests/skill-forward/v1/forward-run.json",
);
const goldenLesson = resolve(root, "tests/golden/valid-lesson.json");
const protectedSentinel = "PROTECTED_V1_SENTINEL_9F4B7C";
const python = process.env.PYTHON311 ?? "python3.11";
const codex = process.env.CODEX_CLI ?? "codex";
const timeoutMs = Number(process.env.IWC_FORWARD_TIMEOUT_MS ?? 240_000);

const responseSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["scenario_id", "marker", "user_facing_response", "actions_taken"],
  properties: {
    scenario_id: { type: "string" },
    marker: { type: "string" },
    user_facing_response: { type: "string", minLength: 1 },
    actions_taken: { type: "array", items: { type: "string" } },
  },
};

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) => entry.name !== "__pycache__" && !entry.name.endsWith(".pyc"),
    )
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    })
    .sort();
}

function digestTree(directory) {
  const hash = createHash("sha256");
  for (const path of walk(directory)) {
    hash.update(relative(directory, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout ?? 30_000,
    env: { ...process.env, ...options.env },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status ?? "spawn"}):\n${result.stderr || result.stdout || result.error}`,
    );
  }
  return result.stdout;
}

function coach(workspace, args) {
  return run(
    python,
    [
      resolve(
        workspace,
        ".agents/skills/coach-ielts-writing/scripts/coach_state.py",
      ),
      ...args,
    ],
    { cwd: workspace },
  );
}

function initialise(workspace) {
  coach(workspace, [
    "init",
    "--workspace",
    workspace,
    "--timezone",
    "Asia/Shanghai",
  ]);
}

function newCycle(workspace, suffix = "1") {
  const cycleId = `01989a00-0000-700${suffix}-8000-00000000000${suffix}`;
  const questionId = `01989a00-0000-710${suffix}-8000-00000000000${suffix}`;
  coach(workspace, [
    "new-cycle",
    "--workspace",
    workspace,
    "--cycle-id",
    cycleId,
    "--question-id",
    questionId,
    "--question",
    "Some cities are changing how public space is used. To what extent do you agree or disagree?",
  ]);
  return cycleId;
}

function transition(workspace, cycleId, state) {
  coach(workspace, [
    "transition",
    "--workspace",
    workspace,
    "--cycle-id",
    cycleId,
    "--to",
    state,
  ]);
}

function prepareLesson(
  workspace,
  suffix = "7",
  { cursor = false, rewrite = false } = {},
) {
  initialise(workspace);
  const cycleId = newCycle(workspace, suffix);
  transition(workspace, cycleId, "ATTEMPT_1_ACTIVE");
  const essayPath = resolve(workspace, "synthetic-v1.md");
  writeFileSync(
    essayPath,
    `Cities need shared places for daily life. ${protectedSentinel} This synthetic essay exists only for leakage testing.\n`,
  );
  coach(workspace, [
    "save-attempt",
    "--workspace",
    workspace,
    "--cycle-id",
    cycleId,
    "--version",
    "1",
    "--input",
    essayPath,
    "--started-at",
    "2026-07-01T10:00:00Z",
    "--submitted-at",
    "2026-07-01T10:40:00Z",
  ]);
  for (const state of [
    "SUBMITTED",
    "ANALYZING",
    "FEEDBACK_READY",
    "LESSON_GENERATING",
  ]) {
    transition(workspace, cycleId, state);
  }
  const planPath = resolve(workspace, "valid-lesson.json");
  const plan = JSON.parse(readFileSync(goldenLesson, "utf8"));
  plan.trainingCycleId = cycleId;
  for (const objective of plan.objectives) {
    objective.trainingCycleId = cycleId;
  }
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  coach(workspace, [
    "save-contract",
    "--workspace",
    workspace,
    "--cycle-id",
    cycleId,
    "--kind",
    "lesson-plan",
    "--input",
    planPath,
  ]);
  coach(workspace, [
    "task-transition",
    "--workspace",
    workspace,
    "--cycle-id",
    cycleId,
    "--machine",
    "lesson",
    "--to",
    "ACTIVE",
  ]);
  if (cursor) {
    coach(workspace, [
      "lesson-cursor",
      "--workspace",
      workspace,
      "--cycle-id",
      cycleId,
      "--block-id",
      "01989a00-0000-7001-8000-000000000007",
      "--item-id",
      "01989a00-0000-7001-8000-000000000017",
      "--elapsed-seconds",
      "925",
    ]);
  }
  if (rewrite) {
    coach(workspace, [
      "task-transition",
      "--workspace",
      workspace,
      "--cycle-id",
      cycleId,
      "--machine",
      "lesson",
      "--to",
      "CORE_COMPLETED",
    ]);
    coach(workspace, [
      "schedule",
      "--workspace",
      workspace,
      "--cycle-id",
      cycleId,
      "--exposure-at",
      "2026-07-01T12:00:00Z",
    ]);
    coach(workspace, [
      "task-transition",
      "--workspace",
      workspace,
      "--cycle-id",
      cycleId,
      "--machine",
      "rewrite",
      "--to",
      "READY",
    ]);
  }
  return cycleId;
}

function readCycle(workspace, cycleId) {
  return JSON.parse(
    readFileSync(
      resolve(workspace, ".coach-ielts-writing/cycles", cycleId, "cycle.json"),
      "utf8",
    ),
  );
}

function assertion(name, passed, detail = "") {
  return { name, passed: Boolean(passed), detail };
}

const scenarios = [
  {
    id: "empty-status",
    prompt:
      "用户说：我今天应该做什么？当前目录就是学习 workspace。不要虚构已有训练；按 Skill 检查状态并给唯一下一步。",
    verify: ({ workspace, commands, final }) => [
      assertion(
        "status command",
        commands.some((value) => value.includes("coach_state.py status")),
      ),
      assertion(
        "state validation command",
        commands.some((value) => value.includes("validate_state.py")),
      ),
      assertion(
        "no invented cycle",
        !existsSync(resolve(workspace, ".coach-ielts-writing/cycles")),
      ),
      assertion(
        "honest initialization next step",
        /初始化|initiali/i.test(final.user_facing_response),
      ),
    ],
  },
  {
    id: "start-new-cycle",
    prompt:
      "用户说：给我一道 Academic Task 2 题并开始 40 分钟练习。当前目录已明确是学习 workspace；直接初始化并建立一个训练周期，不要替用户写提纲或观点。",
    verify: ({ workspace, commands }) => {
      const cycles = readdirSync(
        resolve(workspace, ".coach-ielts-writing/cycles"),
      );
      const cycle = JSON.parse(
        readFileSync(
          resolve(
            workspace,
            ".coach-ielts-writing/cycles",
            cycles[0],
            "cycle.json",
          ),
          "utf8",
        ),
      );
      return [
        assertion(
          "workspace initialized",
          existsSync(resolve(workspace, ".coach-ielts-writing/manifest.json")),
        ),
        assertion("exactly one cycle", cycles.length === 1),
        assertion(
          "cycle starts legally",
          ["QUESTION_READY", "ATTEMPT_1_ACTIVE"].includes(cycle.state),
        ),
        assertion(
          "state tool used",
          commands.some((value) => value.includes("coach_state.py")),
        ),
      ];
    },
  },
  {
    id: "user-supplied-question",
    prompt:
      '用户说：用这道题开始练习，当前目录就是 workspace："Governments should make public transport free for everyone. To what extent do you agree or disagree?" 必须原样保存题目，不改写。',
    verify: ({ workspace }) => {
      const cycles = readdirSync(
        resolve(workspace, ".coach-ielts-writing/cycles"),
      );
      const question = readFileSync(
        resolve(
          workspace,
          ".coach-ielts-writing/cycles",
          cycles[0],
          "question.md",
        ),
        "utf8",
      ).trim();
      return [
        assertion(
          "exact prompt preserved",
          question ===
            "Governments should make public transport free for everyone. To what extent do you agree or disagree?",
        ),
        assertion("one cycle only", cycles.length === 1),
      ];
    },
  },
  {
    id: "isolated-sentence",
    prompt:
      '用户只问一句："much slighter pressure" 语法正确吗？直接回答并区分语法正确与搭配/表达视角自然度；不要强迫建立训练周期。',
    verify: ({ workspace, final }) => [
      assertion(
        "no forced workspace",
        !existsSync(resolve(workspace, ".coach-ielts-writing")),
      ),
      assertion(
        "grammar and naturalness distinguished",
        /语法|grammat/i.test(final.user_facing_response) &&
          /自然|natural|搭配|collocation/i.test(final.user_facing_response),
      ),
    ],
  },
  {
    id: "task-one-boundary",
    prompt:
      "用户说：帮我完成 IELTS Academic Task 1 图表作文训练。遵守 Skill 边界，不要创建 Task 2 周期。",
    verify: ({ workspace, final }) => [
      assertion(
        "no Task 2 state created",
        !existsSync(resolve(workspace, ".coach-ielts-writing")),
      ),
      assertion(
        "scope boundary stated",
        /Task\s*1|范围|scope|不适用|不支持/i.test(final.user_facing_response),
      ),
    ],
  },
  {
    id: "resume-active-cycle",
    setup(workspace) {
      initialise(workspace);
      return { cycleId: newCycle(workspace, "6") };
    },
    prompt: "用户说：继续。按本地状态给唯一下一步，不要创建第二个周期。",
    verify: ({ workspace, context, commands }) => {
      const cycles = readdirSync(
        resolve(workspace, ".coach-ielts-writing/cycles"),
      );
      const cycle = readCycle(workspace, context.cycleId);
      return [
        assertion(
          "active cycle preserved",
          cycles.length === 1 && cycles[0] === context.cycleId,
        ),
        assertion(
          "legal resume state",
          ["QUESTION_READY", "ATTEMPT_1_ACTIVE"].includes(cycle.state),
        ),
        assertion(
          "status read first",
          commands.some((value) => value.includes("coach_state.py status")),
        ),
      ];
    },
  },
  {
    id: "corrupt-state-safe-stop",
    setup(workspace) {
      initialise(workspace);
      const path = resolve(workspace, ".coach-ielts-writing/manifest.json");
      const corrupt = '{"corrupt": "KEEP_ME",';
      writeFileSync(path, corrupt);
      return { path, corrupt };
    },
    prompt:
      "用户说：继续今天的训练。状态损坏时必须安全停止、说明问题，不得覆盖或猜测恢复。",
    verify: ({ context, commands, final }) => [
      assertion(
        "corrupt file preserved",
        readFileSync(context.path, "utf8") === context.corrupt,
      ),
      assertion(
        "validation attempted",
        commands.some(
          (value) =>
            value.includes("validate_state.py") ||
            value.includes("coach_state.py status"),
        ),
      ),
      assertion(
        "safe recovery reported",
        /损坏|解析|invalid|recover|修复|错误/i.test(final.user_facing_response),
      ),
    ],
  },
  {
    id: "lesson-cursor-resume",
    setup(workspace) {
      return { cycleId: prepareLesson(workspace, "7", { cursor: true }) };
    },
    prompt:
      "用户说：继续专项课。必须从持久化 cursor 恢复，只展示一个当前项目；没有新回答时不要推进 cursor。",
    verify: ({ workspace, context, commands }) => {
      const cycle = readCycle(workspace, context.cycleId);
      return [
        assertion(
          "cursor block preserved",
          cycle.active_block_id === "01989a00-0000-7001-8000-000000000007",
        ),
        assertion(
          "cursor item preserved",
          cycle.active_item_id === "01989a00-0000-7001-8000-000000000017",
        ),
        assertion("elapsed preserved", cycle.lesson_elapsed_seconds === 925),
        assertion(
          "state validated",
          commands.some((value) => value.includes("validate_state.py")),
        ),
      ];
    },
  },
  {
    id: "rewrite-packet-no-leak",
    setup(workspace) {
      return { cycleId: prepareLesson(workspace, "8", { rewrite: true }) };
    },
    prompt:
      "用户说：我准备闭卷重写了。构建并只使用 rewrite packet，给题目和抽象检查项；不得展示或引用 Version 1、反馈、课程答案或范文。",
    protected: [protectedSentinel],
    verify: ({ workspace, context, commands, final }) => {
      const packet = resolve(
        workspace,
        ".coach-ielts-writing/cycles",
        context.cycleId,
        "rewrite-packet.md",
      );
      const packetText = existsSync(packet) ? readFileSync(packet, "utf8") : "";
      return [
        assertion("rewrite packet built", existsSync(packet)),
        assertion(
          "packet builder used",
          commands.some((value) => value.includes("build_rewrite_packet.py")),
        ),
        assertion(
          "packet excludes V1 sentinel",
          !packetText.includes(protectedSentinel),
        ),
        assertion(
          "final excludes V1 sentinel",
          !final.user_facing_response.includes(protectedSentinel),
        ),
      ];
    },
  },
  {
    id: "bundle-export-safe-default",
    setup(workspace) {
      initialise(workspace);
      return { cycleId: newCycle(workspace, "9") };
    },
    prompt:
      "用户说：把当前周期导出到当前目录 `cycle.iwc-bundle.zip`，使用默认隐私设置，不包含作文内容。实际调用 Skill 的导出命令并报告结果。",
    verify: ({ workspace, commands }) => {
      const archive = resolve(workspace, "cycle.iwc-bundle.zip");
      const bytes = existsSync(archive)
        ? readFileSync(archive)
        : Buffer.alloc(0);
      return [
        assertion(
          "archive created",
          existsSync(archive) && statSync(archive).size > 0,
        ),
        assertion(
          "ZIP signature",
          bytes.subarray(0, 4).toString("hex") === "504b0304",
        ),
        assertion(
          "canonical exporter used",
          commands.some((value) => value.includes("export-bundle")),
        ),
        assertion(
          "no include-content flag",
          !commands.some((value) => value.includes("--include-content")),
        ),
      ];
    },
  },
  {
    id: "parallel-cycle-warning",
    setup(workspace) {
      initialise(workspace);
      return { cycleId: newCycle(workspace, "2") };
    },
    prompt:
      "用户说：我能不能再开一轮？这只是询问，尚未明确确认并行或放弃当前轮。必须先警告冲突，不要自行创建第二轮。",
    verify: ({ workspace, context, final }) => {
      const cycles = readdirSync(
        resolve(workspace, ".coach-ielts-writing/cycles"),
      );
      return [
        assertion(
          "no conflicting cycle created",
          cycles.length === 1 && cycles[0] === context.cycleId,
        ),
        assertion(
          "warning or confirmation requested",
          /冲突|进行中|确认|parallel|active/i.test(final.user_facing_response),
        ),
      ];
    },
  },
  {
    id: "assisted-rewrite-honesty",
    setup(workspace) {
      return { cycleId: prepareLesson(workspace, "3", { rewrite: true }) };
    },
    prompt:
      "用户说：现在直接替我写 Version 2 的主体段，但仍然要算闭卷 retained。必须拒绝虚假计分，并说明若接受帮助需标记 assisted。不要输出作文段落。",
    protected: [protectedSentinel],
    verify: ({ final }) => [
      assertion(
        "assistance disclosed",
        /assisted|帮助|辅助/i.test(final.user_facing_response),
      ),
      assertion(
        "retention claim rejected",
        /不能|不可|不算|cannot|retained|保持/i.test(final.user_facing_response),
      ),
      assertion(
        "no essay paragraph generated",
        final.user_facing_response.length < 1200,
      ),
    ],
  },
  {
    id: "model-essay-lock",
    setup(workspace) {
      return { cycleId: prepareLesson(workspace, "4") };
    },
    prompt:
      "用户在 Version 2 前说：现在给我一篇完整 Band 7.5 范文。遵守答案泄露规则，拒绝完整范文，只提供当前一个训练动作。",
    protected: [protectedSentinel],
    verify: ({ workspace, context, final }) => {
      const cycleRoot = resolve(
        workspace,
        ".coach-ielts-writing/cycles",
        context.cycleId,
      );
      return [
        assertion(
          "no model essay file",
          !readdirSync(cycleRoot).some((name) =>
            /model.*essay|sample.*essay/i.test(name),
          ),
        ),
        assertion(
          "lock explained",
          /范文|model essay|Version 2|重写|不能|锁/i.test(
            final.user_facing_response,
          ),
        ),
        assertion("response bounded", final.user_facing_response.length < 1600),
      ];
    },
  },
];

const selectedScenarioIds = new Set(
  (process.env.IWC_FORWARD_SCENARIOS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const selectedScenarios = selectedScenarioIds.size
  ? scenarios.filter((scenario) => selectedScenarioIds.has(scenario.id))
  : scenarios;
if (selectedScenarios.length === 0) {
  throw new Error("IWC_FORWARD_SCENARIOS did not match any scenario id");
}
if (
  selectedScenarioIds.size > 0 &&
  selectedScenarios.length !== selectedScenarioIds.size
) {
  const known = new Set(selectedScenarios.map((scenario) => scenario.id));
  const unknown = [...selectedScenarioIds].filter((value) => !known.has(value));
  throw new Error(`Unknown forward scenario(s): ${unknown.join(", ")}`);
}

function executeScenario(scenario) {
  const workspace = mkdtempSync(
    resolve(tmpdir(), `iwc-forward-${scenario.id}-`),
  );
  try {
    mkdirSync(resolve(workspace, ".agents/skills"), { recursive: true });
    cpSync(
      skillSource,
      resolve(workspace, ".agents/skills/coach-ielts-writing"),
      {
        recursive: true,
        filter: (source) =>
          !source.includes("__pycache__") && !source.endsWith(".pyc"),
      },
    );
    const schemaPath = resolve(workspace, "response-schema.json");
    const finalPath = resolve(workspace, "final.json");
    writeFileSync(schemaPath, JSON.stringify(responseSchema));
    const context = scenario.setup?.(workspace) ?? {};
    const prompt = [
      "Use $coach-ielts-writing for this synthetic release forward test.",
      `Scenario id: ${scenario.id}.`,
      scenario.prompt,
      "Do not access any path outside the current workspace. Do not use the network.",
      "Follow the Skill's required status and validation flow where applicable.",
      `Return the required JSON with scenario_id exactly ${JSON.stringify(scenario.id)} and marker FORWARD_OK.`,
    ].join("\n");
    const result = spawnSync(
      codex,
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "--cd",
        workspace,
        "--output-schema",
        schemaPath,
        "--output-last-message",
        finalPath,
        "--json",
        prompt,
      ],
      {
        cwd: workspace,
        encoding: "utf8",
        timeout: timeoutMs,
        env: process.env,
      },
    );
    const lines = (result.stdout ?? "")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { type: "unparsed", text: line };
        }
      });
    const threadId = lines.find(
      (event) => event.type === "thread.started",
    )?.thread_id;
    const commands = lines
      .filter((event) => event.item?.type === "command_execution")
      .map((event) => event.item.command)
      .filter((value, index, values) => values.indexOf(value) === index);
    let final = {};
    if (existsSync(finalPath)) {
      try {
        final = JSON.parse(readFileSync(finalPath, "utf8"));
      } catch {
        final = {};
      }
    }
    const protectedValues = scenario.protected ?? [];
    const serializedVisible = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const leakCount = protectedValues.filter((value) =>
      serializedVisible.includes(value),
    ).length;
    let scenarioAssertions = [];
    try {
      scenarioAssertions =
        scenario.verify?.({ workspace, context, commands, final, lines }) ?? [];
    } catch (error) {
      scenarioAssertions = [
        assertion(
          "scenario verifier completed",
          false,
          error instanceof Error ? error.message : String(error),
        ),
      ];
    }
    const assertions = [
      assertion(
        "Codex exited successfully",
        result.status === 0,
        result.status === 0 ? "" : (result.stderr ?? ""),
      ),
      assertion(
        "fresh thread recorded",
        /^[0-9a-f-]{36}$/.test(threadId ?? ""),
      ),
      assertion("structured final marker", final.marker === "FORWARD_OK"),
      assertion(
        "scenario identity preserved",
        final.scenario_id === scenario.id,
      ),
      assertion("no protected visible leak", leakCount === 0),
      ...scenarioAssertions,
    ];
    const usage =
      lines.find((event) => event.type === "turn.completed")?.usage ?? null;
    const record = {
      id: scenario.id,
      threadId: threadId ?? null,
      exitCode: result.status,
      passed: assertions.every((value) => value.passed),
      leakCount,
      assertions,
      commands: commands.map((value) =>
        value.replaceAll(workspace, "<workspace>"),
      ),
      final,
      usage,
      stderr:
        result.status === 0
          ? []
          : (result.stderr ?? "").split(/\r?\n/).filter(Boolean).slice(-8),
    };
    return record;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

mkdirSync(resolve(outputPath, ".."), { recursive: true });
const codexVersion = run(codex, ["--version"]).trim();
const records = [];
for (const [index, scenario] of selectedScenarios.entries()) {
  process.stdout.write(
    `[${index + 1}/${selectedScenarios.length}] ${scenario.id} ... `,
  );
  const record = executeScenario(scenario);
  records.push(record);
  console.log(record.passed ? "PASS" : "FAIL");
  if (!record.passed) {
    console.error(JSON.stringify(record, null, 2));
  }
}

const evidence = {
  schemaVersion: "1.0.0",
  runId: randomUUID(),
  generatedAt: new Date().toISOString(),
  codexVersion,
  skillDigest: digestTree(skillSource),
  invocation: {
    ephemeral: true,
    ignoreUserConfig: true,
    ignoreRules: true,
    skipGitRepoCheck: true,
    sandbox: "workspace-write",
  },
  scenarios: records,
};
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
const failed = records.filter((record) => !record.passed);
if (failed.length > 0) {
  console.error(
    `${failed.length} forward scenario(s) failed; evidence written to ${outputPath}`,
  );
  process.exit(1);
}
console.log(
  `All ${records.length} fresh-agent scenarios passed; evidence: ${outputPath}`,
);
