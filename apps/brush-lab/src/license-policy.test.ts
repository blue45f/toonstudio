import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

/**
 * 상용 이용 가능 라이선스 게이트(요구: "상업적으로 이용 가능한 설계").
 * 정책 문서: apps/brush-lab/docs/license-policy.md, docs/adr/0008-license-isolation-policy.md,
 * docs/engines/labs-brush-engine-references-2026-10-01.md.
 *
 * - brush-lab의 **프로덕션 의존 폐포**(workspace 패키지를 따라 들어가는 전이 의존 포함)가 모두 허용 SPDX인지 본다.
 *   허용 목록 밖은 `review`(법무 검토 전 채택 금지), 금지 목록은 `reject`다. 둘 다 실패한다(검토를 마친 패키지는 REVIEWED에 사유와 함께 올린다).
 * - 금지 패키지 이름(라이선스 필드가 MIT처럼 보여도 바이너리 약관이 다르거나 원장이 금지한 것)은 따로 막는다.
 * - 바이너리(.wasm)는 npm 메타데이터에 라이선스가 없으므로 BINARY_COMPONENTS 원장에 출처·라이선스를 올려야 하고,
 *   원장에 없는 .wasm이 생기거나 원장의 파일이 사라지면 실패한다.
 * - **번들 내장 wasm**: 패키지가 wasm을 JS에 base64로 내장하면(예: `@dimforge/rapier2d-compat`) 위 `.wasm` 파일 검사에 걸리지 않는다.
 *   그래서 프로덕션 폐포의 패키지 파일을 훑어 wasm 매직(`\0asm\x01\0\0\0`의 base64 `AGFzbQEAAA`·바이트 배열 표기)이 있는 패키지를 찾고,
 *   `EMBEDDED_WASM` 원장(버전·내장 wasm 해시·내장 Rust crate 부분집합과 라이선스·고지 문서)에 없으면 실패한다.
 *   원장의 crate 목록은 **경로 문자열로 식별한 부분집합**이다: 설치본 wasm 바이트 안의 `registry/src/…/이름-버전/`·`/rust/deps/이름-버전/` 경로와 정확히 일치해야 하지만
 *   panic 경로를 남기지 않는 의존은 식별되지 않으므로 이것이 링크된 crate 전체라는 보증은 아니다(Cargo.toml 이 선언한 나머지는 `declaredUnconfirmed` 에 따로 올린다).
 * - SPDX 식 해석기와 위반 탐지기를 표본으로 자체 검증한다(구멍 방지).
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");

// ---------------------------------------------------------------- 정책 데이터

/** 채택 가능 SPDX(소문자 비교). 상용 배포에 고지 외 의무가 없거나 고지·NOTICE 유지뿐인 허용형 라이선스. */
const ALLOWED_SPDX = new Set(["mit", "apache-2.0", "bsd-2-clause", "bsd-3-clause", "isc", "0bsd", "zlib", "cc0-1.0", "unlicense", "bsl-1.0"]);

/** 접두 일치로 거부하는 계열(소문자). */
const REJECTED_PREFIXES = ["gpl", "agpl", "sspl", "busl", "cc-by-nc", "cc-by-sa", "polyform", "prosperity", "commons-clause", "elastic", "unlicensed"];

/** `WITH` 예외 절을 붙여도 기본 판정을 더 낫게 만들지 않는다(예외는 판정을 올리지 않는다). 기록용 허용 예외 이름. */
const KNOWN_EXCEPTIONS = new Set(["llvm-exception", "classpath-exception-2.0"]);

type Verdict = "ok" | "review" | "reject";
const RANK: Record<Verdict, number> = { ok: 0, review: 1, reject: 2 };

/** 라이선스 필드가 허용형처럼 보여도 채택을 막는 패키지(사유 필수). */
const BANNED_PACKAGES: Readonly<Record<string, string>> = {
  mixbox: "CC BY-NC(비상업) — 원장 금지",
  lygia: "Prosperity(상업 이용 불가) — 원장 금지",
  "canvaskit-wasm": "원장 '개념만'(Skia) — 번들 금지(경계 테스트도 import를 막는다)",
  "@babylonjs/havok": "래퍼는 MIT이나 Havok 바이너리 약관이 별도 — 법무 검토 전 금지",
  p5: "LGPL-2.1 — 법무 검토 전 번들 금지(p5.brush 알고리즘은 개념만 쓴다)",
  "taichi.js": "라이선스 필드 없음 — 미확인",
  "ammo.js": "라이선스 필드 없음 — 미확인",
};

/**
 * 라이선스 메타데이터가 비었거나 비표준이지만 LICENSE 파일을 직접 읽어 검토를 마친 패키지(`이름@버전`). 사유와 검토일을 적는다.
 * 새 항목은 검토 근거(LICENSE 원문 확인)와 함께 PR에서 승인받는다.
 */
const REVIEWED: Readonly<Record<string, { readonly spdx: string; readonly noteKo: string }>> = {};

/**
 * 바이너리 구성요소 원장: 저장소 기준 상대 경로 → 출처와 라이선스. npm 패키지가 아닌 .wasm이 대상이다.
 * `original`은 이 저장소의 자체 소스에서 빌드한 산출물이다.
 */
const BINARY_COMPONENTS: readonly { readonly file: string; readonly component: string; readonly license: string }[] = [
  { file: "apps/brush-lab/wasm/sumi-kernel/pkg/sumi_kernel.wasm", component: "Sumi 래스터 커널(자체 Rust 크레이트, 재현 빌드 CI 검증)", license: "original" },
  { file: "packages/studio-brush-platform/src/ink-mesh/ink_mesh.wasm", component: "ink-mesh(자체 Rust 크레이트)", license: "original" },
  { file: "packages/studio-brush-platform/src/libmypaint/mypaint-wasm.wasm", component: "libmypaint v1.6.1 (mypaint/libmypaint, COPYING=ISC)", license: "ISC" },
  { file: "packages/studio-brush-platform/src/ink-modeler/ink_stroke_modeler.wasm", component: "google/ink-stroke-modeler (NOTICE 유지)", license: "Apache-2.0" },
  { file: "packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm_bg.wasm", component: "Hokusai 0.3.0 (studio-hokusai-wasm README)", license: "Apache-2.0 OR MIT" },
];

/** .wasm 탐색 루트(저장소 기준). 빌드 산출물·node_modules는 제외한다. */
const BINARY_SCAN_ROOTS = ["apps/brush-lab", "packages/studio-brush-platform", "packages/studio-hokusai-wasm"];

// ---------------------------------------------------------------- SPDX 식 해석

function classifyId(raw: string): Verdict {
  const id = raw.trim().toLowerCase().replace(/\+$/u, "");
  if (id.length === 0) return "review";
  if (ALLOWED_SPDX.has(id)) return "ok";
  if (REJECTED_PREFIXES.some((prefix) => id.startsWith(prefix))) return "reject";
  return "review";
}

/** SPDX 식을 토큰으로 자른다: 괄호, AND/OR/WITH, 식별자. */
function tokenize(expression: string): string[] {
  return expression.match(/\(|\)|[^\s()]+/gu) ?? [];
}

/**
 * 식 판정: `OR`은 가장 나은 쪽, `AND`는 가장 나쁜 쪽, `WITH`는 기본 라이선스 판정을 따른다(예외가 판정을 올리지 않는다).
 * 해석할 수 없는 식은 `review`다.
 */
