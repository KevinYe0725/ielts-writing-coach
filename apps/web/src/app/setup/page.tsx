"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  EyeOff,
  KeyRound,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import {
  getProviderPreset,
  providerCatalog,
  type ProviderVendor,
} from "@iwc/ai/provider-catalog";

import { useLocale } from "@/components/locale-provider";
import { Badge, Button, Card, LoadingButtonContent } from "@/components/ui";
import { cn } from "@/components/utils";
import {
  learningClient,
  type BootstrapInput,
  type ConnectionProbe,
  type DeploymentMode,
} from "@/lib/client";
import { useOneTimeLinkFromAddressBar } from "@/lib/client/one-time-link";

const initialForm: BootstrapInput = {
  deploymentMode: "personal",
  adminName: "",
  email: "",
  password: "",
  provider: "openai",
  providerVendor: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.4-mini",
  secretSource: "encrypted",
};

export default function SetupPage() {
  const router = useRouter();
  const { text } = useLocale();
  const setupLink = useOneTimeLinkFromAddressBar();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BootstrapInput>(initialForm);
  const [probe, setProbe] = useState<ConnectionProbe | null>(null);
  const [testing, setTesting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionOnlyAvailable, setSessionOnlyAvailable] = useState(false);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/setup/status", { cache: "no-store" })
      .then((response) => response.json())
      .then(
        (status: {
          session_only_available?: boolean;
          setup_required?: boolean;
        }) => {
          if (cancelled) return;
          setSessionOnlyAvailable(status.session_only_available === true);
          setSetupRequired(status.setup_required === true);
        },
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = useMemo(
    () => [
      text("使用方式", "Usage"),
      text("管理员", "Administrator"),
      text("AI 服务", "AI service"),
      text("完成", "Complete"),
    ],
    [text],
  );
  const selectedProvider = useMemo(
    () => getProviderPreset(form.providerVendor),
    [form.providerVendor],
  );

  const update = <K extends keyof BootstrapInput>(
    key: K,
    value: BootstrapInput[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (
      key === "provider" ||
      key === "providerVendor" ||
      key === "model" ||
      key === "apiKey" ||
      key === "baseUrl"
    )
      setProbe(null);
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    try {
      setProbe(
        await learningClient.testConnection({
          ...form,
          ...(setupLink.token ? { setupToken: setupLink.token } : {}),
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : text("连接测试失败。", "Connection test failed."),
      );
    } finally {
      setTesting(false);
    }
  };

  const finish = async (configureAi = true) => {
    setFinishing(true);
    setError(null);
    try {
      await learningClient.completeBootstrap({
        ...form,
        ...(setupLink.token ? { setupToken: setupLink.token } : {}),
        configureAi,
      });
      setAiConfigured(configureAi);
      setStep(3);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : text("初始化失败。", "Setup failed."),
      );
    } finally {
      setFinishing(false);
    }
  };

  const selectMode = (deploymentMode: DeploymentMode) => {
    update("deploymentMode", deploymentMode);
  };

  return (
    <div className="setup-container">
      <ol
        aria-label={text("设置进度", "Setup progress")}
        className="setup-steps"
      >
        {steps.map((label, index) => (
          <li
            aria-current={step === index ? "step" : undefined}
            className={cn(step === index && "current", step > index && "done")}
            key={label}
          >
            <span aria-hidden="true">
              {step > index ? <Check size={14} /> : index + 1}
            </span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>

      {setupRequired === true && setupLink.ready && !setupLink.token ? (
        <p className="inline-probe error" role="alert">
          {text(
            "一次性设置令牌不在此页面内存中。若你刷新过页面，请重新打开实例提供的原始设置链接；令牌不会写入浏览器存储。",
            "The one-time setup token is no longer in this page's memory. If you refreshed, reopen the original setup link supplied by the instance; the token is never written to browser storage.",
          )}
        </p>
      ) : null}

      {step === 0 ? (
        <section aria-labelledby="setup-mode-title" className="setup-panel">
          <div className="setup-heading">
            <Badge tone="blue">
              <Sparkles size={13} aria-hidden="true" />
              {text("约 2 分钟", "About 2 minutes")}
            </Badge>
            <h1 id="setup-mode-title">
              {text("欢迎使用 IELTS Writing", "Welcome to IELTS Writing")}
            </h1>
            <p>
              {text(
                "我们会自动安排批改、专项训练和延迟重写。先告诉我们这个实例由谁使用。",
                "Feedback, focused practice, and delayed rewrites are scheduled for you. First, tell us who will use this instance.",
              )}
            </p>
          </div>
          <div className="setup-choice-grid">
            <button
              aria-pressed={form.deploymentMode === "personal"}
              className={cn(
                "setup-choice",
                form.deploymentMode === "personal" && "selected",
              )}
              onClick={() => selectMode("personal")}
              type="button"
            >
              <span className="setup-choice-icon">
                <Laptop aria-hidden="true" size={23} />
              </span>
              <span className="setup-choice-copy">
                <span className="setup-choice-title">
                  <strong>{text("仅我使用", "Just me")}</strong>
                  <Badge tone="green">{text("推荐", "Recommended")}</Badge>
                </span>
                <span>
                  {text(
                    "你同时是管理员和学习者，隐藏团队与复杂权限。",
                    "You are both administrator and learner; team controls stay out of sight.",
                  )}
                </span>
              </span>
              <span className="radio-dot" aria-hidden="true" />
            </button>
            <button
              aria-pressed={form.deploymentMode === "shared"}
              className={cn(
                "setup-choice",
                form.deploymentMode === "shared" && "selected",
              )}
              onClick={() => selectMode("shared")}
              type="button"
            >
              <span className="setup-choice-icon">
                <Users aria-hidden="true" size={23} />
              </span>
              <span className="setup-choice-copy">
                <span className="setup-choice-title">
                  <strong>{text("与多人共享", "Share with others")}</strong>
                </span>
                <span>
                  {text(
                    "管理员邀请学习者；作文、反馈与成长档案彼此隔离。",
                    "An administrator invites learners; essays, feedback, and growth records remain isolated.",
                  )}
                </span>
              </span>
              <span className="radio-dot" aria-hidden="true" />
            </button>
          </div>
          <div className="privacy-note">
            <ShieldCheck aria-hidden="true" size={19} />
            <p>
              {text(
                "默认不启用公开注册，也不允许管理员直接阅读学习者作文。",
                "Public registration and administrator access to learner essays are off by default.",
              )}
            </p>
          </div>
          <div className="setup-footer">
            <Button onClick={() => setStep(1)} size="lg">
              {text("继续", "Continue")}
              <ArrowRight aria-hidden="true" size={18} />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section
          aria-labelledby="setup-admin-title"
          className="setup-panel setup-panel-narrow"
        >
          <div className="setup-heading">
            <Badge tone="neutral">
              <LockKeyhole size={13} aria-hidden="true" />
              {text("实例归属", "Instance ownership")}
            </Badge>
            <h1 id="setup-admin-title">
              {text("创建首位管理员", "Create the first administrator")}
            </h1>
            <p>
              {text(
                "这些信息只用于登录你的自托管实例。",
                "These details are used only to sign in to your self-hosted instance.",
              )}
            </p>
          </div>
          <Card className="setup-form-card">
            <div className="form-grid">
              <div className="form-field form-field-wide">
                <label htmlFor="admin-name">
                  {text("你的名字", "Your name")}
                </label>
                <input
                  className="text-input"
                  id="admin-name"
                  onChange={(event) => update("adminName", event.target.value)}
                  value={form.adminName}
                />
              </div>
              <div className="form-field form-field-wide">
                <label htmlFor="admin-email">
                  {text("登录邮箱", "Sign-in email")}
                </label>
                <input
                  autoComplete="email"
                  className="text-input"
                  id="admin-email"
                  onChange={(event) => update("email", event.target.value)}
                  placeholder="simon@example.com"
                  type="email"
                  value={form.email}
                />
              </div>
              <div className="form-field form-field-wide">
                <label htmlFor="admin-password">
                  {text("密码", "Password")}
                </label>
                <input
                  autoComplete="new-password"
                  className="text-input"
                  id="admin-password"
                  minLength={12}
                  onChange={(event) => update("password", event.target.value)}
                  placeholder={text("至少 12 个字符", "At least 12 characters")}
                  type="password"
                  value={form.password}
                />
                <p className="field-hint">
                  {form.deploymentMode === "shared"
                    ? text(
                        "共享模式下必须启用安全登录，公开注册默认关闭。",
                        "Secure sign-in is required in shared mode; public registration stays off.",
                      )
                    : text(
                        "如果实例只监听本机，之后可以启用简化登录。",
                        "A simplified sign-in can be enabled later for local-only instances.",
                      )}
                </p>
              </div>
            </div>
          </Card>
          <div className="setup-footer split">
            <Button onClick={() => setStep(0)} size="lg" variant="ghost">
              <ArrowLeft aria-hidden="true" size={18} />
              {text("返回", "Back")}
            </Button>
            <Button
              disabled={
                !form.adminName || !form.email || form.password.length < 12
              }
              onClick={() => setStep(2)}
              size="lg"
            >
              {text("连接 AI", "Connect AI")}
              <ArrowRight aria-hidden="true" size={18} />
            </Button>
          </div>
          {error ? (
            <p className="inline-probe error" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section
          aria-labelledby="setup-ai-title"
          className="setup-panel setup-panel-wide"
        >
          <div className="setup-heading">
            <Badge tone="blue">
              <Cloud size={13} aria-hidden="true" />
              BYOAI
            </Badge>
            <h1 id="setup-ai-title">
              {text("连接你的 AI 服务", "Connect your AI service")}
            </h1>
            <p>
              {text(
                "默认只需供应商、API Key 和模型。连接测试使用固定无隐私样本。",
                "The default path needs only a provider, API key, and model. Connection tests use a fixed non-private sample.",
              )}
            </p>
          </div>
          <div className="ai-setup-layout">
            <Card className="setup-form-card">
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="provider">{text("供应商", "Provider")}</label>
                  <select
                    className="select-input"
                    id="provider"
                    onChange={(event) => {
                      const vendor = event.target.value as ProviderVendor;
                      const preset = getProviderPreset(vendor);
                      setForm((current) => ({
                        ...current,
                        providerVendor: vendor,
                        provider: preset.kind,
                        baseUrl: preset.baseUrl ?? "",
                        model: preset.defaultModel,
                        apiKey: vendor === "mock" ? "" : current.apiKey,
                      }));
                      setProbe(null);
                    }}
                    value={form.providerVendor}
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
                      Mock · {text("仅演示", "demo only")}
                    </option>
                  </select>
                  <p className="field-hint">
                    {text(
                      selectedProvider.compatibilityNoteZh,
                      selectedProvider.compatibilityNoteEn,
                    )}
                  </p>
                </div>
                <div className="form-field">
                  <label htmlFor="model">{text("模型 ID", "Model ID")}</label>
                  <input
                    className="text-input"
                    id="model"
                    onChange={(event) => update("model", event.target.value)}
                    value={form.model}
                  />
                </div>
                {selectedProvider.configurableBaseUrl ? (
                  <div className="form-field form-field-wide">
                    <label htmlFor="base-url">Base URL</label>
                    <input
                      className="text-input"
                      id="base-url"
                      onChange={(event) =>
                        update("baseUrl", event.target.value)
                      }
                      type="url"
                      value={form.baseUrl}
                    />
                    <p className="field-hint">
                      {text(
                        "填写精确 API 根地址（含版本路径，如 /v1）。本地地址还需实例管理员加入精确 allowlist。",
                        "Enter the exact API root, including its version path such as /v1. Local URLs also require an exact operator allowlist.",
                      )}
                    </p>
                  </div>
                ) : null}
                {form.providerVendor !== "mock" ? (
                  <div className="form-field form-field-wide">
                    <label htmlFor="api-key">API Key</label>
                    <div className="secret-input-wrap">
                      <KeyRound aria-hidden="true" size={17} />
                      <input
                        autoComplete="off"
                        className="text-input"
                        id="api-key"
                        onChange={(event) =>
                          update("apiKey", event.target.value)
                        }
                        placeholder={selectedProvider.apiKeyPlaceholder}
                        spellCheck={false}
                        type="password"
                        value={form.apiKey}
                      />
                    </div>
                    <p className="field-hint">
                      <EyeOff aria-hidden="true" size={13} />{" "}
                      {text(
                        "保存后不可回显。浏览器不会直接携带 Key 请求供应商。",
                        "The key cannot be revealed after saving. Your browser never calls the provider with it directly.",
                      )}
                    </p>
                  </div>
                ) : null}
                <fieldset className="save-mode form-field-wide">
                  <legend>{text("密钥保存方式", "Secret storage")}</legend>
                  <label>
                    <input
                      checked={form.secretSource === "encrypted"}
                      name="secret-mode"
                      onChange={() => update("secretSource", "encrypted")}
                      type="radio"
                    />
                    <span>
                      <strong>{text("加密保存", "Encrypted storage")}</strong>
                      <small>
                        {text(
                          "支持无人值守的后台批改与提醒",
                          "Supports unattended feedback and reminders",
                        )}
                      </small>
                    </span>
                  </label>
                  {form.deploymentMode === "personal" &&
                  sessionOnlyAvailable ? (
                    <label>
                      <input
                        checked={form.secretSource === "session"}
                        name="secret-mode"
                        onChange={() => update("secretSource", "session")}
                        type="radio"
                      />
                      <span>
                        <strong>
                          {text("仅本次会话", "This session only")}
                        </strong>
                        <small>
                          {text(
                            "退出或服务重启后需要重新输入",
                            "Must be entered again after sign-out or restart",
                          )}
                        </small>
                      </span>
                    </label>
                  ) : null}
                </fieldset>
              </div>
              <details className="advanced-disclosure">
                <summary>{text("高级设置", "Advanced settings")}</summary>
                <p>
                  {text(
                    "默认使用单模型处理评分、生成和开放题判分。完成初始化后可在设置中配置八类任务路由。",
                    "By default, one model handles assessment, generation, and open responses. After setup, all eight task routes can be configured in Settings.",
                  )}
                </p>
              </details>
            </Card>
            <aside className="probe-column" aria-live="polite">
              <Card className="probe-card">
                <div className="probe-header">
                  <span className="probe-icon">
                    <Server aria-hidden="true" size={20} />
                  </span>
                  <div>
                    <strong>
                      {text("连接与能力检查", "Connection & capability check")}
                    </strong>
                    <span>
                      {text("不会发送真实作文", "No real essay is sent")}
                    </span>
                  </div>
                </div>
                {probe ? (
                  <div className="probe-results">
                    <Badge
                      tone={
                        probe.status === "success"
                          ? "green"
                          : probe.status === "compatibility"
                            ? "amber"
                            : "red"
                      }
                    >
                      {probe.status === "success"
                        ? text("可正常使用", "Ready")
                        : probe.status === "compatibility"
                          ? text("兼容模式可用", "Compatibility mode")
                          : text("需要修复", "Needs attention")}
                    </Badge>
                    <p>{text(probe.messageZh, probe.messageEn)}</p>
                    <ul>
                      <li>
                        <span>{text("基础连接", "Connection")}</span>
                        <strong>{probe.connection ? "✓" : "—"}</strong>
                      </li>
                      <li>
                        <span>{text("结构化输出", "Structured output")}</span>
                        <strong>
                          {probe.structuredOutput
                            ? "✓"
                            : text("兼容提取", "Fallback")}
                        </strong>
                      </li>
                      <li>
                        <span>{text("上下文容量", "Context capacity")}</span>
                        <strong>{probe.contextWindow ? "✓" : "—"}</strong>
                      </li>
                      <li>
                        <span>{text("教学质量", "Teaching quality")}</span>
                        <strong>
                          {text(
                            "连接测试不代表人工校准",
                            "Connection testing is not human calibration",
                          )}
                        </strong>
                      </li>
                      <li>
                        <span>{text("测试延迟", "Test latency")}</span>
                        <strong>{probe.latencyMs} ms</strong>
                      </li>
                    </ul>
                  </div>
                ) : (
                  <div className="probe-placeholder">
                    <ShieldCheck aria-hidden="true" size={30} />
                    <p>
                      {text(
                        "填写连接信息后进行一次安全测试。只有通过后才会正式保存。",
                        "Run a safe test after entering the connection details. The configuration is saved only after passing.",
                      )}
                    </p>
                  </div>
                )}
              </Card>
              <div className="cost-note">
                <strong>{text("费用提示", "Cost note")}</strong>
                <span>
                  {text(
                    "费用由供应商决定。只有价格信息可靠时，本系统才显示估算。",
                    "Your provider determines charges. Estimates appear only when pricing data is reliable.",
                  )}
                </span>
              </div>
            </aside>
          </div>
          <div className="setup-footer split">
            <Button onClick={() => setStep(1)} size="lg" variant="ghost">
              <ArrowLeft aria-hidden="true" size={18} />
              {text("返回", "Back")}
            </Button>
            <div className="setup-footer-actions">
              <Button
                disabled={finishing}
                onClick={() => void finish(false)}
                size="lg"
                variant="secondary"
              >
                {text("暂不配置", "Set up later")}
              </Button>
              {probe?.status === "success" ||
              probe?.status === "compatibility" ? (
                <Button
                  disabled={finishing}
                  onClick={() => void finish(true)}
                  size="lg"
                >
                  {finishing ? (
                    <LoadingButtonContent
                      label={text("正在保存…", "Saving…")}
                    />
                  ) : (
                    <>
                      {text("保存并完成", "Save and finish")}
                      <ArrowRight aria-hidden="true" size={18} />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  disabled={testing}
                  onClick={() => void test()}
                  size="lg"
                >
                  {testing ? (
                    <LoadingButtonContent
                      label={text("正在测试…", "Testing…")}
                    />
                  ) : (
                    <>
                      {text("测试连接", "Test connection")}
                      <ArrowRight aria-hidden="true" size={18} />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          {error ? (
            <p className="inline-probe error" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section
          aria-labelledby="setup-success-title"
          className="setup-panel setup-success"
        >
          <span className="success-orbit" aria-hidden="true">
            <CheckCircle2 size={42} />
          </span>
          <Badge tone="green">{text("系统已就绪", "System ready")}</Badge>
          <h1 id="setup-success-title">
            {text("可以开始第一篇写作了", "You are ready for your first essay")}
          </h1>
          <p>
            {text(
              "选题、批改、专项训练和延迟重写将自动推进。首页始终只给你一个下一步。",
              "Topic selection, feedback, focused practice, and delayed rewriting will advance automatically. Today always shows one next action.",
            )}
          </p>
          {aiConfigured ? (
            <Card className="connection-success-card">
              <span>
                <Cloud aria-hidden="true" size={19} />
              </span>
              <div>
                <strong>
                  {text(selectedProvider.labelZh, selectedProvider.label)}
                </strong>
                <small>
                  {form.model} ·{" "}
                  {text(
                    "连接与能力检查已通过",
                    "Connection and capability checks passed",
                  )}
                </small>
              </div>
              <Badge tone="green">{text("正常", "Healthy")}</Badge>
            </Card>
          ) : (
            <Card className="connection-success-card">
              <span>
                <Server aria-hidden="true" size={19} />
              </span>
              <div>
                <strong>{text("AI 稍后配置", "AI setup deferred")}</strong>
                <small>
                  {text(
                    "写作与历史功能仍可使用。",
                    "Writing and history remain available.",
                  )}
                </small>
              </div>
              <Badge tone="neutral">{text("未连接", "Not connected")}</Badge>
            </Card>
          )}
          <Button onClick={() => router.push("/today")} size="lg">
            {text("进入今日计划", "Open today’s plan")}
            <ArrowRight aria-hidden="true" size={18} />
          </Button>
        </section>
      ) : null}
    </div>
  );
}
