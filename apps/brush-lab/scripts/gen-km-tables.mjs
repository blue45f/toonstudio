#!/usr/bin/env node
// 혼색 엔진(engine/pigment/km-mix.ts)이 쓰는 밴드 표(km-tables.ts)와 골든 기대값 블록(km-mix.test.ts)을 생성한다.
//
// 입력: spectral.js 3.0.0(MIT)의 설치 경로(디렉터리 또는 spectral.js 파일). 저장소 루트 의존으로 이미 설치돼 있다.
//   예) node apps/brush-lab/scripts/gen-km-tables.mjs node_modules/.pnpm/spectral.js@3.0.0/node_modules/spectral.js
// 모드:
//   (기본)           km-tables.ts를 쓰고, km-mix.test.ts의 GOLDEN 블록(마커 사이)을 갱신한다.
//   --check          재생성 결과가 커밋된 km-tables.ts·GOLDEN 블록과 바이트 동일한지 확인한다(파일은 쓰지 않는다). 다르면 종료 코드 1.
//   --print-golden   GOLDEN 블록만 표준 출력으로 낸다.
//   --out <경로>     km-tables.ts 대신 쓸/비교할 경로(기본: src/engine/pigment/km-tables.ts)
//   --test <경로>    km-mix.test.ts 대신 쓸/비교할 경로(기본: src/engine/pigment/km-mix.test.ts)
//
// 방법: spectral.js 공개 API(`new Color([r,g,b]).R`)로 7기저 스펙트럼(흰·시안·마젠타·노랑·빨강·초록·파랑, 38밴드 380~750nm 10nm 간격)을 읽고,
// 38밴드 중 등간격 n개만 골라 줄인다. 반사율 → 선형 sRGB 복원 행렬은 시드 고정 무작위 색쌍(훈련 400쌍: 원색 반사율 + spectral.js 혼합 결과 반사율)
// 에서 최소제곱으로 적합한다. 모든 난수는 시드 고정 LCG라 같은 입력이면 같은 출력이다(결정적).
// 주의: 재현성은 spectral.js 내부의 Math.pow(`**`)가 같은 값을 내는 JS 엔진(V8)에 기댄다. 다른 엔진에서 --check가 어긋나면 먼저 그 점을 의심한다.
//
// 이 스크립트는 spectral.js 외의 어떤 데이터도 읽지 않는다(표의 출처가 spectral.js 하나임을 코드로 보장).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_OUT = path.join(APP_DIR, "src/engine/pigment/km-tables.ts");
const DEFAULT_TEST = path.join(APP_DIR, "src/engine/pigment/km-mix.test.ts");

/** 고정 입력: 이 버전·파일 해시가 아니면 거부한다(표는 이 정확한 빌드에서 파생됐다). */
const PINNED_VERSION = "3.0.0";
const PINNED_SOURCE_SHA256 = "dbaa1a8b44d2c734b48b6d44777b1f182c9740e9220d2cbded02002c8e6d271a";
const COPYRIGHT_LINE = "Copyright (c) 2025 Ronald van Wijnen";
const TRAIN_SEED = 20261008;
const TRAIN_PAIRS = 400;
const SIGNIFICANT_DIGITS = 8;
const FULL_BANDS = 38;

/** spectral.js LICENSE 원문(저작권 고지 포함). 설치본 LICENSE와 같은지 확인한 뒤 표 헤더에 그대로 넣는다. */
const MIT_LICENSE_TEXT = `MIT License

${COPYRIGHT_LINE}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const TABLE_BODY_MARKER = "// ==== 표 본문 시작(위 sha256의 대상은 이 줄 다음부터 파일 끝까지) ====";
const GOLDEN_BEGIN = "// GOLDEN-BEGIN";
const GOLDEN_END = "// GOLDEN-END";

/** 골든 색쌍: 8비트 sRGB 입력(spectral.js 입력과 같은 정수)과 t 점. */
const GOLDEN_T = [0, 0.25, 0.5, 0.75, 1];
const GOLDEN_PAIRS = [
  { id: "blue-yellow", label: "파랑+노랑", a: [0, 33, 133], b: [252, 210, 0] },
  { id: "red-green", label: "빨강+초록", a: [208, 16, 16], b: [16, 160, 32] },
  { id: "magenta-cyan", label: "마젠타+시안", a: [255, 0, 255], b: [0, 255, 255] },
  { id: "white-blue", label: "흰색+파랑 틴트", a: [255, 255, 255], b: [0, 33, 133] },
  { id: "white-red", label: "흰색+빨강 틴트", a: [255, 255, 255], b: [208, 16, 16] },
  { id: "white-yellow", label: "흰색+노랑 틴트", a: [255, 255, 255], b: [252, 210, 0] },
  { id: "dark-teal-white", label: "어두운 청록+흰색", a: [11, 31, 42], b: [255, 255, 255] },
  { id: "near-black-tint", label: "먹색(#101010)+흰 틴트(#f4f4f4)", a: [16, 16, 16], b: [244, 244, 244] },
  { id: "pure-black-white", label: "순흑(0,0,0)+순백", a: [0, 0, 0], b: [255, 255, 255] },
];
const GOLDEN_DECIMALS = 6;

function fail(message) {
  console.error(`gen-km-tables: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { check: false, printGolden: false, out: DEFAULT_OUT, test: DEFAULT_TEST, spectral: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") opts.check = true;
    else if (arg === "--print-golden") opts.printGolden = true;
    else if (arg === "--out" || arg === "--test") {
      const value = argv[i + 1];
      if (!value) fail(`${arg}에 경로가 필요하다`);
      opts[arg === "--out" ? "out" : "test"] = path.resolve(value);
      i += 1;
    } else if (arg.startsWith("--")) fail(`알 수 없는 옵션: ${arg}`);
    else if (opts.spectral === null) opts.spectral = path.resolve(arg);
    else fail(`위치 인자가 둘 이상이다: ${arg}`);
  }
  if (opts.spectral === null) {
    fail("spectral.js 경로가 필요하다. 사용법: node apps/brush-lab/scripts/gen-km-tables.mjs [--check] <spectral.js 설치 경로>");
  }
  return opts;
}

