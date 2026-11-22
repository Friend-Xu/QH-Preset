# QH-Preset

`quanheng` 是 DSH（DeepSeek Harness）的一个 Agent preset：把 Superpowers 的方法论技能装进一个完整声明的组合，让 agent 在创造性工作前先对齐意图、先查已有方案、完成前先验证。

## 它是什么

- 一个 **bundle**：`package.json` + `cordis.patch.yml`，用 `plugin_manager install_bundle` 装进 profile。
- 一个 **preset**：id `quanheng`，安装后出现在 设置 → Agent 预设，新会话可选。
- 8 个技能（来自 Superpowers 7.0.2，MIT）：`using-superpowers`、`brainstorming`、`writing-plans`、`executing-plans`、`subagent-driven-development`、`requesting-code-review`、`receiving-code-review`、`verification-before-completion`。

## 装与卸

```powershell
# 装（在本会话里由 agent 调用 plugin_manager；手工安装走 插件 → 添加插件 → 选本目录）
# target = D:\WorkSpace\PRD-OS\QH-Preset
# 卸
# plugin_manager action=uninstall_bundle target=@quanheng/preset
```

安装会改写 profile（`D:\Agents\.dsh\profiles\web`）的依赖与 bundle 清单；卸载即回滚。装完**新会话**才生效。

## 三条必须知道的约束

1. **仓库是唯一真相。** 在 设置 → Agent 预设 里编辑 `quanheng` 会写进 profile 的 `cordis.patch.yml`，按行 id 覆盖本 bundle 的 `config.plugins`。两边一旦分叉，以仓库为准：删掉那条覆盖，或重装本 bundle。
2. **不要移动本目录。** 安装以 link 方式挂到 profile；改名或移动会让依赖失效，必须重装。
3. **bash 不在 PATH。** 技能里的 `scripts/*` helper 是 `#!/usr/bin/env bash`；用 `D:\Program Files\Git\bin\bash.exe` 调（`references/dsh-tools.md` 有写法）。不存在就如实报告，不许假装执行。

## 目录

```
package.json               @quanheng/preset（不设 files 白名单：skills 必须随包）
cordis.patch.yml           preset-quanheng 的完整声明
skills/                    8 个技能；using-superpowers/references/dsh-tools.md 是本部署的工具映射
vendor/superpowers/        7.0.2 原样快照（diff 用）
vendor/ecc/                ECC 2.2.3 的 rules/common 与 eval-harness（v0.2 用）
docs/UPSTREAM.md           上游版本与我们的改动清单
rules/                     v0.2：ECC 规则提炼版，写而不挂
scripts/check-preset.mjs   契约自检
tests/acceptance.md        M4 验收记录
```

## 分批开关

| 能力 | 状态 |
|---|---|
| preset + 8 技能 | 已开（v0.1） |
| 视觉伴生服务器 | **关闭**（不提供浏览器通道；要图就写 HTML 文件给路径） |
| ECC 规则、`eval-harness` 技能 | v0.2，M4 通过后挂 |
| 直觉引擎（`@quanheng/hooks`） | v0.3，需要 `tools/result` 捕获与 `agent/pre-step` 注入 |

## 自检

```powershell
node scripts/check-preset.mjs
```

检查 preset 声明的契约（行、分组、isolate、五字段）、8 个技能的 frontmatter、无残留 `superpowers:` 命名空间、无视觉伴生残留、技能根表达式指向本包。
