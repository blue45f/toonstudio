import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 경계 게이트(스펙 §18). `src/**` 소스를 읽어 금지 import·전역 참조를 검사한다.
 * - 전체: apps/(web|admin-web|api|character-lab), `@/`, mixbox, canvaskit import 부재
 * - 테스트가 아닌 파일: `node:` import 부재(엔진·레인·벤치·앱은 브라우저에서 동작)
 * - 전체: 라이선스상 금지된 이름(mixbox·lygia) 문자열 부재(주석·템플릿 리터럴 안의 출처 표기 포함 — 아래 BANNED_NAMES)
 * - engine/**: `@toonstudio/`, react, ../lanes|../bench|../app|../platform 참조 부재,
 *   document/window/navigator/requestAnimationFrame/performance/Math.random/Date.now 참조 부재
 *   (`globalThis.`·`self.` 경유 접근 포함), zod는 presets/program-schema.ts·wet/params.ts만
 * - engine/**: bare specifier는 zod(위 두 파일)뿐이다(테스트는 vitest도). 외부 물리 엔진 패키지(Rapier·planck·matter 등) import는
 *   `lanes/physics/**`에서만 허용하고, 그 안에서도 값 import는 동적 `import()`만 쓴다(무거운 wasm을 `init()` 시점까지 미룬다 — 타입 import는 허용)
 * - 모듈 참조는 정규식이 아니라 TypeScript AST(`ts.createSourceFile`)로 수집한다: 정적 import·export-from·`import x = require()`·`import("…")`·
 *   `import type`/`typeof import("…")`를 구분하고, 문자열 리터럴이 아닌 동적 `import()`·`require()`·`createRequire`는 지정자를 알 수 없으므로
 *   그 자체를 위반으로 센다(변수·템플릿 지정자와 import attributes, 같은 줄의 `"a//b"` 뒤 import도 놓치지 않는다).
 * - 탐지기 자체 검증: 금지 전역·금지 이름·모듈 참조 탐지기가 실제로 위반을 잡는지(구멍이 없는지) 표본으로 확인한다.
 */

