/**
 * StudioRulersPanel.tsx
 *
 * 자(rulers) + 대칭 그리기 설정 패널.
 *
 * UX 목표: 10초 안에 목적 이해 — "자를 올려놓고 그리면 선이 자에 착 달라붙어요".
 * - 자 종류 카드 4종 (직선/곡선/동심원/퍼스펙티브) + SVG 미니 프리뷰
 * - 올려놓은 자 목록: 표시/숨기기, 스냅 on/off, 자별 색상
 * - 원근 가이드: 1/2/3점 투시 토글 + 그리기 스냅 (studio-perspective-guide).
 *   켜면 소실점 격자 세그먼트를 onPerspectiveGuideChange 로 내보내고,
 *   호스트는 그 세그먼트를 캔버스에 그리고 studio-perspective-pen-snap 으로
 *   펜 입력을 스냅한다. 꺼져 있으면 이 섹션은 접혀 있고 어떤 콜백도
 *   나가지 않아 기존 동작과 완전히 동일하다(기본값 꺼짐).
 * - 원근 가이드 확장: 장면 프리셋 6종(복도·실내 코너·거리·넓은 광장·
 *   고층 올려보기·내려보기), 격자 밀도 4단계, 피쉬아이 곡선 표시,
 *   보조 격자(동심원·방사). 전부 켠 상태에서만 나타나고, 기본값
 *   (프리셋 없음·보통 밀도·직선·보조 없음)은 종전 상태와 동일하다.
 *   상태에는 presetId/gridDensity/displayMode/auxiliaryKind 가 함께
 *   나가므로 호스트가 실제 캔버스 크기로 다시 만들 때도 같은 옵션을
 *   buildPerspectiveGuideSegments 에 넘기면 된다.
 * - 대칭 그리기: 모드(수직/수평/4방향/방사형) + 축·각도·분할 수 조절
 *
 * 접근성: 정적 SVG 프리뷰(role="img" + aria-label), 토글은 aria-pressed,
 * 슬라이더는 label 연결. 애니메이션이 전혀 없어 reduced-motion 대응은
 * 구조적으로 만족한다. 390px 너비 대응: 고정 너비 없음, 2열 카드 그리드.
 * 다크/라이트는 디자인 토큰(bg-card/text-fg/border-line/bg-canvas)으로 대응.
 */

import { useRef, useState } from "react";

import { CircleDot, Eye, EyeOff, Magnet, Plus, Pyramid, Ruler, Spline, Trash2 } from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

import { translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_RULERS_MAX_PER_CANVAS,
  createStudioConcentricRuler,
  createStudioCurveRuler,
  createStudioLineRuler,
  createStudioPerspectiveRuler,
  type StudioRuler,
  type StudioRulerKind,
} from "./studio-rulers";
import {
  buildPerspectiveGuideSegments,
  createDefaultPerspectiveGuide,
  createPerspectiveGuideFromScenePreset,
  PERSPECTIVE_GRID_DENSITIES,
  PERSPECTIVE_SCENE_PRESETS,
  PERSPECTIVE_KINDS,
  perspectiveVanishingPoints,
  type GuideLine,
  type PerspectiveAuxiliaryGuideKind,
  type PerspectiveGridDensity,
  type PerspectiveGuide,
  type PerspectiveGuideDisplayMode,
  type PerspectiveKind,
  type PerspectiveScenePresetId,
} from "./studio-perspective-guide";
import {
  STUDIO_SYMMETRY_FOLDS_MAX,
  STUDIO_SYMMETRY_FOLDS_MIN,
  STUDIO_SYMMETRY_MODES,
  normalizeStudioSymmetrySettings,
  type StudioSymmetryMode,
  type StudioSymmetrySettings,
} from "./studio-symmetry";

const SCOPE = "studioRulersPanel";

/** 패널이 가정하는 캔버스 좌표 공간 (슬라이더 범위 기준). */
const CANVAS_W = 320;
const CANVAS_H = 240;

const COLOR_PRESETS = [
  "#4f9cf9",
  "#7c5cff",
  "#22b8a8",
  "#f59e0b",
  "#ef4444",
  "#64748b",
] as const;

const KIND_CARD_META: ReadonlyArray<{
  readonly kind: StudioRulerKind;
  readonly Icon: LucideIcon;
}> = [
  { kind: "line", Icon: Ruler },
  { kind: "curve", Icon: Spline },
  { kind: "concentric", Icon: CircleDot },
  { kind: "perspective", Icon: Pyramid },
] as const;

