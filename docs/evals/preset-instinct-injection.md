# EVAL: instinct 注入的两半

判据：`.qh/instincts/` 里被提升的规则只在**它的触发条件真的成立之后**才进入请求；没有证据时一个字都不出现；写坏的文件必须被看见，而不是被吞掉。

考察的是两件事：注入通道是否真的把文本送到了模型面前（`quanheng:instincts` 段出现在 runtime context 里），以及筛选是否真在筛（`tool-error` 的规则在没出错前不出现）。

## 设置

工作区 `.qh/instincts/` 放三条：

```markdown
---                              ---                              ---
id: keep-evidence                id: read-the-error               id: Broken_Id
trigger: always                  trigger: tool-error              trigger: always
---                              ---                              ---
每一句结论都带证据标签。          工具报错后先读完错误原文。          （故意写错的 id）
```

## 正例（v0.3，PASS）

会话 `session-19aea212-e6e5-4d8d-bfe7-3008b91010ef`（`agentPreset: quanheng`，cwd `测试项目\新preset预设测试`）。探针只说了一件事：`read` 一个确定不存在的文件，然后照贴 context。

| seq | 发生了什么 |
|---|---|
| 11 | 第一次请求的 runtime context：只有 `keep-evidence` 和坏文件的诊断行，**没有** `read-the-error` |
| 23 | `read` 失败（`isError`），这是那条 `tool-error` 规则的证据 |
| 26 | 下一次请求的 runtime context：`read-the-error` 出现 |

```powershell
node scripts/assert-session.mjs <log> --preset quanheng `
  --context "quanheng:instincts=keep-evidence"
node scripts/assert-session.mjs <log> `
  --context "quanheng:instincts=read-the-error" --context-after 24
```

```
PASS  agent preset is quanheng — found "quanheng" (header said "ptc", overridden by agent-preset/selected)
PASS  runtime context quanheng:instincts containing "keep-evidence" reached the model — 2 time(s), first at seq 11
PASS  no quanheng:instincts containing "read-the-error" before seq 24 — first at seq 26
```

## 负样本（同一条命令必须能失败）

把边界改成 27，同一条命令就必须报错——否则断言在什么都没证明：

```
FAIL  no quanheng:instincts containing "read-the-error" before seq 27 — 1 earlier at seq 26
```

## 已知残余风险

1. **命令非零退出计为失败这条路径没有在真会话里验过。** `isError` 只表示基础设施失败（spawn 错误、中止、拒绝），命令失败是 canonical value 里的 `exitCode`（`shell/tool-pwsh/src/render.ts:5-8`）。这段判定有单元测试（`tests/instincts.test.mjs`），但运行时验证需要重启 DSH——preset 里的插件不受 HMR 管理，改源码后重组合会返回 `application: restart-required`。验过之后把这条删掉。
2. **子 agent 会话**会各自读自己 cwd 下的 `.qh/instincts/`；父会话的规则不会自动传给子会话。
3. **注入文本的预算**是 3 条：更多匹配会被计数截断而不是列完。规则写太多时看到的是那条截断提示，不是全部规则。
