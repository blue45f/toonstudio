import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { buildCompositionGenerationBrief } from "../ai/studio-composition-generation-brief";
import {
  buildStudioMannequinCompositionSnapshot,
} from "./studio-mannequin-composition-snapshot";

import { readStudioMannequinCaptureCamera } from "./studio-mannequin-capture-camera";
import { resolveStudioMannequinCameraFrame, resolveStudioMannequinCaptureResult, type StudioMannequinCameraPreset } from "./studio-mannequin-scene";

function presetCamera(preset: StudioMannequinCameraPreset, heightM = 1.65) {
  const frame = resolveStudioMannequinCameraFrame(heightM, preset);
  const camera = new PerspectiveCamera(35, 1, 0.05, 60);
  camera.position.set(...frame.position);
  camera.lookAt(...frame.target);
  return readStudioMannequinCaptureCamera(camera, true);
}

describe("buildStudioMannequinCompositionSnapshot (E2 포저 호스트 스냅샷)", () => {
  it("프리셋 방향에서 방위·고도를 기하로 도출한다", () => {
    expect(presetCamera("front")).toMatchObject({
      azimuthDegrees: 0,
      elevationDegrees: 3,
    });
    expect(presetCamera("side").azimuthDegrees).toBe(90);
    expect(presetCamera("back").azimuthDegrees).toBe(180);
    expect(presetCamera("top").elevationDegrees).toBeGreaterThan(85);
    expect(presetCamera("high").elevationDegrees).toBeGreaterThan(15);
    expect(presetCamera("low").elevationDegrees).toBeLessThan(0);
    expect(presetCamera("home").azimuthDegrees).toBeGreaterThan(0);
    expect(presetCamera("home").azimuthDegrees).toBeLessThan(45);
  });

  it("임의 오빗·팬과 선택한 실제 화각을 PNG와 구도 설명에 동일하게 보낸다", () => {
    const camera = new PerspectiveCamera(68, 1.6, 0.05, 60);
    camera.position.set(-2, 3, 2);
    camera.lookAt(new Vector3(-1, 2, 1));
    const observed = readStudioMannequinCaptureCamera(camera, false);
    expect(observed).toMatchObject({ fovDegrees: 68, azimuthDegrees: 315, elevationDegrees: 35.3, framing: "as-framed" });
    const capture = resolveStudioMannequinCaptureResult({ camera: observed, pngDataUrl: "png", width: 32, height: 32, displayWidth: 16, displayHeight: 16 });
    const snapshot = buildStudioMannequinCompositionSnapshot({ camera: observed, heightCm: 190 });
    expect(capture.camera).toBe(snapshot.camera);
    const brief = buildCompositionGenerationBrief({ ...snapshot, userPrompt: "낮은 채도" });
    expect(brief.ok && brief.request.prompt).toContain("vertical field of view 68°");
    expect(brief.ok && brief.request.briefKo).toContain("작가 메모: 낮은 채도");
    expect(presetCamera("high", 1.25)).toEqual(presetCamera("high", 1.98));
  });

  it("직교 카메라의 줌에서 실제 세로 범위를 읽고 원근 화각을 만들지 않는다", () => {
    const camera = new OrthographicCamera(-2, 2, 3, -3, 0.05, 60);
    camera.zoom = 2;
    const observed = readStudioMannequinCaptureCamera(camera, false);
    expect(observed).toMatchObject({ projection: "orthographic", verticalSpanM: 3 });
    const brief = buildCompositionGenerationBrief(buildStudioMannequinCompositionSnapshot({ camera: observed }));
    expect(brief.ok && brief.request.briefKo).toContain("직교 투영 · 세로 범위 3m");
    expect(brief.ok && brief.request.prompt).not.toContain("field of view");
  });

  it("포저 상태가 브리프 계약의 유효한 스냅샷이 된다 (fail-closed 통과)", () => {
    const snapshot = buildStudioMannequinCompositionSnapshot({
      camera: presetCamera("high"),
      heightCm: 172,
      posePresetId: "dash",
      poseLabel: "달리기",
      materialStyle: "wood",
    });
    expect(snapshot.characterId).toBe("studio-mannequin");
    expect(snapshot.camera.fovDegrees).toBe(35);
    expect(snapshot.camera.framing).toBe("full-body");
    expect(snapshot.posePresetId).toBe("dash");
    expect(snapshot.poseDescription).toBe("달리기");
    // 재질은 내부 id(wood)가 아니라 화면 이름으로 실린다(B-08).
    expect(snapshot.characterAppearance).toEqual(["신장 172cm", "재질 목조 인형"]);
    const brief = buildCompositionGenerationBrief(snapshot);
    expect(brief.ok).toBe(true);
    if (brief.ok) {
      expect(brief.request.consistencyKeys).toContain("character:studio-mannequin");
      expect(brief.request.consistencyKeys).toContain("pose:dash");
      expect(brief.request.fallback).toBe("insert-capture-as-is");
    }
  });

  it("알 수 없는 재질 id는 그대로 싣고, 한국어 브리프에는 영문 앵글·내부 id가 섞이지 않는다 (B-08)", () => {
    const unknown = buildStudioMannequinCompositionSnapshot({ camera: presetCamera("home"), materialStyle: "custom-x" });
    expect(unknown.characterAppearance).toEqual(["신장 165cm", "재질 custom-x"]);
    const brief = buildCompositionGenerationBrief(
      buildStudioMannequinCompositionSnapshot({ camera: presetCamera("home"), materialStyle: "clay", poseLabel: "달리기", posePresetId: "run" }),
    );
    expect(brief.ok).toBe(true);
    if (!brief.ok) return;
    expect(brief.request.briefKo).toContain("캐릭터: 3D 데생 인형");
    expect(brief.request.briefKo).not.toContain("studio-mannequin");
    expect(brief.request.briefKo).toContain("오른쪽 3/4 앞모습 · 눈높이");
    expect(brief.request.briefKo).toContain("재질 클레이");
    expect(brief.request.briefKo).not.toMatch(/three-quarter|view|angle/u);
    // 제공자 프롬프트(영문)와 일관성 키에는 내부 id가 그대로 남는다.
    expect(brief.request.prompt).toContain("three-quarter view from the right");
    expect(brief.request.consistencyKeys).toContain("character:studio-mannequin");
  });

  it("포즈 미적용·신장 이상값에서도 결정적으로 떨어진다", () => {
    const snapshot = buildStudioMannequinCompositionSnapshot({
      camera: presetCamera("front"),
      heightCm: Number.NaN,
      posePresetId: null,
    });
    expect(snapshot.posePresetId).toBeUndefined();
    expect(snapshot.characterAppearance).toEqual(["신장 165cm"]);
    expect(buildCompositionGenerationBrief(snapshot).ok).toBe(true);
    const again = buildStudioMannequinCompositionSnapshot({
      camera: presetCamera("front"),
      heightCm: Number.NaN,
      posePresetId: null,
    });
    expect(again).toEqual(snapshot);
  });
});