/**
 * 원근 가이드 상태 — 패널이 호스트에 내보내는 배선 계약.
 * enabled=false 이면 segments는 항상 빈 배열이고, 호스트는 오버레이를
 * 그리지 않으며 펜 스냅 세션도 열지 않는다(기존 동작과 동일).
 * segments는 패널 좌표 공간(기본 320×240)으로 자른 격자이며, 호스트가
 * 실제 캔버스 크기로 다시 만들려면 guide + buildPerspectiveGuideSegments
 * (studio-perspective-guide)에 gridDensity/displayMode/auxiliaryKind
 * 옵션을 함께 넘기면 된다.
 */
export interface StudioPerspectiveGuideState {
  readonly enabled: boolean;
  /** 가이드가 켜져 있을 때만 의미 있는 그리기 스냅 토글. */
  readonly snapEnabled: boolean;
  readonly guide: PerspectiveGuide;
  readonly segments: readonly GuideLine[];
  /** 적용된 장면 프리셋. 1/2/3점 수동 선택이면 null. */
  readonly presetId?: PerspectiveScenePresetId | null;
  /** 격자 밀도. 기본 "standard"(종전 divisions와 동일). */
  readonly gridDensity?: PerspectiveGridDensity;
  /** 표시 모드. "fisheye"면 segments는 곡선 근사 폴리라인이다. */
  readonly displayMode?: PerspectiveGuideDisplayMode;
  /** 보조 격자 종류. 기본 "none". */
  readonly auxiliaryKind?: PerspectiveAuxiliaryGuideKind;
}

export interface StudioRulersPanelProps {
  readonly initialRulers?: ReadonlyArray<StudioRuler>;
  readonly initialSymmetry?: Partial<StudioSymmetrySettings>;
  readonly onRulersChange?: (rulers: StudioRuler[]) => void;
  readonly onSymmetryChange?: (settings: StudioSymmetrySettings) => void;
  /** 원근 가이드 초기 켜짐 여부. 기본 false — 기존 렌더와 동일. */
  readonly initialPerspectiveGuideEnabled?: boolean;
  /** 원근 가이드 초기 투시 종류. 기본 "two-point". */
  readonly initialPerspectiveKind?: PerspectiveKind;
  /** 원근 가이드 초기 상태 전체(프리셋·종류보다 우선). */
  readonly initialPerspectiveGuide?: PerspectiveGuide;
  /** 원근 가이드 초기 장면 프리셋(초기 상태 전체보다 낮고 종류보다 높다). */
  readonly initialPerspectivePresetId?: PerspectiveScenePresetId;
  /** 원근 가이드 초기 격자 밀도. 기본 "standard". */
  readonly initialPerspectiveGridDensity?: PerspectiveGridDensity;
  /** 원근 가이드 초기 표시 모드. 기본 "linear". */
  readonly initialPerspectiveDisplayMode?: PerspectiveGuideDisplayMode;
  /** 원근 가이드 초기 보조 격자. 기본 "none". */
  readonly initialPerspectiveAuxiliaryKind?: PerspectiveAuxiliaryGuideKind;
  /** 원근 가이드 격자를 만들 캔버스 크기. 기본 320×240(패널 좌표 공간). */
  readonly perspectiveCanvasSize?: {
    readonly width: number;
    readonly height: number;
  };
  readonly onPerspectiveGuideChange?: (
    state: StudioPerspectiveGuideState,
  ) => void;
  /**
   * 원근 가이드 섹션만 렌더한다(인스펙터 자 섹션 마운트용). 자 목록·대칭은
   * 인스펙터의 전용 섹션이 이미 실연결로 제공하므로 중복 렌더를 막는다.
   * 기본 false — 기존 전체 패널 렌더와 동일.
   */
  readonly perspectiveOnly?: boolean;
}

