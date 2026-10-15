import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioBg3dEditorSource } from "./read-studio-bg3d-editor-source";

function source(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

const sceneGraph = source("StudioBg3dEditorSceneGraph.tsx");
const viewport = source("StudioBg3dEditorViewport.tsx");
const editorHook = source("useStudioBg3dEditor.ts");
const measureHost = source("studio-bg3d-editor-measure-host.ts");
const placementHost = source("studio-bg3d-editor-placement-host.ts");
const editorSource = readStudioBg3dEditorSource();

/** three/@react-three를 import 하지 않아야 하는 DOM 부품(패널 UI 경계). */
const DOM_ONLY_FILES = [
  "StudioBg3dInferenceHud.tsx",
  "StudioBg3dInferenceKeyboardPicker.tsx",
  "StudioBg3dInferenceMarker.tsx",
  "StudioBg3dLengthField.tsx",
] as const;

/** 순수 코어 — three.js·DOM·React를 import 하지 않는다. */
const PURE_CORE_FILES = [
  "studio-bg3d-inference-math.ts",
  "studio-bg3d-inference-units.ts",
  "studio-bg3d-inference-kinds.ts",
  "studio-bg3d-inference-sources.ts",
  "studio-bg3d-inference-index.ts",
  "studio-bg3d-inference-probe.ts",
  "studio-bg3d-inference-ray.ts",
  "studio-bg3d-inference-engine.ts",
  "studio-bg3d-inference-session.ts",
  "studio-bg3d-inference-timing.ts",
  "studio-bg3d-inference-transform.ts",
  "studio-bg3d-inference-service.ts",
  "studio-bg3d-inference-overlay-model.ts",
  "studio-bg3d-inference-adhoc.ts",
  "studio-bg3d-inference-keyboard.ts",
  "studio-bg3d-inference-placement.ts",
] as const;

describe("추론 통합 경계", () => {
  it("컨트롤러와 오버레이는 View 포털 안(sceneContent)에만 마운트한다 — 루트 Canvas 카메라가 아닌 실제 렌더 카메라를 쓰기 위해", () => {
    expect(sceneGraph).toContain("<StudioBg3dInferenceController");
    expect(sceneGraph).toContain("<StudioBg3dInferenceOverlay");
    expect(viewport).not.toContain("<StudioBg3dInferenceController");
    expect(viewport).not.toContain("<StudioBg3dInferenceOverlay");
    // sceneContent 정의 안(측정 뷰포트 바로 옆)에 있다.
    const sceneContentStart = sceneGraph.indexOf("const sceneContent = (");
    const controllerAt = sceneGraph.indexOf("<StudioBg3dInferenceController");
    const measurementAt = sceneGraph.indexOf("<StudioBg3dMeasurementViewport");
    expect(sceneContentStart).toBeGreaterThan(0);
    expect(controllerAt).toBeGreaterThan(measurementAt);
    expect(controllerAt - measurementAt).toBeLessThan(1500);
  });

  it("사면 뷰에서는 컨트롤러가 비활성이고 카메라를 알리지 않는다", () => {
    expect(sceneGraph).toMatch(/active=\{Boolean\(h\.inferencePointerToolActive\) && !effectiveIsQuadView\}/u);
    expect(sceneGraph).toMatch(/effectiveIsQuadView \? \{\} : \{ onCameraChange: h\.handleInferenceCameraChange \}/u);
  });

  it("기즈모 이동 드래그가 시작·변경·종료에서 추론 세션을 부른다 (이동 모드 한정, 기하 스냅 뒤에는 눈금 스냅 생략)", () => {
    expect(sceneGraph).toMatch(/transformMode === "translate"\) h\.inferenceDrag\?\.begin\(firstObj\)/u);
    expect(sceneGraph).toMatch(/transformMode === "translate"\) h\.inferenceDrag\?\.update\(event\?\.target\?\.axis \?\? null\)/u);
    expect(sceneGraph).toContain("h.inferenceDrag?.end()");
    expect(sceneGraph).toContain("dragEnd?.lastSnapped");
  });

  it("HUD는 뷰포트 안내 영역에서 마운트하고 키보드 점 고르기를 줄자 점 찍기에 연결한다", () => {
    expect(viewport).toContain("<StudioBg3dInferenceHud");
    expect(viewport).toContain("h.pickInferencePoint?.(point)");
    expect(viewport.indexOf("<StudioBg3dInferenceHud")).toBeGreaterThan(viewport.indexOf("bg3d-measurement-status"));
  });

  it("에디터 훅은 호스트 훅을 한 번 부르고 서비스를 호스트 백에 노출한다", () => {
    expect(editorHook.match(/useStudioBg3dInferenceHost\(h\)/gu)).toHaveLength(1);
    for (const name of ["inferenceService", "inferenceDrag", "inferencePointerToolActive", "handleInferenceCameraChange", "pickInferencePoint", "inferPlacementTarget"]) {
      expect(editorHook, name).toContain(`h.${name} =`);
    }
    expect(editorHook.indexOf("useStudioBg3dInferenceHost(h)")).toBeLessThan(editorHook.indexOf("bindStudioBg3dEditorSceneGraph(h)"));
  });

  it("줄자 호스트는 클릭·미리보기를 추론 점으로 치환하고 길이 입력은 치환하지 않는다", () => {
    expect(measureHost).toContain("h.inferenceService.resolveFreshPoint(rawPoint).point");
    expect(measureHost).toContain("lockedLengthMeters === undefined && h.inferenceService");
    expect(measureHost).toContain("h.cancelMeasurementStep = cancelMeasurementStep");
  });

  it("배치 호스트는 이동·확정 모두 추론 치환을 거친다", () => {
    expect(placementHost.match(/h\.inferPlacementTarget \? h\.inferPlacementTarget\(rawTarget\) : rawTarget/gu)).toHaveLength(2);
  });

  it("편집기 소스 안에서 추론 서비스는 훅 한 곳에서만 만든다", () => {
    expect(editorSource.match(/createStudioBg3dInferenceService\(/gu) ?? []).toHaveLength(0);
    expect(source("useStudioBg3dInferenceHost.ts").match(/createStudioBg3dInferenceService\(/gu)).toHaveLength(1);
  });

  it.each(DOM_ONLY_FILES)("%s 는 three.js / @react-three 를 import 하지 않는다 (패널 UI 경계)", (file) => {
    expect(source(file)).not.toMatch(/from "(?:three|@react-three\/[^"]+)"/u);
  });

  it.each(PURE_CORE_FILES)("%s 는 three.js·React·DOM 전역에 의존하지 않는다", (file) => {
    const text = source(file);
    expect(text).not.toMatch(/from "(?:three|react|react-dom|@react-three\/[^"]+)"/u);
    expect(text).not.toMatch(/\b(?:document|localStorage|requestAnimationFrame)\b\./u);
  });

  it("새 컨트롤은 포커스 윤곽선을 지우지 않는다", () => {
    for (const file of [...DOM_ONLY_FILES, "StudioBg3dInferenceController.tsx", "StudioBg3dInferenceOverlay.tsx"]) {
      expect(source(file), file).not.toMatch(/(?:^|\s)(?:focus:)?outline-none(?![^"\n]*focus-visible:outline)/u);
    }
  });

  it("공개 훅 파일에 방 빌더 사용 예가 문서화되어 있고 방 빌더 소스는 수정하지 않았다", () => {
    const publicHook = source("useStudioBg3dInference.ts");
    expect(publicHook).toContain("방 빌더");
    expect(source("studio-bg3d-room-builder.ts")).not.toContain("Inference");
    expect(source("StudioBg3dRoomBuilderPanel.tsx")).not.toContain("Inference");
  });
});