/** spectral.js 설치본을 읽고 버전·파일 해시·라이선스를 고정값과 대조한다. */
function loadSpectral(spectralPath) {
  if (!existsSync(spectralPath)) fail(`경로가 없다: ${spectralPath}`);
  const dir = statSync(spectralPath).isDirectory() ? spectralPath : path.dirname(spectralPath);
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) fail(`package.json이 없다: ${pkgPath}`);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name !== "spectral.js" || pkg.version !== PINNED_VERSION) {
    fail(`spectral.js ${PINNED_VERSION}만 허용한다(발견: ${pkg.name}@${pkg.version})`);
  }
  if (pkg.license !== "MIT") fail(`package.json license가 MIT가 아니다: ${pkg.license}`);
  const entry = path.join(dir, "spectral.js");
  const sourceSha = createHash("sha256").update(readFileSync(entry)).digest("hex");
  if (sourceSha !== PINNED_SOURCE_SHA256) {
    fail(`spectral.js 파일 sha256이 고정값과 다르다(발견 ${sourceSha}). 다른 빌드에서 표를 만들지 않는다.`);
  }
  const licensePath = path.join(dir, "LICENSE");
  if (!existsSync(licensePath)) fail(`LICENSE가 없다: ${licensePath}`);
  const installed = readFileSync(licensePath, "utf8").replace(/\r\n/g, "\n").trim();
  if (installed !== MIT_LICENSE_TEXT) fail("설치본 LICENSE가 헤더에 넣을 MIT 전문과 다르다. 라이선스 원문을 직접 확인한다.");
  const require = createRequire(import.meta.url);
  const spectral = require(entry);
  if (typeof spectral.Color !== "function" || typeof spectral.mix !== "function") fail("spectral.js 공개 API(Color·mix)가 없다");
  return { spectral, sourceSha };
}

/** 시드 고정 선형 합동 난수(결정적). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 정규방정식 (AᵀA + εI) X = AᵀB 를 가우스 소거로 푼다. A: m×n, B: m×k → X: n×k. */
function solveLeastSquares(A, B) {
  const m = A.length;
  const n = A[0].length;
  const k = B[0].length;
  const N = Array.from({ length: n }, () => new Array(n + k).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let s = 0;
      for (let r = 0; r < m; r += 1) s += A[r][i] * A[r][j];
      N[i][j] = s + (i === j ? 1e-9 : 0);
    }
    for (let j = 0; j < k; j += 1) {
      let s = 0;
      for (let r = 0; r < m; r += 1) s += A[r][i] * B[r][j];
      N[i][n + j] = s;
    }
  }
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(N[r][c]) > Math.abs(N[p][c])) p = r;
    [N[c], N[p]] = [N[p], N[c]];
    const d = N[c][c];
    for (let j = c; j < n + k; j += 1) N[c][j] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = N[r][c];
      if (f === 0) continue;
      for (let j = c; j < n + k; j += 1) N[r][j] -= f * N[c][j];
    }
  }
  return N.map((row) => row.slice(n));
}

const round = (x) => Number(x.toPrecision(SIGNIFICANT_DIGITS));

