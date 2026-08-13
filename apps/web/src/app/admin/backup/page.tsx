"use client";

import { useCallback, useState } from "react";
import { Download, LockKeyhole } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { useDemoResource } from "@/components/use-demo-resource";
import { learningClient } from "@/lib/client";

function fileNameFromDisposition(value: string | null): string {
  return (
    value?.match(/filename="([^"]+)"/u)?.[1] ?? "ielts-writing-coach.iwc-backup"
  );
}

export default function BackupPage() {
  const { text } = useLocale();
  const statusLoader = useCallback(() => learningClient.getSystemStatus(), []);
  const { data: status, loading } = useDemoResource(statusLoader);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const createBackup = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/admin/backups", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          passphrase,
          confirmation,
        }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          problem?.detail ??
            text("无法创建备份。", "The backup could not be created."),
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const archiveName = fileNameFromDisposition(
        response.headers.get("content-disposition"),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = archiveName;
      anchor.click();
      URL.revokeObjectURL(url);
      const checksum = response.headers.get("x-iwc-backup-sha256");
      if (checksum) {
        const checksumUrl = URL.createObjectURL(
          new Blob([`${checksum}  ${archiveName}\n`], {
            type: "text/plain;charset=utf-8",
          }),
        );
        const checksumAnchor = document.createElement("a");
        checksumAnchor.href = checksumUrl;
        checksumAnchor.download = `${archiveName}.sha256`;
        checksumAnchor.click();
        URL.revokeObjectURL(checksumUrl);
      }
      setPassphrase("");
      setConfirmation("");
      setMessage(
        text(
          "加密实例备份已下载。请把口令存入独立密码管理器，并按恢复手册验证归档。",
          "The fully encrypted instance backup and checksum were downloaded. Store its passphrase separately and verify the archive with the restore runbook.",
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : text("无法创建备份。", "The backup could not be created."),
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading || !status) {
    return (
      <Skeleton
        label={text("正在验证 Owner 权限…", "Verifying owner access…")}
      />
    );
  }
  if (status.actorRole !== "owner") {
    return (
      <>
        <PageHeader
          eyebrow={text("仅 Owner 可执行", "Owner only")}
          title={text("创建实例备份", "Create instance backup")}
          description={text(
            "管理员可以查看健康状态，但只有实例 Owner 可以导出恢复密钥。",
            "Administrators may inspect health, but only the instance owner can export recovery secrets.",
          )}
        />
        <Card>
          <p className="panel-note">
            {text(
              "请由实例 Owner 执行此操作。",
              "Ask the instance owner to perform this operation.",
            )}
          </p>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow={text("仅 Owner 可执行", "Owner only")}
        title={text("创建实例备份", "Create instance backup")}
        description={text(
          "下载整体口令加密的 PostgreSQL dump、版本清单和实例密钥。",
          "Download a fully passphrase-encrypted PostgreSQL dump, version manifest, and instance secrets.",
        )}
      />
      <Card className="admin-panel">
        <div className="card-title-row">
          <div>
            <p className="eyebrow">Portable recovery</p>
            <h2>{text("加密恢复归档", "Encrypted recovery archive")}</h2>
          </div>
          <LockKeyhole aria-hidden="true" size={22} />
        </div>
        <p className="panel-note">
          {text(
            "整个归档（包括作文）用下方口令加密；Provider 密钥在数据库中仍是密文，实例主密钥还会二次加密。SMTP、环境变量 Provider 凭据和 DATABASE_URL 不会进入归档。",
            "The complete archive, including essays, is encrypted with the passphrase below. Provider credentials remain database ciphertext and the instance key is encrypted again. SMTP credentials, environment-managed provider keys, and DATABASE_URL are omitted.",
          )}
        </p>
        <div className="settings-fields">
          <div className="form-field form-field-wide">
            <label htmlFor="backup-passphrase">
              {text(
                "备份口令（至少 12 个字符）",
                "Backup passphrase (12+ characters)",
              )}
            </label>
            <input
              autoComplete="new-password"
              id="backup-passphrase"
              onChange={(event) => setPassphrase(event.target.value)}
              type="password"
              value={passphrase}
            />
          </div>
          <div className="form-field form-field-wide">
            <label htmlFor="backup-confirmation">
              {text(
                "输入 CREATE ENCRYPTED INSTANCE BACKUP 以确认",
                "Type CREATE ENCRYPTED INSTANCE BACKUP to confirm",
              )}
            </label>
            <input
              autoComplete="off"
              id="backup-confirmation"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </div>
        </div>
        <div className="settings-savebar">
          <span>
            {text(
              "下载完成不等于备份已验证；请执行 CLI doctor/restore 演练。",
              "A download is not a verified backup; perform the CLI doctor/restore drill.",
            )}
          </span>
          <Button
            disabled={
              creating ||
              passphrase.length < 12 ||
              confirmation !== "CREATE ENCRYPTED INSTANCE BACKUP"
            }
            onClick={() => void createBackup()}
          >
            <Download aria-hidden="true" size={17} />
            {creating
              ? text("正在创建…", "Creating…")
              : text("创建并下载", "Create and download")}
          </Button>
        </div>
        {message ? (
          <p aria-live="polite" className="panel-note">
            {message}
          </p>
        ) : null}
      </Card>
    </>
  );
}
