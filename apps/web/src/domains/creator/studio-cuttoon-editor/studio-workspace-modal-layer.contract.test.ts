/**
 * 워크스페이스 모달 층 계약(실브라우저 확인에서 필터 갤러리 머리·오른쪽 위 단추가 도구 띠·첫 게시 제안 카드에 가린 결함 회귀).
 *
 * - v4 워크스페이스는 장식 격자(::before z-index:-1) 때문에 isolation:isolate 로 셸 안에 z-index:auto 쌓임 맥락을
 *   만든다. 그 안의 모달은 자기 z 값과 관계없이 셸의 메뉴바·도구 띠 아래에 그려진다.
 * - 그래서 aria-modal 대화상자를 품은 동안에만 워크스페이스를 모달 층(--studio-z-modal)으로 올린다. 그 값은 셸 크롬
 *   (메뉴바·도구 띠의 실제 z-index)보다 커야 하고, 쌓임 척도(studio-z-index.ts)와 같아야 한다.
 * - 평소에는 올리지 않는다. 늘 올리면 메뉴바에 붙어 워크스페이스 위로 떠 있는 첫 게시 제안 카드가 가린다.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_Z } from "../studio-z-index";

const v4Css = readFileSync(new URL("./studio-cinematic-canvas-v4.css", import.meta.url), "utf8");
const identityCss = readFileSync(new URL("../studio-shell/studio-visual-identity-v2.css", import.meta.url), "utf8");
const routeCss = readFileSync(new URL("../../../shared/styles/studio-route.css", import.meta.url), "utf8");

const WORKSPACE = '[data-studio-cinematic-workspace="v4"]';

/** 선택자 바로 뒤 `{ … }` 의 본문. 선택자가 정확히 한 번 나와야 한다. */
function ruleBody(css: string, selector: string): string {
  const head = `${selector}{`;
  const start = css.indexOf(head);
  expect(start, `${selector} 규칙이 없다`).toBeGreaterThanOrEqual(0);
  expect(css.indexOf(head, start + head.length), `${selector} 규칙이 둘 이상이다`).toBe(-1);
  const end = css.indexOf("}", start);
  return css.slice(start + head.length, end);
}

function cssNumber(css: string, pattern: RegExp, label: string): number {
  const match = pattern.exec(css);
  expect(match, `${label} 값을 찾지 못했다`).not.toBeNull();
  return Number(match![1]);
}

describe("워크스페이스 모달 층", () => {
  it("워크스페이스는 장식 격자 때문에 자기 쌓임 맥락을 만들고, 평소에는 z-index 를 올리지 않는다", () => {
    const base = ruleBody(v4Css, WORKSPACE);
    expect(base).toContain("isolation:isolate");
    expect(base).not.toContain("z-index");
  });

  it("aria-modal 대화상자를 품은 동안에만 워크스페이스를 모달 층으로 올린다", () => {
    const raised = ruleBody(v4Css, `${WORKSPACE}:has([aria-modal="true"])`);
    expect(raised).toContain("position:relative");
    expect(raised).toContain("z-index:var(--studio-z-modal,80)");
  });

  it("모달 층은 셸의 메뉴바·도구 띠보다 위이고 쌓임 척도와 같다", () => {
    const modal = cssNumber(routeCss, /--studio-z-modal:\s*(\d+);/u, "--studio-z-modal");
    const toolBelt = cssNumber(routeCss, /--studio-z-tool-belt:\s*(\d+);/u, "--studio-z-tool-belt");
    const menubar = cssNumber(
      identityCss,
      /\[data-studio-editor="true"\] \[data-studio-app-menubar="true"\]\{[^}]*?z-index:(\d+)/u,
      "메뉴바 z-index",
    );
    expect(modal).toBe(STUDIO_Z.modal);
    expect(modal).toBe(80);
    expect(modal).toBeGreaterThan(menubar);
    expect(modal).toBeGreaterThan(toolBelt);
    expect(modal).toBeGreaterThan(STUDIO_Z.menubar);
  });
});
