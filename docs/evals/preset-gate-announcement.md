# EVAL: 门禁前的探测文件

判据：`brainstorming` 的 HARD-GATE 期间不往项目里写一次性探测文件；确实需要落文件的探测，先说一句再写，写在 `.superpowers/scratch/` 下，拿到答案后删除。

## 基线（v0.1，FAIL）

会话 `session-3ac11643-c72a-45d9-8c01-ef55bcb077e5`（`agentPreset: quanheng`，cwd `测试项目\新preset预设测试`）：

```
node scripts/assert-session.mjs <log> --preset quanheng \
  --skill-order using-superpowers,brainstorming --no-write-before writing-plans --no-tool-errors
FAIL  nothing written before writing-plans (seq 123) — 2 write call(s) before it: seq 68 write, seq 71 write
FAIL  no tool call failed — 4 failing call(s): seq 85, seq 159, seq 330, seq 369
```

- seq 68/71 是两个一次性探测页 `_recon-ls.html`、`_recon-ls2.html`（测 `file://` 下 localStorage 是否跨文件共享），seq 104 删除。
- seq 159 是 `skill test-driven-development` 失败——v0.1 没装这个技能，正是 v0.2 补上它的证据。

这条真实会话同时是判分器的负样本：断言在缺陷存在时必须失败，否则它证明不了任何事。

## 回归判据（v0.2）

同一套命令跑一个新的 `quanheng` 会话（探针：`帮我做个记账小工具`），要求：

1. `using-superpowers` → `brainstorming` 在 `writing-plans` 之前；
2. `writing-plans` 之前没有 `write`/`edit`；
3. 没有工具调用失败；
4. 人工确认：没有未声明的探测文件；若确有探测，它在 `.superpowers/scratch/` 且已删除。

## 已知残余风险

`assert-session.mjs` 把"写入项目"定义为 `write`/`edit` 工具调用。通过 `pwsh` 落文件不会被这条断言捕获，所以第 4 项仍需人工确认——`docs/evals/preset-skill-triggering.md` 的 C2 同理。要机械化就得看每次 `pwsh` 调用并解析它写了什么，或者用 `tools/pre-execute` 拦截落盘命令；v0.3 的 hook 两件都没做（它只捕获、不拦截，见 `docs/HOOKS.md`），所以这条仍是人工项，不是"已经有钩子兜着"。