/** n밴드 표: 선택 밴드 인덱스, 7기저 반사율(7×n), 복원 행렬(3×n). */
function buildBandTable(spectral, n) {
  const bands = Array.from({ length: n }, (_, i) => Math.round((i * (FULL_BANDS - 1)) / (n - 1)));
  const primaries = [
    [255, 255, 255], [0, 255, 255], [255, 0, 255], [255, 255, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255],
  ];
  const fullBasis = primaries.map((c) => Array.from(new spectral.Color(c).R));
  for (const b of fullBasis) if (b.length !== FULL_BANDS) fail(`기저 스펙트럼 길이가 ${FULL_BANDS}가 아니다: ${b.length}`);

  const rnd = lcg(TRAIN_SEED);
  const rows = [];
  const targets = [];
  const push = (R, lrgb) => {
    rows.push(bands.map((b) => R[b]));
    targets.push([lrgb[0], lrgb[1], lrgb[2]]);
  };
  for (let i = 0; i < TRAIN_PAIRS; i += 1) {
    const ca = new spectral.Color([rnd() * 255, rnd() * 255, rnd() * 255]);
    const cb = new spectral.Color([rnd() * 255, rnd() * 255, rnd() * 255]);
    const t = rnd();
    const mixed = spectral.mix([ca, 1 - t], [cb, t]);
    push(ca.R, ca.lRGB);
    push(mixed.R, mixed.lRGB);
  }
  const X = solveLeastSquares(rows, targets);
  const rec = [];
  for (let c = 0; c < 3; c += 1) for (let j = 0; j < n; j += 1) rec.push(round(X[j][c]));
  const basis = fullBasis.flatMap((b) => bands.map((i) => round(b[i])));
  return { bands: n, index: bands, basis, rec };
}

function emitTable(name, t) {
  return [
    `export const ${name} = {`,
    `  bands: ${t.bands},`,
    `  /** 38밴드(380nm + 10nm·i) 중 선택한 인덱스 */`,
    `  index: [${t.index.join(", ")}],`,
    `  /** 흰·시안·마젠타·노랑·빨강·초록·파랑 7기저의 반사율(7×${t.bands}, 행 우선) */`,
    `  basis: new Float32Array([${t.basis.join(", ")}]),`,
    `  /** ${t.bands}밴드 반사율 → 선형 sRGB 복원 행렬(3×${t.bands}, 행 우선, 훈련 시드 ${TRAIN_SEED}) */`,
    `  rec: new Float32Array([${t.rec.join(", ")}]),`,
    `} as const;`,
    ``,
  ].join("\n");
}

function renderTablesFile(spectral, sourceSha) {
  const body = [emitTable("KM_TABLE_8", buildBandTable(spectral, 8)), emitTable("KM_TABLE_6", buildBandTable(spectral, 6))].join("\n");
  const bodySha = createHash("sha256").update(body).digest("hex");
  const license = MIT_LICENSE_TEXT.split("\n")
    .map((line) => (line === "" ? " *" : ` *   ${line}`))
    .join("\n");
  const header = [
    "/*",
    " * 자동 생성 파일 — 수정 금지.",
    " *",
    " * 생성 스크립트: apps/brush-lab/scripts/gen-km-tables.mjs",
    " *   재생성: node apps/brush-lab/scripts/gen-km-tables.mjs <spectral.js 3.0.0 설치 경로>",
    " *   검증:   node apps/brush-lab/scripts/gen-km-tables.mjs --check <spectral.js 3.0.0 설치 경로> (재생성 결과가 이 파일과 바이트 동일해야 한다)",
    " * 원본 데이터: spectral.js 3.0.0 (MIT) — 공개 API로 읽은 7기저 반사율 스펙트럼을 n밴드로 줄인 파생 표다.",
    ` * 원본 spectral.js 파일 sha256: ${sourceSha}`,
    ` * 훈련: 시드 ${TRAIN_SEED} 고정 LCG, 무작위 색쌍 ${TRAIN_PAIRS}개(원색 반사율 + spectral.js 혼합 결과 반사율)의 최소제곱 적합`,
    ` * 표 본문 sha256: ${bodySha}`,
    " *",
    " * 이 표는 위 원본 데이터에서 파생했으므로 아래 MIT 라이선스 전문과 저작권 고지를 유지해야 한다(번들·재배포 포함).",
    " *",
    " * ----- spectral.js 라이선스 전문 -----",
    license,
    " */",
    "",
    TABLE_BODY_MARKER,
    "",
  ].join("\n");
  return header + body;
}

