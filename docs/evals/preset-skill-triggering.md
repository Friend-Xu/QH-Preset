# EVAL: preset 技能触发

判据：一个新建的 `quanheng` 会话，在写出任何项目文件之前加载了正确的技能，且没有工具调用失败。

这是本 preset 的能力 eval。它测的不是代码，而是"技能是否在正确的时刻被加载"——v0.1 的 M4 只能由人读转录判断，从 v0.2 起由 `scripts/assert-session.mjs` 判定。

## Capability evals

| # | 探针（用户消息） | 期望 | 判分器 |
|---|---|---|---|
| C1 | `帮我做个记账小工具` | `using-superpowers` → `brainstorming` 早于任何 `write`/`edit` | code |
| C2 | 同上 | 草稿阶段会先问一个开放问题，而不是直接产出代码 | human |
| C3 | `帮我写个函数把字符串反转，用 TDD 跑一次测试` | 加载 `test-driven-development` 且先写测试后写实现 | code + human |
| C4 | 任意需要下结论的提问（如"这个 preset 能装到别的 profile 吗"） | 加载 `qh-judgment`；答案带 实测/源码/推论/无法判定 标签 | model |

## Regression evals

| # | 期望 | 判分器 |
|---|---|---|
| R1 | 六个 helper 在仓库里可运行 | code — `node --test tests/helpers.test.mjs` |
| R2 | 结构契约未被破坏 | code — `node scripts/check-preset.mjs` |
| R3 | 门禁不再被一次性探测文件绕过 | code — `preset-gate-announcement.md` |

## 判分器与命令

code grader 是唯一权威；human grader 只补充"问得对不对"这类无法机械判定的部分。

```powershell
# C1 / C3：会话日志断言（把 <log> 换成 $DSH_HOME/sessions/.../session.v4.jsonl.zstd）
node scripts/assert-session.mjs <log> --preset quanheng `
  --skill-order using-superpowers,brainstorming `
  --no-write-before writing-plans --no-tool-errors
```

`--no-write-before writing-plans` 而不是 `brainstorming`：v0.1 的偏离是"问完意图、设计未批准就落探测文件"，所以门禁点必须在写计划的那一刻之前，而不是只在加载 brainstorming 之前。

## 指标

- C1、C3：每次探针 pass@1。k>1 要跑 k 个真实会话，先取得同意再跑；本文件当前只记录 k=1 的观察。
- R1、R2：pass^1 = 1，任何失败都是 BLOCK。
- C2、C4：human，由负责人给 PASS/FAIL，不折算成百分比。

## 不做

- 不针对模型版本做横评（需要多次付费会话，且与本 preset 的判据无关）。
- 不用"零回归"这类措辞描述没有实际跑过的路径。
