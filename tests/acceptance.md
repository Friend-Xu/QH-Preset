# 验收记录

判据只记实测结果；"通过"必须能指向下面的命令或会话 id。v0.1 的 M4 记录保留在文末作为基线。

> **安装方式在 2026-11-22 之后变了**：从"本地目录（link，改动即时生效）"改为"GitHub 仓库（副本）"。下面各条里的 `source: link:…`、`D:\…` 路径和 `127.0.0.1` 地址都是当时实测的原文，按记录不改写；当前装法见 [README](../README.md) 的「装与卸」。
>
> 小节标题里的 `v0.1` / `v0.2` / `v0.3` / `v0.3.1` 是**开发批次编号**，不是发布版本。仓库的第一个公开发布版本是 `0.1.0`（tag `v0.1.0`）。

## v0.2 — 六处缺口的关闭状态

| # | v0.1 的缺口 | v0.2 的处理 | 判据 | 结果 |
|---|---|---|---|---|
| ① | 执行阶段要求 TDD 时该技能不存在（v0.1 会话 seq 159 报错） | 补装 `test-driven-development`（正文只改一处命名空间） | `check-preset` 技能集断言 | **通过**（11 个技能） |
| ② | ECC 规则只有快照、没有落地 | 提炼为 `qh-judgment`（证据四档、审查分级、委派契约） | 自检"提炼技能标注 origin: ECC" + 技能内相对链接可解析 | **通过** |
| ③ | `eval-harness` 未移植 | 提炼为 `eval-harness`，判分器映射到 DSH 工具 | 同上 | **通过** |
| ④ | 门禁被一次性探测文件绕过（seq 68/71） | `brainstorming` HARD-GATE 明确"探索不写项目文件"，落文件探测须先声明并在 `.superpowers/scratch/` 用完删除，Red Flags 加一行 | `docs/evals/preset-gate-announcement.md` 的负样本 + 待跑的 M4b | **负样本通过；M4b 待跑** |
| ⑤ | 6 个 helper 是 bash，本机跑不起来 | 移植为 Node `.mjs`，语义/参数/退出码/输出对齐；13 处调用点改写 | `node --test` 20 例 | **通过（20/20）** |
| ⑥ | 自检只查结构不查行为 | `check-preset` 扩到 16 项；新增 `assert-session.mjs` 会话日志断言；20 例 helper 行为测试 | 两个命令全绿 | **通过** |

## 静态与行为检查（2026-11-22，本轮实测）

```
$ node scripts/check-preset.mjs
16 passed, 0 failed
  （行/分组/isolate/五字段、技能集与 frontmatter、链接可解析、helper 提及可解析且无 bash scripts/、
    无上游命名空间与家目录路径、helper 不管道捕获、import 可解析、persona 四条不变量、
    dsh-tools 动作映射、origin: ECC、包元数据与技能根、单文件 ≤32KB — 42 files / 207 KB）

$ node --test
20 passed, 0 failed  （sdd-repo 3、workspace 3、task-brief 5、review-package 2、task-start 1、
                      task-done 3（含 .cmd）、用法 1、无残留 1）
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

## M4b：门禁回归（已跑，通过）

会话 `session-bb82e844-42f1-4ea6-a627-400027458ef8`，`cwd = 测试项目\新preset预设测试`，探针就是 `帮我做个记账小工具`。

```
$ node scripts/assert-session.mjs <log> --preset quanheng \
    --skill-order using-superpowers,brainstorming --no-write-before writing-plans --no-tool-errors