function evaluateSpdx(expression: string): Verdict {
  const trimmed = expression.trim();
  if (trimmed.length === 0 || /^see\s+license/iu.test(trimmed)) return "review";
  const tokens = tokenize(trimmed);
  let pos = 0;

  let malformed = false;

  const parseOr = (): Verdict => {
    let best = parseAnd();
    while (tokens[pos]?.toUpperCase() === "OR") {
      pos += 1;
      const next = parseAnd();
      if (RANK[next] < RANK[best]) best = next;
    }
    return best;
  };
  const parseAnd = (): Verdict => {
    let worst = parseFactor();
    while (tokens[pos]?.toUpperCase() === "AND") {
      pos += 1;
      const next = parseFactor();
      if (RANK[next] > RANK[worst]) worst = next;
    }
    return worst;
  };
  const parseFactor = (): Verdict => {
    const token = tokens[pos];
    if (token === undefined) return "review";
    if (token === "(") {
      pos += 1;
      const inner = parseOr();
      if (tokens[pos] === ")") pos += 1;
      else malformed = true;
      return inner;
    }
    pos += 1;
    let verdict = classifyId(token);
    if (tokens[pos]?.toUpperCase() === "WITH") {
      pos += 1;
      const exception = tokens[pos]?.toLowerCase() ?? "";
      pos += 1;
      // 알려진 예외도, 모르는 예외도 판정을 올리지 않는다. 모르는 예외가 붙은 허용 라이선스는 검토 대상이다.
      if (verdict === "ok" && !KNOWN_EXCEPTIONS.has(exception)) verdict = "review";
    }
    return verdict;
  };

  const result = parseOr();
  // 괄호가 맞지 않거나 남는 토큰이 있으면 식을 이해하지 못한 것이다.
  return malformed || pos < tokens.length ? "review" : result;
}

// ---------------------------------------------------------------- 의존 폐포

interface PackageInfo {
  readonly name: string;
  readonly version: string;
  readonly license: string | null;
  readonly dir: string;
  /** 저장소 안의 workspace 패키지(node_modules 밖)인가 */
  readonly internal: boolean;
  readonly via: string;
}

interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly license?: unknown;
  readonly licenses?: unknown;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

function readPackageJson(dir: string): PackageJson {
  return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as PackageJson;
}

/** package.json의 license/licenses 필드를 SPDX 식 문자열로 정규화한다(없으면 null). */
function licenseFieldOf(pkg: PackageJson): string | null {
  if (typeof pkg.license === "string") return pkg.license;
  if (typeof pkg.license === "object" && pkg.license !== null && "type" in pkg.license && typeof pkg.license.type === "string") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    const types = pkg.licenses.map((entry: unknown) => (typeof entry === "object" && entry !== null && "type" in entry && typeof entry.type === "string" ? entry.type : null)).filter((t): t is string => t !== null);
    if (types.length > 0) return types.join(" OR ");
  }
  return null;
}

/** Node 해석 규칙대로 `fromDir`에서 위로 올라가며 `dep`의 패키지 디렉터리를 찾는다(pnpm 심볼릭 링크 구조 포함). */
function findDependency(fromDir: string, dep: string): string | null {
  let current = fromDir;
  for (;;) {
    const nodeModules = path.basename(current) === "node_modules" ? current : path.join(current, "node_modules");
    const candidate = path.join(nodeModules, dep);
    if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function productionClosure(appDir: string): { readonly packages: PackageInfo[]; readonly missing: string[] } {
  const packages = new Map<string, PackageInfo>();
  const missing: string[] = [];
  const visit = (dir: string, via: string): void => {
    const pkg = readPackageJson(dir);
    const name = pkg.name ?? path.basename(dir);
    const version = pkg.version ?? "0.0.0";
    const key = `${name}@${version}`;
    if (packages.has(key)) return;
    const internal = !dir.split(path.sep).includes("node_modules");
    packages.set(key, { name, version, license: licenseFieldOf(pkg), dir, internal, via });
    const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      const resolved = findDependency(dir, dep);
      // 선택 의존(플랫폼별 바이너리 등)은 설치되지 않을 수 있다 — 설치된 것만 검사한다.
      if (resolved === null) {
        if (!optional.has(dep)) missing.push(`${dep} (요구: ${key})`);
      } else visit(resolved, key);
    }
  };
  visit(realpathSync(appDir), "root");
  return { packages: [...packages.values()], missing };
}

interface LicenseFinding {
  readonly pkg: string;
  readonly license: string;
  readonly verdict: Verdict;
  readonly reason: string;
}

/** 폐포의 위반(허용 밖·금지 이름)을 모은다. workspace 내부 패키지는 라이선스 필드가 없어도 된다. */
function licenseFindings(packages: readonly PackageInfo[]): LicenseFinding[] {
  const findings: LicenseFinding[] = [];
  for (const info of packages) {
    const key = `${info.name}@${info.version}`;
    const banned = BANNED_PACKAGES[info.name];
    if (banned !== undefined) findings.push({ pkg: key, license: info.license ?? "(없음)", verdict: "reject", reason: `금지 패키지: ${banned}` });
    if (info.internal) continue;
    const reviewed = REVIEWED[key];
    const expression = reviewed?.spdx ?? info.license;
    if (expression === null) {
      findings.push({ pkg: key, license: "(없음)", verdict: "review", reason: "라이선스 메타데이터가 없다 — LICENSE 파일을 직접 읽고 REVIEWED에 올려야 한다" });
      continue;
    }
    const verdict = evaluateSpdx(expression);
    if (verdict !== "ok") findings.push({ pkg: key, license: expression, verdict, reason: verdict === "reject" ? "금지 계열 라이선스" : "허용 목록 밖 — 법무 검토 전 채택 금지" });
  }
  return findings;
}

// ---------------------------------------------------------------- 바이너리 원장

function findWasmFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === "target" || name === ".git") continue;
      const full = path.join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.endsWith(".wasm")) out.push(path.relative(REPO_ROOT, full).split(path.sep).join("/"));
    }
  };
  for (const root of BINARY_SCAN_ROOTS) {
    const dir = path.join(REPO_ROOT, root);
    if (existsSync(dir)) walk(dir);
  }
  return out.sort();
}


/**
 * 번들 내장 wasm 원장: npm 패키지의 JS에 base64로 내장됐거나 패키지 안에 따로 들어 있는 wasm. npm 메타데이터의 라이선스는 **래퍼**의 것이고
 * wasm 안에는 Rust crate들이 정적으로 링크돼 있어 crate별 라이선스가 따로 따라온다(고지 문서에 기록).
 *
 * 확인 방식 구분(2026-10-08):
 * - `confirmedInWasm`: 설치본 wasm 바이트에서 `registry/src/<인덱스>/<이름>-<버전>/` 또는 `/rust/deps/<이름>-<버전>/`(표준 라이브러리가 품은 제3자 코드) 경로 문자열로
 *   이름·버전을 **직접 확인**한 crate(테스트가 집합 일치를 검사한다). 이 집합은 **경로로 식별한 부분집합**이지 링크된 crate 전체가 아니다.
 * - `licenseSource: "원격 조회"`: crate 라이선스는 설치본에 없어 crates.io API와 crate 소스 아카이브(static.crates.io)의 LICENSE 파일로 확인했다.
 *   crates.io 의 옛 표기 `MIT/Apache-2.0` 은 SPDX `MIT OR Apache-2.0` 로 적는다.
 * - 경로로 식별되지 않는 의존(Cargo.toml 에는 선언돼 있으나 wasm 에서 문자열 흔적을 찾지 못한 것)은 `DeclaredDependency`(declaredUnconfirmed)로 라이선스와 함께 올린다.
 */
