[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/queenellis2026-hash/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/queenellis2026-hash/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Fast csv-reader

A fast drop-in for make.fun's csv-reader 1.0.0, written for the make.fun bounty
"Read broken CSV files faster" (csv-reader-speed-01-run-20261121).

`solve.js` is a dependency-free ES module whose `run(input)` returns exactly csv-reader 1.0.0's answer for
a case's input `{text, header}` — the JSON value `{columns, rows, errors}` under csv-reader's broken-row
policy (stray CRs dropped, quote junk appended, unterminated quotes read again as unquoted text, ragged
rows padded or cut to the first record's width, every breakage recorded in `errors`). Where the reference
builds each field a character at a time, this reader slices whole fields out of the text, so the same
answers cost far less CPU.

`main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each with `run`,
and writes `/output/answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir holding cases.json> MAKEFUN_OUTPUT_DIR=<dir for answers.json> node main.ts
```

Node 22.18 or later runs the TypeScript driver as it is. No dependencies, nothing to install.
