import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
