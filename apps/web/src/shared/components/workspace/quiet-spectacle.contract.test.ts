import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const visualV3 = readFileSync(new URL("./workspace-visual-v3.css", import.meta.url), "utf8");
const polish = readFileSync(
  new URL("../../../domains/creator/workspace/studio-workspace-polish.css", import.meta.url),
  "utf8",
);
const homeFirst = readFileSync(
  new URL("../../../domains/creator/workspace/studio-workspace-home-first.css", import.meta.url),
  "utf8",
);

const sceneArtLib = readFileSync(
  new URL("../../lib/workspace-scene-art.ts", import.meta.url),
  "utf8",
);
const appearanceBridge = readFileSync(
  new URL("../appearance/AppearanceBridge.tsx", import.meta.url),
  "utf8",
);
const appearanceSettings = readFileSync(
  new URL("../appearance/AppearanceSettings.tsx", import.meta.url),
  "utf8",
);
const learningHub = readFileSync(
  new URL("../../../domains/learn/learning-hub.css", import.meta.url),
  "utf8",
);

/**
 * "조용한 스펙터클" 계약 (BLUEPRINT §6.2 (3)·§6.3, S3-18).
 * 작업 표면의 화려함은 표지 히어로 스트립 1개로 모으고, 씬 아트 전경 배경과
 * 상주 모션은 기본으로 끈다. 이 테스트는 그 기본값·상한·정지 규칙이 CSS에서
 * 사라지지 않게 고정한다.
 */
describe("작업공간 조용한 스펙터클 계약 (S3-18)", () => {
  it("씬 아트 전경 배경은 기본 opacity 0이다", () => {
    const baseRule = visualV3.match(/\.workspace-shell::before,\.workspace-focused-shell::before\{[^}]*\}/);
    expect(baseRule?.[0]).toContain("opacity:0");
    expect(baseRule?.[0]).not.toContain("opacity:.2");
  });

  it("씬 아트는 opt-in 속성으로만 켜지고 불투명도 상한을 넘지 않는다", () => {
    expect(visualV3).toContain(':root[data-workspace-scene-art="on"] .workspace-shell::before{opacity:.2}');
    expect(visualV3).toContain(':root[data-workspace-scene-art="on"] .workspace-shell::before{opacity:.13}');
    // 집중 셸은 밀도 연동으로 opt-in 대상에서 제외된다(켜도 항상 끔).
    expect(visualV3).not.toContain('[data-workspace-scene-art="on"] .workspace-focused-shell::before');
  });

  it("작업 표면 상주 모션(캠퍼스 광택·궤도, 진행 광택, 캐릭터 idle)이 없다", () => {
    expect(visualV3).not.toContain("animation:campus-sheen");
    expect(visualV3).not.toContain("animation:campus-orbit");
    expect(polish).not.toContain("animation:workspace-hero-progress-sheen");
    expect(homeFirst).not.toContain("animation:workspace-home-character-idle");
  });

  it("히어로 단계 틴트 칩은 --domain-tint만 소비한다", () => {
    expect(polish).toContain(".workspace-hero-stage-chip");
    expect(polish).toContain("var(--domain-tint,var(--color-accent))");
    expect(polish).toContain('[data-workspace-stage-chip="archived"]');
  });
});

describe("학습 틴트·여정선 계약 (S3-18)", () => {
  it("학습 CSS는 색 리터럴을 만들지 않고 --domain-tint만 소비한다", () => {
    const section = learningHub.slice(learningHub.indexOf("S3-18 학습 틴트·여정선"));
    expect(section).toContain("var(--domain-tint, var(--learn-accent))");
    expect(section).not.toMatch(/oklch\(|#[0-9a-fA-F]{3,8}\b/);
  });

  it("여정선은 완료 구간 틴트와 현재 노드 강조를 가진다", () => {
    expect(learningHub).toContain(".learn-path-course-list li.is-completed::before");
    expect(learningHub).toContain(".learn-path-course-list li.is-current .learn-path-step");
    // 여정선에는 상주 모션을 두지 않는다.
    const section = learningHub.slice(learningHub.indexOf("S3-18 학습 틴트·여정선"));
    expect(section).not.toContain("animation");
  });

  it("씬 아트 opt-in은 런타임 배선이 기본 끔으로 :root에 반영한다", () => {
    expect(sceneArtLib).toContain('data-workspace-scene-art');
    expect(sceneArtLib).toContain("installWorkspaceSceneArtSync");
    expect(sceneArtLib).toContain("setWorkspaceSceneArtEnabled");
    // 기본값은 끔: 저장값이 정확히 "on"일 때만 켜진다.
    expect(sceneArtLib).toContain('=== "on"');
    expect(appearanceBridge).toContain("installWorkspaceSceneArtSync");
  });

  it("씬 아트 opt-in 토글은 외형 설정에 단일 진입점으로 배선된다", () => {
    // 초기값은 저장된 선택(기본 끔)을 읽고, 변경은 저장+즉시 반영 진입점 하나로만 나간다.
    expect(appearanceSettings).toContain("readWorkspaceSceneArtEnabled()");
    expect(appearanceSettings).toContain("setWorkspaceSceneArtEnabled(enabled)");
    expect(appearanceSettings).toContain('type="checkbox"');
    expect(appearanceSettings).toContain("checked={sceneArtEnabled}");
  });
});
