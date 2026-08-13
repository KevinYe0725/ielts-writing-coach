# IELTS Writing Coach

[English](./README.md) | [简体中文](./README.zh-CN.md)

IELTS Writing Coach 是一个开源、可自托管的 IELTS Academic 与 General Training Writing Task 2 学习系统。它会把每篇作文推进为完整训练闭环：限时首写、基于证据的评估、针对性主动练习、延迟闭卷重写、版本比较，以及之后的陌生语境迁移检测。

> [!IMPORTANT]
> 所有 Band 分数均为 AI 估分，并非 IELTS 官方成绩。本项目独立开发，与 IELTS、Cambridge University Press & Assessment、British Council 或 IDP 均无隶属、合作或背书关系。

## 项目状态

当前源码以 v1.0.0 为目标；在版本化人工审查证据、真实 Provider 完整闭环、云模板验收和 Release 工作流全部通过前，项目不会宣称已有稳定版本。带标签的 GitHub Release 出现之前，`main` 仅是发布候选。正式发布后按语义化版本管理兼容性；只要部署中保存了重要学习数据，仍应固定使用明确的发布标签或镜像摘要，并在换版本前阅读[升级指南](./docs/operations/upgrading.md)。

## 系统做什么

系统负责自动化刻意练习中的流程管理，但把真正产生学习效果的工作留给学习者：

1. 选择或粘贴一道 Task 2 题目；
2. 在 40 分钟内完成 Version 1；
3. 获得带原文证据的 TR、CC、LR 与 GRA 评估；
4. 围绕本篇最高优先级问题完成专项课；
5. 经过真实时间间隔后，闭卷重写；
6. 比较 Version 1 与 Version 2；
7. 在陌生语境中再次检测同一能力。

Web 应用和仓库内的 Codex Skill 共用带版本的学习契约。一节专项课最多只能提供短期的 `applied` 证据；只有延迟、独立的输出才能把能力推进为 `retained` 或 `transferred`。

## 技术架构

- Next.js Web 应用：学习者与管理员界面
- Graphile Worker：持久化 AI 后台任务
- PostgreSQL：应用数据与任务队列
- TypeScript 共享包：AI 适配器、学习契约、学习规则、认证与数据访问
- 仓库内可发现的 `coach-ielts-writing` Codex Skill

v1 架构不依赖 Redis、对象存储或任何闭源托管后端。设计依据见 [ADR 0001](./docs/adr/0001-modular-monolith.md)。

## 使用 Docker Compose 快速启动

要求：Docker Engine、Docker Compose v2 与 OpenSSL。数据库与 Web 端口默认都只绑定到 `127.0.0.1`。如需通过受维护的反向代理发布 Web，请显式设置 `IWC_BIND_ADDRESS` 并配置 HTTPS；不要暴露 PostgreSQL。

```bash
cp .env.example .env
printf '\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> .env
docker compose up -d --build
docker compose logs bootstrap
curl --fail http://127.0.0.1:3000/api/v1/health/ready
```

首次创建密钥卷时，`bootstrap` 日志会输出一次性初始化令牌。打开 `http://127.0.0.1:3000/setup?token=YOUR_TOKEN`，创建所有者账号并配置 AI 服务。应用不会把已经保存的 AI provider 密钥发送到浏览器端代码。

自动生成的认证密钥、加密密钥和初始化令牌保存在 `iwc_secrets` Docker 卷中。必须将该卷与数据库一起备份；丢失加密密钥会导致已经持久化的 provider 凭据无法解密。存入真实学习数据前，请先阅读[备份与恢复手册](./docs/operations/backup-restore.md)。

停止应用但保留数据：

```bash
docker compose down
```

除非你明确要删除数据库和自动生成的密钥，否则不要添加 `--volumes`。

## 本地开发

要求：Node.js 24.14 或更高版本、pnpm 11.16、Docker Compose v2 与 OpenSSL。

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres
export DATABASE_URL='postgresql://iwc:iwc-local-only@127.0.0.1:5433/iwc'
export AUTH_SECRET="$(openssl rand -base64 48)"
export APP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export SETUP_TOKEN="$(openssl rand -base64 24)"
pnpm db:migrate
pnpm db:seed
pnpm dev
```

打开 `http://127.0.0.1:3000/setup?token=$SETUP_TOKEN`。开发命令会同时启动 Web 和独立 Worker。这里明确设置的 `DATABASE_URL` 使用 `5433`，因为它是 `compose.yaml` 暴露到宿主机的端口；容器内部仍然使用 `5432`。

提交 Pull Request 前运行：