interface EmbeddedCrate {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  /** wasm 바이트 안 registry 경로 문자열로 이름·버전을 확인했는가 */
  readonly confirmedInWasm: boolean;
  readonly licenseSource: "원격 조회";
}

/**
 * Cargo.toml 이 필수 의존으로 선언했지만 wasm 바이트에서 경로 문자열로 확인하지 못한 의존(2026-10-08, 선언 기준).
 * 컴파일 단위에 링크됐을 수 있으므로 상용 승격 전 `cargo-about` 로 전체 목록을 만들 때까지 고지 대상 후보로 올린다.
 * 라이선스는 crates.io API 의 해당 버전 `license` 필드를 원격 조회했다(요구 버전 범위의 최댓값 기준).
 */
interface DeclaredDependency {
  readonly name: string;
  /** Cargo.toml 의 요구 버전 범위 */
  readonly versionReq: string;
  /** 요구 범위에서 라이선스를 조회한 버전 */
  readonly checkedVersion: string;
  readonly license: string;
  /** 이 의존을 선언한 crate(버전). Cargo.toml 은 crates.io 소스 아카이브(static.crates.io)에서 받았다 */
  readonly declaredBy: string;
  /** `proc-macro` 면 컴파일 시점 매크로라 wasm 에 링크되지 않을 수 있다 */
  readonly kind: "일반 의존" | "proc-macro(빌드 시점)";
}

interface EmbeddedWasmEntry {
  readonly pkg: string;
  /** npm 패키지 버전. `null` 이면 이 저장소의 workspace 패키지(버전과 무관하게 이름으로 찾는다) */
  readonly version: string | null;
  /** npm 패키지(래퍼) 라이선스 — 설치본 package.json 과 일치해야 한다. workspace 자체 산출물은 `original` */
  readonly license: string;
  /** wasm 이 들어 있는 패키지 상대 파일 전체(인라인 JS·독립 .wasm). 폐포 탐색 결과와 정확히 일치해야 한다 */
  readonly files: readonly string[];
  readonly wasmBytes: number;
  readonly wasmSha256: string;
  /** wasm 바이트 안에 반드시 있어야 하는 문자열(빌드 도구·컴파일러·소스 위치 증거) */
  readonly anchors: readonly string[];
  readonly crates: readonly EmbeddedCrate[];
  /** Cargo.toml 이 선언했으나 wasm 에서 경로로 확인하지 못한 의존(선언 기준·wasm 에서 미확인). 비어 있으면 조사하지 않았거나 해당 없음 */
  readonly declaredUnconfirmed: readonly DeclaredDependency[];
  /** 고지 문서(저장소 기준 상대 경로). 자체 산출물(`original`)은 null */
  readonly noticeDoc: string | null;
  /** 이 내장 wasm 이 `BINARY_COMPONENTS` 의 어느 .wasm 파일과 바이트 동일해야 하는지(자체 산출물의 생성 사본) */
  readonly sameBytesAs?: string;
}

/** 원장 항목의 폐포 탐색 키: 외부 패키지는 `이름@버전`, workspace 패키지는 이름. */
function embeddedKey(entry: Pick<EmbeddedWasmEntry, "pkg" | "version">): string {
  return entry.version === null ? entry.pkg : `${entry.pkg}@${entry.version}`;
}

