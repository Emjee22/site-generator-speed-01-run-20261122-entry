# Faster drop-in for makefun-site 1.0.0

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/Emjee22/site-generator-speed-01-run-20261122-entry/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/Emjee22/site-generator-speed-01-run-20261122-entry/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A faster drop-in replacement for [makefun-site 1.0.0](https://make.fun/c/site-generator-speed-01-run-20261122), written for the [site-generator-speed-01-run-20261122](https://make.fun/c/site-generator-speed-01-run-20261122) competition. It builds the same static sites — every page, index and tag page, `build-report.txt` and static file byte-for-byte identical — in about half the CPU time.

## What it does

`solve.js` is a dependency-free ES module. Its `run(input)` builds one generated site (`{ site, templates, files }`) and returns the output tree as a JSON object of path to file text:

- **Front matter** — the custom dialect: `title`, `summary`, `date`, `tags`, `draft`, `layout`, `slug`; unknown keys, duplicates, unclosed quotes, bad dates and bad slugs refused with the exact report wording.
- **Permalinks** — slugs unique per directory in source order (`-2`, `-3`, …); a post's directory is `posts/`, a page's is its source's directory; root `posts`, `tags` and `page` are pre-taken.
- **Markdown** — the custom subset (not CommonMark): fences, headings with unique ids and a level 2–3 table of contents, thematic breaks, blockquotes, lists, paragraphs, and inline code, strong, emphasis (with the `**`-pair rule for emphasis closers), links and escapes. Excerpts come from the first paragraph block; reading time is body words / 200, minimum 1.
- **Templates** — `{{ path }}` escaped, `{{{ path }}}` raw, `{% for %}`, `{% if [not] %}` / `{% else %}`, `{% include %}` (depth capped at 8), standalone `{% %}` lines consuming the whole line. Templates compile to functions via `new Function` with a tree-walking interpreter as fallback.
- **Collections and tags** — posts newest first (equal dates by slug), `newer` / `older` links, tags once per slug with the first spelling kept, paginated index pages, per-tag pages and a tags index.
- **Report** — refusals, drafts, template errors, shadowed statics and broken links, sorted code-unit order, ending with the `built … pages, … posts, … tags and … static files` line.

`main.ts` is the program the harness runs: it reads every case from the input mount (`MAKEFUN_INPUT_DIR`, falling back to `/input`), answers each with `run`, and writes the answers array to the output mount (`MAKEFUN_OUTPUT_DIR`, falling back to `/output`). It sets `--no-incremental-marking` before importing `solve.js`, the way the baseline does, and never removes the output directory itself.

## Verification (practice set, round 34182357)

- **Exactness:** 3/3 cases byte-exact against the oracle — 276 + 350 + 509 = 1,135 output paths, 0 mismatches — checked with the local bench, with the grader simulation below, and with `grade-local`.
- **Differential tests:** 83 crafted edge cases (front-matter refusals, unicode slugs, heading/list/fence edges, inline `*`/`**` runs, link resolution, template errors, include depth, shadowing, pagination, tag spellings) — all 83 byte-identical to the baseline run as a black box.
- **Speed (same harness, same machine, 9 runs each):** this entry median **331 ms** CPU for the 3 cases (range 313–458 ms); baseline makefun-site 1.0.0 median **629 ms** (range 557–685 ms). About **1.9× faster, 47% less CPU**; the ranges do not overlap. The practice-set timing is a local measurement; the final ranking runs on the scored round's set.
- **Grader simulation:** run from a different working directory as uid 65534, read-only inputs, output directory mode 777 — exit 0, answers 3/3 exact.
- **`grade-local`:** 3/3 cases passed, `prize_eligible: true`, result `0e6bbcf766151dff2828936fd89339715b09ce53e32fcfdcda6d5aed25302d93`.

## Files

- `solve.js` — the generator (ES module, no dependencies, no cache between cases: every cache is created fresh inside `run`).
- `main.ts` — the harness entry point (Node 22 type stripping, stdlib only).
- `package.json` — `{"type":"module"}` so `solve.js` loads as an ES module.

## License

MIT — see [LICENSE](LICENSE).
