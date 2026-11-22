# 验收记录

判据只记实测结果；"通过"必须能指向下面的命令或会话 id。v0.1 的 M4 记录保留在文末作为基线。

## v0.2 — 六处缺口的关闭状态

| # | v0.1 的缺口 | v0.2 的处理 | 判据 | 结果 |
|---|---|---|---|---|
| ① | 执行阶段要求 TDD 时该技能不存在（v0.1 会话 seq 159 报错） | 补装 `test-driven-development`（正文只改一处命名空间） | `check-preset` 技能集断言 | **通过**（11 个技能） |
| ② | ECC 规则只有快照、没有落地 | 提炼为 `qh-judgment`（证据四档、审查分级、委派契约） | 自检"提炼技能标注 origin: ECC" + 技能内相对链接可解析 | **通过** |
| ③ | `eval-harness` 未移植 | 提炼为 `eval-harness`，判分器映射到 DSH 工具 | 同上 | **通过** |
| ④ | 门禁被一次性探测文件绕过（seq 68/71） | `brainstorming` HARD-GATE 明确"探索不写项目文件"，落文件探测须先声明并在 `.superpowers/scratch/` 用完删除，Red Flags 加一行 | `docs/evals/preset-gate-announcement.md` 的负样本 + 待跑的 M4b | **负样本通过；M4b 待跑** |
| ⑤ | 6 个 helper 是 bash，本机跑不起来 | 移植为 Node `.mjs`，语义/参数/退出码/输出对齐；13 处调用点改写 | `node --test` 19 例 | **通过（19/19）** |
| ⑥ | 自检只查结构不查行为 | `check-preset` 扩到 16 项；新增 `assert-session.mjs` 会话日志断言；19 例 helper 行为测试 | 两个命令全绿 | **通过** |

## 静态与行为检查（2026-11-22，本轮实测）

```
$ node scripts/check-preset.mjs
16 passed, 0 failed
  （行/分组/isolate/五字段、技能集与 frontmatter、链接可解析、helper 提及可解析且无 bash scripts/、
    无上游命名空间与家目录路径、helper 不管道捕获、import 可解析、persona 四条不变量、
    dsh-tools 动作映射、origin: ECC、包元数据与技能根、单文件 ≤32KB — 42 files / 206 KB）

$ node --test
19 passed, 0 failed  （sdd-repo 3、workspace 3、task-brief 5、review-package 2、
                      task-start 1、task-done 2、用法 1、无残留 1、无残留写入 1）
```

`node --test` 用 `tests/.tmp/` 里的临时 git 仓库做 fixture，跑完删除；`GIT_CEILING_DIRECTORIES` 限定 git 不向上找到本包仓库，否则"不在仓库内"那条用例会因为错误原因通过。

## 负样本：断言必须能在缺陷存在时失败

会话 `session-3ac11643-c72a-45d9-8c01-ef55bcb077e5`（v0.1，`agentPreset: quanheng`）：

```
$ node scripts/assert-session.mjs <log> --preset quanheng \
    --skill-order using-superpowers,brainstorming --no-write-before writing-plans --no-tool-errors
preset:  quanheng
chain:   25:using-superpowers → 28:brainstorming → 31:personalized-pages → 123:writing-plans
         → 150:executing-plans → 157:test-driven-development → 160:verification-before-completion
         → 486:requesting-code-review
PASS  agent preset is quanheng
PASS  skills load in order: using-superpowers → brainstorming
FAIL  nothing written before writing-plans (seq 123) — 2 write call(s) before it: seq 68 write, seq 71 write
FAIL  no tool call failed — 4 failing call(s): seq 85, seq 159, seq 330, seq 369
```

seq 68/71 是一次性探测页（v0.1 的偏离）；seq 159 是缺失的 TDD 技能；seq 85/330/369 是同一会话里浏览器验证手段本身的失败。这条记录说明判分器不是空转的。

## M1 / M2 / M2b（v0.2 复跑）