const EMBEDDED_WASM: readonly EmbeddedWasmEntry[] = [
  {
    pkg: "@dimforge/rapier2d-compat",
    version: "0.21.0",
    license: "Apache-2.0",
    files: ["dist/rapier.cjs", "dist/rapier.mjs", "dist/rapier_wasm2d_bg.wasm"],
    wasmBytes: 2_404_467,
    wasmSha256: "322b00649f412e75e047c79741b6b89e6323f6f81034d114a9e8ab872bae7435",
    anchors: [
      "/rustc/48a229ceaefd4985c50990b14116b6d856af0985",
      "wasm-bindgen",
      "0.2.129 (165586f85)",
      "rapier/crates/rapier2d/../../src/dynamics/rigid_body_set.rs",
      "builds/rapier2d/../../src/geometry/collider.rs",
    ],
    crates: [
      { name: "nalgebra", version: "0.35.0", license: "Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "parry2d", version: "0.31.1", license: "Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "glam", version: "0.33.10", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "arrayvec", version: "0.7.8", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "ena", version: "0.14.4", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "hashbrown", version: "0.17.1", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "js-sys", version: "0.3.106", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "once_cell", version: "1.21.4", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "robust", version: "1.2.0", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "smallvec", version: "1.16.2", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "spade", version: "2.15.1", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      { name: "web-time", version: "1.1.0", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      // 표준 라이브러리가 품은 제3자 코드: wasm 안 `/rust/deps/dlmalloc-0.2.13/src/dlmalloc.rs` 경로로 식별한다(메모리 할당기). 이전에는 '식별 불가'로 잘못 적었다.
      { name: "dlmalloc", version: "0.2.13", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" },
      // 아래 둘은 registry 경로가 아니라 wasm 의 producers 섹션(wasm-bindgen)·소스 경로(rapier2d)로 식별한다.
      { name: "wasm-bindgen", version: "0.2.129", license: "MIT OR Apache-2.0", confirmedInWasm: false, licenseSource: "원격 조회" },
      { name: "rapier2d", version: "(wasm 안 버전 표기 없음)", license: "Apache-2.0", confirmedInWasm: false, licenseSource: "원격 조회" },
    ],
    declaredUnconfirmed: [
      // nalgebra 0.35.0 Cargo.toml 의 필수(optional 아님) 의존
      { name: "approx", versionReq: "0.5", checkedVersion: "0.5.1", license: "Apache-2.0", declaredBy: "nalgebra 0.35.0 · parry2d 0.31.1", kind: "일반 의존" },
      { name: "num-complex", versionReq: "0.4", checkedVersion: "0.4.6", license: "MIT OR Apache-2.0", declaredBy: "nalgebra 0.35.0", kind: "일반 의존" },
      { name: "num-rational", versionReq: "0.4", checkedVersion: "0.4.2", license: "MIT OR Apache-2.0", declaredBy: "nalgebra 0.35.0", kind: "일반 의존" },
      { name: "num-traits", versionReq: "0.2", checkedVersion: "0.2.19", license: "MIT OR Apache-2.0", declaredBy: "nalgebra 0.35.0 · parry2d 0.31.1", kind: "일반 의존" },
      { name: "simba", versionReq: "0.10", checkedVersion: "0.10.2", license: "Apache-2.0", declaredBy: "nalgebra 0.35.0 · parry2d 0.31.1", kind: "일반 의존" },
      { name: "typenum", versionReq: "1.12", checkedVersion: "1.20.1", license: "MIT OR Apache-2.0", declaredBy: "nalgebra 0.35.0", kind: "일반 의존" },
      // parry2d 0.31.1 Cargo.toml 의 필수 의존(arrayvec 은 위 확인 목록에 있다)
      { name: "bitflags", versionReq: "2.3", checkedVersion: "2.13.2", license: "MIT OR Apache-2.0", declaredBy: "parry2d 0.31.1", kind: "일반 의존" },
      { name: "either", versionReq: "1", checkedVersion: "1.19.0", license: "MIT OR Apache-2.0", declaredBy: "parry2d 0.31.1", kind: "일반 의존" },
      { name: "foldhash", versionReq: "0.2", checkedVersion: "0.2.0", license: "Zlib", declaredBy: "parry2d 0.31.1", kind: "일반 의존" },
      { name: "glamx", versionReq: "0.3", checkedVersion: "0.3.1", license: "MIT OR Apache-2.0", declaredBy: "parry2d 0.31.1", kind: "일반 의존" },
      { name: "log", versionReq: "0.4", checkedVersion: "0.4.34", license: "MIT OR Apache-2.0", declaredBy: "parry2d 0.31.1", kind: "일반 의존" },
      { name: "ordered-float", versionReq: "5", checkedVersion: "5.5.0", license: "MIT", declaredBy: "parry2d 0.31.1", kind: "일반 의존" },
      { name: "num-derive", versionReq: "0.5", checkedVersion: "0.5.1", license: "MIT OR Apache-2.0", declaredBy: "parry2d 0.31.1", kind: "proc-macro(빌드 시점)" },
      { name: "thiserror", versionReq: "2", checkedVersion: "2.0.21", license: "MIT OR Apache-2.0", declaredBy: "parry2d 0.31.1", kind: "proc-macro(빌드 시점)" },
    ],
    noticeDoc: "apps/brush-lab/docs/notices/rapier2d-third-party.md",
  },
  {
    // 자체 Rust 커널(wasm/sumi-kernel)의 base64 사본. build.sh 가 생성하며 pkg/sumi_kernel.wasm 과 바이트 동일해야 한다(BINARY_COMPONENTS `original`).
    pkg: "@toonstudio/brush-lab",
    version: null,
    license: "original",
    files: ["src/engine/wasm/kernel-embedded.ts"],
    wasmBytes: 33_946,
    wasmSha256: "63a5d3d3c2124b86f212ff6d3abe77f379a654768624b13c520390b3274209dc",
    anchors: [],
    // 자체 커널 wasm 도 표준 라이브러리의 메모리 할당기 dlmalloc 0.2.13 을 품는다(`/rust/deps/dlmalloc-0.2.13/` 경로로 식별, R-C-5에서 발견).
    crates: [{ name: "dlmalloc", version: "0.2.13", license: "MIT OR Apache-2.0", confirmedInWasm: true, licenseSource: "원격 조회" }],
    declaredUnconfirmed: [],
    noticeDoc: "apps/brush-lab/docs/notices/sumi-kernel-third-party.md",
    sameBytesAs: "apps/brush-lab/wasm/sumi-kernel/pkg/sumi_kernel.wasm",
  },
];

/** wasm 매직(`\0asm` + 버전 1)의 base64 표기(오프셋 0). 3바이트 정렬이라 데이터 URL 접두 뒤에서도 같다. */
const WASM_MAGIC_BASE64 = "AGFzbQEAAA";
/**
 * base64 표기: wasm 이 다른 바이트 뒤에 이어 붙으면 3바이트 정렬이 어긋나 오프셋 0 의 표기가 나오지 않는다. 오프셋 0·1·2 를 모두 본다
 * (오프셋 1·2 는 매직 앞의 알 수 없는 바이트가 섞이는 글자를 빼고 변하지 않는 구간만 쓴다. base64url 의 `-`·`_` 도 같은 구간이다).
 * - 오프셋 0: `00 61 73 6d 01 00 00 00` → `AGFzbQEAAA`
 * - 오프셋 1(앞 1바이트 x): `[x 00 61] [73 6d 01] [00 00 00]` → `?[AQgw]Bh` + `c20BAAAA`
 * - 오프셋 2(앞 2바이트): `[x y 00] [61 73 6d] [01 00 00]` → `A` + `YXNtAQAA`
 */
const WASM_MAGIC_BASE64_PATTERNS: readonly RegExp[] = [/AGFzbQEAAA/u, /[A-Za-z0-9+/_-][AQgw]Bhc20BAAAA/u, /AYXNtAQAA/u];

/** 바이트 하나의 숫자 리터럴 표기(10진·16진·2진·8진, 앞자리 0 허용). */
function byteLiteralPattern(value: number): string {
  return `(?:0*${value}|0x0*${value.toString(16)}|0b0*${value.toString(2)}|0o0*${value.toString(8)})`;
}

const WASM_MAGIC_BYTES = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00] as const;

/** 숫자 배열 리터럴(`0x00, 97, 0x73, 109, 1, 0, 0, 0`처럼 10진·16진·2진·8진이 섞여도 된다). */
const WASM_MAGIC_ARRAY = new RegExp(`(?<![\\w.])${WASM_MAGIC_BYTES.map(byteLiteralPattern).join("\\s*,\\s*")}(?![\\w.])`, "iu");

/** 16진 문자열(`0061736d01000000`, 공백·쉼표·`\x`·`0x` 구분 포함). */
const WASM_MAGIC_HEX = new RegExp(WASM_MAGIC_BYTES.map((b) => `(?:\\\\x|0x)?${b.toString(16).padStart(2, "0")}`).join("[\\s,]*"), "iu");

/** 문자열 이스케이프(`"\0asm\x01\0\0\0"`, `\x00asm…`, `\u0000asm…`)와 원시 바이트(latin1 로 읽은 raw `\0asm\x01\0\0\0`). */
const WASM_MAGIC_ESCAPE = /(?:\\0|\\x00|\\u0000)asm(?:\\x0?1|\\u0001|\\1)(?:\\0|\\x00|\\u0000)(?:\\0|\\x00|\\u0000)(?:\\0|\\x00|\\u0000)/u;
const WASM_MAGIC_RAW = String.fromCharCode(...WASM_MAGIC_BYTES);

/**
 * 파일 내용에 wasm 이 인라인으로 들어 있는지.
 * 잡는 표기: base64(오프셋 3종)·base64url·데이터 URL, 바이트 배열(10진/16진/2진/8진 혼합), 16진 문자열, 문자열 이스케이프, 원시 바이트.
 * **못 잡는 표기(한계, docs/license-policy.md 2절)**: gzip/brotli/zlib 등으로 압축한 뒤 인코딩한 wasm, 암호화·분할(여러 조각을 런타임에 이어 붙임)·
 * XOR 같은 난독화, 네트워크에서 내려받는 wasm. 이런 것은 수동 검토 항목이다.
 */
function containsInlineWasm(content: string): boolean {
  return WASM_MAGIC_BASE64_PATTERNS.some((re) => re.test(content)) || WASM_MAGIC_ARRAY.test(content) || WASM_MAGIC_HEX.test(content) || WASM_MAGIC_ESCAPE.test(content) || content.includes(WASM_MAGIC_RAW);
}

/**
 * 훑지 않는 확장자: 실행·로드되지 않는 문서·소스맵과 이미지·글꼴 같은 미디어. 이 밖의 확장자는 비코드(`.json`·`.bin`·`.node`·`.data`·확장자 없음 등)도 훑는다
 * (wasm 을 `.json`/`.bin` 으로 담거나 확장자를 바꿔 숨기는 길을 막는다). `.wasm` 은 따로 외부 패키지에서만 센다(저장소 자체 wasm 은 BINARY_COMPONENTS 가 맡는다).
 */
const WASM_SCAN_SKIP_EXTENSIONS = new Set([".map", ".md", ".markdown", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".webm", ".ogg"]);
/** 한 파일을 읽어 훑는 크기 상한(바이트). 넘는 파일은 건너뛰지 않고 `skippedLarge` 로 보고해 테스트가 실패하게 한다(조용한 구멍 방지). */
const WASM_SCAN_MAX_BYTES = 16 * 1024 * 1024;
/** 테스트 파일은 배포 대상이 아니고 탐지기·로더 시험 표본(가짜 wasm 헤더)을 담으므로 건너뛴다. */
const WASM_SCAN_SKIP_FILE = /\.test\.[cm]?[jt]sx?$/u;
const WASM_SCAN_SKIP_DIRS = new Set(["node_modules", ".git"]);
/** workspace(내부) 패키지는 빌드 산출물·캐시 디렉터리도 건너뛴다(외부 패키지는 dist 가 곧 배포 코드다). */
const WASM_SCAN_SKIP_DIRS_INTERNAL = new Set(["dist", "target", "coverage", ".turbo"]);

interface EmbeddedWasmFinding {
  readonly pkg: string;
  /** 패키지 상대 경로(POSIX) */
  readonly files: readonly string[];
}

interface EmbeddedWasmScan {
  readonly findings: EmbeddedWasmFinding[];
  /** 크기 상한을 넘어 훑지 못한 파일(`패키지 › 상대 경로`). 비어 있어야 한다. */
  readonly skippedLarge: string[];
  /** 실제로 내용을 훑은 파일 수(탐색기가 살아 있는지 확인용). */
  readonly scannedFiles: number;
}

/** 폐포 패키지 파일에서 wasm 을 가진 패키지·파일을 찾는다. */
function scanEmbeddedWasm(packages: readonly PackageInfo[]): EmbeddedWasmScan {
  const findings: EmbeddedWasmFinding[] = [];
  const skippedLarge: string[] = [];
  let scannedFiles = 0;
  for (const info of packages) {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (WASM_SCAN_SKIP_DIRS.has(name) || (info.internal && WASM_SCAN_SKIP_DIRS_INTERNAL.has(name))) continue;
        const full = path.join(dir, name);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
          continue;
        }
        if (WASM_SCAN_SKIP_FILE.test(name)) continue;
        const ext = path.extname(name).toLowerCase();
        let found = false;
        if (ext === ".wasm") found = !info.internal;
        else if (!WASM_SCAN_SKIP_EXTENSIONS.has(ext)) {
          if (stat.size > WASM_SCAN_MAX_BYTES) {
            skippedLarge.push(`${info.name} › ${path.relative(info.dir, full).split(path.sep).join("/")}`);
            continue;
          }
          scannedFiles += 1;
          found = containsInlineWasm(readFileSync(full, "latin1"));
        }
        if (found) hits.push(path.relative(info.dir, full).split(path.sep).join("/"));
      }
    };
    walk(info.dir);
    if (hits.length > 0) findings.push({ pkg: info.internal ? info.name : `${info.name}@${info.version}`, files: hits.sort() });
  }
  return { findings: findings.sort((x, y) => x.pkg.localeCompare(y.pkg)), skippedLarge, scannedFiles };
}