const SRC_ROOT = path.dirname(fileURLToPath(import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mts|cts)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 외부 물리 엔진 패키지(이름 규칙). engine/**에는 둘 수 없고(승격 단위는 외부 의존 0) `lanes/physics/**`에서만 쓴다.
 * 새 엔진을 시험하려면 이 목록에 이름 규칙을 더하고 그 엔진을 감싸는 어댑터를 `lanes/physics/`에 둔다.
 */
const EXTERNAL_PHYSICS_PACKAGES: readonly RegExp[] = [
  /^@dimforge\//,
  /^@box2d\//,
  /^rapier/,
  /^planck(-js)?$/,
  /^matter-js$/,
  /^p2(-es)?$/,
  /^box2d/,
  /^cannon(-es)?$/,
  /^jolt-physics/,
  /^@babylonjs\/havok$/,
  /^ammo(\.js)?$/,
  /^oimo/,
];

/** 외부 물리 엔진 패키지 지정자인가. */
function isExternalPhysicsSpecifier(spec: string): boolean {
  return EXTERNAL_PHYSICS_PACKAGES.some((re) => re.test(spec));
}

/** 상대·절대 경로가 아닌 bare specifier(패키지 이름·`node:`)인가. */
function isBareSpecifier(spec: string): boolean {
  return !spec.startsWith(".") && !spec.startsWith("/");
}

/**
 * engine/** 파일이 쓸 수 있는 bare specifier를 벗어난 지정자 목록. 비테스트 파일은 zod(허용 파일 한정은 별도 규칙)뿐이고,
 * 테스트 파일은 vitest도 쓴다. 그 밖의 패키지(외부 물리 엔진 포함)는 전부 위반이다.
 */
function engineBareSpecifierViolations(rel: string, specs: readonly string[]): string[] {
  const allowed = new Set(["zod"]);
  if (isTest(rel)) allowed.add("vitest");
  return specs.filter((spec) => isBareSpecifier(spec) && !allowed.has(spec));
}

/** 모듈 참조 종류. `type`은 런타임에 사라지는 타입 전용 참조, `dynamic`은 `import("…")`, `require`는 CJS `require("…")` 호출이다. */
type ModuleRefKind = "static" | "type" | "dynamic" | "require";

interface ModuleRef {
  /** 지정자. 문자열 리터럴이 아니어서 알 수 없으면 `OPAQUE_SPECIFIER`다. */
  spec: string;
  kind: ModuleRefKind;
}

/** 지정자를 정적으로 알 수 없는 모듈 로드(비리터럴 `import()`·`require()`)를 나타내는 표식. bare specifier로 취급되어 어떤 허용 목록에도 들지 못한다. */
const OPAQUE_SPECIFIER = "<정적으로 알 수 없는 모듈 지정자>";
/** `createRequire`(node:module)는 어떤 지정자든 CJS로 불러올 수 있는 우회로라 호출 자체를 표식으로 센다. */
const CREATE_REQUIRE_SPECIFIER = "<createRequire 호출>";

function scriptKindOf(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

/** 문자열 리터럴(따옴표·치환 없는 템플릿)의 값. 그 밖의 표현식이면 null. */
function literalText(node: ts.Node | undefined): string | null {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return node.text;
  return null;
}

/**
 * TypeScript AST로 파일의 모듈 참조를 모두 모은다. 주석·문자열 안의 import 모양 글자는 노드가 아니므로 잡히지 않고,
 * 같은 줄에 `"a//b"` 같은 문자열이 있어도 뒤의 import를 놓치지 않는다.
 */
function moduleRefs(source: string, fileName = "x.ts"): ModuleRef[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindOf(fileName));
  const refs: ModuleRef[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = literalText(node.moduleSpecifier);
      if (spec !== null) refs.push({ spec, kind: node.importClause?.isTypeOnly === true ? "type" : "static" });
    } else if (ts.isExportDeclaration(node)) {
      const spec = literalText(node.moduleSpecifier);
      if (spec !== null) refs.push({ spec, kind: node.isTypeOnly ? "type" : "static" });
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const spec = literalText(node.moduleReference.expression);
        refs.push({ spec: spec ?? OPAQUE_SPECIFIER, kind: node.isTypeOnly ? "type" : "require" });
      }
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      const spec = ts.isLiteralTypeNode(arg) ? literalText(arg.literal) : null;
      refs.push({ spec: spec ?? OPAQUE_SPECIFIER, kind: "type" });
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        // import("x") · import("x", { with: {} }) — 첫 인자만 지정자다.
        refs.push({ spec: literalText(node.arguments[0]) ?? OPAQUE_SPECIFIER, kind: "dynamic" });
      } else if (ts.isIdentifier(callee) && callee.text === "require") {
        refs.push({ spec: literalText(node.arguments[0]) ?? OPAQUE_SPECIFIER, kind: "require" });
      } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "require") {
        // module.require("x")
        refs.push({ spec: literalText(node.arguments[0]) ?? OPAQUE_SPECIFIER, kind: "require" });
      } else if ((ts.isIdentifier(callee) && callee.text === "createRequire") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "createRequire")) {
        refs.push({ spec: CREATE_REQUIRE_SPECIFIER, kind: "require" });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return refs;
}

/** 모듈 참조의 지정자 전부(타입 전용·동적·require 포함). 비리터럴 동적 로드는 `OPAQUE_SPECIFIER`로 들어간다. */
function importSpecifiers(source: string, fileName = "x.ts"): string[] {
  return moduleRefs(source, fileName).map((r) => r.spec);
}

/** `import type`이 아닌 값 import·재내보내기·부수효과 import·`import x = require()`·`require()`의 지정자(즉시 불러오는 것). 동적 `import()`와 타입 참조는 제외한다. */
function staticValueImportSpecifiers(source: string, fileName = "x.ts"): string[] {
  return moduleRefs(source, fileName)
    .filter((r) => r.kind === "static" || r.kind === "require")
    .map((r) => r.spec);
}

/** 지정자를 정적으로 알 수 없는 모듈 로드·`require`·`createRequire` 호출(전부 위반). 사유 문자열 목록. */
function opaqueModuleLoads(source: string, fileName = "x.ts"): string[] {
  const out: string[] = [];
  for (const ref of moduleRefs(source, fileName)) {
    if (ref.spec === CREATE_REQUIRE_SPECIFIER) out.push("createRequire 호출");
    else if (ref.kind === "require") out.push(`require(${ref.spec === OPAQUE_SPECIFIER ? "비리터럴" : ref.spec})`);
    else if (ref.spec === OPAQUE_SPECIFIER) out.push(`${ref.kind === "dynamic" ? "import()" : "모듈 참조"}의 지정자가 문자열 리터럴이 아니다`);
  }
  return out;
}

