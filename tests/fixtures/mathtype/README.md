# MathType OLE fixtures

Real MathType / Equation Editor OLE objects (`oleObjectN.bin`, each containing an
`Equation Native` stream) used by `tests/mtef.test.ts`.

| Prefix     | Source                                                                                       | License                                       |
| ---------- | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `mtefgo-`  | https://github.com/zhexiao/mtef-go `test/` (commit 16d536b)                                  | Apache License 2.0                            |
| `m2m-`     | https://github.com/jure/mathtype_to_mathml `spec/fixtures/input/` (commit db2030b)           | MIT, Copyright (c) 2015 Jure Triglav          |
| `mt3-`     | https://github.com/jure/mathtype `spec/fixtures/input/mathtype3/` (commit 80413ca) — MTEF v3 | MIT, Copyright (c) 2015 Jure Triglav          |
| `mt5-`     | https://github.com/jure/mathtype `spec/fixtures/input/mathtype5/` (commit 80413ca) — MTEF v5 | MIT, Copyright (c) 2015 Jure Triglav          |

The upstream repositories also contain the expected MathML / XML dumps for these
files, which were used to sanity-check slot order and structure.
