import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `sr-only` 는 `clip: rect(0,0,0,0)`·`overflow: hidden`·1px 크기로 화면에서 숨기는 유틸리티다. 포커스 변형으로
 * 위치(`focus:fixed`)나 최소 높이만 바꿔서는 이 숨김이 풀리지 않아, 키보드 사용자가 첫 Tab 에서 아무것도 보지 못한다
 * (UI/UX 자동 측정 2026-10-16: 97개 칸에서 '본문으로 건너뛰기'의 포커스 표시가 보이지 않음). 숨김을 푸는 것은
 * `focus:not-sr-only` 다.
 */
describe("AppShell 본문 건너뛰기 링크의 포커스 가시성", () => {
  const source = readFileSync(fileURLToPath(new URL("./AppShell.tsx", import.meta.url)), "utf8");
  const classes = (/<a href="#main-content" className="([^"]+)"/u.exec(source)?.[1] ?? "").split(/\s+/u).filter(Boolean);

  it("평소에는 sr-only 로 숨기고, 포커스를 받으면 sr-only 를 풀어 보인다", () => {
    expect(classes).toContain("sr-only");
    expect(classes).toContain("focus:not-sr-only");
  });

  it("보일 때는 화면 고정 위치·충분한 탭 크기·눈에 띄는 윤곽선을 가진다", () => {
    for (const required of ["focus:fixed", "focus:min-h-11", "focus:outline", "focus:outline-2", "focus:outline-accent"]) {
      expect(classes, required).toContain(required);
    }
  });
});