/** 파일에서 wasm 바이트를 꺼낸다: 독립 .wasm 은 그대로, JS 는 매직부터 이어지는 base64 구간을 디코드한다. */
function extractWasmBytes(file: string): Buffer {
  if (file.endsWith(".wasm")) return readFileSync(file);
  const content = readFileSync(file, "latin1");
  const start = content.indexOf(WASM_MAGIC_BASE64);
  if (start < 0) throw new Error(`${file}: base64 wasm 매직을 찾지 못했다`);
  // 생성 파일(kernel-embedded.ts)은 base64 를 여러 줄로 나눠 담으므로 공백을 지운 뒤 디코드한다.
  const run = /^[A-Za-z0-9+/\s]+={0,2}/u.exec(content.slice(start));
  if (run === null) throw new Error(`${file}: base64 구간을 읽지 못했다`);
  return Buffer.from(run[0].replace(/\s+/gu, ""), "base64");
}

/**
 * wasm 바이트 안의 crate 경로에서 `이름@버전` 집합을 읽는다: 외부 crate 는 `registry/src/<인덱스>/<이름>-<버전>/`, 표준 라이브러리가 품은 제3자 코드는
 * `/rust/deps/<이름>-<버전>/`(예: dlmalloc, hashbrown)다. 경로 문자열을 남기는 crate 만 식별되므로 결과는 링크된 crate 전체가 아니라 **부분집합**이다.
 */