preset:  quanheng
chain:   22:using-superpowers → 28:brainstorming
PASS  agent preset is quanheng — found "quanheng" (header said "ptc", overridden by agent-preset/selected)
PASS  skills load in order: using-superpowers → brainstorming — 2 skill calls
PASS  nothing written while writing-plans is still ahead (never loaded) — 0 write call(s)
FAIL  no tool call failed — 1 failing call(s): seq 77
```

- **门禁通过**：整个探索阶段 0 次 `write`/`edit`（v0.1 是 seq 68/71 两个探测页），只做只读探查（`Get-ChildItem`/`Get-Content`/`Get-Command`），最后用 `ask_user_question` 问一个开放问题，没有擅自开工。
- **新规则真的被用上了**：负责人回答"就用它，先带我过一遍"之后，agent 唯一一次落文件是 seq 174 的 `.superpowers\scratch\demo\.keep`——正是新版 HARD-GATE 指定的位置（v0.1 那次是项目根目录的 `_recon-ls.html`）。它也在 seq 179 说明了自己在演示前建的临时目录。
- **环境限制（不是 preset 缺陷，但要知道）**：这个测试工作区有陈旧的沙箱 ACL——`pwsh` 里在子目录下建文件被拒（seq 136 → 143），根目录可以（seq 158/165）。agent 因此加载了 DSH 自带的 `diagnose-windows-sandbox-acl` 排查（seq 144），最后改用 `write` 工具（不受沙箱令牌限制）建那个 `.keep`。同理，helper 在别的健康工作区跑没问题；如果哪个工作区写不进去，helper 会以非零退出码直接报错，不会静默。
- **preset 判定要读事件而不是 header**：这个会话是 GUI 先建了草稿（header 写 `ptc`），随后在同一 composer 里改选「权衡」，首条消息前落了一条 `agent-preset/selected: quanheng`。`assert-session.mjs` 因此改为"最后一个 `agent-preset/selected` 优先，header 兜底"——不改的话，真实的 quanheng 会话会被判成 ptc。
- **那 1 个失败调用是环境限制，不是 preset 缺陷**：seq 77 用浏览器工具打开 `file:///…/随手记账.html` 被拒（`Access to "file:" protocol is blocked`）。它随后改用 `python -m http.server 8765`（seq 90）看完并在同一轮 `job_kill`（seq 123/124）。据此改了一条部署说明：`dsh-tools.md` 现在写明 `file:` 被拒，需要自己看就起短命本地服务器并在同一轮停掉。

## M3：新技能可发现 + TDD 触发（已跑，通过）

会话 `session-9c6fb552-ace8-4552-bee5-7bbccace2bdf`，探针 `帮我写个函数把字符串反转，用 TDD 跑一次测试`。

```
$ node scripts/assert-session.mjs <log> --preset quanheng \
    --skill-order using-superpowers,test-driven-development --no-tool-errors
preset:  quanheng
chain:   22:using-superpowers → 28:test-driven-development
PASS  agent preset is quanheng — found "quanheng"
PASS  skills load in order: using-superpowers → test-driven-development
PASS  no tool call failed — 0 errors
```

**RED-GREEN 也真的发生了**（这是 TDD 技能自己的主张，值得单独记）：

| seq | 动作 | 结果 |
|---|---|---|
| 119 | 先写测试 `string-reverse/tests/test_reverse_string.py` | — |
| 125 / 139 | 在没有任何实现时跑 `py -3.15 -m unittest discover` | 两次都是 `_FailedTest ... ERROR`（RED） |
| 147 | 才写实现 `string-reverse/reverse_string.py` | — |
| 153 | 再跑同一个命令 | `test_returns_single_character_unchanged ... ok`（GREEN） |

顺序是"测试 → 看它失败 → 再实现"，不是"先写代码再补测试"。它自己选了 Python + unittest（本机有 `py 3.15`），没有引入任何外部依赖。