/**
 * 주석을 제거한다(규칙 설명 주석이 검사에 걸리지 않게). 따옴표 문자열 안의 `//`·`/*`는 주석이 아니므로 보존한다
 * (`const u = "a//b"; Date.now()`에서 뒤 코드가 지워져 금지 전역을 놓치지 않게). 템플릿 리터럴 안의 `//`는 지운다(WGSL 주석 — 원문 검사는 `raw` 규칙).
 */
function stripComments(source: string): string {
  return source.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\/|\/\/.*$/gm, (_m, quoted: string | undefined) => quoted ?? "");
}

const files = walk(SRC_ROOT).map((full) => ({
  full,
  rel: path.relative(SRC_ROOT, full).split(path.sep).join("/"),
  source: readFileSync(full, "utf8"),
}));

const isTest = (rel: string): boolean => /\.(test|spec)\.(ts|tsx|mts|cts)$/.test(rel);
const isEngine = (rel: string): boolean => rel.startsWith("engine/");
const ZOD_ALLOWED = new Set(["engine/presets/program-schema.ts", "engine/wet/params.ts"]);
const FORBIDDEN_GLOBALS = ["document", "window", "navigator", "requestAnimationFrame", "performance", "Math.random", "Date.now"];

/**
 * 주석을 제거한 코드에서 금지 전역을 쓴 이름 목록.
 * 전역 사용 형태만 잡는다: `document.x`, `document(`, `document[`, `document?.x`, `typeof document`.
 * 속성 선언(`document:`)·멤버 접근(`ctx.document`)·문자열 안의 이름(`"performance-now"`)은 엔진 자체 식별자라 허용한다.
 * `globalThis.`·`self.` 경유 접근은 멤버 접근 예외를 우회하는 길이라 따로 잡는다(`globalThis.crypto`는 허용 대상).
 */
function forbiddenGlobalUses(code: string): string[] {
  const found: string[] = [];
  for (const g of FORBIDDEN_GLOBALS) {
    const name = g.replace(".", "\\.");
    const use = new RegExp(`(^|[^\\w.$'"\`])${name}(?=\\s*(?:[.(\\[]|\\?\\.))`);
    const typeOf = new RegExp(`typeof\\s+${name}(?![\\w$])`);
    const viaGlobalObject = new RegExp(`\\b(?:globalThis|self)\\s*(?:\\?\\.|\\.|\\?\\.\\[\\s*["'\`]|\\[\\s*["'\`])\\s*${name}(?![\\w$])`);
    if (use.test(code) || typeOf.test(code) || viaGlobalObject.test(code)) found.push(g);
  }
  return found;
}

/**
 * 라이선스상 유입 금지 이름(대소문자 무시). 문서(labs-brush-engine-references §4-1)가 약속한 "mixbox·lygia 문자열 검색"이다.
 * `raw`는 주석까지 포함한 원문을 검사할 파일인가(아니면 주석 제외 소스만).
 * - mixbox(CC BY-NC): 일반 소스에는 "쓰지 않는다"는 부정 서술 주석(`pigment/kubelka-munk.ts`)이 있어 주석 제외 소스를 본다.
 *   단 WGSL 문자열 모듈(`*.wgsl.ts`)은 템플릿 리터럴 안의 `//` 주석까지 본다.
 * - lygia(Prosperity, 상업 이용 불가): 붙여 넣은 셰이더의 `#include "lygia/..."`나 출처·라이선스 주석은 템플릿 리터럴 안
 *   `//`로 남는데 `stripComments`가 그것을 지우므로, 어느 파일이든 주석 포함 원문을 본다(이 이름은 어디에도 쓰지 않는다).
 */
const BANNED_NAMES: readonly { name: string; raw: (rel: string) => boolean }[] = [
  { name: "mixbox", raw: (rel) => rel.endsWith(".wgsl.ts") },
  { name: "lygia", raw: () => true },
];

