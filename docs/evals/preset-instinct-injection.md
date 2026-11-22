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

## 正例一：工具级失败（v0.3，PASS）

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

## 正例二：命令非零退出（v0.3，PASS，重启 DSH 后复验）

会话 `session-2335cb1d-6649-4bfa-a113-666ede3f1b2b`。探针只说"运行 `node -e "process.exit(7)"` 并照贴"。

| seq | 发生了什么 |
|---|---|
| 11 | 第一次请求：只有 `keep-evidence` 与坏文件诊断 |
| 22 | `pwsh` 跑 `node -e "process.exit(7)"` |
| 25 | 结果是 `isError=false`，正文 `(no output)` + `[exit code: 1]` —— 命令失败但工具没报错 |
| 28 | 下一次请求：`read-the-error` 出现 |

```powershell
node scripts/assert-session.mjs <log> --preset quanheng `
  --context "quanheng:instincts=read-the-error" --context-after 26
```

```
PASS  agent preset is quanheng — found "quanheng" (header said "ptc", overridden by agent-preset/selected)
PASS  no quanheng:instincts containing "read-the-error" before seq 26 — first at seq 28
```

这条比正例一更关键：它证明"命令失败"不是靠 `isError` 判的。`isError` 在 seq 25 是 `false`，若按 `isError` 判定，规则永远不会出现。同样跑反证：边界挪到 29 必须 FAIL。

## 负样本（同一条命令必须能失败）

把边界改成 27（正例一）或 29（正例二），同一条命令就必须报错——否则断言在什么都没证明：

```
FAIL  no quanheng:instincts containing "read-the-error" before seq 27 — 1 earlier at seq 26
```

## 已知残余风险

1. **改 `hooks/` 源码后必须重启 DSH。** preset 里的插件不受 HMR 管理，`set_plugin include:preset-quanheng` 会返回 `application: restart-required`（`restartReason: unmanaged-plugin`）。只改 `.qh/instincts/*.md` 不用重启——它们在每次组装时读。
2. **子 agent 会话**会各自读自己 cwd 下的 `.qh/instincts/`；父会话的规则不会自动传给子会话。
3. **注入文本的预算**是 3 条：更多匹配会被计数截断而不是列完。规则写太多时看到的是那条截断提示，不是全部规则。
