/* eslint-disable react-refresh/only-export-components -- 분리된 3D 리프트 UI 컴포넌트와 정적 옵션 상수를 함께 소유한다 */
import { useEffect, useId, useRef } from "react";

import type { StudioLift3dWarning } from "./studio-lift3d-contract";
import type {
  StudioLift3dLibraryRights,
  StudioLift3dRightsDeclaration,
} from "./studio-lift3d-library-handoff";

export const PREVIEW_TABS = ["source", "mask", "depth", "model"] as const;
export type StudioLift3dPreviewTab = (typeof PREVIEW_TABS)[number];

export const PREVIEW_TAB_LABELS: Readonly<Record<StudioLift3dPreviewTab, string>> = {
  source: "원화",
  mask: "실루엣",
  depth: "깊이",
  model: "3D",
};

export const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm " +
  "font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed " +
  "disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent";
export const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm " +
  "font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed " +
  "disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent";
export const FIELD_LABEL_CLASS = "flex items-center justify-between text-xs font-semibold text-fg-2";

/**
 * 배경 3D 편집기의 업로드 패널과 같은 문구.
 *
 * "구매·허가"(licensed)는 라이선스 이름을 함께 받아야 저장되는데 여기엔 그 입력이 없다.
 * 받을 수 없는 선언은 제안하지 않는다 — 자세한 이유는 StudioLift3dLibraryRights 참고.
 */
export const LIBRARY_RIGHTS_OPTIONS: ReadonlyArray<{
  readonly id: StudioLift3dLibraryRights;
  readonly label: string;
}> = [
  { id: "unknown", label: "확인 전 — 상업 이용 보류" },
  { id: "owned", label: "직접 제작 — 내가 만든 원화" },
  { id: "public-domain", label: "공개 이용(퍼블릭 도메인)" },
];
export const CARD_CLASS = "rounded-xl border border-line bg-card/60 p-4";

/** 등록 결과 문구에 쓸 권리 표기 이름. 목록에 없는 값이면 식별자를 그대로 보여준다. */
export function rightsLabel(rights: StudioLift3dRightsDeclaration): string {
  const status = LIBRARY_RIGHTS_OPTIONS.find((option) => option.id === rights.status)?.label
    ?? rights.status;
  return `${status} · ${rights.commercialUse ? "상업 이용 가능" : "상업 이용 확인 필요"}`;
}

export interface SliderFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly display: string;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  disabled,
  onChange,
}: SliderFieldProps) {
  const inputId = useId();
  return (
    <div className="space-y-1.5">
      <label className={FIELD_LABEL_CLASS} htmlFor={inputId}>
        <span>{label}</span>
        <span className="font-mono text-fg-3">{display}</span>
      </label>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent disabled:opacity-40"
      />
    </div>
  );
}

export function WarningList({ warnings }: { readonly warnings: readonly StudioLift3dWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-xs leading-relaxed text-fg-3">
      {warnings.map((warning) => (
        <li key={`${warning.code}-${warning.message}`} className="flex gap-2">
          <span aria-hidden="true">·</span>
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** 마스크·깊이 미리보기를 작업 격자 해상도 그대로 그린다(확대는 CSS 가 픽셀 단위로). */
export function RasterPreview({
  width,
  height,
  pixels,
  label,
}: {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
  }, [width, height, pixels]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className="h-full w-full object-contain [image-rendering:pixelated]"
    />
  );
}
