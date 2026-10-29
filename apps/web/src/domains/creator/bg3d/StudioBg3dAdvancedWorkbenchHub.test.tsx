// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { parseSkp } from "openskp";
import { Group } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioBg3dExecuteSelectionArray, StudioBg3dSelectionArraySummary } from "./studio-bg3d-selection-array";
import type { StudioBg3dReadSkpSceneSource, StudioBg3dSkpSourceReadResult } from "./studio-bg3d-skp-source-read-command";
import type { StudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-source";
import { extractStudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import { studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";
import { studioBg3dSkpGeometryTransform } from "./studio-bg3d-skp-scene-source";
import { createStudioBg3dSkpSceneSourceVffBytes } from "./studio-bg3d-skp-scene-source.test-fixture";
import { createStudioBg3dSkpSourceReaderFromHost, inspectStudioBg3dSkpSourceSelection } from "./studio-bg3d-skp-source-read-command";

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
  "spatial-modeler",
  "spatial-fx",
  "spatial-webtoon",
  "virtual-space-collab",
  "vrm-hybrid-dcc",
];

function actualSkpSource(): StudioBg3dSkpSceneSource {
  const bytes = new Uint8Array(createStudioBg3dSkpSceneSourceVffBytes());
  const result = extractStudioBg3dSkpSceneManifest(parseSkp(bytes.buffer));
  if (!result.ok) throw new Error(result.detail);
  return { version: 1, status: "available", manifest: result.value, reason: null, geometryTransform: studioBg3dSkpGeometryTransform() };
}

function sourceHost(source: StudioBg3dSkpSceneSource | undefined, suffix = "A") {
  const root = new Group();
  if (source) root.userData.toonstudioSkpSceneSource = source;
  const host = { open: true, selectedIds: new Set([`instance-${suffix}`]),
    physicsRuntimeSourceRef: { current: { customModels: [{ id: `instance-${suffix}`, modelId: `storage-${suffix}`, name: `원본 모델 ${suffix}` }] } },
    modelRootCacheRef: { current: new Map([[studioBg3dModelCacheKey(`storage-${suffix}`, "webgl"), { root, runtimeVariant: studioBg3dModelRuntimeVariant("webgl"), record: { id: `storage-${suffix}` } }]]) } };
  return { read: vi.fn(createStudioBg3dSkpSourceReaderFromHost(host)), selection: inspectStudioBg3dSkpSourceSelection(host) };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("지연 결과가 준비되지 않았습니다."); };
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

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

  it("공간 모델러의 지형·솔리드·사진 투시·건축 요소와 Blender 도구의 장면 배치·카메라·선화 연동이 동작한다", () => {
    const insertedBatches: number[] = [];
    const appliedFovs: number[] = [];
    const lineArtStates: boolean[] = [];

    render(
      <StudioBg3dAdvancedWorkbenchHub
        defaultTab="spatial-modeler"
        onInsertScenePrimitives={(prims) => { insertedBatches.push(prims.length); return true; }}
        onApplySceneCamera={(cam) => appliedFovs.push(cam.fovDegrees)}
        onSyncSceneLineArt={(enabled) => lineArtStates.push(enabled)}
      />,
    );

    // 공간 모델러: 지형·솔리드·건축 요소 배치, 사진 투시 카메라 적용, 벡터 단면도 생성
    fireEvent.click(screen.getByTestId("spatial-modeler-sandbox-insert-scene-btn"));
    expect(insertedBatches.length).toBe(1);
    expect(insertedBatches[0]).toBeGreaterThan(5);

    fireEvent.click(screen.getByTestId("spatial-modeler-solid-op-split"));
    fireEvent.click(screen.getByTestId("spatial-modeler-solid-insert-scene-btn"));
    expect(insertedBatches.length).toBe(2);
    expect(insertedBatches[1]).toBe(3);

    fireEvent.click(screen.getByTestId("spatial-modeler-match-photo-apply-camera-btn"));
    expect(appliedFovs.length).toBe(1);

    fireEvent.click(screen.getByTestId("spatial-modeler-arch-kind-roof-hanok"));
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(insertedBatches.length).toBe(3);

    fireEvent.click(screen.getByTestId("spatial-modeler-layout-svg-export-btn"));
    expect(screen.getByTestId("spatial-modeler-layout-svg-summary").textContent).toContain(
      "벡터 단면 SVG",
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
  it("장면에서 거부된 도형은 배치 수와 성공 안내에 반영하지 않는다", () => {
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" onInsertScenePrimitives={() => false} />);
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain("3D 배치 0개");
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toContain("배치하지 못했습니다");
    expect(screen.getByTestId("spatial-modeler-workbench-status").textContent).not.toContain("배치 완료");
  });

  it("장면 연결이 없으면 건축 요소 배치를 사용할 수 없다", () => {
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" />);
    expect(screen.getByTestId("spatial-modeler-arch-insert-scene-btn")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain("3D 배치 0개");
  });

  it("선택 요약과 배열 명령을 실제 공간 모델러 패널로 전달하고 성공 결과만 Hub 배치 수에 누적한다", () => {
    const execute = vi.fn<StudioBg3dExecuteSelectionArray>()
      .mockReturnValueOnce({ ok: true, addedNodeCount: 4, copyCount: 2, selectedNodeCount: 2, normalizedToken: "*2" })
      .mockReturnValueOnce({ ok: false, code: "selection-unavailable", messageKo: "선택이 변경되어 반복 배치하지 못했습니다." })
      .mockReturnValueOnce({ ok: true, addedNodeCount: 2, copyCount: 1, selectedNodeCount: 2, normalizedToken: "*1" });
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler"
      arraySelection={{ selectedPrimitiveCount: 2, availableNodeCount: 50, blockedReason: null }} onExecuteSelectionArray={execute} />);
    expect(screen.getByTestId("bg3d-selection-array-panel")).toBeTruthy();
    expect(screen.getByTestId("bg3d-array-selection-summary").textContent).toContain("선택 도형 2개");
    fireEvent.change(screen.getByLabelText("복제 명령"), { target: { value: "2x" } });
    fireEvent.change(screen.getByLabelText("배치 간격 (m)"), { target: { value: "-1.25" } });
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    expect(execute).toHaveBeenNthCalledWith(1, { mode: "linear", token: "*2", delta: [-1.25, 0, 0] });
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain("3D 배치 4개");

    fireEvent.change(screen.getByLabelText("복제 명령"), { target: { value: "*1" } });
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    expect(screen.getByTestId("bg3d-array-result").textContent).toBe("선택이 변경되어 반복 배치하지 못했습니다.");
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain("3D 배치 4개");
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    expect(execute).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain("3D 배치 6개");
  });

  it("부적합 선택 이유와 최신 선택 수·편집 잠금을 반복 배치 패널에 전달한다", () => {
    const execute = vi.fn<StudioBg3dExecuteSelectionArray>(() => ({
      ok: true, addedNodeCount: 6, copyCount: 3, selectedNodeCount: 2, normalizedToken: "*3",
    }));
    const selection: StudioBg3dSelectionArraySummary = {
      selectedPrimitiveCount: 2, availableNodeCount: 50, blockedReason: "외부 모델을 포함한 선택은 반복 배치할 수 없습니다.",
    };
    const view = render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" arraySelection={selection} onExecuteSelectionArray={execute} />);
    expect(screen.getByTestId("bg3d-array-selection-blocked").textContent).toBe(selection.blockedReason);
    expect(screen.getByTestId("bg3d-array-execute")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    view.rerender(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" disabled
      arraySelection={{ selectedPrimitiveCount: 1, availableNodeCount: 50, blockedReason: null }} onExecuteSelectionArray={execute} />);
    expect(screen.getByTestId("bg3d-array-selection-summary").textContent).toContain("선택 도형 1개");
    expect(screen.getByTestId("bg3d-array-execute")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByTestId("bg3d-array-execute"));
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain("3D 배치 0개");
  });

  it("Hub→실제 공간 모델러 패널→원본 정보 버튼으로 검증된 자산 정보를 읽고 기존 3D 배치 수를 바꾸지 않는다", async () => {
    const source = sourceHost(actualSkpSource());
    const insert = vi.fn(() => true);
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" onInsertScenePrimitives={insert}
      skpSourceSelection={source.selection} onReadSkpSceneSource={source.read} />);
    expect(source.read).not.toHaveBeenCalled();
    expect(screen.queryByTestId("bg3d-skp-source-available")).toBeNull();
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(insert).toHaveBeenCalledTimes(1);
    const countBefore = screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent;
    const actionBefore = screen.getByTestId("bg3d-workbench-last-action").textContent;
    expect(countBefore).not.toContain("3D 배치 0개");
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    const result = await screen.findByTestId("bg3d-skp-source-available");
    expect(within(result).getByText("원근 컷")).toBeTruthy();
    expect(within(result).getByText("평행 컷")).toBeTruthy();
    expect(within(result).getAllByText("원본 FOV 47.5° · 기준 미확인")).toHaveLength(2);
    expect(within(result).getByText("정의 (루트 포함)").nextElementSibling?.textContent).toBe("2");
    expect(source.read).toHaveBeenCalledTimes(1); expect(insert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toBe(countBefore);
    expect(screen.getByTestId("bg3d-workbench-last-action").textContent).toBe(actionBefore);
  });

  it("Hub 편집이 잠겨도 원본 조회는 허용하며 기존 배치 버튼 잠금은 유지한다", async () => {
    const source = sourceHost(actualSkpSource()), insert = vi.fn(() => true);
    render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" disabled onInsertScenePrimitives={insert}
      skpSourceSelection={source.selection} onReadSkpSceneSource={source.read} />);
    expect(screen.getByTestId("spatial-modeler-arch-insert-scene-btn")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("spatial-modeler-sandbox-insert-scene-btn")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("bg3d-skp-source-read")).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    await screen.findByTestId("bg3d-skp-source-available");
    expect(source.read).toHaveBeenCalledTimes(1); expect(insert).not.toHaveBeenCalled();
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain("3D 배치 0개");
  });

  it("Hub의 선택 scope가 바뀌면 이전 결과를 숨기고 늦게 도착한 유효 원본 결과도 새 선택에 노출하지 않는다", async () => {
    const first = sourceHost(actualSkpSource()), next = sourceHost(undefined, "B");
    const pending = deferred<StudioBg3dSkpSourceReadResult>();
    const oldResult = await first.read();
    const delayed = vi.fn<StudioBg3dReadSkpSceneSource>(() => pending.promise);
    const view = render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" skpSourceSelection={first.selection} onReadSkpSceneSource={delayed} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read")); expect(delayed).toHaveBeenCalledTimes(1);
    view.rerender(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" skpSourceSelection={next.selection} onReadSkpSceneSource={next.read} />);
    expect(screen.getByTestId("bg3d-skp-source-model").textContent).toContain("원본 모델 B");
    expect(screen.queryByTestId("bg3d-skp-source-available")).toBeNull();
    expect(next.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read"));
    await screen.findByTestId("bg3d-skp-source-legacy");
    await act(async () => { pending.resolve(oldResult); await pending.promise; });
    expect(screen.getByTestId("bg3d-skp-source-legacy")).toBeTruthy();
    expect(screen.queryByText("원근 컷")).toBeNull();
    expect(screen.queryByTestId("bg3d-skp-source-available")).toBeNull();
    expect(next.read).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bg3d-workbench-dcc-compat-badge").textContent).toContain("3D 배치 0개");
  });

  it("기존 선택에 표시한 원본 결과도 새 scope로 바뀌는 즉시 지운다", async () => {
    const first = sourceHost(actualSkpSource()), next = sourceHost(undefined, "B");
    const view = render(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" skpSourceSelection={first.selection} onReadSkpSceneSource={first.read} />);
    fireEvent.click(screen.getByTestId("bg3d-skp-source-read")); await screen.findByTestId("bg3d-skp-source-available");
    view.rerender(<StudioBg3dAdvancedWorkbenchHub defaultTab="spatial-modeler" skpSourceSelection={next.selection} onReadSkpSceneSource={next.read} />);
    expect(screen.queryByTestId("bg3d-skp-source-available")).toBeNull();
    expect(screen.queryByText("원근 컷")).toBeNull();
    expect(next.read).not.toHaveBeenCalled();
  });

});
