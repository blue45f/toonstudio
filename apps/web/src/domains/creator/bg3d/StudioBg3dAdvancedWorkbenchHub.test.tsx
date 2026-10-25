// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  StudioBg3dAdvancedWorkbenchHub,
  type StudioBg3dWorkbenchTabId,
} from "./StudioBg3dAdvancedWorkbenchHub";

const ALL_WORKBENCH_TAB_IDS: readonly StudioBg3dWorkbenchTabId[] = [
  "atmosphere",
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
  "spatial-fx",
  "spatial-webtoon",
  "virtual-space-collab",
  "vrm-hybrid-dcc",
];

describe("StudioBg3dAdvancedWorkbenchHub", () => {
  afterEach(() => {
    cleanup();
  });

  it("17종의 스페셜리스트 탭을 모두 렌더링하고 탭 전환 시 각 도메인 엔진 UI가 정상 마운트된다", () => {
    render(<StudioBg3dAdvancedWorkbenchHub />);

    expect(screen.getByTestId("bg3d-advanced-workbench-hub")).toBeTruthy();
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain(
      "glTF 2.0 / GLB): A",
    );
    expect(ALL_WORKBENCH_TAB_IDS).toHaveLength(17);

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
});
