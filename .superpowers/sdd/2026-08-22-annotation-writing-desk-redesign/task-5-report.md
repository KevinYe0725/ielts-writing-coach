# Task 5 报告：WritingRoom 与延迟重写展示迁移

## 状态

- **完成**：WritingRoom 已迁移到批注写作桌视觉层，桌面题纸/编辑区为 38% / 62%，位于需求允许的 36–40% / 60–64% 区间。
- **完成**：390×844 下考试规则仍可见；未隐藏 40 分钟、关闭拼写/语法/AI、至少 250 词三条规则。
- **完成**：Version 2 前 35 分钟仍只显示封存说明，最后 5 分钟仅在 blind snapshot 成功后显示抽象目标。
- **功能零变化**：未修改 API/client、state machine、IndexedDB schema/storage keys、提交/冲突处理器或任何路由目标。
- BASE：`9bbbd27e433ca498dbadf8a322a519e770ad9213`
- Commit：`feat: redesign the timed writing workspace`（本报告随实现提交；最终哈希以 `git log -1` 为准）

## 文件

- 新建 `apps/web/src/components/writing-room.module.css`
- 修改 `apps/web/src/components/writing-room.tsx`
- 修改 `tests/e2e/writing-rewrite.spec.ts`
- 修改 `tests/e2e/redesign-contracts.spec.ts`
- 新建本报告
- `apps/web/src/app/write/page.tsx` 与 `apps/web/src/app/rewrite/page.tsx` 无需重复改动：Task 3 已在 `AppShell` 按 pathname 统一提供 `main[data-page-layout="workspace"]`；本任务直接复用该前置接口，且 `git diff --quiet BASE -- 两个页面` 通过。

## RED / GREEN

### RED

命令：

```bash
PATH=/opt/homebrew/opt/node@24/bin:$PATH NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/writing-rewrite.spec.ts tests/e2e/redesign-contracts.spec.ts --project=chromium --workers=1
```

结果：`2 failed, 20 passed`。

- 桌面几何：`[data-writing-mode="first"]` 不存在。
- 移动规则：`构思、写作和检查均计入 40 分钟` 被旧媒体查询隐藏。

### GREEN

同一命令再次执行：`22 passed (12.9s)`。

- 新 DOM 同时保留 frozen legacy class 与 CSS Module class：`writing-room`、`writing-prompt`、`writing-editor`。
- 1440px 下真实 bounding box 断言证明 38% / 62% 落入合同区间。
- 390×844 下 40 分钟与至少 250 词均为 visible，且 `main[data-page-layout="workspace"]` 保持不变。

## 自动保存、计时与冲突冻结证据

- **650ms autosave**：`writing-room.tsx` 的 `setTimeout(..., 650)`、generation guard、`persistDraft`、提交时取消 pending autosave 均未改。键盘保存/提交 E2E 通过。
- **IndexedDB 本地草稿**：`cacheWritingDraft` / `readCachedWritingDraft` / `removeCachedWritingDraft` 调用与 key 结构未改；“服务器版本 / 恢复本地草稿”E2E 通过。
- **服务器冲突**：`DraftConflictError` 分支、`keepServerDraft`、刷新 ETag 后 `restoreLocalDraft` 的逻辑未改；全量 web unit tests 覆盖 typed optimistic-concurrency conflict 并通过。
- **40 分钟与归零提交**：`remaining = 40 * 60`、deadline 计算、`remaining <= 0` 自动调用 `submit()`、locked guard 均未改。V2 clock E2E 从 `40:00` 到 `05:00` 通过。
- **提交锁定**：`locked` 禁用 textarea/button、`ATTEMPT_LOCKED` / `ATTEMPT_ALREADY_SUBMITTED` 竞态处理与目的路由未改。
- **V2 blind snapshot**：`before` 封存、失败时保持 error 且不展示目标、提交时 `after` 封存均未改；35/5 分钟 E2E 通过。
- **输入约束**：`spellCheck={false}`、`autoCorrect="off"`、250 词提示与原 40 词提交门槛均未改。
- **路由冻结**：两个 page 文件、`learning-route.ts` 与所有 `router.push(...)` 均未改；现有显式 cycle/task 路由 E2E 通过。

`git diff --unified=0 BASE -- writing-room.tsx` 只显示：样式 imports、rewrite unlock 倒计时 lint 等价修复、wrapper/classes 与 `data-writing-mode`；以上状态机区域无 diff。

## Lint 修复说明

BASE 的 `react-hooks/set-state-in-effect` 错误位于 rewrite **开放倒计时文案** effect，而非 40 分钟写作计时器。修复仅把 effect 内的同步首 tick/reset 改为 0ms `window.setTimeout`，并补充 timeout cleanup；目标时间、每秒 interval、格式化逻辑与归零行为完全不变。

- 变更前定向 lint：`1 error`，`writing-room.tsx:111 react-hooks/set-state-in-effect`。
- 变更后全量 web lint：`0 errors, 4 warnings`；4 条 warning 均在未修改的 `layout.tsx`、`page-layout.tsx`、`locale-provider.tsx`。

## 验证

- Writing + accessibility E2E：`18 passed (18.9s)`。
- Writing + redesign contracts E2E：`22 passed (12.9s)`。
- Web unit tests：`258 passed, 53 skipped`（30 files passed，11 files skipped）。
- Web typecheck：通过，exit 0。
- Web lint：0 errors；4 条既有、非变更文件 warning。
- `git diff --check`：通过。

## 真实浏览器视觉 QA

- `output/playwright/task-5-writing-desktop.png`：1440×960 首写桌面，题纸/编辑区清晰分栏，规则、计时与提交操作可见。
- `output/playwright/task-5-writing-mobile.png`：390×844 首写移动端，规则完整呈现、无水平溢出，编辑区顺序正确。
- `output/playwright/task-5-rewrite-desktop.png`：1440×960 V2，完整显示 blind-rewrite 顶部提示与锁定的最后 5 分钟自检框，未泄露目标。

三张截图均人工查看；视觉签名为题纸左侧的克制红色批注边线，其他区域沿用 Task 2 的 desk tokens、字体和间距。未新增无关动画或装饰。

## 自审

- 需求逐项复核：40 分钟、650ms、快捷键、归零提交、IndexedDB、冲突选择、锁定、spellcheck/AI、250 词、V2 35/5、snapshot 失败文案、route 目标均保留。
- DOM 变更只增加 wrapper class、CSS Module class 和 `data-writing-mode`；textarea、dialogs、handlers 的顺序和内容未改。
- CSS Module 覆盖旧 negative-margin/viewport width 计算，直接吃 Task 3 的 workspace 宽度；legacy class 仍保留供迁移期间的既有选择器与测试使用。
- 移动端没有通过 `display:none` 隐藏规则；题纸在编辑区之前，符合考试阅读顺序。
- 未触碰用户不相关改动；由 Next dev 自动改写的 `next-env.d.ts` 已恢复。

## Concerns

- `mind` MCP 在本会话未注册，无法执行 AGENTS.md 要求的 Mind 查询/持久化；未保存任何敏感或替代记忆。
- demo 模式真实浏览器中 `/api/v1/auth/get-session` 返回既有 503；页面数据、快照、交互和 E2E 均正常，未发现本任务引入的浏览器错误。
- 视觉截图位于已忽略的 `output/playwright/`，用于本地 QA，不纳入产品提交。
