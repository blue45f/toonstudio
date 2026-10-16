import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * "원고 이미지는 이 기기를 떠나지 않는다"는 약속을 소스 수준에서 지키는 경계 시험.
 * 컷 감지·재배열·카드 슬라이스 폴더의 어떤 파일도 네트워크 API 를 부르지 않고, 외부 주소를 쓰지 않으며,
 * Worker 는 같은 출처의 상대 경로 모듈로만 만든다. (실행 중 네트워크 차단 시험은 별도 규칙상 쓰지 않는다.)
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
    expect(runtimeImports.filter((specifier) => specifier?.startsWith("."))).toEqual(["./PanelNotice", "./panel-import-bi", "./panel-import-styles"]);
    expect(entry?.code).toMatch(/import\(\s*["']\.\/PanelImportWorkbench["']\s*\)/u);
  });

  it("화면 컴포넌트는 감지·재배열·내보내기를 환경 객체로만 부른다", () => {
    const uiFiles = files.filter((file) => file.name.startsWith("ui") && file.name.endsWith(".tsx") && !file.name.includes("test-kit"));
    const forbidden = uiFiles.filter((file) => /panel-detect-client|panel-canvas-adapter|downloadBlob|createObjectURL|new Worker/u.test(file.code)).map((file) => file.name);
    expect(forbidden).toEqual([]);
  });
});
