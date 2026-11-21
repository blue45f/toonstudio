import type Konva from "konva";
import { describe, expect, it, vi } from "vitest";

import { captureStudioInkInputContractV2 } from "@/shared/lib/studio-ink-input-contract";
import { StudioDrawingPointerTransportController } from "../brush/studio-drawing-pointer-transport";
import { beginStudioStrokePointerSession } from "../canvas/studio-pointer-input";
import type { DrawEl } from "../studio-element-model";
import type { StudioPredictedInkTailState } from "../studio-predicted-ink-tail";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";
import { bindStudioCuttoonStagePointersBatch } from "./studio-cuttoon-stage-pointers-batch";
import { bindStudioCuttoonStagePointersFreehand } from "./studio-cuttoon-stage-pointers-freehand";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";

const SENSOR_NAMES = [
  "altitudeAngles", "azimuthAngles", "contactWidths", "contactHeights", "sampleTimeOffsets",
] as const;

function frozen(values: number[]): number[] {
  Object.freeze(values);
  return values;
}

function fixture(sampleCount: number, direct: boolean) {
  const lastOffset = (sampleCount - 1) * 4;
  const lastX = sampleCount * 2 - 2;
  const lastY = sampleCount * 2 - 1;
  const channel = (start: number, end: number) => frozen(Array.from(
    { length: sampleCount }, (_, index) => start + (end - start) * index / (sampleCount - 1),
  ));
  const sources = {
    altitudeAngles: channel(0.2, 1.2),
    azimuthAngles: channel(0.4, 3.4),
    contactWidths: channel(2, 5),
    contactHeights: channel(3, 7),
    sampleTimeOffsets: channel(0, lastOffset),
  };
  const scalarReads = {
    altitudeAngles: 0, azimuthAngles: 0, contactWidths: 0, contactHeights: 0, sampleTimeOffsets: 0,
  };
  const observed = (name: typeof SENSOR_NAMES[number]) => new Proxy(sources[name], {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) scalarReads[name] += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const authoritative: DrawEl = {
    id: "prediction-long-stroke", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
    stroke: "#123456", strokeWidth: 4, sampleSpacing: 0,
    inkInput: captureStudioInkInputContractV2("pen"),
    points: frozen(Array.from({ length: sampleCount * 2 }, (_, index) => index)),
    pressures: frozen(Array(sampleCount).fill(0.5)),
    altitudeAngles: observed("altitudeAngles"),
    azimuthAngles: observed("azimuthAngles"),
    contactWidths: observed("contactWidths"),
    contactHeights: observed("contactHeights"),
    sampleTimeOffsets: observed("sampleTimeOffsets"),
  };
  Object.freeze(authoritative);

  const pointer = (step: number): PointerEvent => ({
    pointerId: 7, pointerType: "pen", isPrimary: true, button: 0, buttons: 1,
    clientX: lastX + step * 10, clientY: lastY + step * 5,
    pressure: 0.5, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0,
    altitudeAngle: step === 0 ? 1.2 : 0.9,
    azimuthAngle: step === 0 ? 3.4 : 4.2,
    width: step === 0 ? 5 : 6, height: step === 0 ? 7 : 8,
    timeStamp: 100 + lastOffset + step * 8, shiftKey: false,
  } as PointerEvent);
  const predicted = [pointer(1), pointer(2)];
  // 직전 실제 샘플은 중복 제거되고 이번 배치에는 브라우저 예측 두 점만 남는다.
  const event = { ...pointer(0), getPredictedEvents: () => predicted } as PointerEvent;
  const session = beginStudioStrokePointerSession(event);
  if (!session) throw new Error("예측 배치 테스트의 펜 세션이 없습니다.");
  const transport = new StudioDrawingPointerTransportController({
    documentTarget: null, windowTarget: null,
  });
  transport.start({ pointerEvent: event, session, stage: null });
  const tail: StudioPredictedInkTailState = {
    phase: "active", authoritativeSampleCount: sampleCount,
    authoritativeEndpoint: { x: lastX, y: lastY, pressure: 0.5 }, predictedSamples: [],
  };
  const drawingRef = { current: authoritative };
  const replacePredictedInkTail = vi.fn<(drawing: DrawEl, startSample: number) => void>();
  const scheduleDraft = vi.fn<(drawing: DrawEl) => void>();
  const publishAuthoritativeFreehandSuffix = vi.fn(() => drawingRef.current);
  const values = {
    drawMode: "pen", drawingRef,
    drawingPointerTransportRef: { current: transport },
    drawingInputSettingsRef: { current: null }, drawingInkTimeOriginRef: { current: 100 },
    drawingFixedRateFilterRef: { current: null }, drawingFixedRateSampleClockRef: { current: null },
    drawingFixedRateOwnedPointsRef: { current: null }, drawingImmediateCausalInputRef: { current: true },
    drawingImmediateBatchMutationRef: { current: false }, drawingPredictionBatchMutationRef: { current: false },
    drawingPredictionPreviewRef: { current: false }, drawingThinLineInkInputRef: { current: null },
    drawingStabilizerRef: { current: null }, drawingVelocityRef: { current: null },
    drawingVelocityPressureRef: { current: null }, drawingPrecisionStabilizerBridgeRef: { current: null },
    drawingLastAuthoritativePointerRef: { current: event },
    perspectiveRayRef: { current: null }, isometricAxisRayRef: { current: null },
    advancedRulerSnapRef: { current: null },
    causalPostCorrectionStateRef: { current: null }, predictedInkTailStateRef: { current: direct ? tail : null },
    rawPenInkPreviewStateRef: { current: null },
    liveDraftDirectRef: { current: direct }, liveInkOverlayRendererRef: { current: { isActive: direct } },
    liveStampDraftDirectRef: { current: false }, liveDynamicBrushDraftDirectRef: { current: false },
    liveRetainedMediaDraftDirectRef: { current: false }, liveWetInkDraftDirectRef: { current: false },
    gpuLiveInkPinnedRef: { current: false }, gpuLiveSourceJournalRef: { current: null },
    inkMeshLivePreviewModuleRef: { current: null }, inkMeshLivePreviewRuntimeRef: { current: null },
    perspectiveRulerActive: false, isometricGridActive: false, vanishingPoints: [],
    effScale: 1, pressureCurve: 1, pressureMinSize: 0, useVelocityPressure: false, velocitySensitivity: 0,
    replacePredictedInkTail, scheduleDraft,
  } satisfies Partial<StudioCuttoonStagePointersHost>;
  // 렌더러와 Stage만 테스트 경계로 두고 배치 수집 및 실제 freehand 센서 추가를 함께 실행한다.
  const host = values as unknown as StudioCuttoonStagePointersHost;
  const api = {
    applyStrokeObjectSnapToPoint: (x: number, y: number) => ({ x, y }),
    publishAuthoritativeFreehandSuffix,
  } as StudioCuttoonStagePointersApi;
  bindStudioCuttoonStagePointersFreehand(host, api);
  bindStudioCuttoonStagePointersBatch(host, api);
  const stage = { getContent: () => null, setPointersPositions: vi.fn() } as unknown as Konva.Stage;
  const run = () => api.consumeFreehandPointerBatch(stage, event, true, {
    coordinateMapper: { pointFor: (sample: PointerEvent) => ({ x: sample.clientX, y: sample.clientY }) },
  });
  return {
    run, transport, values, authoritative, sources, scalarReads, lastOffset, lastX, lastY,
    replacePredictedInkTail, scheduleDraft, publishAuthoritativeFreehandSuffix,
  };
}

describe("실제 펜 예측 배치의 v2 센서 소유권", () => {
  it.each([1_000, 8_000, 50_000])(
    "%i점 장획의 반복 예측도 센서별 두 원소만 읽고 새 예측 접미사를 교체한다",
    (sampleCount) => {
      const f = fixture(sampleCount, true);
      try {
        for (let delivery = 1; delivery <= 2; delivery += 1) {
          expect(f.run()).toBe(true);
          const call = f.replacePredictedInkTail.mock.calls.at(-1);
          if (!call) throw new Error("교체할 예측 접미사가 전달되지 않았습니다.");
          const [preview, predictionStart] = call;
          expect(predictionStart).toBe(2);
          expect(preview.points).toEqual([
            0, 1, f.lastX, f.lastY, f.lastX + 10, f.lastY + 5, f.lastX + 20, f.lastY + 10,
          ]);
          expect(preview.altitudeAngles).toEqual([0.2, 1.2, 0.9, 0.9]);
          expect(preview.azimuthAngles).toEqual([0.4, 3.4, 4.2, 4.2]);
          expect(preview.contactWidths).toEqual([2, 5, 6, 6]);
          expect(preview.contactHeights).toEqual([3, 7, 8, 8]);
          expect(preview.sampleTimeOffsets).toEqual([0, f.lastOffset, f.lastOffset + 8, f.lastOffset + 16]);
          for (const name of SENSOR_NAMES) {
            expect(f.scalarReads[name]).toBe(delivery * 2);
            expect(preview[name]).not.toBe(f.authoritative[name]);
            expect(f.sources[name]).toHaveLength(sampleCount);
          }
          expect(f.values.drawingRef.current).toBe(f.authoritative);
          expect(f.values.drawingPredictionPreviewRef.current).toBe(false);
          expect(f.values.drawingPredictionBatchMutationRef.current).toBe(false);
          expect(f.values.drawingVelocityRef.current).toBeNull();
          expect(f.values.drawingVelocityPressureRef.current).toBeNull();
        }
        expect(f.replacePredictedInkTail).toHaveBeenCalledTimes(2);
        expect(f.scheduleDraft).not.toHaveBeenCalled();
        expect(f.publishAuthoritativeFreehandSuffix).not.toHaveBeenCalled();
        expect(f.authoritative.points).toHaveLength(sampleCount * 2);
        expect(f.transport.getSession()?.lastAuthoritativeSample.timeStamp).toBe(100 + f.lastOffset);
      } finally {
        f.transport.dispose();
      }
    },
  );

  it("전체 경로 미리보기 fallback은 모든 센서 점을 독립 복사하고 실제 획을 복원한다", () => {
    const sampleCount = 1_000;
    const f = fixture(sampleCount, false);
    try {
      expect(f.run()).toBe(true);
      const call = f.scheduleDraft.mock.calls.at(-1);
      if (!call) throw new Error("전체 경로 예측 미리보기가 전달되지 않았습니다.");
      const [preview] = call;
      expect(preview.points).toHaveLength((sampleCount + 2) * 2);
      expect(preview.points.slice(0, sampleCount * 2)).toEqual(f.authoritative.points);
      for (const name of SENSOR_NAMES) {
        const channel = preview[name];
        if (!channel) throw new Error(`${name} 전체 경로 센서가 없습니다.`);
        expect(f.scalarReads[name]).toBe(sampleCount);
        expect(channel).toHaveLength(sampleCount + 2);
        expect(channel.slice(0, sampleCount)).toEqual(f.sources[name]);
        expect(channel).not.toBe(f.authoritative[name]);
      }
      expect(preview.sampleTimeOffsets?.slice(-2)).toEqual([f.lastOffset + 8, f.lastOffset + 16]);
      expect(f.values.drawingRef.current).toBe(f.authoritative);
      expect(f.replacePredictedInkTail).not.toHaveBeenCalled();
      expect(f.publishAuthoritativeFreehandSuffix).not.toHaveBeenCalled();
    } finally {
      f.transport.dispose();
    }
  });
});
