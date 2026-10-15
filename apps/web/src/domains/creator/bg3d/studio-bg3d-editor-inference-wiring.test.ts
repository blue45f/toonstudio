import { describe, expect, it, vi } from "vitest";

import { attachStudioBg3dEditorMeasureHost } from "./studio-bg3d-editor-measure-host";
import { attachStudioBg3dEditorPlacementHost } from "./studio-bg3d-editor-placement-host";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";
import {
  STUDIO_BG3D_MEASUREMENT_MAX_REFERENCES,
  classifyStudioBg3dMeasurementInference,
  createStudioBg3dMeasurementDocument,
  formatStudioBg3dMeasurementLength,
  lockStudioBg3dMeasurementLength,
  measureStudioBg3dWorldPoints,
  resolveStudioBg3dMeasurementGuide,
} from "./studio-bg3d-measurement";
import {
  createStudioBg3dPlacementSession,
  transitionStudioBg3dPlacementSession,
} from "./studio-bg3d-placement-session";

// 호스트 파일은 런타임 바인딩 모듈에서 식별자를 구조 분해한다. 무거운 모듈(three, 환경 에셋 매니페스트 등)을
// 끌어오지 않도록 비우고, 필요한 순수 함수만 호스트 백(h)으로 넘긴다.
vi.mock("./studio-bg3d-editor-runtime-bindings", () => ({}));

const WPP = 1 / 64;