/** 금지 이름을 표본(탐지기 자체 검증)·금지 패키지 목록(라이선스 게이트)으로 담는 테스트 파일 — 이름 문자열 검사에서 제외한다. */
const BANNED_NAME_LIST_FILES = new Set(["boundary.test.ts", "license-policy.test.ts"]);

/** 파일 하나가 쓴 금지 이름 목록(대소문자 무시). */
function bannedNameUses(rel: string, source: string): string[] {
  const code = stripComments(source);
  return BANNED_NAMES.filter(({ name, raw }) => new RegExp(name, "i").test(raw(rel) ? source : code)).map(({ name }) => name);
}

describe("src 경계", () => {
  it("소스 파일이 수집된다", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.rel === "engine/index.ts")).toBe(true);
  });

  it("다른 앱·@/·canvaskit import와 mixbox·lygia 문자열이 없다", () => {
    const violations: string[] = [];
    for (const f of files) {
      for (const spec of importSpecifiers(f.source, f.rel)) {
        if (/apps\/(web|admin-web|api|character-lab)/.test(spec)) violations.push(`${f.rel}: ${spec}`);
        if (spec.startsWith("@/")) violations.push(`${f.rel}: ${spec}`);
        if (/mixbox|canvaskit/i.test(spec)) violations.push(`${f.rel}: ${spec}`);
      }
      // 이 파일들은 금지 이름을 표본·금지 목록으로 담고 있어 제외한다.
      if (BANNED_NAME_LIST_FILES.has(f.rel)) continue;
      for (const name of bannedNameUses(f.rel, f.source)) violations.push(`${f.rel}: ${name} 문자열`);
    }
    expect(violations).toEqual([]);
  });

  it("저장소 packages/ 디렉터리로 나가는 상대 import는 외부 엔진 래퍼 레인 파일(과 그 테스트)의 지정 모듈만 쓴다", () => {
    // libmypaint 로더는 패키지 exports에 없어 apps/web 네이티브 프로브 워커와 같은 상대 경로로 가져오고,
    // Hokusai는 pkg 디렉터리에 package.json이 없는 web-target 산출물이라 워크스페이스 의존이 아니라 상대 경로로 가져온다(apps/web 워커와 같다).
    const ALLOWED: Record<string, readonly RegExp[]> = {
      "lanes/libmypaint-lane.ts": [/^(\.\.\/)+packages\/studio-brush-platform\/src\/libmypaint\/index$/],
      "lanes/libmypaint-lane.test.ts": [/^(\.\.\/)+packages\/studio-brush-platform\/src\/libmypaint\/index$/],
      "lanes/hokusai-lane.ts": [/^(\.\.\/)+packages\/studio-hokusai-wasm\/pkg\/studio_hokusai_wasm\.js$/],
      "lanes/hokusai-lane.test.ts": [/^(\.\.\/)+packages\/studio-hokusai-wasm\/pkg\/studio_hokusai_wasm\.js$/],
    };
    const violations: string[] = [];
    const allowedUses: string[] = [];
    for (const f of files) {
      // 탐지기 표본(가짜 import 구문)은 문자열 리터럴이라 AST에서 노드가 아니므로 이 파일도 제외하지 않고 검사한다.
      for (const spec of importSpecifiers(f.source, f.rel)) {
        if (!spec.startsWith(".") || !/(^|\/)packages\//.test(spec)) continue;
        if ((ALLOWED[f.rel] ?? []).some((re) => re.test(spec))) allowedUses.push(`${f.rel}: ${spec.replace(/^(\.\.\/)+/, "")}`);
        else violations.push(`${f.rel}: ${spec}`);
      }
    }
    expect(violations).toEqual([]);
    // 게이트가 살아 있는지: 지정 파일은 실제로 그 모듈을 import한다.
    expect(allowedUses).toContain("lanes/libmypaint-lane.ts: packages/studio-brush-platform/src/libmypaint/index");
    expect(allowedUses).toContain("lanes/hokusai-lane.ts: packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js");
  });

  it("모든 src 파일에서 모듈 지정자는 정적으로 알 수 있어야 한다: 비리터럴 import()·require()·createRequire는 쓰지 않는다", () => {
    // 지정자를 알 수 없는 로드는 위 모든 import 규칙(엔진 bare 금지·외부 물리 패키지 격리·정적 값 import 금지)을 우회하는 길이다.
    const violations: string[] = [];
    for (const f of files) {
      for (const why of opaqueModuleLoads(f.source, f.rel)) violations.push(`${f.rel}: ${why}`);
    }
    expect(violations).toEqual([]);
  });

  it("테스트가 아닌 소스는 node: 모듈을 import하지 않는다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (isTest(f.rel)) continue;
      for (const spec of importSpecifiers(f.source, f.rel)) {
        if (spec.startsWith("node:")) violations.push(`${f.rel}: ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("engine/**는 @toonstudio/·react·레인·벤치·앱·플랫폼을 import하지 않는다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isEngine(f.rel)) continue;
      for (const spec of importSpecifiers(f.source, f.rel)) {
        if (spec.startsWith("@toonstudio/")) violations.push(`${f.rel}: ${spec}`);
        if (spec === "react" || spec.startsWith("react/") || spec === "react-dom") violations.push(`${f.rel}: ${spec}`);
        if (/(^|\/)\.\.\/(lanes|bench|app|platform)(\/|$)/.test(spec)) violations.push(`${f.rel}: ${spec}`);
        if (spec === "zod" && !ZOD_ALLOWED.has(f.rel)) violations.push(`${f.rel}: zod`);
        if (spec.startsWith("node:")) violations.push(`${f.rel}: ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("engine/**의 bare specifier는 zod(허용 파일 한정)뿐이다(테스트는 vitest도) — 외부 물리 패키지 포함 그 밖의 패키지는 거부한다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isEngine(f.rel)) continue;
      // AST로 모으므로 주석·문자열 속 WAT·예시 글자는 import로 오인되지 않는다.
      for (const spec of engineBareSpecifierViolations(f.rel, importSpecifiers(f.source, f.rel))) violations.push(`${f.rel}: ${spec}`);
    }
    expect(violations).toEqual([]);
  });

  it("외부 물리 엔진 패키지 import는 lanes/physics/** 만 허용한다(engine·bench·app·그 밖의 레인 금지)", () => {
    const violations: string[] = [];
    const allowedUses: string[] = [];
    for (const f of files) {
      // 탐지기 표본(가짜 import 구문)은 문자열 리터럴이라 AST에서 노드가 아니므로 이 파일도 제외하지 않고 검사한다.
      for (const spec of importSpecifiers(f.source, f.rel)) {
        if (!isExternalPhysicsSpecifier(spec)) continue;
        if (f.rel.startsWith("lanes/physics/")) allowedUses.push(`${f.rel}: ${spec}`);
        else violations.push(`${f.rel}: ${spec}`);
      }
    }
    expect(violations).toEqual([]);
    // 게이트가 살아 있는지: 지정 어댑터는 실제로 Rapier를 import한다.
    expect(allowedUses).toContain("lanes/physics/rapier-loader.ts: @dimforge/rapier2d-compat");
  });

  it("lanes/physics의 비테스트 소스는 외부 물리 패키지를 정적 값 import하지 않는다(동적 import()·import type만) — 무거운 wasm은 init()까지 미룬다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!f.rel.startsWith("lanes/physics/") || isTest(f.rel)) continue;
      for (const spec of staticValueImportSpecifiers(f.source, f.rel)) {
        if (isExternalPhysicsSpecifier(spec)) violations.push(`${f.rel}: ${spec}`);
      }
    }
    expect(violations).toEqual([]);
    // 게이트가 살아 있는지: 로더는 동적 import()로 실제 불러온다.
    const loader = files.find((f) => f.rel === "lanes/physics/rapier-loader.ts");
    expect(loader).toBeDefined();
    expect(importSpecifiers(loader?.source ?? "", "lanes/physics/rapier-loader.ts")).toContain("@dimforge/rapier2d-compat");
    expect(/import\(\s*["']@dimforge\/rapier2d-compat["']\s*\)/.test(loader?.source ?? "")).toBe(true);
  });

  it("engine/**(테스트 제외)는 DOM 전역·performance·Math.random·Date.now를 참조하지 않는다", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isEngine(f.rel) || isTest(f.rel)) continue;
      for (const g of forbiddenGlobalUses(stripComments(f.source))) violations.push(`${f.rel}: ${g}`);
    }
    expect(violations).toEqual([]);
  });

  it("engine/gpu 밖의 엔진 모듈은 gpu/·webgl2/·wasm/을 import하지 않는다(승격 단위 격리)", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!isEngine(f.rel)) continue;
      if (/^engine\/(gpu|webgl2|wasm)\//.test(f.rel)) continue;
      for (const spec of importSpecifiers(f.source, f.rel)) {
        if (/(^|\/)(gpu|webgl2|wasm)(\/|$)/.test(spec) && spec.startsWith(".")) {
          // 정적 대조 테스트(dab-layout.test)는 WGSL 상수를 읽어도 된다.
          if (isTest(f.rel)) continue;
          violations.push(`${f.rel}: ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("경계 탐지기 자체 검증(구멍 방지)", () => {
  it("importSpecifiers는 동적 import()와 type import의 상대 경로도 모두 수집한다", () => {
    const source = [
      'import type { A } from "../../../../packages/x/src/a";',
      'const m = await import("../../../../packages/y/pkg/y.js");',
      'export { b } from "../../../packages/z/b";',
    ].join("\n");
    expect(importSpecifiers(source)).toEqual(["../../../../packages/x/src/a", "../../../../packages/y/pkg/y.js", "../../../packages/z/b"]);
  });

  it("AST 수집기: 우회로로 알려진 표기(변수·템플릿 지정자, import attributes, require, import-equals, createRequire)를 놓치지 않는다", () => {
    const refsOf = (source: string): ModuleRef[] => moduleRefs(source, "lanes/x.ts");
    // import attributes: 지정자는 첫 인자다.
    expect(refsOf('const m = await import("planck", { with: { type: "json" } });')).toEqual([{ spec: "planck", kind: "dynamic" }]);
    // 치환 없는 템플릿 리터럴은 지정자를 알 수 있다.
    expect(refsOf("const m = await import(`planck`);")).toEqual([{ spec: "planck", kind: "dynamic" }]);
    // 변수·치환 있는 템플릿 지정자는 알 수 없으므로 표식으로 잡힌다(번들러 무시 주석이 있어도).
    expect(refsOf('const n = "planck"; const m = await import(/* @vite-ignore */ n);')).toEqual([{ spec: OPAQUE_SPECIFIER, kind: "dynamic" }]);
    expect(refsOf("const m = await import(`pl${'anck'}`);")).toEqual([{ spec: OPAQUE_SPECIFIER, kind: "dynamic" }]);
    // CJS 경로.
    expect(refsOf('const m = require("planck");')).toEqual([{ spec: "planck", kind: "require" }]);
    expect(refsOf("const m = require(name);")).toEqual([{ spec: OPAQUE_SPECIFIER, kind: "require" }]);
    expect(refsOf('import m = require("planck");')).toEqual([{ spec: "planck", kind: "require" }]);
    expect(refsOf('const r = createRequire(import.meta.url); const m = r("planck");')).toEqual([{ spec: CREATE_REQUIRE_SPECIFIER, kind: "require" }]);
    expect(refsOf('const m = module.require("planck");')).toEqual([{ spec: "planck", kind: "require" }]);
    // 같은 줄에 `//`가 든 문자열이나 `}` 뒤에 와도 놓치지 않는다.
    expect(refsOf('const u = "a//b"; import p from "planck";')).toEqual([{ spec: "planck", kind: "static" }]);
    expect(refsOf('{ const a = 1; } import q from "matter-js";')).toEqual([{ spec: "matter-js", kind: "static" }]);
    // 주석·문자열 속 import 모양 글자는 노드가 아니다.
    expect(refsOf('// import x from "planck";\n/* import("matter-js") */\nconst s = \'import y from "p2-es"\';')).toEqual([]);
    // 타입 전용은 type으로 구분된다.
    expect(refsOf('import type { W } from "planck"; export type { Z } from "p2-es"; type T = typeof import("matter-js");')).toEqual([
      { spec: "planck", kind: "type" },
      { spec: "p2-es", kind: "type" },
      { spec: "matter-js", kind: "type" },
    ]);
    // 값 import 쪽 판정: require와 import-equals는 즉시 불러오므로 정적 값 import에 든다. 동적 import()는 아니다.
    expect(staticValueImportSpecifiers('import a = require("planck"); const b = require("matter-js"); const c = import("p2-es");')).toEqual(["planck", "matter-js"]);
  });

  it("opaqueModuleLoads는 비리터럴 import()·require·createRequire를 위반으로 세고 리터럴 동적 import()는 세지 않는다", () => {
    expect(opaqueModuleLoads('const m = await import("@dimforge/rapier2d-compat");')).toEqual([]);
    expect(opaqueModuleLoads("const m = await import(name);")).toEqual(["import()의 지정자가 문자열 리터럴이 아니다"]);
    expect(opaqueModuleLoads('const n = "planck"; await import(/* @vite-ignore */ n);')).toEqual(["import()의 지정자가 문자열 리터럴이 아니다"]);
    expect(opaqueModuleLoads('const m = require("planck");')).toEqual(["require(planck)"]);
    expect(opaqueModuleLoads("const m = require(x);")).toEqual(["require(비리터럴)"]);
    expect(opaqueModuleLoads('import { createRequire } from "node:module"; const r = createRequire(import.meta.url);')).toEqual(["createRequire 호출"]);
    // 엔진 bare specifier 규칙은 표식도 위반으로 센다(어떤 허용 목록에도 들지 못한다).
    expect(engineBareSpecifierViolations("engine/x.ts", importSpecifiers("const m = await import(name);"))).toEqual([OPAQUE_SPECIFIER]);
  });

  it("stripComments는 문자열 안의 // 뒤 코드를 지우지 않아 금지 전역을 놓치지 않는다", () => {
    const code = stripComments('const u = "a//b"; const t = Date.now(); // 설명\n/* 블록 */ const v = 1;');
    expect(forbiddenGlobalUses(code)).toEqual(["Date.now"]);
    expect(code).not.toContain("설명");
    expect(code).not.toContain("블록");
    expect(code).toContain('"a//b"');
  });

  it.each([
    ["performance.now() 호출", "export const t = () => performance.now();", ["performance"]],
    ["typeof performance", 'const ok = typeof performance !== "undefined";', ["performance"]],
    ["performance?.now()", "const t = performance?.now() ?? 0;", ["performance"]],
    ["globalThis.performance 경유", "const t = globalThis.performance.now();", ["performance"]],
    ["self['performance'] 경유", "const t = self['performance'].now();", ["performance"]],
    ["globalThis.document 경유", "const el = globalThis.document.body;", ["document"]],
    ["Date.now", "const t = Date.now();", ["Date.now"]],
    ["Math.random", "const r = Math.random();", ["Math.random"]],
    ["requestAnimationFrame 호출", "requestAnimationFrame(tick);", ["requestAnimationFrame"]],
  ])("금지 전역을 잡는다: %s", (_name, code, expected) => {
    expect(forbiddenGlobalUses(code)).toEqual(expected);
  });

  it.each([
    ["문자열 리터럴 performance-now", 'export const SOURCE = "performance-now";'],
    ["문자열 high-performance", 'powerPreference: "high-performance"'],
    ["멤버 접근 clock.performance.now()", "const t = ctx.clock.performance.now();"],
    ["속성 선언 performance:", "const opts = { performance: 1 };"],
    ["이름이 이어진 식별자 performanceNow()", "const t = performanceNow();"],
    ["허용된 globalThis.crypto", "const subtle = globalThis.crypto?.subtle;"],
    ["엔진 자체 식별자 ctx.document", "const doc = ctx.document;"],
  ])("엔진 자체 식별자·문자열은 잡지 않는다: %s", (_name, code) => {
    expect(forbiddenGlobalUses(code)).toEqual([]);
  });

  it.each([
    ["Rapier 2D", "@dimforge/rapier2d-compat"],
    ["Rapier 3D", "@dimforge/rapier3d-compat"],
    ["planck", "planck"],
    ["matter-js", "matter-js"],
    ["p2-es", "p2-es"],
    ["box2d-wasm", "box2d-wasm"],
    ["box2d3-wasm", "box2d3-wasm"],
    ["cannon-es", "cannon-es"],
    ["jolt-physics", "jolt-physics"],
    ["Havok", "@babylonjs/havok"],
  ])("외부 물리 패키지 탐지기가 잡는다: %s", (_name, spec) => {
    expect(isExternalPhysicsSpecifier(spec)).toBe(true);
  });

  it.each(["zod", "vitest", "react", "../core/errors", "./world2d/types", "@toonstudio/studio-brush-platform"])("외부 물리 패키지 탐지기가 잡지 않는다: %s", (spec) => {
    expect(isExternalPhysicsSpecifier(spec)).toBe(false);
  });

  it("engine bare specifier 탐지기: 비테스트는 zod만, 테스트는 vitest도 허용하고 나머지(물리 패키지·node:·react)는 위반이다", () => {
    expect(engineBareSpecifierViolations("engine/core/x.ts", ["zod", "./y", "../z"])).toEqual([]);
    expect(engineBareSpecifierViolations("engine/core/x.ts", ["vitest"])).toEqual(["vitest"]);
    expect(engineBareSpecifierViolations("engine/core/x.test.ts", ["vitest", "zod"])).toEqual([]);
    expect(engineBareSpecifierViolations("engine/physics/world2d/w.ts", ["@dimforge/rapier2d-compat", "planck", "node:fs", "react"])).toEqual([
      "@dimforge/rapier2d-compat",
      "planck",
      "node:fs",
      "react",
    ]);
    // 동적 import도 importSpecifiers가 수집해 같은 규칙에 걸린다.
    expect(engineBareSpecifierViolations("engine/x.ts", importSpecifiers('const m = await import("matter-js");'))).toEqual(["matter-js"]);
  });

  it("정적 값 import 탐지기: 값 import·재내보내기·부수효과 import는 잡고 동적 import()·import type은 잡지 않는다", () => {
    const value = [
      'import RAPIER from "@dimforge/rapier2d-compat";',
      'import { World } from "planck";',
      'import { type A, B } from "matter-js";',
      'export { C } from "p2-es";',
      'import "box2d-wasm";',
    ].join("\n");
    expect(staticValueImportSpecifiers(value)).toEqual(["@dimforge/rapier2d-compat", "planck", "matter-js", "p2-es", "box2d-wasm"]);
    const lazy = [
      'import type { World } from "@dimforge/rapier2d-compat";',
      'import type RAPIER from "@dimforge/rapier2d-compat";',
      'const m = () => import("@dimforge/rapier2d-compat");',
      'const t: typeof import("@dimforge/rapier2d-compat") = x;',
    ].join("\n");
    expect(staticValueImportSpecifiers(lazy)).toEqual([]);
  });

  it("lygia: import·#include 문자열과 WGSL 템플릿 리터럴 안 출처 주석을 잡는다(대소문자 무시)", () => {
    const include = 'export const FOO_WGSL = `\n#include "lygia/color/mix.wgsl"\nfn f() {}`;';
    expect(bannedNameUses("engine/gpu/wgsl/foo.wgsl.ts", include)).toEqual(["lygia"]);
    // WGSL의 `//` 주석은 stripComments가 지우므로 원문 검사여야 잡힌다.
    const credit = "export const BAR_WGSL = `\n// from LYGIA (Prosperity License)\nfn f() {}`;";
    expect(bannedNameUses("engine/gpu/wgsl/bar.wgsl.ts", credit)).toEqual(["lygia"]);
    expect(bannedNameUses("engine/webgl2/glsl-bar.ts", credit)).toEqual(["lygia"]);
    expect(bannedNameUses("engine/core/x.ts", 'const mix = require("lygia/color/mix");')).toEqual(["lygia"]);
    expect(bannedNameUses("engine/core/ok.ts", "export const x = 1;")).toEqual([]);
  });

  it("mixbox: 코드·문자열은 잡고, 일반 소스의 부정 서술 주석은 허용하되 WGSL 문자열 모듈은 안의 주석까지 잡는다", () => {
    expect(bannedNameUses("engine/core/x.ts", 'const mix = require("mixbox");')).toEqual(["mixbox"]);
    expect(bannedNameUses("engine/pigment/kubelka-munk.ts", "// mixbox(CC BY-NC) 코드를 포함하지 않는다.\nexport const x = 1;")).toEqual([]);
    expect(bannedNameUses("engine/gpu/wgsl/baz.wgsl.ts", "export const BAZ_WGSL = `\n// mixbox 수식\n`;")).toEqual(["mixbox"]);
  });
});
