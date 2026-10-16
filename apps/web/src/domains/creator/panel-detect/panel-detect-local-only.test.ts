import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { FORBIDDEN_INLINE_BILINGUAL_APIS, scanInlineBilingualUsage } from "@/shared/lib/i18n-namespace-contract";

/**
 * "원고 이미지는 이 기기를 떠나지 않는다"는 약속을 소스 수준에서 지키는 경계 시험.
 * 컷 감지·재배열·카드 슬라이스 폴더의 어떤 파일도 네트워크 API 를 부르지 않고, 외부 주소를 쓰지 않으며,
 * Worker 는 같은 출처의 상대 경로 모듈로만 만든다. (실행 중 네트워크 차단 시험은 별도 규칙상 쓰지 않는다.)
 *
 * 폴더 안에 네트워크 호출이 없어도 화면 문구가 번역 서비스(런타임 기계번역)로 사용자 값을 실어 보낼 수 있다: 문구의 영어 원문이
 * 번역 원문으로 등록되어 `q=` 로 나가는데, 원문에 파일 이름·행 번호가 섞이면 그 값이 제3자로 나간다. 그래서 번역 함수 호출에
 * 템플릿 보간·문자열 이어붙이기를 금지하고(아래), 실행 중 요청은 ui/panel-import-translation-privacy.test.tsx 가 확인한다.
 */

const folder = dirname(fileURLToPath(import.meta.url));
const SELF = basename(fileURLToPath(import.meta.url));

function collect(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collect(path);
    // 시험 파일은 `blob:http://…` 같은 예시 값을 담을 수 있어 제외한다. 시험 보조(대역·합성 이미지·화면 시험 도구)는 포함한다.
    if (!/\.(ts|tsx)$/u.test(entry.name) || /\.test\.tsx?$/u.test(entry.name) || entry.name === SELF) return [];
    return [path];
  });
}

/** 주석을 지운다(주소 문자열 안의 `//` 는 앞 글자가 `:` 라서 남긴다). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:"'`\\])\/\/.*$/gmu, "$1");
}

const files = collect(folder).map((path) => ({ name: relative(folder, path), code: stripComments(readFileSync(path, "utf8")) }));

const NETWORK_APIS: ReadonlyArray<readonly [name: string, pattern: RegExp]> = [
  ["fetch", /\bfetch\s*\(/u],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/u],
  ["sendBeacon", /\bsendBeacon\b/u],
  ["WebSocket", /\bWebSocket\b/u],
  ["EventSource", /\bEventSource\b/u],
  ["RTCPeerConnection", /\bRTCPeerConnection\b/u],
  ["원격 import", /\bimport\s*\(\s*["'`]https?:/u],
  ["importScripts", /\bimportScripts\s*\(/u],
];

describe("컷 가져오기 — 이미지가 이 기기를 떠나지 않는다", () => {
  it("검사 대상 소스를 실제로 찾았다", () => {
    const names = files.map((file) => file.name);
    expect(names).toContain("panel-detect-core.ts");
    expect(names).toContain("panel-detect-client.ts");
    expect(names).toContain("panel-card-export.ts");
    expect(names).toContain(join("ui", "PanelReflowFlow.tsx"));
    expect(files.length).toBeGreaterThan(40);
  });

  for (const [name, pattern] of NETWORK_APIS) {
    it(`${name} 를 부르지 않는다`, () => {
      const offenders = files.filter((file) => pattern.test(file.code)).map((file) => file.name);
      expect(offenders).toEqual([]);
    });
  }

  it("외부 주소(http·https)를 코드에 쓰지 않는다", () => {
    const offenders = files.filter((file) => /https?:\/\//u.test(file.code)).map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it("Worker 는 같은 출처의 상대 경로 모듈로만 만든다", () => {
    const creators = files.filter((file) => /new\s+Worker\s*\(/u.test(file.code)).map((file) => file.name);
    expect(creators).toEqual(["panel-detect-client.ts"]);
    const client = files.find((file) => file.name === "panel-detect-client.ts");
    expect(client?.code).toMatch(/new\s+URL\(\s*["']\.\/panel-detect\.worker\.ts["']\s*,\s*import\.meta\.url\s*\)/u);
  });

  it("진입 구역은 가져오기 화면과 함께 불러오므로 작업대를 지연 로딩하고 정적 의존은 알림·번역·스타일뿐이다", () => {
    const entry = files.find((file) => file.name === join("ui", "PanelImportEntry.tsx"));
    expect(entry).toBeTruthy();
    const runtimeImports = [...(entry?.code.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gmu) ?? [])].map((match) => match[1]);
    // 사전 등록과 번역 훅은 use-panel-t 가 맡는다(문구 도우미 panel-import-copy 는 무거운 모듈을 끌어오므로 가져오지 않는다).
    expect(runtimeImports.filter((specifier) => specifier?.startsWith("."))).toEqual(["./PanelNotice", "./panel-import-styles", "./use-panel-t"]);
    expect(entry?.code).toMatch(/import\(\s*["']\.\/PanelImportWorkbench["']\s*\)/u);
  });

  it("화면 컴포넌트는 감지·재배열·내보내기를 환경 객체로만 부른다", () => {
    const uiFiles = files.filter((file) => file.name.startsWith("ui") && file.name.endsWith(".tsx") && !file.name.includes("test-kit"));
    const forbidden = uiFiles.filter((file) => /panel-detect-client|panel-canvas-adapter|downloadBlob|createObjectURL|new Worker/u.test(file.code)).map((file) => file.name);
    expect(forbidden).toEqual([]);
  });
});

// ── 번역 함수 호출에 사용자 값이 섞이지 않는다 ──────────────────────────────────

/** 번역 문구를 만드는 호출의 이름. 해소 함수 t 와 옛 이중언어 도우미(bi·bt)와 금지된 인라인 쌍 API 전부. */
const TRANSLATION_CALLEES: ReadonlySet<string> = new Set(["t", "bi", "bt", ...FORBIDDEN_INLINE_BILINGUAL_APIS]);

