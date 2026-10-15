/**
 * 뷰포트 오버레이가 그릴 마커·유도선을 순수 데이터로 만든다 — three.js/React 비의존.
 *
 * 마커 모양·색·문구와 유도선의 색·점선 무늬 규칙을 한곳에 두어, R3F 오버레이는 이 모델을 그대로 그리기만
 * 하고 규칙은 단위 테스트로 지킨다. 축 유도선은 빨강=X, 초록=Y, 파랑=Z이고 축마다 점선 간격이 달라
 * 색을 구분하지 못해도 선 무늬로 축을 알 수 있다.
 */

import {
  STUDIO_BG3D_INFERENCE_AXIS_STYLE,
  STUDIO_BG3D_INFERENCE_KIND_STYLE,
  studioBg3dInferenceKindLabel,
} from "./studio-bg3d-inference-kinds";

import type { StudioBg3dInferenceAxis, StudioBg3dInferenceKind } from "./studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferenceServiceSnapshot } from "./studio-bg3d-inference-service";
import type { StudioBg3dInferenceGuide } from "./studio-bg3d-inference-types";

export interface StudioBg3dInferenceOverlayMarker {
  readonly id: string;
  readonly point: StudioBg3dInferenceVec3;
  readonly kind: StudioBg3dInferenceKind;
  readonly axis: StudioBg3dInferenceAxis | null;
  /** 툴팁이자 접근성 이름. */
  readonly label: string;
  /** 현재 커서 결과만 툴팁을 항상 보인다 — 호버 기준점은 마커만 둔다. */
  readonly showLabel: boolean;
}

export interface StudioBg3dInferenceOverlayGuide {
  readonly id: string;
  readonly from: StudioBg3dInferenceVec3;
  readonly to: StudioBg3dInferenceVec3;
  readonly hex: string;
  readonly dashed: boolean;
  readonly dashSize: number;
  readonly gapSize: number;
  readonly opacity: number;
  readonly renderOrder: number;
}

export interface StudioBg3dInferenceOverlayModel {
  readonly markers: readonly StudioBg3dInferenceOverlayMarker[];
  readonly guides: readonly StudioBg3dInferenceOverlayGuide[];
}

export const EMPTY_STUDIO_BG3D_INFERENCE_OVERLAY: StudioBg3dInferenceOverlayModel = Object.freeze({
  markers: Object.freeze([]),
  guides: Object.freeze([]),
});

const DEFAULT_DASH: readonly [number, number] = [0.1, 0.05];

/** 유도선의 색·무늬·불투명도 규칙. */
export function resolveStudioBg3dInferenceGuideStyle(
  guide: Pick<StudioBg3dInferenceGuide, "role" | "axis" | "dashed">,
): Pick<StudioBg3dInferenceOverlayGuide, "hex" | "dashed" | "dashSize" | "gapSize" | "opacity" | "renderOrder"> {
  const axisStyle = guide.axis ? STUDIO_BG3D_INFERENCE_AXIS_STYLE[guide.axis] : null;
  const [dashSize, gapSize] = axisStyle?.dash ?? DEFAULT_DASH;
  switch (guide.role) {
    case "axis":
    case "lock":
    case "from-point":
      return {
        hex: axisStyle?.hex ?? STUDIO_BG3D_INFERENCE_KIND_STYLE.axis.hex,
        dashed: guide.dashed,
        dashSize,
        gapSize,
        opacity: guide.role === "lock" ? 1 : 0.9,
        renderOrder: guide.role === "lock" ? 45 : 44,
      };
    case "relation":
      return {
        hex: STUDIO_BG3D_INFERENCE_KIND_STYLE.parallel.hex,
        dashed: guide.dashed,
        dashSize: DEFAULT_DASH[0],
        gapSize: DEFAULT_DASH[1],
        opacity: 0.9,
        renderOrder: 44,
      };
    case "reference-edge":
      return {
        hex: STUDIO_BG3D_INFERENCE_KIND_STYLE.parallel.hex,
        dashed: false,
        dashSize: DEFAULT_DASH[0],
        gapSize: DEFAULT_DASH[1],
        opacity: 1,
        renderOrder: 46,
      };
    case "edge":
      return {
        hex: STUDIO_BG3D_INFERENCE_KIND_STYLE["on-edge"].hex,
        dashed: false,
        dashSize: DEFAULT_DASH[0],
        gapSize: DEFAULT_DASH[1],
        opacity: 1,
        renderOrder: 46,
      };
    default:
      return {
        hex: STUDIO_BG3D_INFERENCE_KIND_STYLE.free.hex,
        dashed: true,
        dashSize: DEFAULT_DASH[0],
        gapSize: DEFAULT_DASH[1],
        opacity: 0.7,
        renderOrder: 43,
      };
  }
}

/**
 * 서비스 스냅샷으로 오버레이 모델을 만든다.
 * 자유 위치는 마커를 그리지 않는다(커서 자체가 위치를 보여 준다). 호버 기준점은 항상 그린다.
 */
export function buildStudioBg3dInferenceOverlayModel(
  snapshot: Pick<StudioBg3dInferenceServiceSnapshot, "session">,
  capturing = false,
): StudioBg3dInferenceOverlayModel {
  const { session } = snapshot;
  if (!session.active || capturing) return EMPTY_STUDIO_BG3D_INFERENCE_OVERLAY;
  const markers: StudioBg3dInferenceOverlayMarker[] = [];
  const guides: StudioBg3dInferenceOverlayGuide[] = [];

  session.hoverReferences.forEach((point, index) => {
    markers.push({
      id: `hover-${index}`,
      point,
      kind: "from-point",
      axis: null,
      label: `기준점 ${index + 1}`,
      showLabel: false,
    });
  });

  const result = session.lastResult;
  if (result) {
    if (result.kind !== "free") {
      markers.push({
        id: "current",
        point: result.point,
        kind: result.kind,
        axis: result.axis,
        label: result.label || studioBg3dInferenceKindLabel(result.kind, result.axis),
        showLabel: true,
      });
    }
    result.guides.forEach((guide, index) => {
      guides.push({
        id: `${guide.id}:${index}`,
        from: guide.from,
        to: guide.to,
        ...resolveStudioBg3dInferenceGuideStyle(guide),
      });
    });
  }
  return { markers, guides };
}
