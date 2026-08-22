# Task 9 Report — Compare / Transfer / Growth Evidence Records

## Status

- 状态：完成
- 功能提交：`47694ad` (`feat: present learning progress as evidence`)
- 基线：`eb32bb76bb7bf1df89ce64ff882932c5b0e57c61`
- 分支：`codex/frontend-redesign`

## Outcome

- Compare 已重组为 V1 → V2 → 同量表四项变化 → 每 100 词复发 → resolved/improved/watch → 下一次证据的时间顺序档案。
- Transfer 已重组为闭卷开始 → 8 分钟首答封存 → 1.5 秒服务器轮询 → PASS/FAIL/NO_OPPORTUNITY 的证据协议，并为 READY、processing、PASS、FAIL、NO_OPPORTUNITY、evaluation failure、expired、reschedule、Mock 结果保留独立展示状态。
- Growth 使用完整 diagnosed/practicing/applied/retained/transferred 五级档案；`growthEvidenceState` 映射为 unavailable/revision/active/verified/verified。applied 是 active blue，retained/transferred 是 verified green。
- 分数与统计仍可见，但降为辅助证据；HTTP 无 score history 时明确显示“不生成趋势”。

## RED

1. 首轮聚焦测试：13 项中 6 项按预期失败、7 项既有契约通过。失败原因均为新证据记录、状态标记与五级映射尚不存在。
2. 移动视觉回归测试先失败：Compare “本次证据”宽度仅 37px，被长说明挤成逐字竖排。
3. 辅助字测试先失败：`0.75rem` 在当前根字号下计算为 11.84px，低于 12px 门槛。

## GREEN

- Demo 聚焦 Playwright：`14 passed, 5 skipped`；5 项 skip 是专门要求 `NEXT_PUBLIC_DEMO_MODE=false` 的 HTTP 状态用例。
- HTTP 状态 Playwright：`5 passed`，覆盖 processing、PASS、FAIL、evaluation failure 与 Growth 无历史不造趋势。
- 桌面/移动证据记录专项：`2 passed`，每页均检查无横向溢出、基础 ARIA/landmark、唯一 H1、字段标签与辅助字不少于 12px。
- Web unit：`258 passed, 53 skipped`（30 test files passed，11 skipped）。
- Web typecheck：通过。
- Web lint：0 errors；4 个既有 Fast Refresh warnings，均不在 Task 9 文件。
- Prettier scoped check：通过。
- `git diff --check`：通过。
- Demo HTTP：Compare、Transfer、Growth 页面均返回 200；`/api/v1/health/live` 返回 200。

## Frozen contracts

- 未修改 API、client、state 或 storage。
- Compare 保留 V1/V2 同 rubric 总分、四项 delta、每 100 词复发、retained gate、模型范文数据门与 `data.nextTask.href` 原样透传。
- Transfer 保留 cycle + task route identity、90–140 仅计数提示、首次答案冻结、1.5s 轮询、服务器结果、Mock 不评分、无自然机会和过期重排逻辑。
- Growth 不修改服务端状态值、证据计数、复发率、目标值或趋势数据。
- Workspace/Reading route identity、既有 hooks 与 ARIA live/busy 行为保留。

## Screenshots

- `output/playwright/task-9/compare-desktop.png`
- `output/playwright/task-9/compare-mobile.png`
- `output/playwright/task-9/transfer-desktop.png`
- `output/playwright/task-9/transfer-mobile.png`
- `output/playwright/task-9/growth-desktop.png`
- `output/playwright/task-9/growth-mobile.png`

这些 QA 截图位于 gitignored 的 `output/`，未进入功能提交。

## Concerns

- Demo 视觉 QA 在未启动真实认证后端时，`/api/v1/auth/get-session` 返回 503 并产生控制台噪音；三页本身与 health endpoint 均为 200，证据页面测试不受影响。
- 仓库 lint 仍有 4 个既有 `react-refresh/only-export-components` warnings（`app/layout.tsx`、`components/layout/page-layout.tsx`、`components/locale-provider.tsx`），Task 9 未新增 lint warning。
- 当前运行环境未暴露 Mind MCP 工具，因此无法按 AGENTS.md 写入 Mind；未以替代工具写入持久记忆。