function registryCratesIn(wasm: Buffer): string[] {
  const text = wasm.toString("latin1");
  const found = new Set<string>();
  const patterns = [/registry\/src\/[^/\0]+\/([A-Za-z0-9_.+-]+?)-(\d+\.\d+\.\d+[A-Za-z0-9.+-]*)\//gu, /\/rust\/deps\/([A-Za-z0-9_.+-]+?)-(\d+\.\d+\.\d+[A-Za-z0-9.+-]*)\//gu];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.add(`${match[1]}@${match[2]}`);
  }
  return [...found].sort();
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** 내장 wasm 원장 위반 목록(폐포 탐색 결과 ↔ 원장). 빈 배열 = 일치. */
function embeddedWasmFindings(found: readonly EmbeddedWasmFinding[], ledger: readonly EmbeddedWasmEntry[]): string[] {
  const out: string[] = [];
  for (const hit of found) {
    const entry = ledger.find((candidate) => embeddedKey(candidate) === hit.pkg);
    if (entry === undefined) {
      out.push(`${hit.pkg}: 내장 wasm(${hit.files.join(", ")})이 EMBEDDED_WASM 원장에 없다 — 출처·crate 라이선스를 확인해 올려야 한다`);
      continue;
    }
    if (hit.files.join("|") !== [...entry.files].sort().join("|")) {
      out.push(`${hit.pkg}: wasm 이 있는 파일이 원장과 다르다 (설치본 ${hit.files.join(", ")} ≠ 원장 ${entry.files.join(", ")})`);
    }
  }
  for (const entry of ledger) {
    if (!found.some((hit) => hit.pkg === embeddedKey(entry))) {
      out.push(`${embeddedKey(entry)}: 원장에 있으나 프로덕션 폐포에서 내장 wasm 을 찾지 못했다(버전이 바뀌었거나 의존이 빠졌다)`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 테스트

describe("상용 이용 가능 라이선스 게이트", () => {
  const closure = productionClosure(APP_ROOT);

  it("프로덕션 의존 폐포가 수집된다(react·zod와 workspace 패키지 포함)", () => {
    const names = closure.packages.map((info) => info.name);
    expect(names).toContain("react");
    expect(names).toContain("zod");
    expect(names).toContain("@toonstudio/studio-brush-platform");
    expect(closure.packages.length).toBeGreaterThan(5);
  });

  it("의존 폐포에서 해석하지 못한 패키지가 없다(설치 누락이면 검사 구멍이 생긴다)", () => {
    expect(closure.missing).toEqual([]);
  });

  it("프로덕션 의존 폐포의 모든 외부 패키지가 허용 SPDX이고 금지 패키지가 없다", () => {
    expect(licenseFindings(closure.packages)).toEqual([]);
  });

  it("바이너리(.wasm)는 모두 원장에 출처·라이선스가 있고, 원장의 파일은 실제로 존재한다", () => {
    const found = findWasmFiles();
    const ledger = BINARY_COMPONENTS.map((entry) => entry.file).sort();
    const unlisted = found.filter((file) => !ledger.includes(file));
    const stale = ledger.filter((file) => !existsSync(path.join(REPO_ROOT, file)));
    expect({ unlisted, stale }).toEqual({ unlisted: [], stale: [] });
  });

  it("원장의 바이너리 라이선스가 모두 허용형이다(`original`은 자체 소스)", () => {
    const bad = BINARY_COMPONENTS.filter((entry) => entry.license !== "original" && evaluateSpdx(entry.license) !== "ok").map((entry) => `${entry.file}: ${entry.license}`);
    expect(bad).toEqual([]);
  });
});

describe("번들 내장 wasm 원장(EMBEDDED_WASM)", () => {
  const closure = productionClosure(APP_ROOT);
  const scan = scanEmbeddedWasm(closure.packages);
  const found = scan.findings;

  it("탐색기가 살아 있다: 프로덕션 폐포에서 Rapier 의 내장 wasm 을 실제로 찾는다", () => {
    expect(found.map((hit) => hit.pkg)).toContain("@dimforge/rapier2d-compat@0.21.0");
  });

  it("wasm 을 가진 폐포 패키지는 모두 원장에 있고 파일 목록이 일치한다(원장에 없는 내장 wasm 이 생기면 실패)", () => {
    expect(embeddedWasmFindings(found, EMBEDDED_WASM)).toEqual([]);
  });

  const externalEntries = EMBEDDED_WASM.filter((entry) => entry.version !== null).map((entry) => [embeddedKey(entry), entry] as const);
  const allEntries = EMBEDDED_WASM.map((entry) => [embeddedKey(entry), entry] as const);

  it.each(externalEntries)("%s: 설치 버전·래퍼 라이선스가 원장과 일치하고 허용 SPDX 이다", (_key, entry) => {
    const info = closure.packages.find((candidate) => candidate.name === entry.pkg);
    expect(info, `${entry.pkg} 가 폐포에 없다`).toBeDefined();
    expect(info?.version).toBe(entry.version);
    expect(info?.license).toBe(entry.license);
    expect(evaluateSpdx(entry.license)).toBe("ok");
  });

  it.each(allEntries)("%s: 내장 wasm 바이트(해시·크기)가 파일마다 원장과 같고, 경로로 식별한 crate 부분집합이 원장과 일치한다(링크된 crate 전체 목록이 아니다)", (_key, entry) => {
    const info = closure.packages.find((candidate) => candidate.name === entry.pkg);
    expect(info).toBeDefined();
    if (info === undefined) return;
    for (const rel of entry.files) {
      const wasm = extractWasmBytes(path.join(info.dir, rel));
      expect({ file: rel, bytes: wasm.length, sha256: sha256Hex(wasm) }).toEqual({ file: rel, bytes: entry.wasmBytes, sha256: entry.wasmSha256 });
    }
    const first = entry.files[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const wasm = extractWasmBytes(path.join(info.dir, first));
    const text = wasm.toString("latin1");
    // 증거 문자열(컴파일러 커밋·wasm-bindgen 버전·rapier 소스 경로)
    expect(entry.anchors.filter((anchor) => !text.includes(anchor))).toEqual([]);
    // 경로(registry/src·/rust/deps)로 식별한 crate 집합 == 원장에서 confirmedInWasm 인 crate 집합. 식별되지 않는 의존이 있을 수 있어 '전체'가 아니라 '부분집합'이다.
    const confirmed = entry.crates.filter((crate) => crate.confirmedInWasm).map((crate) => `${crate.name}@${crate.version}`).sort();
    expect(registryCratesIn(wasm)).toEqual(confirmed);
    // 자체 산출물의 생성 사본은 원본 .wasm 과 바이트 동일해야 한다.
    if (entry.sameBytesAs !== undefined) {
      expect(sha256Hex(readFileSync(path.join(REPO_ROOT, entry.sameBytesAs)))).toBe(entry.wasmSha256);
      expect(BINARY_COMPONENTS.some((component) => component.file === entry.sameBytesAs && component.license === "original")).toBe(true);
    }
  });

  it("원장의 모든 crate 라이선스가 허용 SPDX 이고 확인 방식이 표기돼 있다", () => {
    const bad: string[] = [];
    for (const entry of EMBEDDED_WASM) {
      for (const crate of entry.crates) {
        if (evaluateSpdx(crate.license) !== "ok") bad.push(`${entry.pkg} › ${crate.name}@${crate.version}: ${crate.license}`);
        if (crate.licenseSource !== "원격 조회") bad.push(`${entry.pkg} › ${crate.name}: 확인 방식 표기 없음`);
      }
    }
    expect(bad).toEqual([]);
  });

  /** 마크다운에서 제목 접두(`## 3`·`### 4.1` 등)로 시작하는 절의 `| \`` 표 행을 모은다. 다음 같은 수준 이하 제목이 나오면 끝난다. */
  function noticeTableRows(text: string, headingPrefix: string): string[] {
    const lines = text.split(/\r?\n/u);
    const start = lines.findIndex((line) => line.startsWith(headingPrefix));
    if (start < 0) return [];
    const level = /^#+/u.exec(lines[start] ?? "")?.[0].length ?? 2;
    const rows: string[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const heading = /^(#+)\s/u.exec(line);
      if (heading !== null && (heading[1]?.length ?? 9) <= level) break;
      if (line.startsWith("| `")) rows.push(line);
    }
    return rows;
  }

  const noticeEntries = EMBEDDED_WASM.filter((entry) => entry.noticeDoc !== null).map((entry) => [embeddedKey(entry), entry] as const);

  it.each(externalEntries)("%s: 외부 패키지는 고지 문서가 있어야 한다", (_key, entry) => {
    expect(entry.noticeDoc, `${entry.pkg}: 외부 패키지는 고지 문서가 필요하다`).not.toBeNull();
  });

  it.each(noticeEntries)("%s: 고지 문서가 실제로 있고 패키지·wasm 해시·식별한 모든 crate·선언 기준 의존을 담고 있다", (_key, entry) => {
    if (entry.noticeDoc === null) return;
    const file = path.join(REPO_ROOT, entry.noticeDoc);
    expect(existsSync(file), `${entry.noticeDoc} 가 없다`).toBe(true);
    const text = readFileSync(file, "utf8");
    const missing: string[] = [];
    for (const needle of [embeddedKey(entry), entry.wasmSha256, entry.license]) if (!text.includes(needle)) missing.push(needle);
    for (const crate of entry.crates) if (!text.includes(`${crate.name}\` ${crate.version}`) && !text.includes(`${crate.name} ${crate.version}`)) missing.push(`${crate.name} ${crate.version}`);
    for (const dep of entry.declaredUnconfirmed) if (!text.includes(`${dep.name}\``) || !text.includes(dep.license)) missing.push(`선언 기준 ${dep.name} (${dep.license})`);
    // 원격 조회로 구분 표기했는지와 확인하지 못한 범위 절·부분집합 단서가 있는지
    for (const needle of ["원격 조회", "확인하지 못한 범위", "부분집합"]) if (!text.includes(needle)) missing.push(needle);
    if (entry.declaredUnconfirmed.length > 0) for (const needle of ["선언 기준", "wasm 에서 미확인"]) if (!text.includes(needle)) missing.push(needle);
    expect(missing).toEqual([]);
  });

  it.each(noticeEntries)("%s: 고지 문서의 crate 표 행수가 원장과 같다(원장에만 올리고 문서를 빼먹는 것을 막는다)", (_key, entry) => {
    if (entry.noticeDoc === null) return;
    const text = readFileSync(path.join(REPO_ROOT, entry.noticeDoc), "utf8");
    expect(noticeTableRows(text, "## 3"), `${entry.noticeDoc} 3절(식별한 crate 부분집합)`).toHaveLength(entry.crates.length);
    expect(noticeTableRows(text, "### 4.1"), `${entry.noticeDoc} 4.1절(선언 기준·wasm 에서 미확인)`).toHaveLength(entry.declaredUnconfirmed.length);
  });

  it("선언 기준·wasm 에서 미확인 의존의 라이선스도 모두 허용 SPDX 이고 식별한 crate 와 겹치지 않는다", () => {
    const bad: string[] = [];
    for (const entry of EMBEDDED_WASM) {
      const confirmed = new Set(entry.crates.map((crate) => crate.name));
      for (const dep of entry.declaredUnconfirmed) {
        if (evaluateSpdx(dep.license) !== "ok") bad.push(`${entry.pkg} › ${dep.name}: ${dep.license}`);
        if (confirmed.has(dep.name)) bad.push(`${entry.pkg} › ${dep.name}: 식별한 crate 와 중복`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("선언 기준 의존은 정말 wasm 에서 경로로 식별되지 않는다(식별되면 confirmedInWasm 쪽으로 옮겨야 한다)", () => {
    const rapier = EMBEDDED_WASM.find((entry) => entry.pkg === "@dimforge/rapier2d-compat");
    const info = closure.packages.find((candidate) => candidate.name === "@dimforge/rapier2d-compat");
    expect(rapier).toBeDefined();
    expect(info).toBeDefined();
    if (rapier === undefined || info === undefined) return;
    const first = rapier.files[0];
    if (first === undefined) return;
    const identified = new Set(registryCratesIn(extractWasmBytes(path.join(info.dir, first))).map((id) => id.replace(/@.*/u, "")));
    expect(rapier.declaredUnconfirmed.filter((dep) => identified.has(dep.name)).map((dep) => dep.name)).toEqual([]);
  });

  it("탐색기는 비코드 확장자도 훑고, 크기 상한을 넘어 건너뛴 파일이 없으며, 훑은 파일이 충분하다", () => {
    expect(scan.skippedLarge).toEqual([]);
    expect(scan.scannedFiles).toBeGreaterThan(100);
  });

  it("탐지기 자체 검증: base64·데이터 URL·바이트 배열 표기는 잡고 비슷한 문자열은 잡지 않는다", () => {
    const wasmHeader = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04]);
    const b64 = wasmHeader.toString("base64");
    expect(b64.startsWith(WASM_MAGIC_BASE64)).toBe(true);
    expect(containsInlineWasm(`const w = "${b64}";`)).toBe(true);
    expect(containsInlineWasm(`url("data:application/wasm;base64,${b64}")`)).toBe(true);
    expect(containsInlineWasm("new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 1, 2])")).toBe(true);
    expect(containsInlineWasm("new Uint8Array([0,97,115,109,1,0,0,0,1])")).toBe(true);
    // 매직 일부·버전이 다른 표기·일반 문자열은 잡지 않는다.
    expect(containsInlineWasm("const x = 'AGFzbQ is only a prefix';")).toBe(false);
    expect(containsInlineWasm("new Uint8Array([0,97,115,109,2,0,0,0])")).toBe(false);
    expect(containsInlineWasm("export const label = '0asm';")).toBe(false);
  });

  it("탐지기 자체 검증(R-C-3): wasm 앞에 다른 바이트가 붙은 base64·base64url(오프셋 1·2)도 잡는다", () => {
    const body = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f]);
    // 앞 1바이트 x 를 0..255 전부(오프셋 1), 앞 2바이트를 여러 조합으로(오프셋 2), 3바이트(오프셋 0 으로 되돌아옴), 4~5바이트까지 확인한다.
    for (let x = 0; x < 256; x += 1) {
      const buf = Buffer.concat([Buffer.from([x]), body]);
      expect(containsInlineWasm(`"${buf.toString("base64")}"`), `앞 1바이트 ${x}`).toBe(true);
      expect(containsInlineWasm(`"${buf.toString("base64url")}"`), `앞 1바이트 ${x} (url)`).toBe(true);
    }
    for (const [x, y] of [[0, 0], [255, 255], [1, 2], [0x80, 0x7f], [0x61, 0x00], [250, 3], [17, 200]] as const) {
      const buf = Buffer.concat([Buffer.from([x, y]), body]);
      expect(containsInlineWasm(`"${buf.toString("base64")}"`), `앞 2바이트 ${x},${y}`).toBe(true);
      expect(containsInlineWasm(`"${buf.toString("base64url")}"`), `앞 2바이트 ${x},${y} (url)`).toBe(true);
    }
    for (let len = 3; len <= 8; len += 1) {
      const buf = Buffer.concat([Buffer.alloc(len, 0xa5), body]);
      expect(containsInlineWasm(`"${buf.toString("base64")}"`), `앞 ${len}바이트`).toBe(true);
    }
  });

  it("탐지기 자체 검증(R-C-3): 16진 문자열·문자열 이스케이프·원시 바이트·10/16/2/8진 혼합 배열도 잡는다", () => {
    expect(containsInlineWasm('const hex = "0061736d01000000010401";')).toBe(true);
    expect(containsInlineWasm('const hex = "0061736D01000000";')).toBe(true);
    expect(containsInlineWasm('const hex = "00 61 73 6d 01 00 00 00";')).toBe(true);
    expect(containsInlineWasm('const hex = "\\x00\\x61\\x73\\x6d\\x01\\x00\\x00\\x00";')).toBe(true);
    expect(containsInlineWasm('const s = "\\0asm\\x01\\0\\0\\0";')).toBe(true);
    expect(containsInlineWasm('const s = "\\x00asm\\x01\\x00\\x00\\x00";')).toBe(true);
    expect(containsInlineWasm('const s = "\\u0000asm\\u0001\\u0000\\u0000\\u0000";')).toBe(true);
    expect(containsInlineWasm(`blob:${String.fromCharCode(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0)}rest`)).toBe(true);
    expect(containsInlineWasm("[0x00, 97, 115, 109, 1, 0, 0, 0]")).toBe(true);
    expect(containsInlineWasm("[0, 0x61, 0b1110011, 0o155, 0x1, 0, 0x00, 0]")).toBe(true);
    expect(containsInlineWasm("[ 0x00 ,0x61 ,0x73 ,0x6D ,0x01 ,0x00 ,0x00 ,0x00 ]")).toBe(true);
    expect(containsInlineWasm("new Uint8Array([\n  0,\n  97,\n  115,\n  109,\n  1,\n  0,\n  0,\n  0\n])")).toBe(true);
    // 비슷하지만 wasm 이 아닌 표기는 잡지 않는다.
    expect(containsInlineWasm('const hex = "0061736d02000000";')).toBe(false);
    expect(containsInlineWasm("[0, 97, 115, 109, 1, 0, 0, 1]")).toBe(false);
    expect(containsInlineWasm("[10, 97, 115, 109, 1, 0, 0, 0]")).toBe(false);
    expect(containsInlineWasm("[0, 97, 115, 109, 1, 0, 0]")).toBe(false);
    expect(containsInlineWasm("const note = 'the asm.js format';")).toBe(false);
    expect(containsInlineWasm(Buffer.from("그냥 평범한 base64 문자열 sample 입니다. ".repeat(40)).toString("base64"))).toBe(false);
  });

  it("탐지기 자체 검증(한계): 압축(gzip·brotli·zlib)한 뒤 인코딩한 wasm 은 잡지 못한다 — docs/license-policy.md 2절에 한계로 명시한 수동 검토 항목이다", () => {
    const body = Buffer.concat([Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]), Buffer.alloc(64, 7)]);
    expect(containsInlineWasm(gzipSync(body).toString("base64"))).toBe(false);
    expect(containsInlineWasm(brotliCompressSync(body).toString("base64"))).toBe(false);
    expect(containsInlineWasm(deflateSync(body).toString("base64"))).toBe(false);
    // 같은 바이트를 압축하지 않고 담으면 잡힌다(탐지기가 죽은 것이 아님을 대조).
    expect(containsInlineWasm(body.toString("base64"))).toBe(true);
  });

  it("원장 위반 탐지기가 실제로 잡는다: 원장에 없는 패키지·파일 목록 불일치·사라진 패키지", () => {
    const rapier = EMBEDDED_WASM.find((entry) => entry.pkg === "@dimforge/rapier2d-compat");
    const own = EMBEDDED_WASM.find((entry) => entry.version === null);
    expect(rapier).toBeDefined();
    expect(own).toBeDefined();
    if (rapier === undefined || own === undefined) return;
    const rapierHit = { pkg: embeddedKey(rapier), files: [...rapier.files].sort() };
    const ownHit = { pkg: embeddedKey(own), files: [...own.files].sort() };
    expect(embeddedWasmFindings([rapierHit, ownHit], EMBEDDED_WASM)).toEqual([]);
    expect(embeddedWasmFindings([{ pkg: "some-wasm-pkg@1.0.0", files: ["dist/a.js"] }, rapierHit, ownHit], EMBEDDED_WASM)).toHaveLength(1);
    expect(embeddedWasmFindings([{ pkg: rapierHit.pkg, files: ["dist/rapier.mjs"] }, ownHit], EMBEDDED_WASM)).toHaveLength(1);
    // 버전이 바뀐 외부 패키지는 원장 키가 달라 '원장에 없음'과 '사라진 항목' 두 건이 난다.
    expect(embeddedWasmFindings([{ pkg: "@dimforge/rapier2d-compat@0.22.0", files: rapierHit.files }, ownHit], EMBEDDED_WASM)).toHaveLength(2);
    expect(embeddedWasmFindings([ownHit], EMBEDDED_WASM)).toHaveLength(1);
  });

  it("registry 경로 파서: 이름에 하이픈·점이 든 crate 와 사전 릴리스 버전을 읽는다", () => {
    const sample = Buffer.from("x/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/web-time-1.1.0/src/lib.rs\0y/registry/src/index.crates.io-aaaa/foo_bar-0.3.0-rc.1/src/a.rs", "latin1");
    expect(registryCratesIn(sample)).toEqual(["foo_bar@0.3.0-rc.1", "web-time@1.1.0"]);
  });

  it("R-C-5 경로 파서: 표준 라이브러리가 품은 제3자 코드(/rust/deps/<이름>-<버전>/)도 식별한다", () => {
    const sample = Buffer.from("x/rustc/abc/library/std/src/lib.rs\0/rust/deps/dlmalloc-0.2.13/src/dlmalloc.rs\0/rust/deps/hashbrown-0.17.1/src/raw.rs\0/rust/deps/hashbrown-0.17.1/src/map.rs", "latin1");
    expect(registryCratesIn(sample)).toEqual(["dlmalloc@0.2.13", "hashbrown@0.17.1"]);
    // 실제 Rapier wasm 과 자체 Sumi 커널 wasm 둘 다에서 dlmalloc 이 식별된다.
    const closure2 = productionClosure(APP_ROOT);
    const rapierDir = closure2.packages.find((candidate) => candidate.name === "@dimforge/rapier2d-compat")?.dir ?? "";
    expect(registryCratesIn(extractWasmBytes(path.join(rapierDir, "dist/rapier.mjs")))).toContain("dlmalloc@0.2.13");
    expect(registryCratesIn(readFileSync(path.join(REPO_ROOT, "apps/brush-lab/wasm/sumi-kernel/pkg/sumi_kernel.wasm")))).toEqual(["dlmalloc@0.2.13"]);
  });
});

describe("SPDX 식 해석기 자체 검증(구멍 방지)", () => {
  it.each([
    ["MIT", "ok"],
    ["Apache-2.0", "ok"],
    ["(MIT OR Apache-2.0)", "ok"],
    ["Apache-2.0 OR MIT", "ok"],
    ["MIT AND Zlib", "ok"],
    ["BSD-3-Clause", "ok"],
    ["ISC", "ok"],
    ["Unlicense", "ok"],
    ["CC0-1.0", "ok"],
    ["MIT OR GPL-3.0-only", "ok"],
    ["(GPL-2.0-or-later OR MIT)", "ok"],
    ["MPL-2.0", "review"],
    ["LGPL-2.1", "review"],
    ["LGPL-3.0-or-later", "review"],
    ["MIT AND MPL-2.0", "review"],
    ["Apache 2.0", "review"],
    ["BSD", "review"],
    ["SEE LICENSE IN LICENSE.md", "review"],
    ["", "review"],
    ["MIT WITH Weird-exception", "review"],
    ["Apache-2.0 WITH LLVM-exception", "ok"],
    ["GPL-3.0-only", "reject"],
    ["GPL-2.0+", "reject"],
    ["AGPL-3.0-or-later", "reject"],
    ["MIT AND GPL-3.0-only", "reject"],
    ["CC-BY-NC-4.0", "reject"],
    ["CC-BY-SA-4.0", "reject"],
    ["SSPL-1.0", "reject"],
    ["BUSL-1.1", "reject"],
    ["PolyForm-Noncommercial-1.0.0", "reject"],
    ["Prosperity-3.0.0", "reject"],
    ["UNLICENSED", "reject"],
    ["(MIT", "review"],
    ["MIT)", "review"],
    ["MIT Apache-2.0", "review"],
  ] as const)("%s → %s", (expression, expected) => {
    expect(evaluateSpdx(expression)).toBe(expected);
  });

  it("license/licenses 필드의 옛 형식도 읽는다", () => {
    expect(licenseFieldOf({ license: "MIT" })).toBe("MIT");
    expect(licenseFieldOf({ license: { type: "ISC" } })).toBe("ISC");
    expect(licenseFieldOf({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("MIT OR Apache-2.0");
    expect(licenseFieldOf({})).toBeNull();
  });

  it("탐지기가 위반을 실제로 잡는다: 비허용 라이선스·금지 이름·라이선스 없음", () => {
    const sample = (name: string, license: string | null, internal = false): PackageInfo => ({ name, version: "1.0.0", license, dir: `/x/${name}`, internal, via: "root" });
    const findings = licenseFindings([
      sample("ok-pkg", "MIT"),
      sample("copyleft-pkg", "GPL-3.0-only"),
      sample("weak-pkg", "MPL-2.0"),
      sample("none-pkg", null),
      sample("mixbox", "MIT"),
      sample("@toonstudio/internal-pkg", null, true),
    ]);
    expect(findings.map((finding) => [finding.pkg, finding.verdict])).toEqual([
      ["copyleft-pkg@1.0.0", "reject"],
      ["weak-pkg@1.0.0", "review"],
      ["none-pkg@1.0.0", "review"],
      ["mixbox@1.0.0", "reject"],
    ]);
  });
});