```bash
pnpm validate
pnpm test:e2e
pnpm skill:validate
pnpm skill:forward:validate
```

测试范围、隐私要求、契约变更规则和每个 commit 必须包含的 DCO 签署方式见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 部署支持范围

| 目标           | 支持级别           | 配置文件                                                                                   |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| Docker Compose | Tier 1             | [`compose.yaml`](./compose.yaml)                                                           |
| Railway        | Tier 1             | [`railway.web.toml`](./railway.web.toml) 与 [`railway.worker.toml`](./railway.worker.toml) |
| Render         | 社区示例，尽力维护 | [`render.yaml`](./render.yaml)                                                             |

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/n6tTY8)

Railway 模板会创建 PostgreSQL 17、独立 Web 和独立 Worker。加入此链接前，已用公网
`/api/v1/health/ready` 完成真实部署验收。

Tier 1 表示该目标的文档或配置回归会阻塞项目发布，但不代表项目提供托管 SLA。Render Blueprint 只是社区维护的起点；套餐、平台行为、数据库迁移顺序、备份方式和费用均需部署者自行复核。

部署到 Railway 或 Render 前，请阅读[部署指南](./docs/deployment.md)，其中列出了服务拓扑、共享密钥、迁移顺序和平台专项验证方法。

## 运维

- 受支持的 Compose 命令（必须始终显式传入准确 project）：

  ```bash
  pnpm compose:doctor -- --project ielts-writing-coach
  pnpm compose:backup -- --project ielts-writing-coach
  pnpm compose:restore -- --project recovery --archive /secure/backup.iwc-backup --confirm "RESTORE recovery"
  pnpm compose:upgrade -- --project ielts-writing-coach --image ghcr.io/kevinye0725/ielts-writing-coach:1.0.0 --confirm "UPGRADE ielts-writing-coach TO ghcr.io/kevinye0725/ielts-writing-coach:1.0.0"
  ```

  在真实数据上操作前，先阅读各命令的 `--help`。备份是完整加密的
  `.iwc-backup` 文件，包含 PostgreSQL custom dump、版本化 manifest、校验和，
  以及二次加密的实例密钥信封。恢复会先认证并完整校验归档，随后才修改显式
  命名的 project；升级会在通过可验证的升级前备份之前拒绝拉取新镜像。

- [备份与恢复](./docs/operations/backup-restore.md)
- [升级与回滚](./docs/operations/upgrading.md)
- 健康检查：`/api/v1/health/live` 检测 Web 进程存活；`/api/v1/health/ready` 同时检查配置、迁移版本、数据库连接和新鲜的 Worker 心跳
- 兼容版本：`/api/version`（亦可用 `/api/v1/version`）公开应用、数据库、契约、规划器、Prompt、Rubric 与交换格式版本

## Codex Skill

仓库内 Skill 位于 `.agents/skills/coach-ielts-writing`，从本仓库启动 Codex 时会自动发现。若完全不使用 Web，可让 Codex 使用内置 `$skill-installer` 从固定标签路径安装：

```text
Use $skill-installer to install https://github.com/KevinYe0725/ielts-writing-coach/tree/v1.0.0/.agents/skills/coach-ielts-writing
```

安装后的 Skill 会在下一次 Codex 对话中可用。它只依赖 Python 3.11 标准库，把学习状态写入所选 workspace 下的 `.coach-ielts-writing/`，不会另外调用 AI API。正式标签 Release 也会附带独立 Skill ZIP；建议固定标签，不要安装会变化的 `main`。

维护者使用 `pnpm skill:validate` 检查结构，使用 `pnpm skill:forward:validate` 验证仓库内 10+ 个独立 ephemeral Codex 会话证据；`pnpm skill:forward` 会有意重新执行一次真实、会产生模型用量的 forward suite。版本对应关系见[兼容矩阵](./docs/compatibility.md)，验收机制见 [fresh-agent 协议](./tests/skill-forward/README.md)。

## 安全与隐私

请勿把真实作文、provider 凭据、数据库备份、会话 Cookie 或其他个人数据放入 issue、测试 fixture、截图或 Pull Request。API key 始终留在服务端；持久化的 provider 凭据由部署者提供的 `APP_ENCRYPTION_KEY` 加密。

发现漏洞时请按 [SECURITY.md](./SECURITY.md) 私下报告，不要创建公开 issue。

## 许可证与贡献

源代码与文档依据 [Apache License 2.0](./LICENSE) 发布，署名信息见 [NOTICE](./NOTICE)。每个贡献 commit 都必须签署 [Developer Certificate of Origin 1.1](./DCO.md)；项目不要求转让版权。

参与贡献前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。
