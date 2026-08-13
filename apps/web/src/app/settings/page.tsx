"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  Cloud,
  Database,
  EyeOff,
  KeyRound,
  Languages,
  LockKeyhole,
  Mail,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";

import {
  getProviderPreset,
  providerCatalog,
  type ProviderVendor,
} from "@iwc/ai/provider-catalog";

import { useLocale } from "@/components/locale-provider";
import {
  Badge,
  Button,
  Card,
  LoadingButtonContent,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { useDialogFocus } from "@/components/use-dialog-focus";
import { cn } from "@/components/utils";
import {
  LearningClientError,
  learningClient,
  type AiTaskKind,
  type ConnectionProbe,
  type CycleExportOption,
  type CycleBundleImportResult,
  type SettingsData,
  type UserPreferences,
} from "@/lib/client";

type SettingsTab = "learning" | "schedule" | "ai" | "data";

const AI_ROUTE_TASKS: ReadonlyArray<{
  id: AiTaskKind;
  zh: string;
  en: string;
}> = [
  { id: "ielts_assessment", zh: "IELTS 四项估分", en: "IELTS assessment" },
  {
    id: "issue_classification",
    zh: "问题发现与分类",
    en: "Issue classification",
  },
  {
    id: "objective_prioritization",
    zh: "目标优先级",
    en: "Objective priority",
  },
  {
    id: "exercise_generation",
    zh: "专项题生成",
    en: "Exercise generation",
  },
  {
    id: "open_sentence_evaluation",
    zh: "开放句评价",
    en: "Open-sentence evaluation",
  },
  {
    id: "paragraph_evaluation",
    zh: "段落目标评价",
    en: "Paragraph evaluation",
  },
  {
    id: "version_comparison",
    zh: "V1 / V2 比较",
    en: "V1 / V2 comparison",
  },
  {
    id: "transfer_evaluation",
    zh: "迁移表现判断",
    en: "Transfer evaluation",
  },
];

export default function SettingsPage() {
  const { text, locale, setLocale } = useLocale();
  const loader = useCallback(() => learningClient.getSettings(), []);
  const { data, loading, retry } = useDemoResource(loader);
  const [tab, setTab] = useState<SettingsTab>("learning");
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [probe, setProbe] = useState<ConnectionProbe | null>(null);
  const [newKey, setNewKey] = useState("");
  const [exporting, setExporting] = useState(false);
  const [cycleOptions, setCycleOptions] = useState<CycleExportOption[] | null>(
    null,
  );
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [cycleExporting, setCycleExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] =
    useState<CycleBundleImportResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const deleteDataButtonRef = useRef<HTMLButtonElement>(null);
  const closeDeleteDialog = useCallback(() => {
    if (deleting) return;
    setConfirmDelete(false);
    setDeletePhrase("");
  }, [deleting]);
  const deleteDataDialogRef = useDialogFocus<HTMLDivElement>(
    confirmDelete,
    closeDeleteDialog,
    deleteDataButtonRef,
  );
  const [dataActionMessage, setDataActionMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!data || preferences) return;
    const timeout = window.setTimeout(
      () => setPreferences(data.preferences),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [data, preferences]);

  const update = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => {
    setPreferences((current) =>
      current ? { ...current, [key]: value } : current,
    );
    setSaved(false);
  };

  const save = async () => {
    if (!preferences) return;
    setSaving(true);
    try {
      await learningClient.updatePreferences(preferences);
      setLocale(preferences.locale);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const testAi = async () => {
    if (!data) return;
    setTesting(true);
    try {
      setProbe(
        await learningClient.testConnection({
          provider: data.ai.provider,
          providerVendor: data.ai.vendor,
          baseUrl: data.ai.baseUrl,
          model: data.ai.model,
          apiKey: newKey,
        }),
      );
    } finally {
      setTesting(false);
    }
  };

  const replaceAiKey = async () => {
    if (!data || !newKey || data.ai.id === "environment-openai") return;
    setReplacing(true);
    try {
      const response = await fetch(
        `/api/v1/providers/${encodeURIComponent(data.ai.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            api_key: newKey,
            secret_mode:
              data.ai.secretSource === "session" ? "session_only" : "encrypted",
            ...(isConcreteModel(data.ai.model)
              ? { test_model: data.ai.model }
              : {}),
          }),
        },
      );
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          problem?.detail ??
            text("密钥替换失败。", "The key could not be replaced."),
        );
      }
      setNewKey("");
      setProbe({
        status: "success",
        latencyMs: 0,
        connection: true,
        structuredOutput: data.ai.structuredOutput,
        contextWindow: true,
        messageZh: "新密钥已验证并替换，受阻任务会沿用原 Job 恢复。",
        messageEn:
          "The new key was verified and replaced; blocked jobs resume with their original Job IDs.",
      });
      retry();
    } catch (error) {
      setProbe({
        status: "failure",
        latencyMs: 0,
        connection: false,
        structuredOutput: false,
        contextWindow: false,
        messageZh: error instanceof Error ? error.message : "密钥替换失败。",
        messageEn:
          error instanceof Error ? error.message : "Key replacement failed.",
      });
    } finally {
      setReplacing(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    setDataActionMessage(null);
    try {
      await learningClient.downloadLearningArchive();
      setDataActionMessage(
        text(
          "学习档案已创建；下载内容不含 AI 密钥。",
          "Your learning archive was created without AI secrets.",
        ),
      );
    } catch (error) {
      setDataActionMessage(
        error instanceof Error
          ? error.message
          : text("导出失败，请重试。", "Export failed. Try again."),
      );
    } finally {
      setExporting(false);
    }
  };

  const loadCycleOptions = async () => {
    if (cycleOptions !== null) return;
    try {
      const options = await learningClient.getCycleExportOptions();
      setCycleOptions(options);
      setSelectedCycleId((current) => current || options[0]?.id || "");
    } catch (error) {
      setCycleOptions([]);
      setDataActionMessage(
        error instanceof Error
          ? error.message
          : text("无法读取训练轮次。", "Could not load TrainingCycles."),
      );
    }
  };

  const exportCycleBundle = async () => {
    if (!selectedCycleId) return;
    setCycleExporting(true);
    setDataActionMessage(null);
    try {
      await learningClient.downloadCycleBundle(selectedCycleId);
      setDataActionMessage(
        text(
          "TrainingCycle 交换包已下载，可导入 Web 或 coach-ielts-writing Skill。",
          "The TrainingCycle bundle was downloaded for Web or the coach-ielts-writing Skill.",
        ),
      );
    } catch (error) {
      setDataActionMessage(
        error instanceof Error
          ? error.message
          : text("轮次导出失败。", "Cycle export failed."),
      );
    } finally {
      setCycleExporting(false);
    }
  };

  const importData = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setDataActionMessage(null);
    try {
      const result = await learningClient.importLearningBundle(importFile);
      setImportResult(result);
      setDataActionMessage(
        result.idempotent
          ? text(
              "该交换包此前已导入；本次未创建重复数据。",
              "This bundle was already imported; no duplicate data was created.",
            )
          : text(
              "交换包已导入，可从 Today 继续训练。",
              "The bundle was imported and can be continued from Today.",
            ),
      );
    } catch (error) {
      const conflicts =
        error instanceof LearningClientError &&
        Array.isArray(error.problem?.conflicts)
          ? error.problem.conflicts.filter(
              (entry): entry is Record<string, unknown> =>
                entry !== null && typeof entry === "object",
            )
          : [];
      if (conflicts.length > 0) {
        setImportResult({
          imported: false,
          idempotent: false,
          cycleId: "",
          bundleId: "",
          conflicts,
        });
      }
      setDataActionMessage(
        error instanceof Error
          ? error.message
          : text("导入失败，请检查文件。", "Import failed. Check the file."),
      );
    } finally {
      setImporting(false);
    }
  };

  const deleteData = async () => {
    if (deletePhrase !== "DELETE MY LEARNING DATA") return;
    setDeleting(true);
    setDataActionMessage(null);
    try {
      await learningClient.deleteLearningData();
      setConfirmDelete(false);
      setDeletePhrase("");
      setDataActionMessage(
        text(
          "全部学习数据已删除；账户和 AI 连接仍保留。",
          "All learning data was deleted; your account and AI connection remain.",
        ),
      );
      retry();
    } catch (error) {
      setDataActionMessage(
        error instanceof Error
          ? error.message
          : text("删除失败，请重试。", "Deletion failed. Try again."),
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !data || !preferences)
    return <Skeleton label={text("正在准备设置…", "Preparing settings…")} />;

  const tabs: Array<{
    id: SettingsTab;
    zh: string;
    en: string;
    icon: typeof UserRound;
  }> = [
    { id: "learning", zh: "学习偏好", en: "Learning", icon: UserRound },
    { id: "schedule", zh: "计划与提醒", en: "Schedule", icon: Bell },
    { id: "ai", zh: "AI 服务", en: "AI service", icon: Cloud },
    { id: "data", zh: "数据与隐私", en: "Data & privacy", icon: Database },
  ];

  return (
    <>
      <PageHeader
        eyebrow={text("个人与实例设置", "Personal & instance settings")}
        title={text(
          "保持默认简单，需要时再展开",
          "Simple by default, advanced when needed",
        )}
        description={text(
          "学习者偏好与管理员运维设置分开；个人模式下它们集中在同一处。",
          "Learner preferences and administrator operations are separated; personal mode keeps them together here.",
        )}
      />
      <div className="settings-layout">
        <nav
          aria-label={text("设置类别", "Settings categories")}
          className="settings-nav"
        >
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={tab === item.id ? "page" : undefined}
                className={cn(tab === item.id && "active")}
                key={item.id}
                onClick={() => {
                  setTab(item.id);
                  if (item.id === "data") void loadCycleOptions();
                }}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                {text(item.zh, item.en)}
              </button>
            );
          })}
        </nav>

        <div className="settings-content">
          {tab === "learning" ? (
            <Card className="settings-section">
              <div className="settings-section-head">
                <span className="settings-icon">
                  <Languages aria-hidden="true" size={20} />
                </span>
                <div>
                  <h2>{text("学习与语言", "Learning & language")}</h2>
                  <p>
                    {text(
                      "这些偏好会影响题目推荐和反馈呈现，不会影响客观估分。",
                      "These preferences affect recommendations and presentation, never the objective estimate.",
                    )}
                  </p>
                </div>
              </div>
              <div className="settings-fields">
                <div className="form-field">
                  <label htmlFor="locale">
                    {text("界面语言", "Interface language")}
                  </label>
                  <select
                    className="select-input"
                    id="locale"
                    onChange={(event) =>
                      update(
                        "locale",
                        event.target.value as UserPreferences["locale"],
                      )
                    }
                    value={preferences.locale}
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="feedback-language">
                    {text("反馈语言", "Feedback language")}
                  </label>
                  <select
                    className="select-input"
                    id="feedback-language"
                    onChange={(event) =>
                      update(
                        "feedbackLanguage",
                        event.target
                          .value as UserPreferences["feedbackLanguage"],
                      )
                    }
                    value={preferences.feedbackLanguage}
                  >
                    <option value="zh-with-en">
                      中文解释 + English examples
                    </option>
                    <option value="en">English only</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="exam-type">IELTS</label>
                  <select
                    className="select-input"
                    id="exam-type"
                    onChange={(event) =>
                      update(
                        "examType",
                        event.target.value as UserPreferences["examType"],
                      )
                    }
                    value={preferences.examType}
                  >
                    <option value="academic">Academic</option>
                    <option value="general">General Training</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="target-band">
                    {text("目标分数", "Target band")}
                  </label>
                  <select
                    className="select-input"
                    id="target-band"
                    onChange={(event) =>
                      update("targetBand", Number(event.target.value))
                    }
                    value={preferences.targetBand}
                  >
                    <option value="6.5">6.5</option>
                    <option value="7">7.0</option>
                    <option value="7.5">7.5</option>
                    <option value="8">8.0</option>
                  </select>
                  <p className="field-hint">
                    {text(
                      "影响训练难度，不改变本次作文的估分。",
                      "Changes training difficulty, not the current estimate.",
                    )}
                  </p>
                </div>
              </div>
              <div className="settings-divider" />
              <div className="switch-row">
                <div className="switch-row-copy">
                  <strong>
                    {text("严格 40 分钟模式", "Strict 40-minute mode")}
                  </strong>
                  <span>
                    {text(
                      "离开页面计时继续，结果可与真实考试条件比较。",
                      "The timer continues if you leave, preserving exam comparability.",
                    )}
                  </span>
                </div>
                <button
                  aria-checked={preferences.strictTimedMode}
                  aria-label={text(
                    "切换严格计时模式",
                    "Toggle strict timed mode",
                  )}
                  className="switch"
                  onClick={() =>
                    update("strictTimedMode", !preferences.strictTimedMode)
                  }
                  role="switch"
                  type="button"
                />
              </div>
            </Card>
          ) : null}

          {tab === "schedule" ? (
            <Card className="settings-section">
              <div className="settings-section-head">
                <span className="settings-icon">
                  <Bell aria-hidden="true" size={20} />
                </span>
                <div>
                  <h2>
                    {text("自动排程与提醒", "Automatic scheduling & reminders")}
                  </h2>
                  <p>
                    {text(
                      "系统只在关键异步节点提醒，不使用 streak 或羞耻式催促。",
                      "Notifications are limited to important asynchronous moments, with no streak pressure.",
                    )}
                  </p>
                </div>
              </div>
              <div className="settings-fields">
                <div className="form-field">
                  <label htmlFor="timezone">{text("时区", "Time zone")}</label>
                  <select
                    className="select-input"
                    id="timezone"
                    onChange={(event) => update("timezone", event.target.value)}
                    value={preferences.timezone}
                  >
                    <option>Asia/Shanghai</option>
                    <option>Europe/London</option>
                    <option>America/New_York</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="study-time">
                    {text("常用学习时间", "Preferred study time")}
                  </label>
                  <input
                    className="text-input"
                    id="study-time"
                    onChange={(event) =>
                      update("studyTime", event.target.value)
                    }
                    type="time"
                    value={preferences.studyTime}
                  />
                </div>
                <div className="form-field form-field-wide">
                  <span className="field-label">
                    {text("可学习日期", "Available days")}
                  </span>
                  <div className="day-picker">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day) => {
                        const active = preferences.studyDays.includes(day);
                        return (
                          <button
                            aria-pressed={active}
                            className={active ? "active" : ""}
                            key={day}
                            onClick={() =>
                              update(
                                "studyDays",
                                active
                                  ? preferences.studyDays.filter(
                                      (value) => value !== day,
                                    )
                                  : [...preferences.studyDays, day],
                              )
                            }
                            type="button"
                          >
                            {day}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>
              <div className="settings-divider" />
              <div className="switch-row">
                <div className="switch-row-copy">
                  <strong>{text("邮件提醒", "Email reminders")}</strong>
                  <span>
                    {text(
                      "专项课就绪、重写解锁和一次温和逾期提醒。",
                      "Lesson-ready, rewrite-unlocked, and one gentle overdue reminder.",
                    )}
                  </span>
                </div>
                <button
                  aria-checked={preferences.emailNotifications}
                  aria-label={text("切换邮件提醒", "Toggle email reminders")}
                  className="switch"
                  disabled={data.mailState !== "ready"}
                  onClick={() =>
                    update(
                      "emailNotifications",
                      !preferences.emailNotifications,
                    )
                  }
                  role="switch"
                  type="button"
                />
              </div>
              {data.mailState !== "ready" ? (
                <p className="field-hint">
                  {text(
                    "实例未配置 SMTP；关键节点仍会通过站内提醒送达。",
                    "SMTP is not configured; important events still arrive in-app.",
                  )}
                </p>
              ) : null}
              {preferences.emailNotifications ? (
                <div className="form-field notification-email">
                  <label htmlFor="notification-email">
                    {text("提醒邮箱", "Notification email")}
                  </label>
                  <div className="input-with-icon">
                    <Mail aria-hidden="true" size={16} />
                    <input
                      className="text-input"
                      disabled
                      id="notification-email"
                      readOnly
                      type="email"
                      value={preferences.email}
                    />
                  </div>
                  <p className="field-hint">
                    {text(
                      "提醒发送到账户邮箱；更改账户邮箱需要单独的验证流程。",
                      "Reminders use the account email; changing it requires a separate verification flow.",
                    )}
                  </p>
                </div>
              ) : null}
              <div className="settings-divider" />
              <div className="switch-row">
                <div className="switch-row-copy">
                  <strong>{text("免打扰时段", "Quiet hours")}</strong>
                  <span>
                    {text(
                      "提醒会顺延到用户时区中的首个允许分钟。",
                      "Delivery is deferred to the first allowed minute in your timezone.",
                    )}
                  </span>
                </div>
                <button
                  aria-checked={preferences.quietHoursEnabled}
                  aria-label={text("切换免打扰时段", "Toggle quiet hours")}
                  className="switch"
                  onClick={() =>
                    update("quietHoursEnabled", !preferences.quietHoursEnabled)
                  }
                  role="switch"
                  type="button"
                />
              </div>
              {preferences.quietHoursEnabled ? (
                <div className="quiet-hours-fields">
                  <div className="form-field">
                    <label htmlFor="quiet-hours-start">
                      {text("开始", "Start")}
                    </label>
                    <input
                      className="text-input"
                      id="quiet-hours-start"
                      onChange={(event) =>
                        update("quietHoursStart", event.target.value)
                      }
                      type="time"
                      value={preferences.quietHoursStart}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="quiet-hours-end">
                      {text("结束", "End")}
                    </label>
                    <input
                      className="text-input"
                      id="quiet-hours-end"
                      onChange={(event) =>
                        update("quietHoursEnd", event.target.value)
                      }
                      type="time"
                      value={preferences.quietHoursEnd}
                    />
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}

          {tab === "ai" ? (
            <AiSettings
              data={data}
              newKey={newKey}
              onKeyChange={setNewKey}
              onReplace={() => void replaceAiKey()}
              onRefresh={retry}
              onTest={() => void testAi()}
              probe={probe}
              testing={testing}
              replacing={replacing}
              text={text}
            />
          ) : null}

          {tab === "data" ? (
            <Card className="settings-section">
              <div className="settings-section-head">
                <span className="settings-icon">
                  <ShieldCheck aria-hidden="true" size={20} />
                </span>
                <div>
                  <h2>{text("数据与隐私", "Data & privacy")}</h2>
                  <p>
                    {text(
                      "作文、反馈和能力证据属于学习者。导出不包含 AI 密钥。",
                      "Essays, feedback, and evidence belong to the learner. Exports never contain AI secrets.",
                    )}
                  </p>
                </div>
              </div>
              <div className="data-action-list">
                <div className="import-data-action">
                  <span>
                    <strong>
                      {text("导入学习交换包", "Import learning bundle")}
                    </strong>
                    <small>
                      {text(
                        "支持 .iwc-bundle.zip、.zip 或 JSON，最大 20 MiB；冲突不会覆盖本地版本。",
                        "Accepts .iwc-bundle.zip, .zip, or JSON up to 20 MiB. Conflicts never overwrite the local version.",
                      )}
                    </small>
                    <input
                      accept=".iwc-bundle.zip,.zip,.json,application/zip,application/json"
                      aria-label={text("选择交换包", "Choose a bundle")}
                      className="text-input"
                      onChange={(event) => {
                        setImportFile(event.target.files?.[0] ?? null);
                        setImportResult(null);
                        setDataActionMessage(null);
                      }}
                      type="file"
                    />
                  </span>
                  <Button
                    disabled={importing || !importFile}
                    onClick={() => void importData()}
                    variant="secondary"
                  >
                    {importing ? (
                      <LoadingButtonContent
                        label={text("正在导入…", "Importing…")}
                      />
                    ) : (
                      <>
                        <Upload aria-hidden="true" size={16} />
                        {text("导入", "Import")}
                      </>
                    )}
                  </Button>
                </div>
                <div className="cycle-export-action">
                  <span>
                    <strong>
                      {text(
                        "导出单个 TrainingCycle 交换包",
                        "Export one TrainingCycle exchange bundle",
                      )}
                    </strong>
                    <small>
                      {text(
                        "生成 Web ↔ Skill 可互导的 .iwc-bundle.zip；它不是完整账户归档。尚未开始写作的轮次可能暂不可导出。",
                        "Creates a Web ↔ Skill .iwc-bundle.zip. This is not a complete account archive. A cycle that has not started may not be exportable yet.",
                      )}
                    </small>
                    <select
                      aria-label={text("选择训练轮次", "Select TrainingCycle")}
                      className="select-input"
                      disabled={!cycleOptions?.length}
                      onChange={(event) =>
                        setSelectedCycleId(event.target.value)
                      }
                      value={selectedCycleId}
                    >
                      {cycleOptions === null ? (
                        <option value="">
                          {text("正在读取轮次…", "Loading cycles…")}
                        </option>
                      ) : cycleOptions.length === 0 ? (
                        <option value="">
                          {text("暂无可选轮次", "No cycles available")}
                        </option>
                      ) : (
                        cycleOptions.map((cycle) => (
                          <option key={cycle.id} value={cycle.id}>
                            {`${cycle.prompt.slice(0, 72)} · ${cycle.status}`}
                          </option>
                        ))
                      )}
                    </select>
                  </span>
                  <Button
                    disabled={cycleExporting || !selectedCycleId}
                    onClick={() => void exportCycleBundle()}
                    variant="secondary"
                  >
                    {cycleExporting ? (
                      <LoadingButtonContent
                        label={text("正在导出…", "Exporting…")}
                      />
                    ) : (
                      text("下载交换包", "Download bundle")
                    )}
                  </Button>
                </div>
                <div>
                  <span>
                    <strong>
                      {text(
                        "导出完整学习档案（只读归档）",
                        "Export complete learning record (read-only archive)",
                      )}
                    </strong>
                    <small>
                      {text(
                        "用于数据查阅与迁出，包含 JSON + 可读 Markdown；该完整归档不能通过 CycleBundle 导入口回灌。",
                        "For data access and portability: JSON + readable Markdown. This complete archive cannot be restored through the CycleBundle importer.",
                      )}
                    </small>
                  </span>
                  <Button
                    disabled={exporting}
                    onClick={() => void exportData()}
                    variant="secondary"
                  >
                    {exporting ? (
                      <LoadingButtonContent
                        label={text("正在创建…", "Creating…")}
                      />
                    ) : (
                      text("创建导出", "Create export")
                    )}
                  </Button>
                </div>
                <div>
                  <span>
                    <strong>
                      {text("管理员读取作文正文", "Administrator essay access")}
                    </strong>
                    <small>
                      {text(
                        "默认关闭，排障访问需要单独授权和审计。",
                        "Off by default; troubleshooting access requires explicit consent and audit.",
                      )}
                    </small>
                  </span>
                  <Badge tone="green">{text("已关闭", "Off")}</Badge>
                </div>
                <div className="danger-row">
                  <span>
                    <strong>
                      {text("删除全部学习数据", "Delete all learning data")}
                    </strong>
                    <small>
                      {text(
                        "彻底删除作文、批改、训练和能力证据。",
                        "Permanently removes essays, feedback, lessons, and evidence.",
                      )}
                    </small>
                  </span>
                  <Button
                    ref={deleteDataButtonRef}
                    onClick={() => setConfirmDelete(true)}
                    variant="danger"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                    {text("删除…", "Delete…")}
                  </Button>
                </div>
              </div>
              {dataActionMessage ? (
                <p aria-live="polite" className="field-hint">
                  {dataActionMessage}
                </p>
              ) : null}
              {importResult ? (
                <dl aria-live="polite" className="import-result">
                  <div>
                    <dt>imported</dt>
                    <dd>{String(importResult.imported)}</dd>
                  </div>
                  <div>
                    <dt>idempotent</dt>
                    <dd>{String(importResult.idempotent)}</dd>
                  </div>
                  <div>
                    <dt>cycle_id</dt>
                    <dd>{importResult.cycleId || "—"}</dd>
                  </div>
                  <div>
                    <dt>conflicts</dt>
                    <dd>{importResult.conflicts.length}</dd>
                  </div>
                </dl>
              ) : null}
            </Card>
          ) : null}

          {tab !== "ai" ? (
            <div className="settings-savebar">
              <span aria-live="polite">
                {saved ? (
                  <>
                    <Check aria-hidden="true" size={15} />
                    {text("偏好已保存", "Preferences saved")}
                  </>
                ) : (
                  text(
                    "修改只会影响后续任务",
                    "Changes affect future tasks only",
                  )
                )}
              </span>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? (
                  <LoadingButtonContent label={text("正在保存…", "Saving…")} />
                ) : (
                  <>
                    <Save aria-hidden="true" size={16} />
                    {text("保存更改", "Save changes")}
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      {confirmDelete ? (
        <div
          aria-labelledby="delete-learning-data-title"
          aria-modal="true"
          className="modal-backdrop"
          ref={deleteDataDialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <Card className="modal-card">
            <span className="modal-icon">
              <Trash2 aria-hidden="true" size={22} />
            </span>
            <h2 id="delete-learning-data-title">
              {text("永久删除学习数据？", "Permanently delete learning data?")}
            </h2>
            <p>
              {text(
                "此操作会删除作文、批改、课程、重写、迁移与能力证据，且无法恢复。账户和 AI 连接不会删除。请输入 DELETE MY LEARNING DATA 确认。",
                "This permanently deletes essays, feedback, lessons, rewrites, transfer work, and evidence. Your account and AI connection remain. Type DELETE MY LEARNING DATA to confirm.",
              )}
            </p>
            <label htmlFor="delete-learning-data-confirmation">
              {text("确认短语", "Confirmation phrase")}
            </label>
            <input
              autoComplete="off"
              className="text-input"
              data-dialog-initial-focus
              id="delete-learning-data-confirmation"
              onChange={(event) => setDeletePhrase(event.target.value)}
              spellCheck={false}
              value={deletePhrase}
            />
            <div className="modal-actions">
              <Button
                disabled={deleting}
                onClick={closeDeleteDialog}
                variant="secondary"
              >
                {text("取消", "Cancel")}
              </Button>
              <Button
                disabled={
                  deleting || deletePhrase !== "DELETE MY LEARNING DATA"
                }
                onClick={() => void deleteData()}
                variant="danger"
              >
                {deleting ? (
                  <LoadingButtonContent
                    label={text("正在删除…", "Deleting…")}
                  />
                ) : (
                  text("永久删除", "Delete permanently")
                )}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function isConcreteModel(model: string): boolean {
  return Boolean(
    model && model !== "—" && !model.toLowerCase().includes("configured by"),
  );
}

function AiSettings({
  data,
  newKey,
  onKeyChange,
  onRefresh,
  onReplace,
  onTest,
  probe,
  testing,
  replacing,
  text,
}: {
  data: SettingsData;
  newKey: string;
  onKeyChange: (value: string) => void;
  onRefresh: () => void;
  onReplace: () => void;
  onTest: () => void;
  probe: ConnectionProbe | null;
  testing: boolean;
  replacing: boolean;
  text: (zh: string, en: string) => string;
}) {
  const connected =
    data.ai.state === "connected" || data.ai.state === "compatibility";
  const [routeDrafts, setRouteDrafts] = useState<
    Partial<Record<AiTaskKind, string>>
  >({});
  const [routeProviders, setRouteProviders] = useState<
    Partial<Record<AiTaskKind, string>>
  >({});
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeSaving, setRouteSaving] = useState<AiTaskKind | null>(null);
  const [routeMessage, setRouteMessage] = useState<string | null>(null);
  const [deletingConnection, setDeletingConnection] = useState(false);
  const [deleteConnectionMessage, setDeleteConnectionMessage] = useState<
    string | null
  >(null);
  const [showAddConnection, setShowAddConnection] = useState(
    data.ai.id === "missing",
  );
  const [newVendor, setNewVendor] = useState<ProviderVendor>("deepseek");
  const initialNewPreset = getProviderPreset("deepseek");
  const [newProviderModel, setNewProviderModel] = useState(
    initialNewPreset.defaultModel,
  );
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState(
    initialNewPreset.baseUrl ?? "",
  );
  const [newProviderKey, setNewProviderKey] = useState("");
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const newProviderPreset = getProviderPreset(newVendor);

  const selectNewVendor = (vendor: ProviderVendor) => {
    const preset = getProviderPreset(vendor);
    setNewVendor(vendor);
    setNewProviderModel(preset.defaultModel);
    setNewProviderBaseUrl(preset.baseUrl ?? "");
    if (vendor === "mock") setNewProviderKey("");
    setProviderMessage(null);
  };

  const saveNewProvider = async () => {
    setSavingProvider(true);
    setProviderMessage(null);
    try {
      await learningClient.configureAiConnection({
        provider: newProviderPreset.kind,
        providerVendor: newVendor,
        baseUrl: newProviderBaseUrl,
        apiKey: newProviderKey,
        model: newProviderModel,
        secretSource: "encrypted",
      });
      setProviderMessage(
        text(
          "连接已通过能力测试并设为八类任务的默认服务。",
          "The connection passed capability testing and is now the default for all eight task types.",
        ),
      );
      setNewProviderKey("");
      setShowAddConnection(false);
      onRefresh();
    } catch (error) {
      setProviderMessage(
        error instanceof Error
          ? error.message
          : text("连接无法保存。", "The connection could not be saved."),
      );
    } finally {
      setSavingProvider(false);
    }
  };

  const deleteCurrentConnection = async () => {
    const confirmed = window.confirm(
      text(
        `只删除当前连接“${data.ai.displayName}”（${data.ai.id}）？等待中的 AI 任务将暂停；此操作不会在供应商侧撤销密钥。`,
        `Delete only the current connection “${data.ai.displayName}” (${data.ai.id})? Queued AI work will pause. This does not revoke the key at the provider.`,
      ),
    );
    if (!confirmed) return;
    setDeletingConnection(true);
    setDeleteConnectionMessage(null);
    try {
      await learningClient.deleteAiConnection(data.ai.id);
      onRefresh();
    } catch (error) {
      setDeleteConnectionMessage(
        error instanceof Error
          ? error.message
          : text(
              "当前连接无法删除。",
              "The current connection could not be deleted.",
            ),
      );
    } finally {
      setDeletingConnection(false);
    }
  };

  const loadRoutes = async () => {
    if (routesLoaded || routesLoading) return;
    setRoutesLoading(true);
    setRouteMessage(null);
    try {
      const routes = await learningClient.getModelRoutes();
      const drafts: Partial<Record<AiTaskKind, string>> = {};
      const providers: Partial<Record<AiTaskKind, string>> = {};
      for (const route of routes) {
        drafts[route.taskKind] = route.model;
        providers[route.taskKind] =
          route.providerConnectionId ?? "environment-openai";
      }
      setRouteDrafts(drafts);
      setRouteProviders(providers);
      setRoutesLoaded(true);
    } catch (error) {
      setRouteMessage(
        error instanceof Error
          ? error.message
          : text("无法读取模型路由。", "Could not load model routes."),
      );
    } finally {
      setRoutesLoading(false);
    }
  };

  const saveRoute = async (taskKind: AiTaskKind) => {
    const model = (routeDrafts[taskKind] ?? "").trim();
    if (!model || !connected || data.ai.id === "missing") return;
    setRouteSaving(taskKind);
    setRouteMessage(null);
    try {
      const route = await learningClient.updateModelRoute({
        taskKind,
        providerConnectionId: data.ai.id,
        model,
      });
      setRouteDrafts((current) => ({
        ...current,
        [taskKind]: route.model,
      }));
      setRouteProviders((current) => ({
        ...current,
        [taskKind]: data.ai.id,
      }));
      setRouteMessage(
        text(
          "路由已保存；等待配置的同类任务会使用原 Job ID 恢复。",
          "Route saved. Waiting jobs of this kind resume with their original Job IDs.",
        ),
      );
    } catch (error) {
      setRouteMessage(
        error instanceof Error
          ? error.message
          : text("路由保存失败。", "Could not save the route."),
      );
    } finally {
      setRouteSaving(null);
    }
  };
  return (
    <div className="ai-settings-stack">
      <Card className="settings-section">
        <div className="settings-section-head">
          <span className="settings-icon">
            <Cloud aria-hidden="true" size={20} />
          </span>
          <div>
            <h2>{text("AI 服务", "AI service")}</h2>
            <p>
              {text(
                "只有实例管理员可以查看技术状态或修改连接。",
                "Only instance administrators can view technical status or change the connection.",
              )}
            </p>
          </div>
          <Badge tone={connected ? "green" : "red"}>
            {connected
              ? text("连接正常", "Connected")
              : text("未连接", "Not connected")}
          </Badge>
        </div>
        <div className="connection-overview">
          <div>
            <span>{text("供应商", "Provider")}</span>
            <strong>{data.ai.displayName}</strong>
          </div>
          <div>
            <span>{text("默认模型", "Default model")}</span>
            <strong>{data.ai.model}</strong>
          </div>
          <div>
            <span>API Key</span>
            <strong>
              {data.ai.secretSource === "environment"
                ? text("由环境变量管理", "Managed by environment")
                : data.ai.secretHint}
            </strong>
          </div>
          <div>
            <span>{text("最近测试", "Last tested")}</span>
            <strong>{text(data.ai.lastTestedZh, data.ai.lastTestedEn)}</strong>
          </div>
        </div>
        <div className="connection-health-row">
          <span className={connected ? "" : "warning"}>
            {connected ? <Check aria-hidden="true" size={14} /> : "!"}
            {text("基础连接", "Connection")}
          </span>
          <span className={data.ai.structuredOutput ? "" : "warning"}>
            {data.ai.structuredOutput ? (
              <Check aria-hidden="true" size={14} />
            ) : (
              "!"
            )}
            {text("结构化输出", "Structured output")}
          </span>
          <span className="warning">
            ! {text("不代表人工校准", "Not human-calibrated")}
          </span>
          {data.ai.latencyMs ? <small>{data.ai.latencyMs} ms</small> : null}
        </div>
        {data.ai.secretSource !== "environment" &&
        data.ai.provider !== "mock" ? (
          <>
            <div className="settings-divider" />
            <div className="replace-key-form">
              <div className="form-field">
                <label htmlFor="new-api-key">
                  {text("替换 API Key", "Replace API key")}
                </label>
                <div className="input-with-icon">
                  <KeyRound aria-hidden="true" size={16} />
                  <input
                    autoComplete="off"
                    className="text-input"
                    id="new-api-key"
                    onChange={(event) => onKeyChange(event.target.value)}
                    placeholder={text(
                      "输入完整新密钥",
                      "Enter the complete new key",
                    )}
                    spellCheck={false}
                    type="password"
                    value={newKey}
                  />
                </div>
                <p className="field-hint">
                  <EyeOff aria-hidden="true" size={13} />
                  {text(
                    "原始密钥永不回显；更新必须完整输入。",
                    "The original secret is never revealed; replacement requires the complete new key.",
                  )}
                </p>
              </div>
              <div className="inline-actions">
                <Button
                  disabled={testing || replacing || !newKey}
                  onClick={onTest}
                  variant="secondary"
                >
                  {testing ? (
                    <LoadingButtonContent label={text("测试中…", "Testing…")} />
                  ) : (
                    <>
                      <RefreshCw aria-hidden="true" size={16} />
                      {text("测试连接", "Test connection")}
                    </>
                  )}
                </Button>
                <Button
                  disabled={testing || replacing || !newKey}
                  onClick={onReplace}
                >
                  {replacing ? (
                    <LoadingButtonContent
                      label={text("正在替换…", "Replacing…")}
                    />
                  ) : (
                    text("验证并替换", "Verify & replace")
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : null}
        {probe ? (
          <div
            aria-live="polite"
            className={cn(
              "inline-probe",
              probe.status === "failure" ? "error" : "success",
            )}
          >
            <strong>{text(probe.messageZh, probe.messageEn)}</strong>
            <span>
              {probe.latencyMs
                ? `${probe.latencyMs} ms`
                : text("请检查密钥与模型", "Check the key and model")}
            </span>
          </div>
        ) : null}
        <div className="settings-divider" />
        <div className="inline-actions">
          <Button
            onClick={() => setShowAddConnection((current) => !current)}
            variant="secondary"
          >
            <Cloud aria-hidden="true" size={16} />
            {showAddConnection
              ? text("收起新增连接", "Close new connection")
              : text("新增或切换 AI 服务", "Add or switch AI service")}
          </Button>
        </div>
        {showAddConnection ? (
          <div className="replace-key-form">
            <div className="form-grid">
              <div className="form-field form-field-wide">
                <label htmlFor="new-provider-vendor">
                  {text("服务商预设", "Provider preset")}
                </label>
                <select
                  className="select-input"
                  id="new-provider-vendor"
                  onChange={(event) =>
                    selectNewVendor(event.target.value as ProviderVendor)
                  }
                  value={newVendor}
                >
                  <optgroup label={text("全球主流服务", "Global providers")}>
                    {providerCatalog
                      .filter((preset) => preset.region === "global")
                      .map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {text(preset.labelZh, preset.label)}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label={text("中国大陆服务", "China providers")}>
                    {providerCatalog
                      .filter((preset) => preset.region === "china")
                      .map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {text(preset.labelZh, preset.label)}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup
                    label={text(
                      "企业、自建与本地",
                      "Enterprise, custom & local",
                    )}
                  >
                    {providerCatalog
                      .filter(
                        (preset) =>
                          ["custom", "local"].includes(preset.region) &&
                          preset.id !== "mock",
                      )
                      .map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {text(preset.labelZh, preset.label)}
                        </option>
                      ))}
                  </optgroup>
                  <option value="mock">
                    {text("Mock（仅演示）", "Mock (demo only)")}
                  </option>
                </select>
                <p className="field-hint">
                  {text(
                    newProviderPreset.compatibilityNoteZh,
                    newProviderPreset.compatibilityNoteEn,
                  )}
                </p>
              </div>
              <div className="form-field">
                <label htmlFor="new-provider-model">
                  {text("模型 ID", "Model ID")}
                </label>
                <input
                  className="text-input"
                  id="new-provider-model"
                  onChange={(event) => setNewProviderModel(event.target.value)}
                  spellCheck={false}
                  value={newProviderModel}
                />
              </div>
              {newProviderPreset.configurableBaseUrl ? (
                <div className="form-field form-field-wide">
                  <label htmlFor="new-provider-base-url">Base URL</label>
                  <input
                    className="text-input"
                    id="new-provider-base-url"
                    onChange={(event) =>
                      setNewProviderBaseUrl(event.target.value)
                    }
                    type="url"
                    value={newProviderBaseUrl}
                  />
                  <p className="field-hint">
                    {text(
                      "必须是精确 API 根地址。本地/私网地址只有进入管理员 allowlist 后才可访问。",
                      "Use the exact API root. Local or private URLs work only after the operator adds them to the allowlist.",
                    )}
                  </p>
                </div>
              ) : null}
              {newVendor !== "mock" ? (
                <div className="form-field form-field-wide">
                  <label htmlFor="new-provider-api-key">API Key</label>
                  <div className="input-with-icon">
                    <KeyRound aria-hidden="true" size={16} />
                    <input
                      autoComplete="off"
                      className="text-input"
                      id="new-provider-api-key"
                      onChange={(event) =>
                        setNewProviderKey(event.target.value)
                      }
                      placeholder={newProviderPreset.apiKeyPlaceholder}
                      spellCheck={false}
                      type="password"
                      value={newProviderKey}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="inline-actions">
              <Button
                disabled={
                  savingProvider ||
                  !newProviderModel.trim() ||
                  (newVendor !== "mock" &&
                    !["ollama", "lm_studio", "custom"].includes(newVendor) &&
                    !newProviderKey)
                }
                onClick={() => void saveNewProvider()}
              >
                {savingProvider ? (
                  <LoadingButtonContent
                    label={text("正在测试并保存…", "Testing and saving…")}
                  />
                ) : (
                  text("测试并设为默认", "Test and set as default")
                )}
              </Button>
            </div>
            {providerMessage ? (
              <p aria-live="polite" className="field-hint">
                {providerMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
      <Card className="settings-section compact-section">
        <div className="settings-section-head">
          <span className="settings-icon">
            <Settings2 aria-hidden="true" size={20} />
          </span>
          <div>
            <h2>{text("模型路由", "Model routing")}</h2>
            <p>
              {text(
                "简单模式使用一个模型完成所有开放 AI 任务。",
                "Simple mode uses one model for every open-ended AI task.",
              )}
            </p>
          </div>
          <Badge tone="blue">{text("简单模式", "Simple mode")}</Badge>
        </div>
        <details
          className="routing-details"
          onToggle={(event) => {
            if (event.currentTarget.open) void loadRoutes();
          }}
        >
          <summary>
            {text("展开高级路由", "Open advanced routing")}
            <ChevronDown aria-hidden="true" size={16} />
          </summary>
          <div>
            <p>
              {text(
                "每类任务可指定当前连接上的模型。保存路由时跨供应商备用保持关闭；完整备用配置仍可通过版本化 API 管理。",
                "Each task can use a model on the current connection. Cross-provider fallback stays off when this editor saves; complete fallback settings remain available through the versioned API.",
              )}
            </p>
            {routesLoading ? (
              <p className="field-hint">
                {text("正在读取路由…", "Loading routes…")}
              </p>
            ) : (
              <div className="route-editor-list">
                {AI_ROUTE_TASKS.map((task) => {
                  const model = routeDrafts[task.id] ?? "";
                  const provider = routeProviders[task.id];
                  return (
                    <div className="route-editor-row" key={task.id}>
                      <span>
                        <strong>{text(task.zh, task.en)}</strong>
                        <small>
                          {provider
                            ? `${text("当前", "Current")}: ${provider}`
                            : text("尚未设置显式路由", "No explicit route")}
                        </small>
                      </span>
                      <input
                        aria-label={`${text(task.zh, task.en)} model`}
                        className="text-input"
                        onChange={(event) =>
                          setRouteDrafts((current) => ({
                            ...current,
                            [task.id]: event.target.value,
                          }))
                        }
                        placeholder={
                          isConcreteModel(data.ai.model)
                            ? data.ai.model
                            : "gpt-5-mini"
                        }
                        spellCheck={false}
                        value={model}
                      />
                      <Button
                        disabled={
                          routeSaving !== null ||
                          !connected ||
                          data.ai.id === "missing" ||
                          model.trim().length === 0
                        }
                        onClick={() => void saveRoute(task.id)}
                        size="sm"
                        variant="secondary"
                      >
                        {routeSaving === task.id
                          ? text("保存中…", "Saving…")
                          : text("保存", "Save")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {routeMessage ? (
              <p aria-live="polite" className="field-hint">
                {routeMessage}
              </p>
            ) : null}
          </div>
        </details>
      </Card>
      <div className="ai-danger-zone">
        <LockKeyhole aria-hidden="true" size={17} />
        <div>
          <strong>
            {text(
              "删除连接会暂停等待中的 AI 任务",
              "Deleting the connection pauses queued AI work",
            )}
          </strong>
          <span>
            {text(
              "删除只移除本实例保存的密钥，不会在供应商侧撤销。",
              "Deletion removes the secret from this instance; it does not revoke it at the provider.",
            )}
          </span>
        </div>
        <Button
          disabled={
            deletingConnection ||
            data.ai.id === "missing" ||
            data.ai.secretSource === "environment"
          }
          onClick={() => void deleteCurrentConnection()}
          size="sm"
          variant="danger"
        >
          {data.ai.secretSource === "environment"
            ? text("环境连接只读", "Environment connection is read-only")
            : text("删除当前连接…", "Delete current connection…")}
        </Button>
        {deleteConnectionMessage ? (
          <span aria-live="polite">{deleteConnectionMessage}</span>
        ) : null}
      </div>
    </div>
  );
}
