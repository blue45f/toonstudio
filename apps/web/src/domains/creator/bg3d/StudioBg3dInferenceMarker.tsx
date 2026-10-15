/**
 * 추론 마커 — 모양과 색을 함께 써서 색에만 의존하지 않는 표시.
 *
 * 끝점=채운 사각형, 중간점=삼각형, 교차점=X, 중심=점이 있는 원, 선 위=굵은 막대, 면 위=평행사변형,
 * 축 정렬=화살표 선, 기준점 연장=점+점선, 평행=두 줄, 수직=직각, 격자=십자. 색은 디자인 토큰
 * (끝점 good, 중간점 cool, 중심 accent, 교차점 bad …)이고, 축 정렬은 축 색(X bad, Y good, Z cool)을 쓴다.
 * 접근성 이름(role=img)은 툴팁과 같은 문구라서 스크린리더와 시각 사용자가 같은 정보를 얻는다.
 */

import {
  STUDIO_BG3D_INFERENCE_KIND_STYLE,
  resolveStudioBg3dInferenceToneTextClass,
  studioBg3dInferenceKindLabel,
} from "./studio-bg3d-inference-kinds";

import type {
  StudioBg3dInferenceAxis,
  StudioBg3dInferenceKind,
  StudioBg3dInferenceMarkerShape,
} from "./studio-bg3d-inference-kinds";

interface GlyphLayer {
  readonly d: string;
  readonly fill?: boolean;
  readonly dash?: string;
  readonly opacity?: number;
}

const GLYPHS: Readonly<Record<StudioBg3dInferenceMarkerShape, readonly GlyphLayer[]>> = Object.freeze({
  square: [{ d: "M6 6h12v12H6z", fill: true }],
  triangle: [{ d: "M12 5l8 14H4z", fill: true }],
  cross: [{ d: "M6 6l12 12M18 6L6 18" }],
  "circle-dot": [{ d: "M12 4a8 8 0 1 0 .001 0z" }, { d: "M12 9.5a2.5 2.5 0 1 0 .001 0z", fill: true }],
  bar: [{ d: "M3 10h18v4H3z", fill: true }],
  face: [{ d: "M8 6h13l-4 12H4z", fill: true, opacity: 0.28 }, { d: "M8 6h13l-4 12H4z" }],
  "axis-line": [{ d: "M4 12h15M14 7l5 5-5 5" }],
  "dotted-line": [{ d: "M6 9.5a2.5 2.5 0 1 0 .001 0z", fill: true }, { d: "M11 12h10", dash: "2 3" }],
  "double-bar": [{ d: "M8 4v16M16 4v16" }],
  "right-angle": [{ d: "M7 4v13h13" }, { d: "M7 12.5h4.5V17", opacity: 0.8 }],
  plus: [{ d: "M12 5v14M5 12h14" }],
  none: [{ d: "M12 9a3 3 0 1 0 .001 0z" }],
});

export interface StudioBg3dInferenceMarkerProps {
  readonly kind: StudioBg3dInferenceKind;
  readonly axis?: StudioBg3dInferenceAxis | null;
  /** 접근성 이름이자 툴팁 문구. 생략하면 종류·축에서 만든다. */
  readonly label?: string;
  readonly showLabel?: boolean;
  readonly size?: number;
  readonly className?: string;
}

export function StudioBg3dInferenceMarker({
  kind,
  axis = null,
  label,
  showLabel = false,
  size = 22,
  className,
}: StudioBg3dInferenceMarkerProps) {
  const style = STUDIO_BG3D_INFERENCE_KIND_STYLE[kind];
  const name = label ?? studioBg3dInferenceKindLabel(kind, axis);
  const layers = GLYPHS[style.shape];
  return (
    <span
      role="img"
      aria-label={name}
      data-testid="bg3d-inference-marker"
      data-kind={kind}
      data-shape={style.shape}
      {...(axis ? { "data-axis": axis } : {})}
      className={[
        "inline-flex items-center",
        resolveStudioBg3dInferenceToneTextClass(kind, axis),
        className ?? "",
      ].join(" ").trim()}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        className="shrink-0 overflow-visible"
      >
        {/* 밝은 배경과 어두운 배경 모두에서 윤곽이 보이도록 패널 색 후광을 먼저 깐다. */}
        <g
          fill="none"
          stroke="var(--color-panel, #fff)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {layers.map((layer, index) => (
            <path key={`halo-${index}`} d={layer.d} {...(layer.fill ? { fill: "var(--color-panel, #fff)" } : {})} />
          ))}
        </g>
        <g fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          {layers.map((layer, index) => (
            <path
              key={`body-${index}`}
              d={layer.d}
              {...(layer.fill ? { fill: "currentColor" } : {})}
              {...(layer.dash ? { strokeDasharray: layer.dash } : {})}
              {...(layer.opacity === undefined ? {} : { opacity: layer.opacity })}
            />
          ))}
        </g>
      </svg>
      {showLabel ? (
        <span
          aria-hidden="true"
          className="pointer-events-none ml-1.5 whitespace-nowrap rounded-full border border-line bg-panel/95 px-2 py-0.5 text-[0.62rem] font-bold text-fg shadow-md backdrop-blur"
        >
          {name}
        </span>
      ) : null}
    </span>
  );
}