function snappedService() {
  const service = createStudioBg3dInferenceService({ now: () => 0, scheduler: () => () => undefined });
  service.syncScene({
    entities: [{ id: "A", kind: "box", label: "상자 A", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
  });
  return service;
}

function measureHost(overrides: Record<string, unknown> = {}) {
  const calls = {
    start: [] as unknown[],
    draft: [] as unknown[],
    status: [] as unknown[],
    active: [] as unknown[],
    inference: [] as unknown[],
  };
  const h: Record<string, unknown> = {
    measurementActiveRef: { current: true },
    surfaceSnapArmedRef: { current: false },
    measurementDocument: createStudioBg3dMeasurementDocument("m"),
    measurementStartWorld: null,
    measurementDraft: null,
    measurementLockedLengthMeters: null,
    setMeasurementActive: (value: unknown) => calls.active.push(value),
    setMeasurementStartWorld: (value: unknown) => calls.start.push(value),
    setMeasurementDraft: (value: unknown) => calls.draft.push(value),
    setMeasurementInference: (value: unknown) => calls.inference.push(value),
    setMeasurementStatus: (value: unknown) => calls.status.push(value),
    setError: () => undefined,
    handlePanelTabChange: () => undefined,
    STUDIO_BG3D_MEASUREMENT_MAX_REFERENCES,
    classifyStudioBg3dMeasurementInference,
    formatStudioBg3dMeasurementLength,
    lockStudioBg3dMeasurementLength,
    measureStudioBg3dWorldPoints,
    resolveStudioBg3dMeasurementGuide,
    ...overrides,
  };
  attachStudioBg3dEditorMeasureHost(h);
  return { h: h as Record<string, (...args: unknown[]) => unknown> & Record<string, unknown>, calls };
}

describe("줄자 호스트 ↔ 추론 서비스", () => {
  it("서비스가 없으면 기존 동작 그대로 원래 점으로 시작점을 잡는다", () => {
    const { h, calls } = measureHost();
    h.pickMeasurementPoint?.([0.52, 1, 0.5]);
    expect(calls.start).toEqual([[0.52, 1, 0.5]]);
  });

  it("첫 점 클릭은 방금 계산된 끝점 추론 점으로 치환된다", () => {
    const service = snappedService();
    service.begin("measure", {});
    service.resolve({ cursor: { kind: "point", point: [0.52, 1, 0.5], worldPerPixel: WPP } });
    const { h, calls } = measureHost({ inferenceService: service });
    h.pickMeasurementPoint?.([0.52, 1, 0.5]);
    expect(calls.start).toEqual([[0.5, 1, 0.5]]);
    expect(String(calls.status.at(-1))).toContain("시작점을 잡았습니다");
  });

  it("추론이 없거나 커서와 멀리 떨어진 점은 치환하지 않는다", () => {
    const service = snappedService();
    service.begin("measure", {});
    service.resolve({ cursor: { kind: "point", point: [0.52, 1, 0.5], worldPerPixel: WPP } });
    const { h, calls } = measureHost({ inferenceService: service });
    h.pickMeasurementPoint?.([4, 0, 4]);
    expect(calls.start).toEqual([[4, 0, 4]]);
  });

  it("미리보기 점도 추론 점으로 치환되어 초안 선분의 끝이 된다", () => {
    const service = snappedService();
    service.begin("measure", { referencePoint: [3, 0, 0] });
    service.resolve({ cursor: { kind: "point", point: [0.52, 1, 0.5], worldPerPixel: WPP } });
    const { h, calls } = measureHost({ inferenceService: service, measurementStartWorld: [3, 0, 0] });
    h.updateMeasurementPreview?.([0.52, 1, 0.5]);
    const draft = calls.draft.at(-1) as { endWorld: number[] } | undefined;
    expect(draft?.endWorld).toEqual([0.5, 1, 0.5]);
  });

  it("두 번째 점 클릭은 측정을 확정하고, 길이 입력은 추론 치환 없이 정확한 길이로 확정한다", () => {
    const service = snappedService();
    service.begin("measure", { referencePoint: [0, 0, 0] });
    const { h, calls } = measureHost({ inferenceService: service, measurementStartWorld: [0, 0, 0] });
    // 정확한 길이: 끝점 (2.4, 0, 0) + 길이 2.4m → 길이 잠금이 방향만 쓰고 거리는 정확히 2.4m가 된다.
    h.pickMeasurementPoint?.([2.4000001, 0, 0], 2.4);
    const draft = calls.draft.at(-1) as { distanceMeters: number; endWorld: number[] } | undefined;
    expect(draft?.distanceMeters).toBeCloseTo(2.4, 12);
    expect(draft?.endWorld[0]).toBeCloseTo(2.4, 12);
    expect(calls.active.at(-1)).toBe(false);
    expect(String(calls.status.at(-1))).toContain("확정");
  });

  it("Esc 단계 취소: 시작점이 있으면 시작점만 취소하고 도구는 유지한다", () => {
    const { h, calls } = measureHost({ measurementStartWorld: [1, 0, 1] });
    h.cancelMeasurementStep?.();
    expect(calls.start).toEqual([null]);
    expect(calls.active).toEqual([]);
    expect(String(calls.status.at(-1))).toContain("시작점을 취소");
  });

  it("Esc 단계 취소: 시작점이 없으면 줄자를 끈다", () => {
    const { h, calls } = measureHost();
    h.cancelMeasurementStep?.();
    expect(calls.active).toEqual([false]);
    expect(String(calls.status.at(-1))).toContain("줄자 측정을 취소");
  });

  it("줄자가 꺼져 있으면 단계 취소도 아무것도 하지 않는다", () => {
    const { h, calls } = measureHost({ measurementActiveRef: { current: false } });
    h.cancelMeasurementStep?.();
    expect(calls.start).toEqual([]);
    expect(calls.status).toEqual([]);
  });
});

describe("모델 배치 호스트 ↔ 추론 서비스", () => {
  function placementHost(inferPlacementTarget?: (target: unknown) => unknown) {
    const published: unknown[] = [];
    const idle = createStudioBg3dPlacementSession();
    const begun = transitionStudioBg3dPlacementSession(idle, {
      type: "begin",
      assetId: "asset-1",
      storageId: "storage-1",
      placementToken: "token-1",
      sourceKind: "asset-library",
      floorPoint: [0, 0],
    } as never);
    if (!begun.ok) throw new Error("배치 세션을 시작하지 못했습니다");
    const h: Record<string, unknown> = {
      placementSessionRef: { current: begun.state },
      setPlacementSession: (state: unknown) => published.push(state),
      transitionStudioBg3dPlacementSession,
      ...(inferPlacementTarget ? { inferPlacementTarget } : {}),
    };
    attachStudioBg3dEditorPlacementHost(h);
    return { h: h as Record<string, (...args: unknown[]) => unknown>, published };
  }

  it("추론 치환이 없으면 포인터 목표를 그대로 세션에 넘긴다", () => {
    const { h, published } = placementHost();
    h.moveCustomModelPlacement?.({ floorPoint: [2, 3] }, false);
    const state = published.at(-1) as { placement: { worldPosition: number[] } };
    expect(state.placement.worldPosition[0]).toBeCloseTo(2, 9);
    expect(state.placement.worldPosition[2]).toBeCloseTo(3, 9);
  });

  it("추론 치환이 있으면 치환된 목표점으로 미리보기를 움직인다", () => {
    const infer = vi.fn(() => ({ floorPoint: [0.5, 0.5] as const }));
    const { h, published } = placementHost(infer);
    h.moveCustomModelPlacement?.({ floorPoint: [0.52, 0.5] }, false);
    expect(infer).toHaveBeenCalledWith({ floorPoint: [0.52, 0.5] });
    const state = published.at(-1) as { placement: { worldPosition: number[] } };
    expect(state.placement.worldPosition[0]).toBeCloseTo(0.5, 9);
    expect(state.placement.worldPosition[2]).toBeCloseTo(0.5, 9);
  });
});
