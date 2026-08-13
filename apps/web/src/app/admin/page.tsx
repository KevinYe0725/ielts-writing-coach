"use client";

import { useCallback, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  Mail,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import {
  ActionLink,
  Badge,
  Button,
  Card,
  PageHeader,
  SectionHeader,
  Skeleton,
} from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { learningClient } from "@/lib/client";

export default function AdminPage() {
  const { text } = useLocale();
  const loader = useCallback(() => learningClient.getSystemStatus(), []);
  const { data, loading, retry } = useDemoResource(loader);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [creatingRecovery, setCreatingRecovery] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestMessage, setSmtpTestMessage] = useState<string | null>(null);
  if (loading || !data)
    return (
      <Skeleton label={text("正在检查系统状态…", "Checking system status…")} />
    );

  const aiHealthy =
    data.ai.state === "connected" || data.ai.state === "compatibility";
  const createRecoveryLink = async () => {
    setCreatingRecovery(true);
    setRecoveryError(null);
    try {
      const response = await fetch("/api/v1/admin/recovery-links", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      const body = (await response.json().catch(() => null)) as {
        detail?: string;
        one_time_link?: string;
      } | null;
      if (!response.ok || !body?.one_time_link) {
        throw new Error(
          body?.detail ??
            text("无法生成恢复链接。", "Could not create a recovery link."),
        );
      }
      setRecoveryLink(body.one_time_link);
    } catch (error) {
      setRecoveryError(
        error instanceof Error
          ? error.message
          : text("请求失败。", "Request failed."),
      );
    } finally {
      setCreatingRecovery(false);
    }
  };
  const testSmtp = async () => {
    setTestingSmtp(true);
    setSmtpTestMessage(null);
    try {
      const response = await fetch("/api/v1/admin/smtp-test", {
        method: "POST",
        credentials: "include",
        headers: { "idempotency-key": crypto.randomUUID() },
      });
      const body = (await response.json().catch(() => null)) as {
        detail?: string;
        verified?: boolean;
      } | null;
      if (!response.ok || body?.verified !== true) {
        throw new Error(
          body?.detail ?? text("SMTP 验证失败。", "SMTP verification failed."),
        );
      }
      setSmtpTestMessage(
        text(
          "本次 SMTP 连接与认证测试通过。",
          "The live SMTP connection and authentication test passed.",
        ),
      );
    } catch (error) {
      setSmtpTestMessage(
        error instanceof Error
          ? error.message
          : text("SMTP 验证失败。", "SMTP verification failed."),
      );
    } finally {
      setTestingSmtp(false);
    }
  };
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={retry} variant="secondary">
            <RefreshCw aria-hidden="true" size={16} />
            {text("重新检查", "Refresh")}
          </Button>
        }
        eyebrow={text("仅管理员可见", "Administrator only")}
        title={text("系统状态", "System status")}
        description={`${text("版本", "Version")} ${data.version} · ${data.deploymentMode === "personal" ? text("个人模式", "Personal mode") : text("共享模式", "Shared mode")}`}
      />

      <div className="health-grid">
        <HealthCard
          icon={Cloud}
          state={aiHealthy ? "healthy" : "error"}
          title={text("AI 服务", "AI service")}
          value={
            aiHealthy
              ? text("正常", "Healthy")
              : text("需要修复", "Needs attention")
          }
          detail={
            aiHealthy
              ? `${data.ai.displayName} · ${data.ai.model}`
              : text("等待中的作文不会丢失", "Queued essays are safe")
          }
        />
        <HealthCard
          icon={Mail}
          state={data.mailState === "ready" ? "healthy" : "warning"}
          title={text("邮件提醒", "Email reminders")}
          value={
            data.mailState === "ready"
              ? text("已验证", "Verified")
              : data.mailState === "missing"
                ? text("未配置", "Not configured")
                : data.mailState === "error"
                  ? text("验证失败", "Verification failed")
                  : text("已配置，未验证", "Configured, unverified")
          }
          detail={
            data.mailState === "ready"
              ? text("最近一次现场测试通过", "Latest live test passed")
              : text("站内提醒始终可用", "In-app reminders always work")
          }
        />
        <HealthCard
          icon={Database}
          state={data.databaseState === "healthy" ? "healthy" : "warning"}
          title={text("数据库", "Database")}
          value={
            data.databaseState === "healthy"
              ? text("正常", "Healthy")
              : text("性能下降", "Degraded")
          }
          detail={text(
            data.migrationsCurrent
              ? "数据库连接与迁移版本均已核验"
              : "数据库可连接，但迁移版本不匹配",
            data.migrationsCurrent
              ? "Database connectivity and migration lineage verified"
              : "Database connected, but migration lineage differs",
          )}
        />
        <HealthCard
          icon={Activity}
          state={
            data.taskExecutorState === "degraded" || data.queue.failed > 0
              ? "warning"
              : "healthy"
          }
          title={text("任务执行器", "Task executor")}
          value={
            data.taskExecutorState === "healthy"
              ? text("心跳正常", "Heartbeat healthy")
              : text("无新鲜心跳", "No fresh heartbeat")
          }
          detail={`${data.queue.running} ${text("运行中", "running")} · ${data.queue.failed} ${text("失败", "failed")}`}
        />
      </div>

      {!aiHealthy ? (
        <div className="admin-alert">
          <AlertTriangle aria-hidden="true" size={22} />
          <div>
            <strong>
              {text(
                `${data.queue.waiting} 项任务正在等待 AI 配置`,
                `${data.queue.waiting} jobs are waiting for AI configuration`,
              )}
            </strong>
            <p>
              {text(
                "修复后会沿用原 Job 与幂等键恢复；结果不会重复落库，支持幂等的供应商也可避免重复请求计费。",
                "After repair, jobs resume with their original Job IDs and idempotency keys. Results are not stored twice, and providers that honor idempotency can also avoid duplicate request charges.",
              )}
            </p>
          </div>
          <ActionLink href="/settings">
            {text("修复 AI 配置", "Repair AI settings")}
          </ActionLink>
        </div>
      ) : null}

      <div className="admin-main-grid">
        <Card className="admin-panel">
          <div className="card-title-row">
            <div>
              <p className="eyebrow">{text("队列", "Queue")}</p>
              <h2>{text("后台任务", "Background work")}</h2>
            </div>
            <Badge tone={data.queue.failed ? "amber" : "green"}>
              {data.queue.failed
                ? text("需关注", "Attention")
                : text("正常", "Healthy")}
            </Badge>
          </div>
          <div className="queue-bars">
            <div>
              <span>{text("等待", "Waiting")}</span>
              <i>
                <b
                  style={{
                    width: `${Math.min(100, data.queue.waiting * 12)}%`,
                  }}
                />
              </i>
              <strong>{data.queue.waiting}</strong>
            </div>
            <div>
              <span>{text("运行中", "Running")}</span>
              <i>
                <b
                  className="running"
                  style={{
                    width: `${Math.min(100, data.queue.running * 20)}%`,
                  }}
                />
              </i>
              <strong>{data.queue.running}</strong>
            </div>
            <div>
              <span>{text("失败", "Failed")}</span>
              <i>
                <b
                  className="failed"
                  style={{ width: `${Math.min(100, data.queue.failed * 20)}%` }}
                />
              </i>
              <strong>{data.queue.failed}</strong>
            </div>
          </div>
          <p className="panel-note">
            {text(
              "批改、课程生成和开放题判分均使用独立幂等键。",
              "Feedback, lesson generation, and open-response evaluation each use independent idempotency keys.",
            )}
          </p>
        </Card>
        <Card className="admin-panel">
          <div className="card-title-row">
            <div>
              <p className="eyebrow">{text("共享边界", "Sharing boundary")}</p>
              <h2>{text("用户与注册", "Users & registration")}</h2>
            </div>
            <Users
              aria-hidden="true"
              className="panel-heading-icon"
              size={21}
            />
          </div>
          <div className="user-numbers">
            <div>
              <strong>{data.users.active}</strong>
              <span>{text("活跃用户", "active users")}</span>
            </div>
            <div>
              <strong>{data.users.invited}</strong>
              <span>{text("待接受邀请", "pending invitation")}</span>
            </div>
          </div>
          <div className="policy-row">
            <span>{text("公开注册", "Public registration")}</span>
            <Badge tone={data.users.publicRegistration ? "amber" : "green"}>
              {data.users.publicRegistration
                ? text("开启", "On")
                : text("关闭", "Off")}
            </Badge>
          </div>
        </Card>
      </div>

      <SectionHeader title={text("隐私与运维", "Privacy & operations")} />
      <div className="operations-list">
        {data.mailState === "missing" ? (
          <Card>
            <span className="operation-icon blue">
              <Mail aria-hidden="true" size={19} />
            </span>
            <div>
              <strong>
                {text(
                  "Owner 一次性账户恢复",
                  "Owner-assisted one-time recovery",
                )}
              </strong>
              <p>
                {text(
                  "SMTP 未配置时，Owner 可生成一小时有效的单次恢复链接。链接仅在本次响应中显示。",
                  "Without SMTP, the Owner can create a single-use recovery link valid for one hour. It is shown only in this response.",
                )}
              </p>
              <div className="admin-inline-form">
                <input
                  aria-label={text("账户邮箱", "Account email")}
                  className="text-input"
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  placeholder="learner@example.com"
                  type="email"
                  value={recoveryEmail}
                />
                <Button
                  disabled={creatingRecovery || !recoveryEmail}
                  onClick={() => void createRecoveryLink()}
                  size="sm"
                  variant="secondary"
                >
                  {creatingRecovery
                    ? text("生成中…", "Creating…")
                    : text("生成链接", "Create link")}
                </Button>
              </div>
              {recoveryLink ? (
                <output className="recovery-link-output">{recoveryLink}</output>
              ) : null}
              {recoveryError ? (
                <p className="inline-probe error" role="alert">
                  {recoveryError}
                </p>
              ) : null}
            </div>
            <Badge tone="amber">Owner</Badge>
          </Card>
        ) : null}
        {data.mailState !== "missing" ? (
          <Card>
            <span className="operation-icon blue">
              <Mail aria-hidden="true" size={19} />
            </span>
            <div>
              <strong>{text("现场测试 SMTP", "Test SMTP live")}</strong>
              <p>
                {smtpTestMessage ??
                  text(
                    "已配置不等于已送达；此测试会检查连接与认证，不发送学习提醒。",
                    "Configured does not mean delivered. This verifies connection and authentication without sending a learning reminder.",
                  )}
              </p>
            </div>
            <Button
              disabled={testingSmtp}
              onClick={() => void testSmtp()}
              size="sm"
              variant="secondary"
            >
              {testingSmtp
                ? text("测试中…", "Testing…")
                : text("测试连接", "Test connection")}
            </Button>
          </Card>
        ) : null}
        <Card>
          <span className="operation-icon green">
            <ShieldCheck aria-hidden="true" size={19} />
          </span>
          <div>
            <strong>
              {text(
                "管理员不能读取作文正文",
                "Administrator cannot read essay text",
              )}
            </strong>
            <p>
              {text(
                "排障访问需要学习者单独授权，并写入审计日志。",
                "Troubleshooting access needs separate learner consent and is audited.",
              )}
            </p>
          </div>
          <Badge tone="green">{text("已保护", "Protected")}</Badge>
        </Card>
        <Card>
          <span className="operation-icon blue">
            <HardDrive aria-hidden="true" size={19} />
          </span>
          <div>
            <strong>
              {text("可创建加密实例备份", "Encrypted instance backup")}
            </strong>
            <p>
              {text(
                "包含数据库、版本清单与口令加密密钥；恢复演练仍需由运维者完成。",
                "Includes the database, version manifest, and passphrase-encrypted secrets; the operator must still test recovery.",
              )}
            </p>
          </div>
          {data.actorRole === "owner" ? (
            <ActionLink href="/admin/backup" size="sm" variant="secondary">
              {text("创建备份", "Create backup")}
            </ActionLink>
          ) : (
            <Badge tone="neutral">{text("仅 Owner", "Owner only")}</Badge>
          )}
        </Card>
        <Card>
          <span className="operation-icon violet">
            <Activity aria-hidden="true" size={19} />
          </span>
          <div>
            <strong>{text("审计事件", "Audit events")}</strong>
            <p>
              {data.privacy.auditEvents}{" "}
              {text(
                "条不含密钥的配置与权限事件",
                "secret-free configuration and permission events",
              )}
            </p>
          </div>
          <Button
            aria-expanded={showAudit}
            onClick={() => setShowAudit((current) => !current)}
            size="sm"
            variant="secondary"
          >
            {showAudit
              ? text("收起日志", "Hide log")
              : text("查看日志", "View log")}
          </Button>
        </Card>
        {showAudit ? (
          <Card className="audit-log-card">
            <div className="card-title-row">
              <div>
                <p className="eyebrow">Audit</p>
                <h2>{text("最近 20 条事件", "Latest 20 events")}</h2>
              </div>
              <Badge tone="neutral">{data.privacy.recentAudit.length}</Badge>
            </div>
            {data.privacy.recentAudit.length === 0 ? (
              <p className="panel-note">
                {text("暂无审计事件。", "No audit events yet.")}
              </p>
            ) : (
              <ol className="audit-event-list">
                {data.privacy.recentAudit.map((event) => (
                  <li key={event.id}>
                    <span>
                      <strong>{event.action}</strong>
                      <small>
                        {event.targetType}
                        {event.targetId ? ` · ${event.targetId}` : ""}
                      </small>
                    </span>
                    <span>
                      <Badge
                        tone={event.result === "success" ? "green" : "amber"}
                      >
                        {event.result}
                      </Badge>
                      <time dateTime={event.occurredAt}>
                        {event.occurredAt
                          ? new Date(event.occurredAt).toLocaleString()
                          : "—"}
                      </time>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}

function HealthCard({
  icon: Icon,
  state,
  title,
  value,
  detail,
}: {
  icon: typeof Cloud;
  state: "healthy" | "warning" | "error";
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className={`health-card health-${state}`}>
      <span className="health-icon">
        {state === "healthy" ? (
          <CheckCircle2 aria-hidden="true" size={18} />
        ) : (
          <Icon aria-hidden="true" size={18} />
        )}
      </span>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </Card>
  );
}
