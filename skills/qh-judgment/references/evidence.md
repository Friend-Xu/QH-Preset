# Evidence

Part of `qh-judgment`. Four labels, one per conclusion. This file says how to
write each one and where the label sits in the answer.

## 实测 — ran it here

You executed the thing in this session and the output is in front of you.

Write: the command, the exit code, and the observation that decides the claim.
Put the numbers in the answer, not a reference to them.

```
实测：`node --test tests/` → 19 passed, 0 failed, exit 0.
实测：`git status --porcelain` 空输出 → 工作区干净。
```

- The run must be yours. A previous session's run, or a run before your last
  edit, is not 实测 for the current state.
- Partial runs are partial. "Grepped the first 250 matches of 9,000" is not
  "no other occurrence exists" — say which slice you ran.
- A passing run of one file is not a green suite; run the project's command.

**Mislabel:** quoting a build log you read instead of ran. That is 源码 (the log
is a document) — and a log can be stale, which the label then admits.

## 源码 — read it

You read the implementation, the schema, or the authoritative document, and the
answer is in the text.

Write: `path:line` or the document section. A path with no line is acceptable
only for a short file where the whole thing is the citation.

```
源码：`packages/skill/skill/src/index.ts:24` → 技能名必须匹配 ^[a-z0-9]+(-[a-z0-9]+)*$。
源码：`docs/02-产品定位与能力地图.md` §2.5 → 产品的灵魂是判断。
```

- Prefer the code over the README that describes it; prefer the test over both.
- A version claim needs the version you read, not "latest".
- Reading a third-party doc is 源码 about the doc, 推论 about the product.

## 推论 — reasoned from the two above

You combined 实测/源码 facts into something not directly observed. This is where
most real engineering answers live; the label is not an apology, it is the
honest name for the kind of claim it is.

Write the premises and the weakest link. One or two lines is enough:

```
推论（据 源码 `config.ts:41` 与 实测 `--dump-config` 输出）：
  env 未设时 profile 名默认 web。最弱一环：未验证别的调用方是否也读这个默认。
```

- `推论` is not a licence to skip checking what is cheap to check. Run it if you
  can; a 实测 beats a carefully worded 推论 every time.
- Two 推论 chained are still one 推论, and weaker. Say the chain is long.

## 无法判定 — the facts do not decide it

The question is real, the evidence available (in this session, from this
machine) does not settle it. This is a legitimate answer and often the most
useful one.

Write: what stays open, why the available facts cannot close it, and what would.
If the answer is one command or one question away, go get it instead — 无法判定
is for the gaps you cannot close here, not for the effort you skipped.

```
无法判定：该 preset 在另一个 Harness 上的触发行为。
  证据只到 DSH 实测；其他 harness 无本机样本，需在对应环境跑一次 M4 探测。
```

## Where the label goes

- **Lead with it when the conclusion is the point.** `实测：…` first, then the
  detail that supports it.
- **A table of findings carries a label column**, not a preamble that says
  "these are estimates".
- **A label covers the sentence it is attached to.** A paragraph may hold two
  labels; make it obvious which sentence has which.
- **A long answer needs no label on every sentence.** Label the conclusions; the
  connecting prose stays unlabelled (it is not a claim about the world).

## When the human partner supplies the label

Their own documents use this convention (实测 / 源码 / 推论). Do not silently
upgrade their 推论 into your 实测, and do not relabel their text: when you
reproduce their claim, carry its label and, if you verified it yourself, say
that it is now 实测 and what you ran.