interface InterpolationFinding {
  readonly callee: string;
  readonly line: number;
}

/** 문구 인자에 쓸 수 없는 모양인가: 값이 들어간 템플릿 리터럴, 문자열 이어붙이기(+). 조건식은 갈래마다 본다. */
function interpolatesValues(node: ts.Expression): boolean {
  if (ts.isTemplateExpression(node)) return true;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return true;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return interpolatesValues(node.expression);
  if (ts.isConditionalExpression(node)) return interpolatesValues(node.whenTrue) || interpolatesValues(node.whenFalse);
  return false;
}

/**
 * 번역 함수 호출의 "직접 인자"가 값이 섞인 문자열인 곳을 모두 찾는다. 값은 문구가 아니라 자리표시({name})에 넘기는 두 번째 인자
 * (객체)로만 전달해야 하므로 객체 안의 템플릿은 보지 않는다.
 */
function findTranslationInterpolation(source: string): InterpolationFinding[] {
  const sourceFile = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: InterpolationFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      if (TRANSLATION_CALLEES.has(callee) && node.arguments.some((argument) => interpolatesValues(argument))) {
        findings.push({ callee, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

describe("컷 가져오기 — 번역 서비스로 사용자 값이 나가지 않는다 (정적 검사)", () => {
  it("검사기는 값이 섞인 문구를 잡고, 자리표시로 값을 넘기는 호출은 통과시킨다", () => {
    const bad = [
      "const a = bi(`${name} 읽는 중…`, `Reading ${name}…`);",
      "const b = t(`panelImport.reading.${kind}`);",
      "const c = t('panelImport.a' + suffix);",
      "const d = bt(flag ? `x ${y}` : 'z');",
      "const e = translateBilingual(t, 'scope', `k ${v}`, 'e');",
    ].join("\n");
    expect(findTranslationInterpolation(bad).map((finding) => finding.callee)).toEqual(["bi", "t", "t", "bt", "translateBilingual"]);
    const good = [
      "const a = t('panelImport.source.reading', { name: file.name });",
      "const b = t(step < 0 ? 'panelImport.cut.stepUp' : 'panelImport.cut.stepDown', { rows: `${Math.abs(step)}` });",
      "const c = t(KEYS[code]);",
      "const d = other(`${name}`);",
    ].join("\n");
    expect(findTranslationInterpolation(good)).toEqual([]);
  });

  it("화면·문구 소스의 번역 함수 호출에는 템플릿 보간과 문자열 이어붙이기가 없다", () => {
    const sources = collect(folder).map((path) => ({ name: relative(folder, path), code: readFileSync(path, "utf8") }));
    expect(sources.some((source) => source.name === join("ui", "PanelSourceStep.tsx"))).toBe(true);
    const offenders = sources.flatMap((source) => findTranslationInterpolation(source.code).map((finding) => `${source.name}:${finding.line} ${finding.callee}()`));
    expect(offenders).toEqual([]);
  });

  it("화면·문구 소스는 옛 인라인 이중언어 API 를 쓰지 않는다(I18N_GUIDE §5: 신규 표면은 키 기반)", () => {
    const offenders = files.flatMap((file) =>
      scanInlineBilingualUsage(readFileSync(join(folder, file.name), "utf8")).map((usage) => `${file.name}:${usage.line} ${usage.api}`));
    expect(offenders).toEqual([]);
    // 번역 도우미는 이름으로도 되살아나지 않는다.
    expect(files.some((file) => /panel-import-bi/u.test(file.name))).toBe(false);
  });
});