function RulerPreview({
  kind,
  color,
  label,
}: {
  readonly kind: StudioRulerKind;
  readonly color: string;
  readonly label: string;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 96 64"
      role="img"
      aria-label={label}
      className="h-16 w-full rounded-lg bg-canvas text-fg-3"
    >
      {kind === "line" && (
        <>
          <line x1="12" y1="50" x2="84" y2="14" stroke={color} strokeWidth="5" strokeLinecap="round" />
          <path
            d="M18 38 Q48 42 78 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="6 5"
            strokeLinecap="round"
            opacity="0.6"
          />
        </>
      )}
      {kind === "curve" && (
        <>
          <path
            d="M10 52 C30 10 66 56 86 14"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M14 44 C34 30 60 46 80 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="6 5"
            strokeLinecap="round"
            opacity="0.6"
          />
        </>
      )}
      {kind === "concentric" && (
        <>
          <circle cx="48" cy="32" r="9" fill="none" stroke={color} strokeWidth="3" />
          <circle cx="48" cy="32" r="17" fill="none" stroke={color} strokeWidth="3" opacity="0.7" />
          <circle cx="48" cy="32" r="25" fill="none" stroke={color} strokeWidth="3" opacity="0.45" />
          <path
            d="M48 7 A25 25 0 0 1 70 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="6 5"
            strokeLinecap="round"
            opacity="0.6"
          />
        </>
      )}
      {kind === "perspective" && (
        <>
          <line x1="12" y1="12" x2="86" y2="10" stroke={color} strokeWidth="1.5" opacity="0.8" />
          <line x1="12" y1="12" x2="86" y2="32" stroke={color} strokeWidth="1.5" opacity="0.8" />
          <line x1="12" y1="12" x2="86" y2="54" stroke={color} strokeWidth="1.5" opacity="0.8" />
          <line x1="84" y1="52" x2="10" y2="26" stroke={color} strokeWidth="1.5" opacity="0.8" />
          <line x1="84" y1="52" x2="10" y2="46" stroke={color} strokeWidth="1.5" opacity="0.8" />
          <circle cx="12" cy="12" r="3.5" fill={color} />
          <circle cx="84" cy="52" r="3.5" fill={color} />
          <line
            x1="30" y1="18" x2="72" y2="26"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="6 5"
            strokeLinecap="round"
            opacity="0.6"
          />
        </>
      )}
    </svg>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit: string;
  readonly onChange: (value: number) => void;
}): ReactElement {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-fg-2">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-fg">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-[#4f9cf9]"
      />
    </label>
  );
}

