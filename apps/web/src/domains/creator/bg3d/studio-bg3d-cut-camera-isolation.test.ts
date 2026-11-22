import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  applyStudioBg3dViewportAfterTransition,
  type BgViewportApi,
} from "./studio-bg3d-camera-application";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dCameraSettings,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * 현재 뷰포트 카메라 상태(위치·타깃·FOV·투영)를 결정적 PNG 시그니처 + 픽셀 페이로드로 직렬화한다.
 * 일괄 출력 중 2번·3번 컷이 1번 컷 카메라나 이전 프레임을 재사용하면 즉시 바이트/해시가 어긋난다.
 */
function renderDeterministicCameraPngBytes(
  scene: StudioBg3dSceneDocument,
  activeCamera: StudioBg3dCameraSettings,
): Uint8Array {
  const payload = JSON.stringify({
    nodes: scene.nodes.map((node) => ({ id: node.id, visible: node.visible })),
    camera: {
      projection: activeCamera.projection,
      position: activeCamera.position,
      target: activeCamera.target,
      fovDegrees: activeCamera.fovDegrees,
      orthographicHeight: activeCamera.orthographicHeight ?? null,
    },
  });
  const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const body = new TextEncoder().encode(payload);
  const out = new Uint8Array(header.byteLength + body.byteLength);
  out.set(header, 0);
  out.set(body, header.byteLength);
  return out;
}

function createMockViewportApi(
  initial: StudioBg3dCameraSettings,
  options: { readonly freezeAfterFirstApply?: boolean } = {},
): {
  readonly api: BgViewportApi;
  readonly getAppliedCamera: () => StudioBg3dCameraSettings;
} {
  let current: StudioBg3dCameraSettings = { ...initial };
  let applyCount = 0;
  return {
    api: {
      zoomBy: () => true,
      applyPreset: () => true,
      readView: () => ({ ...current }),
      readFramingState: () => ({ view: { ...current }, viewportAspect: 16 / 9 }),
      focusOn: () => undefined,
      applyView: (next) => {
        applyCount += 1;
        if (options.freezeAfterFirstApply && applyCount > 1) {
          return true;
        }
        current = {
          ...next,
          position: [...next.position],
          target: [...next.target],
        };
        return true;
      },
    },
    getAppliedCamera: () => current,
  };
}

async function runSequentialBatchPngExport(
  document: StudioBg3dSceneDocument,
  shotIds: readonly string[],
  viewport: { readonly api: BgViewportApi; readonly getAppliedCamera: () => StudioBg3dCameraSettings },
): Promise<ReadonlyMap<string, Uint8Array>> {
  const outputs = new Map<string, Uint8Array>();
  let previousProjection = viewport.getAppliedCamera().projection;
  for (const shotId of shotIds) {
    const applied = applyStudioBg3dShot(document, shotId);
    expect(applied, `${shotId} 적용 실패`).not.toBeNull();
    const projectionChanged = previousProjection !== applied!.camera.projection;
    const transitioned = await applyStudioBg3dViewportAfterTransition({
      view: applied!.camera,
      previousApi: viewport.api,
      requireReplacement: projectionChanged,
      readApi: () => viewport.api,
      isActive: () => true,
      waitForPaintFrame: async () => undefined,
      timeoutMs: 2_000,
    });
    expect(transitioned, `${shotId} 뷰포트 전환 실패`).not.toBeNull();
    previousProjection = applied!.camera.projection;
    outputs.set(shotId, renderDeterministicCameraPngBytes(applied!, viewport.getAppliedCamera()));
  }
  return outputs;
}

