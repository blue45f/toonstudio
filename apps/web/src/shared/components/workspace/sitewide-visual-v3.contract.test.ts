import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workspaceCss = readFileSync(new URL("./workspace-visual-v3.css", import.meta.url), "utf8");
const editorCss = readFileSync(
  new URL("../../../domains/creator/studio-shell/studio-visual-identity-v2.css", import.meta.url),
  "utf8",
);
const adminCss = readFileSync(
  new URL("../../../domains/admin/shell/admin-visual-v2.css", import.meta.url),
  "utf8",
);
const campusModel = readFileSync(
  new URL("../../lib/spatial-campus/campus-model.ts", import.meta.url),
  "utf8",
);
const routeVisual = readFileSync(
  new URL("../../lib/site-route-visual.ts", import.meta.url),
  "utf8",
);

describe("sitewide visual identity v3 contract", () => {
  it("gives every spatial district a distinct Image Generation 2.5 scene", () => {
    expect(workspaceCss.match(/data-campus-district=/gu)).toHaveLength(9);
    expect(campusModel.match(/gpt25-v1/gu)).toHaveLength(9);
    expect(new Set(campusModel.match(/\/assets\/studio\/generated-backgrounds\/gpt25-v1[^"']+/gu))).toHaveLength(9);
  });

  it("maps every route visual kind to generated artwork", () => {
    expect(routeVisual.match(/image: "\/assets\/studio\/generated-backgrounds\/gpt25-v1/gu)).toHaveLength(14);
  });

  it("탐색의 선 아이콘과 모션·강제 색상 접근 경계를 유지한다", () => {
    expect(workspaceCss).toContain(".workspace-nav-visual>.workspace-nav-line-icon");
    expect(workspaceCss).toContain("@media(prefers-reduced-motion:reduce)");
    expect(workspaceCss).toContain("@media(forced-colors:active)");
  });

  it("넓은 화면의 좌측 메뉴는 시안처럼 아이콘+글자 행 목록으로 편다", () => {
    // 행 레일 전환 지점은 BLUEPRINT §5.2 (4)·§5.3 L2에서 1280px로 표준화됐다 (구 1181px).
    expect(workspaceCss).toContain("@media (min-width:1280px)");
    expect(workspaceCss).not.toContain("1181px");
    expect(workspaceCss).toContain(".workspace-nav-shortcuts");
    expect(workspaceCss).toContain(".workspace-nav-row-icon");
    // 중간·좁은 화면의 타일 열과 하단 탭 바 규칙은 그대로 남는다.
    expect(workspaceCss).toContain(".workspace-nav-visual{width:34px;height:34px");
  });

  it("keeps the canvas quiet while upgrading editor chrome and the beta gate", () => {
    expect(editorCss).toContain("[data-studio-canvas-viewport]");
    // 2026-11-20 스타라이트 OKLCH Unslop 정비 이후 개별 도구 원시 HEX 레일 대신 단색 2px 강조 레일을 사용한다.
    expect(editorCss).toContain(
      '[data-studio-editor="true"] :where([data-studio-rail-tool-id], [data-studio-current-tool-id])[aria-pressed="true"]',
    );
    expect(editorCss).toContain("box-shadow: inset 2px 0 0 var(--color-accent) !important");
    expect(editorCss).toContain('[data-studio-beta-notice="true"]');
    expect(editorCss).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/u);
    expect(editorCss).toMatch(/@media\s*\(\s*forced-colors:\s*active\s*\)/u);
  });

  it("gives protected administration routes the same image-led visual language", () => {
    expect(adminCss).toContain('[data-admin-shell="true"]');
    expect(adminCss).toContain(".admin-nav-art");
    expect(adminCss).toContain('[data-admin-notice="true"]');
    expect(adminCss).toContain("@media(prefers-reduced-motion:reduce)");
  });
});