function renderGoldenBlock(spectral) {
  const uncompand = (x) => (x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const fmt = (x) => String(Number(clamp01(x).toFixed(GOLDEN_DECIMALS)));
  const lines = [
    GOLDEN_BEGIN,
    `// 기대값 생성기: apps/brush-lab/scripts/gen-km-tables.mjs (spectral.js ${PINNED_VERSION}, 원본 sha256 ${PINNED_SOURCE_SHA256.slice(0, 16)}…).`,
    "// 입력은 8비트 sRGB 정수이고 spectral.js에 같은 정수를 넣는다. 기대값은 mix([a, 1 − t], [b, t]).lRGB를 0..1로 클램프하고 소수 6자리로 반올림한 선형 sRGB다.",
    "// 이 블록은 생성기가 쓴다 — 직접 수정하지 않는다(--check가 어긋남을 잡는다).",
    `const GOLDEN_T: readonly number[] = [${GOLDEN_T.join(", ")}];`,
    "const GOLDEN_PAIRS: readonly GoldenPair[] = [",
  ];
  for (const pair of GOLDEN_PAIRS) {
    const colorA = new spectral.Color(pair.a);
    const colorB = new spectral.Color(pair.b);
    const expected = GOLDEN_T.map((t) => {
      const lRGB = spectral.mix([colorA, 1 - t], [colorB, t]).lRGB;
      return `[${lRGB.map(fmt).join(", ")}]`;
    });
    // 입력 정수가 선형 값으로 올바르게 바뀌는지 자기 점검(생성기 버그 방지).
    if (pair.a.some((v, i) => Math.abs(colorA.lRGB[i] - uncompand(v / 255)) > 1e-12)) fail(`골든 입력 a 선형 변환 불일치: ${pair.id}`);
    lines.push(
      "  {",
      `    id: "${pair.id}",`,
      `    label: "${pair.label}",`,
      `    a: [${pair.a.join(", ")}],`,
      `    b: [${pair.b.join(", ")}],`,
      `    expected: [${expected.join(", ")}],`,
      "  },",
    );
  }
  lines.push("];", GOLDEN_END);
  return lines.join("\n");
}

function extractGoldenBlock(testSource) {
  const begin = testSource.indexOf(GOLDEN_BEGIN);
  const end = testSource.indexOf(GOLDEN_END);
  if (begin < 0 || end < begin) return null;
  return { begin, end: end + GOLDEN_END.length, text: testSource.slice(begin, end + GOLDEN_END.length) };
}

function firstDiff(expected, actual) {
  const a = expected.split("\n");
  const b = actual.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return `줄 ${i + 1}: 재생성=${JSON.stringify((a[i] ?? "").slice(0, 120))} / 커밋=${JSON.stringify((b[i] ?? "").slice(0, 120))}`;
  }
  return "차이를 찾지 못했다";
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { spectral, sourceSha } = loadSpectral(opts.spectral);
  const golden = renderGoldenBlock(spectral);
  if (opts.printGolden) {
    console.log(golden);
    return;
  }
  const tables = renderTablesFile(spectral, sourceSha);

  if (opts.check) {
    let ok = true;
    const committed = existsSync(opts.out) ? readFileSync(opts.out, "utf8") : null;
    if (committed === tables) {
      console.log(`[OK] ${path.relative(APP_DIR, opts.out)}: 재생성 결과와 바이트 동일(${Buffer.byteLength(tables)} B)`);
    } else {
      ok = false;
      console.error(`[불일치] ${path.relative(APP_DIR, opts.out)}: ${committed === null ? "파일이 없다" : firstDiff(tables, committed)}`);
    }
    const testSource = existsSync(opts.test) ? readFileSync(opts.test, "utf8") : null;
    const block = testSource === null ? null : extractGoldenBlock(testSource);
    if (block !== null && block.text === golden) {
      console.log(`[OK] ${path.relative(APP_DIR, opts.test)}: GOLDEN 블록이 재생성 결과와 동일`);
    } else {
      ok = false;
      console.error(`[불일치] ${path.relative(APP_DIR, opts.test)}: ${block === null ? "GOLDEN 마커 블록이 없다" : firstDiff(golden, block.text)}`);
    }
    process.exit(ok ? 0 : 1);
  }

  writeFileSync(opts.out, tables);
  console.log(`쓴 파일: ${path.relative(APP_DIR, opts.out)} (${Buffer.byteLength(tables)} B)`);
  const testSource = existsSync(opts.test) ? readFileSync(opts.test, "utf8") : null;
  const block = testSource === null ? null : extractGoldenBlock(testSource);
  if (testSource === null || block === null) {
    console.log("GOLDEN 마커 블록이 있는 테스트 파일이 없어 골든 블록은 쓰지 않았다(--print-golden으로 출력).");
    return;
  }
  writeFileSync(opts.test, testSource.slice(0, block.begin) + golden + testSource.slice(block.end));
  console.log(`갱신: ${path.relative(APP_DIR, opts.test)} GOLDEN 블록`);
}

main();
