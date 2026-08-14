<div align="center">

<img src="https://raw.githubusercontent.com/KevinYe0725/ielts-writing-coach/main/assets/logo.svg" alt="IELTS Writing Coach logo" width="96" height="96" />

# IELTS Writing Coach

**自托管的雅思写作 Task 2 学习闭环系统。**

限时初稿 · 基于证据的评分反馈 · 专项训练最弱技能 · 延迟闭卷重写 · 真正记住并迁移到考场。

[![CI](https://img.shields.io/github/actions/workflow/status/KevinYe0725/ielts-writing-coach/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/KevinYe0725/ielts-writing-coach/actions/workflows/ci.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/KevinYe0725/ielts-writing-coach/codeql.yml?branch=main&style=for-the-badge&label=CodeQL)](https://github.com/KevinYe0725/ielts-writing-coach/actions/workflows/codeql.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge)](./LICENSE)
[![Node.js >= 24.14](https://img.shields.io/badge/Node.js-%3E%3D24.14-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)](./package.json)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](./compose.yaml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](./CONTRIBUTING.md)

[English](./README.md) · **简体中文**

</div>

---

> [!IMPORTANT]
> 分数是 AI 估算结果，不是雅思官方成绩。本项目独立开发，与雅思官方（IELTS）、剑桥大学出版社与考评院（Cambridge University Press & Assessment）、英国文化协会（British Council）及 IDP 无任何隶属或背书关系。

IELTS Writing Coach 把每一篇作文变成一次**完整的学习循环**：限时初稿 → 基于证据的评分 → 针对性主动练习 → 延迟闭卷重写 → 版本对比 → 迁移检验。不仅写得更好，而且真正记得住。

## ✨ 为什么选择 IELTS Writing Coach？

大多数 AI 批改工具只会把你的作文"改一遍"。IELTS Writing Coach 基于刻意练习与间隔提取的学习科学设计：

|                          |                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 🔍 **基于证据的评分**    | 每一项 TR / CC / LR / GRA 评分都附带从你作文中引用的原文证据、评分标准版本和诚实的置信度——让你知道*为什么*，而不只是*多少分*。 |
| 🎯 **针对性主动练习**    | 每节课程都围绕你作文中最突出的一个弱点生成，并保证至少 65% 的时间在主动输出——拒绝被动刷视频式学习。                            |
| ⏳ **延迟闭卷重写**      | 经过一段真实的时间间隔后，凭记忆闭卷重写第二版。看懂反馈很容易，回忆并应用它才是真正的考场能力。                               |
| 🔒 **自托管 · 隐私优先** | 用 Docker Compose 跑在你自己的机器上。API 密钥仅存服务端并加密落盘，你的作文永远不会离开你的基础设施。                         |

## 🔄 学习闭环

每篇作文都经历相同的七个步骤：

```mermaid
flowchart LR
    A["📝 <b>写作</b><br/>40 分钟限时初稿"] --> B["🔍 <b>评分</b><br/>基于证据的 TR · CC · LR · GRA"]
    B --> C["🎯 <b>练习</b><br/>针对最弱技能的专项课程"]
    C --> D["⏳ <b>重写</b><br/>真实间隔后的闭卷重写"]
    D --> E["⚖️ <b>对比</b><br/>第一版 vs 第二版"]
    E --> F["🚀 <b>迁移</b><br/>同一技能 · 全新题目"]
    F -.->|"反复循环直至掌握"| A
```

| 评分项  | 考察内容                                                                 |
| ------- | ------------------------------------------------------------------------ |
| **TR**  | 任务回应（Task Response）——是否完整回答了题目                            |
| **CC**  | 连贯与衔接（Coherence & Cohesion）——论证是否组织有序、衔接自然           |
| **LR**  | 词汇资源（Lexical Resource）——词汇的广度与精准度                         |
| **GRA** | 语法范围与准确性（Grammatical Range & Accuracy）——句式多样性与语法控制力 |

技能进步由**证据门槛**判定，而不是由练习次数判定：

```mermaid
flowchart LR
    X["🆕 未证明"] --> Y["📚 <b>已应用</b><br/>在引导练习中使用"]
    Y --> Z["🧠 <b>已保持</b><br/>延迟后仍能回忆"]
    Z --> W["🚀 <b>已迁移</b><br/>在陌生语境中使用"]
```

课程只能证明 `applied`（已应用）。`retained`（已保持）需要延迟后的独立表现，`transferred`（已迁移）需要在全新语境中使用该技能——杜绝虚假掌握。

## 🚀 功能一览

### ✍️ 写作与评分

- 无干扰**写作间**：40 分钟倒计时、实时字数统计
- **120 道内置 Task 2 题目**（8 大话题 × 5 种题型），也可粘贴自定义题目
- 四项评分（TR、CC、LR、GRA），附原文证据引用与半档估分
- 评分标准版本固定（rubric-version pinning），每项分数都可追溯到产生它的具体标准

### 🎯 专项练习

- 根据你作文中优先级最高的一个问题自动生成个性化课程
- 识别与选择题型不超过 25%，至少 65% 主动输出
- 每节课只设一个必学核心目标——深度练习，而非表面覆盖

### ⏳ 保持与迁移

- 延迟闭卷重写（第二版），如实记录是否借助了提示
- 使用同一版评分标准的**版本对比**
- **迁移检验**：在陌生话题和不同题型中检验同一技能
- 成长档案按技能汇总证据——绝不用练习量冒充掌握度

### 🛠️ 平台能力

- **学员端**——今日计划、写作间、评分报告、专项课程、成长档案、设置
- **管理端**——账号管理、SMTP 测试、恢复链接管理
- 双语界面：**English / 简体中文**
- 20+ 家 AI 提供商预设，支持任意 OpenAI 兼容接口；每个模型启用前都会先探测验证
- 提供商密钥加密存储、SMTP 邮件支持、健康检查端点、加密备份

## 🏗️ 技术架构

模块化单体（modular monolith）：单一部署单元、持久化任务队列，无需 Redis、对象存储或任何专有后端。

```mermaid
flowchart TB
    subgraph B["🖥️ 浏览器"]
        L["🧑‍🎓 学员"]
        M["🛠️ 管理员"]
    end
    subgraph S["自托管服务"]
        W["@iwc/web<br/>Next.js"]
        K["@iwc/worker<br/>Graphile Worker"]
        P[("PostgreSQL 17<br/>业务数据 + 持久化任务队列")]
        G["共享包<br/>ai · learning-core · contracts · auth · db · question-bank · exchange · email · config"]
    end
    I["🧠 20+ 家 AI 提供商"]
    C["💻 Codex Skill<br/>coach-ielts-writing"]
    O["本地学习状态<br/>.coach-ielts-writing"]

    L --> W
    M --> W
    W --> P
    W --> G
    W --> K
    K --> P
    K --> G
    K --> I
    G --> I
    C -.->|"独立运行 · Python 3.11 标准库 · 无需 AI API"| O
```

| 层级     | 技术                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Web 应用 | Next.js、React、TypeScript                                                                                |
| 后台任务 | Graphile Worker（持久化 AI 评分与课程生成任务）                                                           |
| 数据库   | PostgreSQL 17（业务数据 + 任务队列）                                                                      |
| 共享包   | `ai`、`learning-core`、`learning-contracts`、`auth`、`db`、`question-bank`、`exchange`、`email`、`config` |
| 工程化   | pnpm workspaces、Docker Compose、GHCR 镜像                                                                |
| 质量保障 | ESLint、Prettier、Vitest、Playwright、CodeQL、DCO                                                         |

## 🚀 快速开始

环境要求：**Docker Engine + Docker Compose v2** 和 **OpenSSL**。仅此而已。

```bash
git clone https://github.com/KevinYe0725/ielts-writing-coach.git
cd ielts-writing-coach

cp .env.example .env
printf '\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" >> .env

docker compose up -d --build
docker compose logs bootstrap   # 打印一次性初始化令牌
```

1. 打开 `http://127.0.0.1:3000/setup?token=你的令牌`
2. 创建管理员账号并配置 AI 提供商
3. 验证就绪状态：`curl --fail http://127.0.0.1:3000/api/v1/health/ready`

> [!WARNING]
> 自动生成的认证、加密与初始化密钥存放在 `iwc_secrets` Docker 卷中。请将该卷与数据库备份一起妥善保管——丢失加密密钥将导致已存储的提供商凭据无法解密。开始存放真实学习数据前，请先阅读[备份与恢复手册](./docs/operations/backup-restore.md)。

Web 应用和 PostgreSQL 默认只绑定 `127.0.0.1`。如需通过反向代理对外发布，请显式设置 `IWC_BIND_ADDRESS`、配置 HTTPS，并且**切勿**暴露 PostgreSQL 端口。

### ⚡ 不用 Docker？一条命令搞定

更喜欢直接用本机环境？在 macOS 和 Linux 上，一条命令即可跑起整个系统，完全不需要 Docker：

```bash
brew install node@24 postgresql@17   # 仅首次需要（如缺失）

pnpm run:local        # 一条命令：PostgreSQL + 迁移 + 种子数据 + Web + Worker
pnpm run:local:stop   # 停止项目本地的 PostgreSQL
```

脚本会自动探测 Node.js ≥ 24.14、pnpm 11.16 与 PostgreSQL 17 二进制文件，在仓库内已 gitignore 的 `.local-run/` 目录中初始化项目专属的 PostgreSQL 集群（自动选择空闲端口）、生成稳定的密钥，并打印一次性初始化链接。任何时候用 `pnpm run:local` 重启即可——数据与账号都会保留。详情见 `scripts/local-run.sh --help`。

## 🧠 AI 提供商

内置 21 家提供商预设，另支持任意 OpenAI 兼容接口的自定义配置。每个选中的模型在成为评分通道前都会**先通过探测验证**，已存储的 API 密钥永远不会发送到浏览器端。

|              |                  |               |
| ------------ | ---------------- | ------------- |
| OpenAI       | Anthropic Claude | Google Gemini |
| DeepSeek     | 通义千问 Qwen    | Kimi          |
| GLM          | MiniMax          | Mistral       |
| xAI Grok     | Groq             | OpenRouter    |
| Together     | Fireworks        | Perplexity    |
| SiliconFlow  | NVIDIA NIM       | Cerebras      |
| Azure OpenAI | Ollama           | LM Studio     |

## ☁️ 部署

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/n6tTY8)

| 部署目标       | 支持级别           | 配置文件                                                                                  |
| -------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| Docker Compose | Tier 1             | [`compose.yaml`](./compose.yaml)                                                          |
| Railway        | Tier 1             | [`railway.web.toml`](./railway.web.toml) · [`railway.worker.toml`](./railway.worker.toml) |
| Render         | 社区示例，尽力维护 | [`render.yaml`](./render.yaml)                                                            |

Tier 1 表示该部署目标的文档与配置回归会被视为发布阻断项。部署前请阅读[部署指南](./docs/deployment.md)，其中涵盖服务拓扑、共享密钥、迁移顺序与平台验证。

## 💻 Codex Skill

更喜欢在终端里练习？仓库自带一个 **Codex Skill**，无需 Web 应用、无需调用 AI API 即可运行同样的学习闭环——仅用 Python 3.11 标准库，学习状态全部保存在本地。

```text
Use $skill-installer to install https://github.com/KevinYe0725/ielts-writing-coach/tree/v1.0.0/.agents/skills/coach-ielts-writing
```

Web 应用与 Skill 共享**带版本号的学习契约**，两端的进度与掌握度定义完全一致。请固定到发布标签（tag），不要安装随时变动的 `main`。

## 🛠️ 本地开发

环境要求：Node.js 24.14+、pnpm 11.16、Docker Compose v2、OpenSSL。

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

打开 `http://127.0.0.1:3000/setup?token=$SETUP_TOKEN`。提交 Pull Request 前请运行：

```bash
pnpm validate
pnpm test:e2e
pnpm skill:validate
pnpm skill:forward:validate
```

## 🔐 安全与隐私

- 提供商凭据使用运营者提供的 `APP_ENCRYPTION_KEY` 加密落盘
- 出站模型请求经过 SSRF 防护；API 密钥永不进入浏览器
- 全加密 `.iwc-backup` 备份归档，含版本化清单与校验和
- 升级前强制完成并通过验证的备份，否则拒绝拉取新镜像

请**不要在 issue、fixture、截图或 Pull Request 中**放置真实作文、凭据、数据库导出或会话 Cookie。发现安全漏洞请遵循 [SECURITY.md](./SECURITY.md)，不要公开提交 issue。

## 📚 文档

| 分类   | 链接                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 产品   | [PRD](./IELTS_Writing_Web_PRD.md) · [v1.0.0 发布说明](./docs/releases/v1.0.0.md) · [兼容性矩阵](./docs/compatibility.md)                                                                         |
| 知识库 | [评分与诊断](./docs/knowledge-base/scoring-and-diagnosis.md) · [反馈与修改](./docs/knowledge-base/feedback-and-revision.md) · [针对性教学设计](./docs/knowledge-base/focused-teaching-design.md) |
| 运维   | [备份与恢复](./docs/operations/backup-restore.md) · [升级与回滚](./docs/operations/upgrading.md) · [部署](./docs/deployment.md)                                                                  |
| 质量   | [人工复核协议](./docs/quality/human-review-protocol.md) · [v1 质量证据](./docs/quality/v1-quality-evidence.md) · [无障碍审查](./docs/quality/accessibility-review-v1.md)                         |
| 架构   | [ADR 0001 — 模块化单体](./docs/adr/0001-modular-monolith.md)                                                                                                                                     |

健康检查端点：`/api/v1/health/live`（进程存活）与 `/api/v1/health/ready`（配置、迁移、数据库连接、Worker 心跳）。版本元数据：`/api/version`。

## 🤝 参与贡献

欢迎贡献！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。每次提交都需要 [Developer Certificate of Origin 1.1](./DCO.md) 签名，无需转让著作权。

## 📄 许可证

源代码与文档使用 [Apache License 2.0](./LICENSE) 许可。署名信息见 [NOTICE](./NOTICE)。

---

<div align="center">

**如果这个项目对你有帮助，请点个 ⭐ 并分享给一起备考的朋友。**

为全球学习者用心打造。与雅思官方、剑桥、英国文化协会及 IDP 无任何隶属或背书关系。

</div>