| 判据 | 命令 | 结果 |
|---|---|---|
| M1 已激活 | `plugin_manager install_bundle`（重装后返回 `bundle: @quanheng/preset`, `version: 0.2.0`, `application: applied`） | **通过** 2026-11-22 |
| M2 出现在配置里 | `dsh --profile web --dump-config` | **通过**：`id: quanheng` 与 `preset-quanheng` 行都在，四个出厂 preset 同时存在 |
| M2b 技能根解析 | 以 profile 的 `createRequire` 解析 `@quanheng/preset/package.json`，读 `skills/` | **通过**：解析到 `D:\WorkSpace\PRD-OS\QH-Preset\package.json`，`skills` 下 11 个目录 |
| M5 卸载 / 重装 | `plugin_manager remove_bundle target=@quanheng/preset` → 再 `install_bundle target=D:\WorkSpace\PRD-OS\QH-Preset` | **通过**：卸载后 `--dump-config` 只剩 `standard / ptc / minimal / cordis`，`quanheng` 出现 0 次，profile `package.json` 的 bundles 里也不再列出本包；重装后 `id: quanheng` 回来，版本 0.2.0 |

## M3 / M4b：需要负责人在新会话执行

这两项必须在**新会话**里跑：preset 在首条消息后锁定，且 `using-superpowers` 明确要求被派遣的子 agent 跳过技能路由——子 agent 测不了门禁。

**M4b（门禁回归，探针会话）**

1. 设置 → Agent 预设选「权衡」，新建会话。
2. 只发这一句：`帮我做个记账小工具`
3. 观察：是否在写任何项目文件之前加载 `using-superpowers` → `brainstorming` 并先问一个开放问题；是否**没有**出现未声明的探测文件。
4. 把会话 id（或 `$DSH_HOME/sessions/.../session-*.v4.jsonl.zstd` 路径）交给 agent，跑：

   ```
   node scripts/assert-session.mjs <log> --preset quanheng `
     --skill-order using-superpowers,brainstorming --no-write-before writing-plans --no-tool-errors
   ```

**M3（新技能可发现 + TDD 触发）**

新建一个 `quanheng` 会话，发：`帮我写个函数把字符串反转，用 TDD 跑一次测试`。期望加载 `using-superpowers` → `test-driven-development`，先写失败测试再写实现。同样把会话 id 交给 agent 断言。

## v0.1 基线（保留）

| 日期 | 结论 | 证据 | 备注 |
|---|---|---|---|
| 2026-11-22 19:43 | 通过（一处偏离） | 会话 `session-3ac11643`，`cwd = 测试项目\新preset预设测试`，`agentPreset: quanheng` | 偏离：设计批准前写了两个探测页，见上面负样本 |

旁证：会话 `session-b7c5802c`（`cwd = D:\WorkSpace\思考类工作目录`，同一 preset）是纯研究任务——加载 `using-superpowers → official-plugins → brainstorming → dsh-doc`，用 `ask_user_question` 问了一个澄清问题，全程零写操作。它唯一的失败调用是 seq 328 的 `read`（路径少了一层目录，`not found`），与 preset 无关。`test-driven-development` 缺失的原始证据只在 `session-3ac11643` 的 seq 159。

## 本轮偏离与修正记录

- `scripts/assert-session.mjs` 与 Batch B 一起提交（原计划放 Batch C）：`check-preset` 的"helper 提及可解析"检查引用它，若分两批提交，Batch B 的仓库状态会自检失败。
- `.gitattributes` 从 `skills/**/scripts/*.mjs` 改为 `*.mjs`：前者匹配不到 `scripts/lib/` 子目录，`git check-attr` 显示 `eol: unspecified`。
- 计划里"自己驱动 GUI 起 2 个新会话"未做成：`http://127.0.0.1:3080` 对 Playwright 返回 401，要求登录令牌（本会话环境里没有，且不读取 `.credentials.yaml`）。当前会话的 `DSH_*` 环境变量只有 HOME/PROFILE/SESSION_ID/URL。因此 M3/M4b 转由负责人在已登录的 GUI 里跑，判分仍由 `assert-session.mjs` 执行。
- `headless` profile 不能替代：它只装 `@deepseek-ai/dsh-base` + `dsh-headless`，基础组合里没有 agent-preset 注册表，也没有 `--preset` 参数，加装本 bundle 也选不到 `quanheng`。