export function StudioRulersPanel({
  initialRulers = [],
  initialSymmetry,
  onRulersChange,
  onSymmetryChange,
  initialPerspectiveGuideEnabled = false,
  initialPerspectiveKind = "two-point",
  initialPerspectiveGuide,
  initialPerspectivePresetId,
  initialPerspectiveGridDensity = "standard",
  initialPerspectiveDisplayMode = "linear",
  initialPerspectiveAuxiliaryKind = "none",
  perspectiveCanvasSize,
  onPerspectiveGuideChange,
  perspectiveOnly = false,
}: StudioRulersPanelProps): ReactElement {
  const tx = (ko: string, en: string): string =>
    translateBilingualPair(SCOPE, ko, en);

  const [rulers, setRulers] = useState<StudioRuler[]>(() => [...initialRulers]);
  const [symmetry, setSymmetry] = useState<StudioSymmetrySettings>(() =>
    normalizeStudioSymmetrySettings(initialSymmetry),
  );
  const idCounter = useRef(0);

  /* ---------------- 원근 가이드 (본 배선) ---------------- */
  const perspectiveCanvas = perspectiveCanvasSize ?? {
    width: CANVAS_W,
    height: CANVAS_H,
  };
  const [perspectiveEnabled, setPerspectiveEnabled] = useState<boolean>(
    initialPerspectiveGuideEnabled,
  );
  const [perspectiveSnapEnabled, setPerspectiveSnapEnabled] =
    useState<boolean>(true);
  const [perspectiveGuide, setPerspectiveGuide] = useState<PerspectiveGuide>(
    () =>
      initialPerspectiveGuide ??
      (initialPerspectivePresetId
        ? createPerspectiveGuideFromScenePreset(
            initialPerspectivePresetId,
            perspectiveCanvas,
          )
        : null) ??
      createDefaultPerspectiveGuide(initialPerspectiveKind, perspectiveCanvas),
  );
  const [perspectivePresetId, setPerspectivePresetId] =
    useState<PerspectiveScenePresetId | null>(
      initialPerspectiveGuide ? null : (initialPerspectivePresetId ?? null),
    );
  const [perspectiveGridDensity, setPerspectiveGridDensity] =
    useState<PerspectiveGridDensity>(initialPerspectiveGridDensity);
  const [perspectiveDisplayMode, setPerspectiveDisplayMode] =
    useState<PerspectiveGuideDisplayMode>(initialPerspectiveDisplayMode);
  const [perspectiveAuxiliaryKind, setPerspectiveAuxiliaryKind] =
    useState<PerspectiveAuxiliaryGuideKind>(initialPerspectiveAuxiliaryKind);

  interface PerspectiveExtras {
    readonly presetId: PerspectiveScenePresetId | null;
    readonly gridDensity: PerspectiveGridDensity;
    readonly displayMode: PerspectiveGuideDisplayMode;
    readonly auxiliaryKind: PerspectiveAuxiliaryGuideKind;
  }

  const currentPerspectiveExtras = (): PerspectiveExtras => ({
    presetId: perspectivePresetId,
    gridDensity: perspectiveGridDensity,
    displayMode: perspectiveDisplayMode,
    auxiliaryKind: perspectiveAuxiliaryKind,
  });

  const buildPerspectiveState = (
    enabled: boolean,
    snapEnabled: boolean,
    guide: PerspectiveGuide,
    extras: PerspectiveExtras,
  ): StudioPerspectiveGuideState => ({
    enabled,
    snapEnabled,
    guide,
    presetId: extras.presetId,
    gridDensity: extras.gridDensity,
    displayMode: extras.displayMode,
    auxiliaryKind: extras.auxiliaryKind,
    segments: enabled
      ? buildPerspectiveGuideSegments({
          guide,
          canvas: perspectiveCanvas,
          options: {
            density: extras.gridDensity,
            displayMode: extras.displayMode,
            auxiliaryKind: extras.auxiliaryKind,
          },
        })
      : [],
  });

  const emitPerspectiveFull = (
    enabled: boolean,
    snapEnabled: boolean,
    guide: PerspectiveGuide,
    extras: PerspectiveExtras,
  ): void => {
    setPerspectiveEnabled(enabled);
    setPerspectiveSnapEnabled(snapEnabled);
    setPerspectiveGuide(guide);
    setPerspectivePresetId(extras.presetId);
    setPerspectiveGridDensity(extras.gridDensity);
    setPerspectiveDisplayMode(extras.displayMode);
    setPerspectiveAuxiliaryKind(extras.auxiliaryKind);
    onPerspectiveGuideChange?.(
      buildPerspectiveState(enabled, snapEnabled, guide, extras),
    );
  };

  const emitPerspective = (
    enabled: boolean,
    snapEnabled: boolean,
    guide: PerspectiveGuide,
  ): void => {
    emitPerspectiveFull(enabled, snapEnabled, guide, currentPerspectiveExtras());
  };

  /** 장면 프리셋 적용 — 소실점/수평선 배치를 한 번에 바꾼다. */
  const applyPerspectivePreset = (presetId: PerspectiveScenePresetId): void => {
    const guide = createPerspectiveGuideFromScenePreset(
      presetId,
      perspectiveCanvas,
    );
    if (!guide) return;
    emitPerspectiveFull(true, perspectiveSnapEnabled, guide, {
      ...currentPerspectiveExtras(),
      presetId,
    });
  };

  /** 1/2/3점 수동 선택 — 프리셋 적용 표시는 해제된다. */
  const applyPerspectiveKind = (kind: PerspectiveKind): void => {
    emitPerspectiveFull(
      true,
      perspectiveSnapEnabled,
      createDefaultPerspectiveGuide(kind, perspectiveCanvas),
      { ...currentPerspectiveExtras(), presetId: null },
    );
  };

  const perspectiveKindLabel = (kind: PerspectiveKind): string =>
    tx(
      {
        "one-point": "1점 투시",
        "two-point": "2점 투시",
        "three-point": "3점 투시",
      }[kind],
      {
        "one-point": "1-point",
        "two-point": "2-point",
        "three-point": "3-point",
      }[kind],
    );

  const perspectiveState = buildPerspectiveState(
    perspectiveEnabled,
    perspectiveSnapEnabled,
    perspectiveGuide,
    currentPerspectiveExtras(),
  );

  const perspectiveDensityLabel = (density: PerspectiveGridDensity): string =>
    tx(
      { sparse: "성김", standard: "보통", dense: "촘촘", fine: "아주 촘촘" }[
        density
      ],
      { sparse: "Sparse", standard: "Standard", dense: "Dense", fine: "Fine" }[
        density
      ],
    );

  const perspectiveAuxiliaryLabel = (
    kind: PerspectiveAuxiliaryGuideKind,
  ): string =>
    tx(
      { none: "없음", concentric: "동심원", radial: "방사" }[kind],
      { none: "None", concentric: "Concentric", radial: "Radial" }[kind],
    );

  const activePerspectivePreset = PERSPECTIVE_SCENE_PRESETS.find(
    (preset) => preset.id === perspectivePresetId,
  );

  const kindName = (kind: StudioRulerKind): string =>
    tx(
      { line: "직선자", curve: "곡선자", concentric: "동심원자", perspective: "퍼스펙티브자" }[kind],
      { line: "Straight", curve: "Curve", concentric: "Concentric", perspective: "Perspective" }[kind],
    );
  const kindDesc = (kind: StudioRulerKind): string =>
    tx(
      {
        line: "곧은 선·건물 외곽선",
        curve: "부드러운 곡선 따라 그리기",
        concentric: "마법진·파문 그리기",
        perspective: "소실점 방향 투시선",
      }[kind],
      {
        line: "Straight lines & edges",
        curve: "Trace smooth curves",
        concentric: "Magic circles & ripples",
        perspective: "Lines toward vanishing points",
      }[kind],
    );

  const emitRulers = (next: StudioRuler[]): void => {
    setRulers(next);
    onRulersChange?.(next);
  };

  const addRuler = (kind: StudioRulerKind): void => {
    if (rulers.length >= STUDIO_RULERS_MAX_PER_CANVAS) return;
    idCounter.current += 1;
    const id = `studio-ruler-${kind}-${idCounter.current}`;
    let ruler: StudioRuler | null;
    switch (kind) {
      case "line":
        ruler = createStudioLineRuler({ id });
        break;
      case "curve":
        ruler = createStudioCurveRuler({ id });
        break;
      case "concentric":
        ruler = createStudioConcentricRuler({ id });
        break;
      case "perspective":
        ruler = createStudioPerspectiveRuler({
          id,
          vanishingPoints: [
            { x: 60, y: 40 },
            { x: 260, y: 40 },
          ],
        });
        break;
    }
    if (!ruler) return;
    emitRulers([...rulers, ruler]);
  };

  const patchRuler = (
    id: string,
    patch: { visible?: boolean; snapEnabled?: boolean; color?: string },
  ): void => {
    emitRulers(rulers.map((ruler) => (ruler.id === id ? { ...ruler, ...patch } : ruler)));
  };

  const removeRuler = (id: string): void => {
    emitRulers(rulers.filter((ruler) => ruler.id !== id));
  };

  const emitSymmetry = (next: StudioSymmetrySettings): void => {
    setSymmetry(next);
    onSymmetryChange?.(next);
  };

  const setSymmetryMode = (mode: StudioSymmetryMode): void => {
    emitSymmetry(normalizeStudioSymmetrySettings({ ...symmetry, mode }));
  };

  const setSymmetryNumber = (
    key: "axisX" | "axisY" | "angleDeg" | "centerX" | "centerY" | "folds",
    value: number,
  ): void => {
    emitSymmetry(normalizeStudioSymmetrySettings({ ...symmetry, [key]: value }));
  };

  const maxedOut = rulers.length >= STUDIO_RULERS_MAX_PER_CANVAS;
  const modeLabel = (mode: StudioSymmetryMode): string =>
    tx(
      { off: "끄기", vertical: "수직", horizontal: "수평", quad: "4방향", radial: "방사형" }[mode],
      { off: "Off", vertical: "Vertical", horizontal: "Horizontal", quad: "Quad", radial: "Radial" }[mode],
    );

  return (
    <section
      aria-label={perspectiveOnly ? tx("원근 가이드", "Perspective guide") : tx("자 & 대칭 그리기", "Rulers & Symmetry")}
      className="w-full rounded-2xl border border-line bg-card p-4 text-fg"
    >
      {!perspectiveOnly && (<>
      <h2 className="text-sm font-bold">{tx("자 & 대칭 그리기", "Rulers & Symmetry")}</h2>
      <p className="mt-1 text-xs leading-5 text-fg-2">
        {tx(
          "자를 올려놓고 그리면 선이 자에 착 달라붙어요",
          "Lay a ruler on the canvas — your strokes snap right onto it.",
        )}
      </p>

      {/* 자 종류 카드 */}
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={tx("자 종류", "Ruler types")}>
        {KIND_CARD_META.map(({ kind, Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => addRuler(kind)}
            disabled={maxedOut}
            className="rounded-xl border border-line bg-canvas p-2 text-left transition-colors hover:border-[#4f9cf9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RulerPreview
              kind={kind}
              color={rulers.find((r) => r.kind === kind)?.color ?? "#4f9cf9"}
              label={tx(
                `${kindName(kind)} 미리보기`,
                `${kindName(kind)} preview`,
              )}
            />
            <span className="mt-1.5 flex items-center gap-1.5 text-xs font-bold">
              <Icon size={14} aria-hidden="true" className="shrink-0 text-fg-2" />
              {kindName(kind)}
            </span>
            <span className="mt-0.5 block text-[0.68rem] leading-4 text-fg-3">
              {kindDesc(kind)}
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-[0.68rem] font-semibold text-[#4f9cf9]">
              <Plus size={12} aria-hidden="true" />
              {tx("올리기", "Add")}
            </span>
          </button>
        ))}
      </div>
      {maxedOut && (
        <p className="mt-2 text-[0.68rem] text-fg-3">
          {tx("자는 최대 12개까지 올릴 수 있어요", "Up to 12 rulers can be placed.")}
        </p>
      )}

      {/* 올려놓은 자 목록 */}
      <h3 className="mt-4 text-xs font-bold text-fg-2">{tx("올려놓은 자", "Rulers on canvas")}</h3>
      {rulers.length === 0 ? (
        <p className="mt-1.5 rounded-xl border border-dashed border-line p-3 text-center text-[0.72rem] leading-5 text-fg-3">
          {tx(
            "아직 올린 자가 없어요. 위에서 자를 골라 올려보세요.",
            "No rulers yet — pick one above.",
          )}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rulers.map((ruler) => (
            <li
              key={ruler.id}
              className="rounded-xl border border-line bg-canvas p-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-3.5 shrink-0 rounded-full border border-line"
                  style={{ backgroundColor: ruler.color }}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-bold">
                  {ruler.name}
                </span>
                <button
                  type="button"
                  aria-pressed={ruler.visible}
                  aria-label={ruler.visible ? tx("자 숨기기", "Hide ruler") : tx("자 보이기", "Show ruler")}
                  title={ruler.visible ? tx("자 숨기기", "Hide ruler") : tx("자 보이기", "Show ruler")}
                  onClick={() => patchRuler(ruler.id, { visible: !ruler.visible })}
                  className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-card"
                >
                  {ruler.visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  aria-pressed={ruler.snapEnabled}
                  aria-label={ruler.snapEnabled ? tx("자 스냅 끄기", "Disable ruler snap") : tx("자 스냅 켜기", "Enable ruler snap")}
                  title={ruler.snapEnabled ? tx("자 스냅 끄기", "Disable ruler snap") : tx("자 스냅 켜기", "Enable ruler snap")}
                  onClick={() => patchRuler(ruler.id, { snapEnabled: !ruler.snapEnabled })}
                  className={`grid size-8 place-items-center rounded-lg hover:bg-card ${
                    ruler.snapEnabled ? "text-[#4f9cf9]" : "text-fg-3"
                  }`}
                >
                  <Magnet size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={tx("자 삭제", "Delete ruler")}
                  title={tx("자 삭제", "Delete ruler")}
                  onClick={() => removeRuler(ruler.id)}
                  className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-card hover:text-fg"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <div
                className="mt-2 flex items-center gap-1.5"
                role="group"
                aria-label={tx("자 색상", "Ruler color")}
              >
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={ruler.color.toLowerCase() === preset}
                    aria-label={tx(`자 색상 ${preset}`, `Ruler color ${preset}`)}
                    onClick={() => patchRuler(ruler.id, { color: preset })}
                    className={`size-6 rounded-full border-2 transition-transform ${
                      ruler.color.toLowerCase() === preset
                        ? "scale-110 border-fg"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: preset }}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      </>)}

      {/* 원근 가이드 */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-fg-2">
          {tx("원근 가이드", "Perspective guide")}
        </h3>
        <button
          type="button"
          aria-pressed={perspectiveEnabled}
          aria-label={
            perspectiveEnabled
              ? tx("원근 가이드 끄기", "Turn off perspective guide")
              : tx("원근 가이드 켜기", "Turn on perspective guide")
          }
          title={
            perspectiveEnabled
              ? tx("원근 가이드 끄기", "Turn off perspective guide")
              : tx("원근 가이드 켜기", "Turn on perspective guide")
          }
          onClick={() =>
            emitPerspective(
              !perspectiveEnabled,
              perspectiveSnapEnabled,
              perspectiveGuide,
            )
          }
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            perspectiveEnabled
              ? "border-[#4f9cf9] bg-[#4f9cf9]/15 text-fg"
              : "border-line bg-canvas text-fg-2 hover:text-fg"
          }`}
        >
          {perspectiveEnabled ? tx("켜짐", "On") : tx("꺼짐", "Off")}
        </button>
      </div>
      <p className="mt-1 text-[0.72rem] leading-5 text-fg-3">
        {tx(
          "켜면 소실점 격자가 보이고, 선이 소실점 방향으로 착 달라붙어요",
          "Turn it on to see the vanishing-point grid — strokes snap toward the vanishing points.",
        )}
      </p>
      {perspectiveEnabled && (
        <div className="mt-2 space-y-2.5 rounded-xl border border-line bg-canvas p-3">
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={tx("투시 종류", "Perspective type")}
          >
            {PERSPECTIVE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={
                  perspectivePresetId === null &&
                  perspectiveGuide.kind === kind
                }
                onClick={() => applyPerspectiveKind(kind)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  perspectiveGuide.kind === kind
                    ? "border-[#4f9cf9] bg-[#4f9cf9]/15 text-fg"
                    : "border-line bg-card text-fg-2 hover:text-fg"
                }`}
              >
                {perspectiveKindLabel(kind)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={perspectiveSnapEnabled}
              aria-label={
                perspectiveSnapEnabled
                  ? tx("원근 스냅 끄기", "Turn off perspective snap")
                  : tx("원근 스냅 켜기", "Turn on perspective snap")
              }
              title={
                perspectiveSnapEnabled
                  ? tx("원근 스냅 끄기", "Turn off perspective snap")
                  : tx("원근 스냅 켜기", "Turn on perspective snap")
              }
              onClick={() =>
                emitPerspective(
                  true,
                  !perspectiveSnapEnabled,
                  perspectiveGuide,
                )
              }
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                perspectiveSnapEnabled
                  ? "border-[#4f9cf9] bg-[#4f9cf9]/15 text-fg"
                  : "border-line bg-card text-fg-3 hover:text-fg"
              }`}
            >
              <Magnet size={13} aria-hidden="true" />
              {tx("그리기 스냅", "Drawing snap")}
            </button>
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={tx("장면 프리셋", "Scene presets")}
          >
            {PERSPECTIVE_SCENE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={perspectivePresetId === preset.id}
                onClick={() => applyPerspectivePreset(preset.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  perspectivePresetId === preset.id
                    ? "border-[#4f9cf9] bg-[#4f9cf9]/15 text-fg"
                    : "border-line bg-card text-fg-2 hover:text-fg"
                }`}
              >
                {tx(preset.labelKo, preset.labelEn)}
              </button>
            ))}
          </div>
          {activePerspectivePreset && (
            <p className="text-[0.68rem] leading-4 text-fg-3">
              {tx(
                activePerspectivePreset.descriptionKo,
                activePerspectivePreset.descriptionEn,
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label={tx("격자 밀도", "Grid density")}
            >
              {PERSPECTIVE_GRID_DENSITIES.map((density) => (
                <button
                  key={density}
                  type="button"
                  aria-pressed={perspectiveGridDensity === density}
                  onClick={() =>
                    emitPerspectiveFull(
                      true,
                      perspectiveSnapEnabled,
                      perspectiveGuide,
                      { ...currentPerspectiveExtras(), gridDensity: density },
                    )
                  }
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    perspectiveGridDensity === density
                      ? "border-[#4f9cf9] bg-[#4f9cf9]/15 text-fg"
                      : "border-line bg-card text-fg-2 hover:text-fg"
                  }`}
                >
                  {perspectiveDensityLabel(density)}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={perspectiveDisplayMode === "fisheye"}
              aria-label={
                perspectiveDisplayMode === "fisheye"
                  ? tx("피쉬아이 곡선 끄기", "Turn off fisheye curves")
                  : tx("피쉬아이 곡선 켜기", "Turn on fisheye curves")
              }
              title={
                perspectiveDisplayMode === "fisheye"
                  ? tx("피쉬아이 곡선 끄기", "Turn off fisheye curves")
                  : tx("피쉬아이 곡선 켜기", "Turn on fisheye curves")
              }
              onClick={() =>
                emitPerspectiveFull(
                  true,
                  perspectiveSnapEnabled,
                  perspectiveGuide,
                  {
                    ...currentPerspectiveExtras(),
                    displayMode:
                      perspectiveDisplayMode === "fisheye"
                        ? "linear"
                        : "fisheye",
                  },
                )
              }
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                perspectiveDisplayMode === "fisheye"
                  ? "border-[#4f9cf9] bg-[#4f9cf9]/15 text-fg"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {tx("피쉬아이 곡선", "Fisheye curves")}
            </button>
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={tx("보조 격자", "Auxiliary grid")}
          >
            {(
              ["none", "concentric", "radial"] as readonly PerspectiveAuxiliaryGuideKind[]
            ).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={perspectiveAuxiliaryKind === kind}
                onClick={() =>
                  emitPerspectiveFull(
                    true,
                    perspectiveSnapEnabled,
                    perspectiveGuide,
                    { ...currentPerspectiveExtras(), auxiliaryKind: kind },
                  )
                }
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  perspectiveAuxiliaryKind === kind
                    ? "border-[#4f9cf9] bg-[#4f9cf9]/15 text-fg"
                    : "border-line bg-card text-fg-2 hover:text-fg"
                }`}
              >
                {perspectiveAuxiliaryLabel(kind)}
              </button>
            ))}
          </div>
          <svg
            viewBox={`0 0 ${perspectiveCanvas.width} ${perspectiveCanvas.height}`}
            role="img"
            aria-label={tx(
              "원근 가이드 격자 미리보기",
              "Perspective guide grid preview",
            )}
            className="h-24 w-full rounded-lg bg-card text-fg-3"
          >
            {perspectiveState.segments.map((segment, index) => (
              <line
                key={index}
                x1={segment.from.x}
                y1={segment.from.y}
                x2={segment.to.x}
                y2={segment.to.y}
                stroke={segment.family === "auxiliary" ? "#22b8a8" : "#f59e0b"}
                strokeWidth="1"
                opacity={
                  segment.family === "horizon"
                    ? "0.9"
                    : segment.family === "auxiliary"
                      ? "0.4"
                      : "0.55"
                }
              />
            ))}
            {perspectiveVanishingPoints(perspectiveGuide).map(
              (point, index) => (
                <circle
                  key={index}
                  cx={Math.min(
                    Math.max(point.x, 0),
                    perspectiveCanvas.width,
                  )}
                  cy={Math.min(
                    Math.max(point.y, 0),
                    perspectiveCanvas.height,
                  )}
                  r="3.5"
                  fill="#f59e0b"
                />
              ))}
          </svg>
          <p className="text-[0.68rem] leading-4 text-fg-3">
            {tx(
              "격자는 캔버스에 그대로 표시되고, 그리기 스냅을 켜면 펜 선이 소실점 방향으로 정렬돼요",
              "The grid appears on the canvas, and with drawing snap on, pen strokes align toward the vanishing points.",
            )}
          </p>
        </div>
      )}

      {!perspectiveOnly && (<>
      {/* 대칭 그리기 */}
      <h3 className="mt-4 text-xs font-bold text-fg-2">{tx("대칭 그리기", "Mirror drawing")}</h3>
      <p className="mt-1 text-[0.72rem] leading-5 text-fg-3">
        {tx(
          "한 번 그리면 대칭 위치에 똑같이 그려져요",
          "Draw once — it appears mirrored everywhere",
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={tx("대칭 모드", "Symmetry mode")}>
        {STUDIO_SYMMETRY_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={symmetry.mode === mode}
            onClick={() => setSymmetryMode(mode)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              symmetry.mode === mode
                ? "border-[#4f9cf9] bg-[#4f9cf9]/15 text-fg"
                : "border-line bg-canvas text-fg-2 hover:text-fg"
            }`}
          >
            {modeLabel(mode)}
          </button>
        ))}
      </div>

      {symmetry.mode !== "off" && (
        <div className="mt-3 space-y-2.5 rounded-xl border border-line bg-canvas p-3">
          {(symmetry.mode === "vertical" || symmetry.mode === "quad") && (
            <SliderRow
              label={tx("수직축 위치", "Vertical axis")}
              value={Math.round(symmetry.axisX)}
              min={0}
              max={CANVAS_W}
              unit="px"
              onChange={(value) => setSymmetryNumber("axisX", value)}
            />
          )}
          {(symmetry.mode === "horizontal" || symmetry.mode === "quad") && (
            <SliderRow
              label={tx("수평축 위치", "Horizontal axis")}
              value={Math.round(symmetry.axisY)}
              min={0}
              max={CANVAS_H}
              unit="px"
              onChange={(value) => setSymmetryNumber("axisY", value)}
            />
          )}
          {(symmetry.mode === "vertical" ||
            symmetry.mode === "horizontal" ||
            symmetry.mode === "quad") && (
            <SliderRow
              label={tx("축 각도", "Axis angle")}
              value={Math.round(symmetry.angleDeg)}
              min={-45}
              max={45}
              unit="°"
              onChange={(value) => setSymmetryNumber("angleDeg", value)}
            />
          )}
          {symmetry.mode === "radial" && (
            <>
              <SliderRow
                label={tx("방사형 중심 X", "Radial center X")}
                value={Math.round(symmetry.centerX)}
                min={0}
                max={CANVAS_W}
                unit="px"
                onChange={(value) => setSymmetryNumber("centerX", value)}
              />
              <SliderRow
                label={tx("방사형 중심 Y", "Radial center Y")}
                value={Math.round(symmetry.centerY)}
                min={0}
                max={CANVAS_H}
                unit="px"
                onChange={(value) => setSymmetryNumber("centerY", value)}
              />
              <SliderRow
                label={tx("분할 수", "Segments")}
                value={symmetry.folds}
                min={STUDIO_SYMMETRY_FOLDS_MIN}
                max={STUDIO_SYMMETRY_FOLDS_MAX}
                unit=""
                onChange={(value) => setSymmetryNumber("folds", value)}
              />
            </>
          )}
          <p className="text-[0.68rem] leading-4 text-fg-3">
            {tx(
              "캔버스에서 축·중심점을 드래그해도 이동해요",
              "You can also drag the axis or center on the canvas",
            )}
          </p>
        </div>
      )}
      </>)}
    </section>
  );
}
