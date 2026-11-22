# Upstream

本 bundle 是两份 MIT 项目的衍生作品。上游原样快照在 `vendor/`，本文件记录差量。

| 上游 | 版本 | 取证方式 | 本地快照 |
|---|---|---|---|
| Superpowers（obra/superpowers） | 7.0.2 | 源目录 `测试项目/superpowers-main`（package.json / .version-bump.json） | `vendor/superpowers/` |
| ECC（affaan-m/ECC） | 2.2.3 | 源目录 `测试项目/ECC-main`（VERSION / package.json） | `vendor/ecc/`（仅 rules/common 与 eval-harness） |

## 我们的改动（Skills）

| # | 改动 | 范围 | 理由 |
|---|---|---|---|
| 1 | 去掉技能引用的命名空间：`superpowers:<skill>` → `<skill>` | 8 个技能中的交叉引用 | DSH 的技能名不带命名空间；不装 JS 钩子也能互相指到 |
| 2 | 关闭视觉伴生：删除 `brainstorming/visual-companion.md` 与 `scripts/`；把 `## Visual Companion` 节改为"本部署不提供" | `skills/brainstorming/` | 需要 25KB Node 服务器 + 216 行 bash 启动器；当前工作以文字决策为主，收益不足以维护一套进程管理 |
| 3 | （v0.2 计划）把 6 个无扩展名 bash helper 移植成 Node | `executing-plans/scripts/`、`subagent-driven-development/scripts/` | 本机 `bash` 不在 PATH；移植后去掉对 Git bash 绝对路径的依赖 |
| 4 | 新增 `using-superpowers/references/dsh-tools.md`，并在 "Platform Adaptation" 列表加 DSH 一行 | `skills/using-superpowers/` | 上游按 harness 提供动作→工具映射，本文件就是 DSH 的适配层 |

**没有改的**：技能正文的方法论、HARD-GATE、Red Flags 表、prompt 模板。它们是对照价值所在。

## 技能取舍

v0.1 只装 8 个（入口 + 计划 + 执行 + 评审 + 验证）。留在 `vendor/` 未装的 7 个：

`test-driven-development`、`systematic-debugging`、`using-git-worktrees`、`finishing-a-development-branch`、`dispatching-parallel-agents`、`diagnosing-superpowers`、`writing-skills`。

其中 `diagnosing-superpowers` 会往 `~/.superpowers/` 写文件，与本项目"文件留在项目内"冲突，重新启用前要先改路径。

## 升级流程

1. 拉上游新版本到 `vendor/`（替换快照）。
2. `diff -r vendor/superpowers/skills skills` 看本文件表格是否有新增差量。
3. 重跑 `node scripts/check-preset.mjs` 与 `tests/acceptance.md`。
4. 在上表补一行日期与版本。