describe("studio-bg3d-cut-camera-isolation — 공유 배경 3컷 카메라 격리 및 일괄 PNG 라운드트립", () => {
  it("같은 배경을 공유하는 3컷에서 1컷 카메라만 변경해도 2·3컷은 전환·재열기·일괄 PNG 출력 전 구간에서 원본 기준 PNG와 100% 일치한다", async () => {
    const baseDoc = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
    const cut1InitialCam: StudioBg3dCameraSettings = {
      ...baseDoc.camera,
      position: [0, 2, 6],
      target: [0, 1, 0],
      fovDegrees: 45,
    };
    const cut2InitialCam: StudioBg3dCameraSettings = {
      ...baseDoc.camera,
      position: [4, 2.5, 3],
      target: [0, 1, -1],
      fovDegrees: 35,
    };
    const cut3InitialCam: StudioBg3dCameraSettings = {
      ...baseDoc.camera,
      position: [-3, 3.2, 5],
      target: [1, 1.2, 0],
      fovDegrees: 55,
    };

    // 1) 공유 배경 문서 1본에 3개 컷을 서로 다른 구도로 기록
    const withCut1 = captureStudioBg3dShot({ ...baseDoc, camera: cut1InitialCam }, { id: "cut-1", name: "1컷 정면" })!;
    const withCut2 = captureStudioBg3dShot({ ...withCut1, camera: cut2InitialCam }, { id: "cut-2", name: "2컷 측면" })!;
    const withAll3 = captureStudioBg3dShot({ ...withCut2, camera: cut3InitialCam }, { id: "cut-3", name: "3컷 부감" })!;
    expect(withAll3.shots?.map((s) => s.id)).toEqual(["cut-1", "cut-2", "cut-3"]);

    // 2) 각 컷을 개별 PNG로 먼저 뽑아 기준선(baseline) 해시 고정
    const baselineViewport = createMockViewportApi(baseDoc.camera);
    const baselinePngs = await runSequentialBatchPngExport(withAll3, ["cut-1", "cut-2", "cut-3"], baselineViewport);
    const baseHash1 = sha256Hex(baselinePngs.get("cut-1")!);
    const baseHash2 = sha256Hex(baselinePngs.get("cut-2")!);
    const baseHash3 = sha256Hex(baselinePngs.get("cut-3")!);
    expect(new Set([baseHash1, baseHash2, baseHash3]).size).toBe(3);

    // 3) 1컷 카메라만 클로즈업으로 수정 (저장 전 단계)
    const cut1UpdatedCam: StudioBg3dCameraSettings = {
      ...cut1InitialCam,
      position: [1.5, 1.8, 2.2],
      target: [0.2, 1.1, -0.5],
      fovDegrees: 28,
    };
    const mutatedDoc: StudioBg3dSceneDocument = {
      ...withAll3,
      camera: cut1UpdatedCam,
      activeShotId: "cut-1",
      shots: withAll3.shots!.map((shot) =>
        shot.id === "cut-1" ? { ...shot, camera: { ...cut1UpdatedCam } } : shot,
      ),
    };

    // [검증 단계 A] 저장 전: 2·3컷 카메라 값 불변
    expect(mutatedDoc.shots?.find((s) => s.id === "cut-2")?.camera).toEqual(cut2InitialCam);
    expect(mutatedDoc.shots?.find((s) => s.id === "cut-3")?.camera).toEqual(cut3InitialCam);

    // [검증 단계 B] 컷 전환 직후: applyStudioBg3dShot으로 2·3컷 전환 시 원본 구도 유지
    expect(applyStudioBg3dShot(mutatedDoc, "cut-2")?.camera).toEqual(cut2InitialCam);
    expect(applyStudioBg3dShot(mutatedDoc, "cut-3")?.camera).toEqual(cut3InitialCam);

    // [검증 단계 C] 저장 → 재열기 직후: 직렬화·역직렬화 라운드트립 후 1컷 반영·2·3컷 불변
    const serialized = serializeStudioBg3dSceneDocument(mutatedDoc);
    expect(serialized).not.toBeNull();
    const reopened = parseStudioBg3dSceneDocument(serialized!);
    expect(reopened).not.toBeNull();
    expect(applyStudioBg3dShot(reopened!, "cut-1")?.camera).toEqual(cut1UpdatedCam);
    expect(applyStudioBg3dShot(reopened!, "cut-2")?.camera).toEqual(cut2InitialCam);
    expect(applyStudioBg3dShot(reopened!, "cut-3")?.camera).toEqual(cut3InitialCam);

    // [검증 단계 D] 재열기 후 3컷 일괄 PNG 출력: 1컷은 새 구도로 변경, 2·3컷은 기준 PNG와 비트 단위 일치
    const batchViewport = createMockViewportApi(baseDoc.camera);
    const batchPngs = await runSequentialBatchPngExport(reopened!, ["cut-1", "cut-2", "cut-3"], batchViewport);
    expect(sha256Hex(batchPngs.get("cut-1")!)).not.toBe(baseHash1);
    expect(sha256Hex(batchPngs.get("cut-2")!)).toBe(baseHash2);
    expect(sha256Hex(batchPngs.get("cut-3")!)).toBe(baseHash3);
    expect(batchPngs.get("cut-2")).toEqual(baselinePngs.get("cut-2"));
    expect(batchPngs.get("cut-3")).toEqual(baselinePngs.get("cut-3"));

    // [반증 검증] 첫 PNG만 정상이고 2·3번 컷에서 이전 카메라가 남는 결함이 생기면 즉시 해시 불일치로 탐지한다
    const buggyViewport = createMockViewportApi(baseDoc.camera, { freezeAfterFirstApply: true });
    const buggyPngs = await runSequentialBatchPngExport(reopened!, ["cut-1", "cut-2", "cut-3"], buggyViewport);
    expect(sha256Hex(buggyPngs.get("cut-1")!)).toBe(sha256Hex(batchPngs.get("cut-1")!));
    expect(sha256Hex(buggyPngs.get("cut-2")!)).not.toBe(baseHash2);
    expect(sha256Hex(buggyPngs.get("cut-3")!)).not.toBe(baseHash3);
  });
});
