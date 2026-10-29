// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  StudioBg3dAdvancedWorkbenchHub,
  type StudioBg3dWorkbenchTabId,
} from "./StudioBg3dAdvancedWorkbenchHub";

const ALL_WORKBENCH_TAB_IDS: readonly StudioBg3dWorkbenchTabId[] = [
  "atmosphere",
  "blender-fantasy-webtoon",
  "character-animator",
  "cloner",
  "cut-strip",
  "dcc-pipeline",
  "deformers",
  "dynamic-components",
  "halftone-screentone",
  "matcap-studio",
  "particle-vfx",
  "place-set-package",
  "postprocess-vfx",
  "shaper-tooning",
  "sketchup-studio",
  "spatial-fx",
  "spatial-webtoon",
  "virtual-space-collab",
  "vrm-hybrid-dcc",
];

describe("StudioBg3dAdvancedWorkbenchHub", () => {
  afterEach(() => {
    cleanup();
  });

  it("18종의 스페셜리스트 탭을 모두 렌더링하고 탭 전환 시 각 도메인 엔진 UI가 정상 마운트된다", () => {
    render(<StudioBg3dAdvancedWorkbenchHub />);

    expect(screen.getByTestId("bg3d-advanced-workbench-hub")).toBeTruthy();
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain(
      "glTF 2.0 / GLB): A",
    );
    expect(ALL_WORKBENCH_TAB_IDS).toHaveLength(19);

    // 기본 탭: atmosphere (높이 안개 감쇠율 & 카메라 추적광 확인)
    expect(screen.getByTestId("bg3d-atmosphere-height-fog-readout").textContent).toContain(
      "높이 기반 안개 감쇠율",
    );

    // postprocess-vfx 탭 전환 및 실시간 웹툰 셀·잉크 필터 7종 선택 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-postprocess-vfx"));
    expect(screen.getByTestId("bg3d-webtoon-filter-section")).toBeTruthy();
    fireEvent.click(screen.getByTestId("bg3d-webtoon-filter-classic-bw-ink"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "웹툰 필터:",
    );

    // matcap-studio 탭 전환 및 VRM MToon LT 선화 프리셋 선택 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-matcap-studio"));
    expect(screen.getByTestId("bg3d-mtoon-lt-preset-section")).toBeTruthy();
    fireEvent.click(screen.getByTestId("bg3d-mtoon-preset-bold-ink"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "MToon LT: 굵은 잉크",
    );

    // blender-fantasy-webtoon 탭 전환 및 EEVEE 광원·NPR·무기·몬스터·군단 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-blender-fantasy-webtoon"));
    expect(screen.getByTestId("bg3d-blender-fantasy-webtoon-panel")).toBeTruthy();
    fireEvent.click(
      screen.getByTestId("bg3d-blender-light-rig-holy-sword-awakening-halo"),
    );
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "조명 설정:",
    );
    fireEvent.click(
      screen.getByTestId("bg3d-blender-weapon-imperial-holy-greatsword"),
    );
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "판타지 무기:",
    );
    fireEvent.click(
      screen.getByTestId("bg3d-blender-crowd-royal-paladin-phalanx-march"),
    );
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "군단 Boid:",
    );

    // spatial-fx 탭 전환 및 3D 집중선 세그먼트 / 3D 빌보드 말풍선 & 이모트 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-spatial-fx"));
    fireEvent.click(screen.getByText("3D 원근 집중선"));
    expect(screen.getByTestId("bg3d-speedline-segment-readout").textContent).toContain(
      "생성 세그먼트 32선분",
    );
    fireEvent.click(screen.getByTestId("bg3d-spatial-fx-tab-bubbles"));
    expect(screen.getByTestId("bg3d-spatial-fx-bubbles-panel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("bg3d-insert-bubble-btn"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "3D 말풍선:",
    );

    // cut-strip 탭 전환 및 연속성 체커 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-cut-strip"));
    expect(screen.getByTestId("bg3d-cut-strip-continuity").textContent).toContain(
      "연속 컷 일관성 점검 (2컷)",
    );

    // character-animator 탭 전환 및 데생 인형 두상 스타일 교체 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-character-animator"));
    expect(screen.getByTestId("bg3d-mannequin-head-style-section")).toBeTruthy();
    fireEvent.click(screen.getByTestId("bg3d-head-style-chibi"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "두상 스타일: chibi",
    );

    // deformers 탭 전환 및 CSG 불리언 & 클레이 블렌드 연산 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-deformers"));
    expect(screen.getByTestId("bg3d-csg-boolean-section")).toBeTruthy();
    fireEvent.click(screen.getByTestId("bg3d-csg-op-union"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "CSG 연산: union",
    );

    // dcc-pipeline 탭 전환 및 실사 프리셋·절차적 도시·그립 솔버·품질 코퍼스 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-dcc-pipeline"));
    expect(screen.getByTestId("bg3d-dcc-scene-pipeline-panel")).toBeTruthy();
    expect(screen.getByTestId("bg3d-pipeline-quality-summary").textContent).toContain(
      "Toon3D v2.0.0",
    );
    fireEvent.click(screen.getByTestId("bg3d-realistic-preset-twilight-real"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "실사 프리셋: twilight-real",
    );
    fireEvent.click(screen.getByTestId("bg3d-cityscape-theme-school-street"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "절차적 도시: school-street",
    );
    fireEvent.click(screen.getByTestId("bg3d-grip-type-gun-pistol-trigger"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "소품 그립: gun-pistol-trigger",
    );

    // vrm-hybrid-dcc 탭 전환 및 캐릭터 적용·VRM 소켓 그립·외부 3D 인테이크 검증
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-vrm-hybrid-dcc"));
    expect(screen.getByTestId("bg3d-vrm-hybrid-dcc-panel")).toBeTruthy();
    expect(screen.getByTestId("bg3d-hybrid-dcc-summary").textContent).toContain(
      "DCC 커널 Ready",
    );
    fireEvent.click(screen.getByTestId("bg3d-char-purpose-ai-control"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "캐릭터 적용: ai-control",
    );
    fireEvent.click(screen.getByTestId("bg3d-vrm-grip-preset-two-hand-grip"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "VRM 소켓 그립: two-hand-grip",
    );
    fireEvent.click(screen.getByTestId("bg3d-external-intake-character"));
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain(
      "외부 인테이크: 캐릭터 (90K)",
    );

    // 나머지 탭들도 모두 클릭하여 크래시 없이 마운트되는지 전수 확인
    for (const tabId of ALL_WORKBENCH_TAB_IDS) {
      fireEvent.click(screen.getByTestId(`bg3d-workbench-tab-${tabId}`));
      expect(screen.getByTestId(`bg3d-workbench-surface-${tabId}`)).toBeTruthy();
    }
  });

  it("SketchUp 3D(Sandbox·Solid Tools·Match Photo·건축 컴포넌트) 및 Blender 5.2(모디파이어·GPv3·물리·카메라)의 3D 장면 배치·카메라·선화 연동이 동작한다", () => {
    const insertedBatches: number[] = [];
    const appliedFovs: number[] = [];
    const lineArtStates: boolean[] = [];

    render(
      <StudioBg3dAdvancedWorkbenchHub
        defaultTab="sketchup-studio"
        onInsertScenePrimitives={(prims) => insertedBatches.push(prims.length)}
        onApplySceneCamera={(cam) => appliedFovs.push(cam.fovDegrees)}
        onSyncSceneLineArt={(enabled) => lineArtStates.push(enabled)}
      />,
    );

    // SketchUp 3D: Sandbox 지형 배치, Solid Tools 배치, Match Photo 카메라 적용, 건축 컴포넌트 배치, LayOut SVG
    fireEvent.click(screen.getByTestId("sketchup-sandbox-insert-scene-btn"));
    expect(insertedBatches.length).toBe(1);
    expect(insertedBatches[0]).toBeGreaterThan(5);

    fireEvent.click(screen.getByTestId("sketchup-solid-op-split"));
    fireEvent.click(screen.getByTestId("sketchup-solid-insert-scene-btn"));
    expect(insertedBatches.length).toBe(2);
    expect(insertedBatches[1]).toBe(3);

    fireEvent.click(screen.getByTestId("sketchup-match-photo-apply-camera-btn"));
    expect(appliedFovs.length).toBe(1);

    fireEvent.click(screen.getByTestId("sketchup-arch-kind-roof-hanok"));
    fireEvent.click(screen.getByTestId("sketchup-arch-insert-scene-btn"));
    expect(insertedBatches.length).toBe(3);

    fireEvent.click(screen.getByTestId("sketchup-layout-svg-export-btn"));
    expect(screen.getByTestId("sketchup-layout-svg-summary").textContent).toContain(
      "LayOut 벡터 단면 SVG",
    );

    // Blender 5.2: 모디파이어 생성물 배치, GPv3/Freestyle 선화 동기화, 물리 도메인 배치, 시네마틱 카메라 적용, 배경 세트 배치
    fireEvent.click(screen.getByTestId("bg3d-workbench-tab-blender-fantasy-webtoon"));
    fireEvent.click(screen.getByTestId("bg3d-blender-modifier-insert-btn"));
    expect(insertedBatches.length).toBe(4);

    fireEvent.click(screen.getByTestId("bg3d-blender-gp3-sync-lineart-btn"));
    expect(lineArtStates).toEqual([true]);

    fireEvent.click(screen.getByTestId("bg3d-blender-physics-insert-btn"));
    expect(insertedBatches.length).toBe(5);

    fireEvent.click(screen.getByTestId("bg3d-blender-apply-camera-btn"));
    expect(appliedFovs.length).toBe(2);

    fireEvent.click(screen.getByTestId("bg3d-blender-scene-theme-cyberpunk-neon-alley"));
    fireEvent.click(screen.getByTestId("bg3d-blender-insert-scene-preset-btn"));
    expect(insertedBatches.length).toBe(6);
  });
});
