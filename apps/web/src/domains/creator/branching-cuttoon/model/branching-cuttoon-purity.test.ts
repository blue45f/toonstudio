import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 분기형 컷툰 모델 모듈은 순수하다: 네트워크·시간·난수·브라우저 저장소·동적 import 에 기대지 않고,
 * 같은 폴더 안의 모듈과 이 폴더 밖으로 나가지 않는 상대 경로만 가져온다. 소스를 직접 읽어 확인한다.
 */
const FOLDER = fileURLToPath(new URL("./", import.meta.url));
const SOURCES = readdirSync(FOLDER).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

function code(name: string): string {
  return readFileSync(`${FOLDER}${name}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

describe("분기형 컷툰 모델 순수성", () => {
  it("검사할 소스가 있다", () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(SOURCES)("%s 는 네트워크·시간·난수·브라우저 API 를 쓰지 않는다", (name) => {
    const source = code(name);
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toMatch(/\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bnavigator\b/u);
    expect(source).not.toMatch(/\b(?:window|document|globalThis|localStorage|sessionStorage|indexedDB)\b/u);
    expect(source).not.toMatch(/\bDate\b|Math\.random|performance\.now|setTimeout|setInterval|requestAnimationFrame/u);
    expect(source).not.toMatch(/\bimport\s*\(/u);
    expect(source).not.toMatch(/\bprocess\./u);
    expect(source).not.toMatch(/\bconsole\./u);
  });

  it.each(SOURCES)("%s 는 같은 폴더의 모듈만 가져온다", (name) => {
    for (const match of code(name).matchAll(/from\s+"([^"]+)"/gu)) {
      expect(match[1], name).toMatch(/^\.\/branching-cuttoon-[a-z-]+$/u);
    }
  });

  it.each(SOURCES)("%s 는 800줄을 넘지 않는다", (name) => {
    expect(readFileSync(`${FOLDER}${name}`, "utf8").split("\n").length).toBeLessThanOrEqual(800);
  });
});
