import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const directory = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(directory, "studio-office2d.css"), "utf8");

/** 선택자로 시작하는 첫 규칙 블록의 본문(중첩 없는 단순 규칙 전용). */
function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`규칙을 찾지 못했어요: ${selector}`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("2D 공정 바 배치 계약 (위치 칩·지도·패널과 겹치지 않기)", () => {
  it("화면 가운데 고정이 아니라 지도 폭만큼 오른쪽 여백을 둔 빈 띠 안에 놓는다", () => {
    const base = ruleBody(".studio-office2d-pipeline");
    expect(base).not.toMatch(/left:\s*50%/u);
    expect(base).not.toMatch(/translateX\(-50%\)/u);
    expect(base).toMatch(/--office2d-rail-inset-end:[^;]*--space-minimap-width/u);
    expect(base).toMatch(/right:\s*var\(--office2d-rail-inset-end\)/u);
    expect(base).toMatch(/max-width:\s*calc\(100% - var\(--office2d-rail-inset-start\) - var\(--office2d-rail-inset-end\)\)/u);
    expect(base).toMatch(/margin-inline:\s*auto/u);
  });

  it("오른쪽 패널이 열리면 지도가 밀리는 만큼 오른쪽 여백을 늘린다", () => {
    const panelRule = ruleBody('.space-hud[data-panel-open][data-hud-layout="desktop"] .studio-office2d-pipeline');
    expect(panelRule).toMatch(/--space-panel-width/u);
    expect(panelRule).toMatch(/--space-minimap-width/u);
  });

  it("서비스 상태 칩이 왼쪽에 생기면 공정 바·평면도 안내·상단 가운데 카드를 같은 높이만큼 내린다", () => {
    const status = ':has(.space-status-slot:not(:empty))';
    expect(css).toContain(`.space-hud[data-hud-layout="desktop"]${status} .studio-office2d-pipeline {`);
    expect(css).toContain(`.space-hud[data-hud-layout="desktop"]${status} .studio-office2d-schematic-banner {`);
    expect(css).toContain(`.space-hud:has(.studio-office2d-pipeline)${status} .space-hud__slot--top-center {`);
  });

  it("지도 아래로 길어지는 좁은 폭에서는 가로로 밀어 보게 하고 포커스 링이 잘리지 않게 여백을 둔다", () => {
    const steps = ruleBody(".studio-office2d-pipeline__steps");
    expect(steps).toMatch(/overflow-x:\s*auto/u);
    expect(steps).toMatch(/margin:\s*-6px/u);
    expect(steps).toMatch(/padding:\s*6px/u);
  });

  it("예전 1560px 단일 줄 전제(공정 바가 위치 칩과 같은 줄)를 되살리지 않는다", () => {
    expect(css).not.toMatch(/@media \(min-width: 1560px\) and \(min-height: 521px\)/u);
  });

  it("가로로 밀어 보는 띠는 잘린 가장자리를 스크롤 위치에 맞춰 옅게 지워 더 있음을 알린다(미지원 브라우저는 건너뜀)", () => {
    expect(css).toMatch(/@supports \(animation-timeline: scroll\(self inline\)\)/u);
    expect(css).toMatch(/animation-timeline:\s*scroll\(self inline\)/u);
    expect(css).toMatch(/@property --office2d-rail-fade-end/u);
    expect(css).toMatch(/mask-image:\s*linear-gradient\(to right, transparent 0, #000 var\(--office2d-rail-fade-start\)/u);
  });

  it("패널이 열린 1024~1179px에서는 상단 가운데 칸이 위치 칩 폭 오른쪽이 아니라 왼쪽 끝에서 시작한다", () => {
    const hud = readFileSync(join(directory, "..", "hud", "space-hud.css"), "utf8");
    const block = /@media \(min-width: 1024px\) and \(max-width: 1179\.98px\) \{[\s\S]*?\n\}\n/u.exec(hud)?.[0] ?? "";
    expect(block).toMatch(/\.space-hud\[data-panel-open\]\[data-hud-layout="desktop"\] \.space-hud__slot--top-center \{\s*left:\s*calc\(var\(--space-gutter\) \+ var\(--space-safe-left\)\)/u);
  });

  it("평면도 배너도 지도·패널 여백을 둔 빈 띠 안에 놓이고 조용한 구역 카드와 겹치지 않는다", () => {
    const banner = ruleBody(".studio-office2d-schematic-banner");
    expect(banner).not.toMatch(/left:\s*50%/u);
    expect(banner).toMatch(/right:\s*var\(--office2d-rail-inset-end\)/u);
    expect(banner).toMatch(/margin-inline:\s*auto/u);
    const hud = readFileSync(join(directory, "..", "hud", "space-hud.css"), "utf8");
    expect(hud).toContain(".space-silent-zone-badge {");
    expect(hud).toContain(".space-hud:has(.studio-office2d-pipeline) .space-hud__slot--top-left > .space-status-slot + * { margin-top: 58px; }");
    expect(hud).toContain(".space-hud:has(.studio-office2d-schematic-banner) .space-hud__slot--top-left > .space-status-slot + * { margin-top: 100px; }");
  });

  it("데스크톱 하단 프롬프트 줄은 왼쪽 말 걸기 버튼과 오른쪽 배율 막대 여백을 비워 두고 집중 제안 카드가 줄바꿈을 허용한다", () => {
    const hud = readFileSync(join(directory, "..", "hud", "space-hud.css"), "utf8");
    expect(hud).toMatch(/\.space-context-suggestion \{\s*flex-wrap:\s*wrap;\s*\}/u);
    expect(hud).toMatch(/padding-inline:\s*104px 312px/u);
    expect(hud).toMatch(/\.space-hud\[data-panel-open\] \.space-hud__prompts \{\s*padding-inline:\s*104px 156px;\s*\}/u);
  });
});