会话产出的 `测试项目\新preset预设测试\string-reverse\` 是探针产物，验收后已删除（连同 `__pycache__`）；证据留在会话日志与上表。

## v0.3 — instinct hook 与另外 4 个技能

| 判据 | 结果 | 证据 |
|---|---|---|
| 插件进组合并激活 | 通过 | `list_bundles` 显示 `@quanheng/preset` v0.3.0 `source: link:D:\WorkSpace\PRD-OS\QH-Preset`；会话 `19aea212` 的 `runtime-context` 里有 `quanheng:instincts` |
| `always` 规则首轮就在 | 通过 | 会话 `19aea212` seq 11 的 context 原文含 `keep-evidence`；`assert-session --context "quanheng:instincts=keep-evidence"` → PASS（首次在 seq 11） |
| `tool-error` 规则只在出错后出现 | 通过 | 同一会话 seq 23 `read` 失败；seq 26 的 context 才出现 `read-the-error`；`--context-after 24` PASS。反证：`--context-after 27` 必须 FAIL（`1 earlier at seq 26`），确认边界不是空的 |
| 坏文件被看见而不是被吞 | 通过 | seq 11 与 seq 26 的 context 都带 `instincts: .qh/instincts/003-broken.md 未通过解析：id is missing or not a lowercase slug`，会话正常结束（`turn/end`） |
| 4 个新技能可被发现 | 通过 | 会话 `082ed5f1` seq 38 `skill systematic-debugging` 加载成功；`check-preset` 的 `EXPECTED_SKILLS` 已是 15 |
| 结构自检 | 通过 | `node scripts/check-preset.mjs` → 20 passed, 0 failed |
| 行为测试 | 通过 | `node --test` → 44 passed, 0 failed（helper / instinct / find-polluter / session-assert） |
| 命令非零退出也触发 `tool-error` | 通过（重启 DSH 后复验） | 会话 `2335cb1d` seq 22 跑 `node -e "process.exit(7)"`，seq 25 的结果是 `isError=false` + `[exit code: 1]`（正是旧代码漏掉的那种），seq 28 的 context 才出现 `read-the-error`；`assert-session --context "quanheng:instincts=read-the-error" --context-after 26` PASS。反证：边界挪到 29 必须 FAIL |

### 重启这条是怎么过的

改完 `hooks/` 源码后，`plugin_manager set_plugin include:preset-quanheng` 一直返回 `application: restart-required`（`restartReason: unmanaged-plugin`）：preset 里的插件不受 HMR 管理，运行中的 Host 持有旧模块。负责人重启 DSH 后，同一探针在 `2335cb1d` 上验成。**这条约束留在 `docs/HOOKS.md` 与 README 里**：改插件源码要重启，改 `.qh/instincts/*.md` 不用。

### 本轮偏离与修正

1. **注入通道从 `agent/pre-step` 改为 `systemPrompt.context`**（计划已写明此偏离并获批）。理由：前者要 `createUserMessage`（`@deepseek-ai/dsh-llm`，预发布版本）→ 给一个 link 安装的包新增预发布 peer 依赖；后者是 Harness 自己的常驻提醒通道（`experimental/timeline` 同构），零外部导入，且注入同样落成持久 `user/message`（`agent-loop/src/runtime-context.ts:76-92`）。
2. **内置的 `repeat-failure` 规则被删除**（计划里唯一的内置规则）。做实前查了一眼运行时的插件清单：`@deepseek-ai/dsh-repeat-tool-reminder` 已在 Host 上激活，按"工具+参数"连续重复计数（阈值 3/5/8）并注入提醒。再写一条同类规则就是第二条路径，违反 `$DSH_HOME/AGENTS.md` §5 与"先查已有方案"。于是 hook 的捕获只用来筛选已提升的 instinct（`tool-error` / `tool:<name>`），不再自己生成规则；`docs/HOOKS.md` 与 `qh-judgment/references/instincts.md` 都写明这条边界。
3. **`isError` 不是"命令失败"**：实测 `pwsh` 跑 `node -e "process.exit(7)"`，`tools/result` 的 `isError` 仍是 `false`，失败在 `[exit code: N]` 标记里；源码 `shell/tool-pwsh/src/render.ts:5-8` 确认"非零退出只报告、不置 error"。改为读 canonical value 的结构化 `exitCode`（`tool-pwsh/src/index.ts` 的 `output.schema` 有该字段），并补了单元测试；重启后用会话 `2335cb1d`（seq 25 → seq 28）复验通过。
4. **`resolveExecutable` 的 Windows 缺陷**（移植 `find-polluter` 时撞出来的）：`npm` 先匹配到 nodejs 目录下无扩展名的 sh shim，`CreateProcess` 跑不了，`ENOENT` 又被 `spawnWithStdio` 吞掉，表现是"命令什么都没发生"。改为先试可执行扩展名；`find-polluter` 同时把"spawn 失败"当失败报出来（不再只看退出码）。
5. **计划里"`docs/UPSTREAM.md` 写的是 4 个未装技能"**：实测是 6 个（15 个目录、已装 9 个）。本次开 4 个，剩 2 个按既有理由不开；文件已改正。

### 一条与本轮无关的观察

探针会话 `082ed5f1` 在调查它自己那条失败命令时，量到 DSH 的 `pwsh` 工具在本机解析到 **Windows PowerShell 5.1**（`$PSVersionTable` = `5.1.26100.9444 Desktop`），因为 `pwsh.exe` 不存在（`shell/pwsh-local/src/resolve.ts` 的回退分支）。后果：`-Command` 里以原生失败命令结尾时，标记给的是 `[exit code: 1]` 而不是子进程真实的 7（seq 25 vs seq 33）。这是 DSH 侧的行为，不在本仓库范围内，但会影响任何依赖退出码的脚本，记在这里备查。

## v0.3.1 — 与 ECC / Superpowers 的核对

起点是一次人工比对：87 个 Superpowers 文件 + 12 个 ECC 文件，逐个对到 `docs/UPSTREAM.md` 的行。结论是**改造本身是对的，账不全**——文件账在 Superpowers 侧 100% 闭合（37 个只在上游的文件、16 个只在包内的文件，逐个指得到一行），ECC 侧漏了 1 个文件的处置；另有 1 个真缺陷（BOM）和 1 个会误导判断的文档错误。

| # | 发现 | 处理 | 判据 |
|---|---|---|---|
| 1 | 8 个文件带 `EF BB BF`（v0.1 批量改名带入），含 `writing-plans/SKILL.md` | 去掉 BOM；检查改为**拒绝**而不是解析前抹掉 | 8 个文件 `git diff --numstat` 各 `1 1`；全包扫描 0 个 BOM |
| 2 | `dsh-tools.md:63` 说"非零退出＝这件事没发生"，与 `find-polluter` 的退出 1（找到污染源）相反 | 改写为"退出 0 表示发生；`find-polluter` 的 1 也是成功" | `find-polluter.mjs:14` 的退出码表 |
| 3 | `UPSTREAM.md` #1 写"已装的 11 个技能"，v0.1 实为 8 个 | 改成 v0.1 的 8 个 | `git ls-tree 927a9d1:skills` = 8；`README.md` 也写 8 |
| 4 | ECC `development-workflow.md` 整包 0 次提及 | 补 E7 行 | `audit-upstream` 对它给出 `omitted` + E7 |
| 5 | 4 处内容改动没进表 | 补 #14–#17 | 每行带引入它的提交：`cf0c28f`（#14–#16）、`11d285c`（#17） |
| 6 | `brainstorming:313` 的"写 HTML 到项目里"与门禁的 scratch 规则互相拉扯 | 让渲染页服从门禁那条 | 两处现在指向同一条规则 |
| 7 | 升级流程第 2 步的 `diff -r` 在本机空转 | 换成 `node scripts/audit-upstream.mjs` | 实测 `(Get-Command diff).CommandType = Alias`（`Compare-Object`）；`diff -r` 不报错，只打印两行目录名 |

### 负样本（检查必须能在缺陷存在时失败）

1. **BOM**：把 `EF BB BF` 写回 `skills/writing-plans/SKILL.md`（首字节 `EF BB BF 2D 2D 2D`），`check-preset` 输出两条 FAIL——`no shipped text file starts with a byte-order mark`（点名文件与字节序列）与 `every SKILL.md carries matching frontmatter`（`has no frontmatter`），合计 `20 passed, 2 failed`。还原（首字节 `2D 2D 2D 0A 6E 61`）后 `22 passed, 0 failed`。这也证明了删掉 `.replace(/^\uFEFF/,'')` 之后缺陷不再被掩盖。
2. **账本**：删掉 `vendor/superpowers/skills/writing-plans/SKILL.md` 那条，`audit-upstream` 退出 1，输出 `FAIL [UNDOCUMENTED_EDIT] ... differs from skills/writing-plans/SKILL.md and no ledger entry says why`；还原后 0 问题。
3. 其余 9 个问题码由 `tests/audit-upstream.test.mjs` 的内存 fixture 覆盖，每个码一例。

### v0.3.1 实测

```
$ node scripts/check-preset.mjs
22 passed, 0 failed
$ node --test
ℹ tests 56  ℹ pass 56  ℹ fail 0
$ node scripts/audit-upstream.mjs
99 vendored files — 17 identical mirrors, 26 edited, 11 ported, 41 omitted, 2 reference, 2 license — 0 problem(s)
upstreams: superpowers 7.0.2 (87 files), ecc 2.2.3 (12 files)
```

### 明确不做

- 技能里 11 个标了 `bash` 的代码围栏：只是示例标签，全文没有一处指令叫 agent 跑 bash；改写会偏离上游排版。
- `dot` 不在本机，`render-graphs.mjs` 跑不了：技能已写明它需要 graphviz 且会报错说明，这是诚实行为，不是缺陷。
- 只在本包内的 16 个新文件不进账本：`check-preset` 的 `EXPECTED_SKILLS` 已经管技能集，账本只负责 vendor 侧。
- 不从 `UPSTREAM.md` 散文里解析版本号做交叉校验：版本在账本里声明并由审计打印，散文仍归人读。

## v0.1 基线（保留）

| 日期 | 结论 | 证据 | 备注 |
|---|---|---|---|
| 2026-11-22 19:43 | 通过（一处偏离） | 会话 `session-3ac11643`，`cwd = 测试项目\新preset预设测试`，`agentPreset: quanheng` | 偏离：设计批准前写了两个探测页，见上面负样本 |

旁证：会话 `session-b7c5802c`（`cwd = D:\WorkSpace\思考类工作目录`，同一 preset）是纯研究任务——加载 `using-superpowers → official-plugins → brainstorming → dsh-doc`，用 `ask_user_question` 问了一个澄清问题，全程零写操作。它唯一的失败调用是 seq 328 的 `read`（路径少了一层目录，`not found`），与 preset 无关。`test-driven-development` 缺失的原始证据只在 `session-3ac11643` 的 seq 159。

## 本轮偏离与修正记录

- **`task-done` 跑不了 `.cmd` 测试命令（自查发现并已修）**：第一版把解析出的可执行文件直接交给 `spawnSync`。Windows 上 `npm`、`pnpm` 这类包装都是 `.cmd`，CreateProcess 拒绝批处理文件，Node 报 `EINVAL`（实测 `status: null, error.code: 'EINVAL'`），也就是最常见的 `npm test` 会失败。修法：`.cmd`/`.bat` 经命令解释器执行（`shell: true` + 自行引号化，解释器解析命令行而不是 CRT），并在 `tests/helpers.test.mjs` 增加一条真实 `.cmd`（路径含空格）的成功用例。参数里出现双引号时报错而不是猜。
- `scripts/assert-session.mjs` 与 Batch B 一起提交（原计划放 Batch C）：`check-preset` 的"helper 提及可解析"检查引用它，若分两批提交，Batch B 的仓库状态会自检失败。
- `.gitattributes` 从 `skills/**/scripts/*.mjs` 改为 `*.mjs`：前者匹配不到 `scripts/lib/` 子目录，`git check-attr` 显示 `eol: unspecified`。
- 计划里"自己驱动 GUI 起 2 个新会话"未做成：`http://127.0.0.1:3080` 对 Playwright 返回 401，要求登录令牌（本会话环境里没有，且不读取 `.credentials.yaml`）。当前会话的 `DSH_*` 环境变量只有 HOME/PROFILE/SESSION_ID/URL。因此 M3/M4b 转由负责人在已登录的 GUI 里跑，判分仍由 `assert-session.mjs` 执行。
- `headless` profile 不能替代：它只装 `@deepseek-ai/dsh-base` + `dsh-headless`，基础组合里没有 agent-preset 注册表，也没有 `--preset` 参数，加装本 bundle 也选不到 `quanheng`。
