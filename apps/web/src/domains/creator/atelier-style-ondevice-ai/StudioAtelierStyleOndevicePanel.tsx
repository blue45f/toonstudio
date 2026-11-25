/**
 * Wave 65B — AtelierStyle 7대 웹툰 화풍 실시간 양방향 변환 & ToonSilicon 온디바이스 AI UI 패널.
 *
 * - 7대 웹툰 장르 화풍 원클릭 스위처 + 양방향 변환 모드 토글(실시간 작화 ↔ 완성 컷·3D 배경 DNA 동기화)
 * - 화풍 강도·종이결·선화 대비 슬라이더 + 순수 OKLCH/currentColor 좌우 실시간 화풍 비교 SVG
 * - 최신 모바일(5종)·PC(4종) 실리콘별 온디바이스 AI 7대 기능 실행 경로 표(서버 전송 0B 배지)
 * - WGSL 컴퓨트 커널 접기(<details>) + JSON 매니페스트 복사
 * - 모든 props 선택적, OKLCH·currentColor 전용, 원시 색상·바이올렛(265~325°)·전역 트랜지션 0건
 */

import {
  ArrowLeftRight, Brush, CheckCircle2, Code2, Copy, Cpu, Layers, Monitor,
  Palette, RotateCcw, ShieldCheck, SlidersHorizontal, Smartphone,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactElement } from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  ATELIER_WEBTOON_STYLES, DEFAULT_LINE_CONTRAST, DEFAULT_PAPER_GRAIN_INTENSITY, DEFAULT_STYLE_STRENGTH,
  TOON_SILICON_PROFILES, buildAtelierStyleOndeviceSnapshot, exportAtelierStyleOndeviceJson,
  formatOklch, getAtelierWebtoonStyle, getToonSiliconProfile,
  type AtelierStyleOndeviceSnapshot, type AtelierWebtoonStyleId, type DispatchRouteHonestyTier,
  type StyleTransformMode, type ToonSiliconProfileId,
} from "./atelier-style-ondevice-engine";

export interface StudioAtelierStyleOndevicePanelProps {
  readonly initialStyleId?: AtelierWebtoonStyleId;
  readonly initialMode?: StyleTransformMode;
  readonly initialSiliconId?: ToonSiliconProfileId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onStyleChange?: (snapshot: AtelierStyleOndeviceSnapshot) => void;
  readonly onExportJson?: (jsonText: string, snapshot: AtelierStyleOndeviceSnapshot) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const ROUTE_TIER_META: Readonly<Record<DispatchRouteHonestyTier, { readonly ko: string; readonly en: string; readonly cls: string }>> = {
  "web-standard-ready": { ko: "브라우저 표준 단독", en: "Browser Standard", cls: "border-good bg-good-soft text-good" },
  "web-standard-with-native-boost": { ko: "표준 + 네이티브 가속", en: "Standard + Native Boost", cls: "border-cool bg-info-soft text-cool" },
  "native-bridge-recommended": { ko: "네이티브 브리지 권장", en: "Native Bridge Recommended", cls: "border-warn bg-warning-soft text-warn" },
};

const RAW_NEUTRAL = {
  bg: formatOklch({ l: 0.96, c: 0.005, h: 90 }),
  panel: formatOklch({ l: 0.92, c: 0.006, h: 90 }),
  flat3d: formatOklch({ l: 0.84, c: 0.012, h: 215 }),
  flat3dSide: formatOklch({ l: 0.74, c: 0.014, h: 218 }),
  wire: formatOklch({ l: 0.56, c: 0.018, h: 212 }),
  line: formatOklch({ l: 0.24, c: 0.01, h: 220 }),
  muted: formatOklch({ l: 0.48, c: 0.012, h: 215 }),
  frame: formatOklch({ l: 0.82, c: 0.008, h: 90 }),
};

/** 순수 OKLCH/currentColor 좌우 실시간 화풍 비교 SVG (좌: 원본 벡터/플랫 3D ↔ 우: 7대 화풍 실시간 변환 + 3D 동기화). */
function StyleBeforeAfterCompareSvg(props: {
  readonly snapshot: AtelierStyleOndeviceSnapshot;
  readonly isEn: boolean;
}): ReactElement {
  const { snapshot, isEn } = props;
  const { transform } = snapshot;
  const { style, mode, normalizedStrength, normalizedPaperGrain, normalizedLineContrast, scene3dSyncPlan } = transform;
  const is3dSync = mode === "scene-restyle-and-3d-sync";
  const pal = style.palette;
  const cPaper = formatOklch(pal.paper);
  const cInk = formatOklch(pal.ink);
  const cMid = formatOklch(pal.midtone);
  const cShadow = formatOklch(pal.shadow);
  const cAccent = formatOklch(pal.accent);
  const cRim = formatOklch(pal.rimLight);
  const cBleed = formatOklch(pal.ink, 0.22);
  const cGlow = formatOklch(pal.rimLight, 0.45);
  const cGrainLine = formatOklch(pal.ink, 0.14 + (normalizedPaperGrain / 100) * 0.2);

  const lineW = (1.6 + (style.lineProfile.baseWidthPx * (0.4 + (normalizedStrength / 100) * 0.6)) * (0.7 + (normalizedLineContrast / 100) * 0.35)).toFixed(2);
  const fgText = style.id === "noir-ink-hatching" ? cRim : cInk;
  const dashPattern =
    style.id === "slice-pastel-crayon" ? "4 2.5"
      : style.id === "korean-sumi-murim" ? "14 1.8 6 1.2"
        : style.id === "painterly-gouache-impasto" ? "10 1.4"
          : undefined;

  return (
    <svg
      data-testid="atelier-style-compare-svg"
      data-style-id={style.id}
      data-transform-mode={mode}
      data-3d-sync-active={String(is3dSync)}
      data-strength={normalizedStrength}
      data-paper-grain={normalizedPaperGrain}
      data-line-contrast={normalizedLineContrast}
      data-violet-free="true"
      viewBox="0 0 720 264"
      role="img"
      aria-label={isEn ? `Before and after real-time style comparison for ${style.labelEn}` : `원본과 '${style.labelKo}' 실시간 화풍 변환 좌우 비교`}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg sm:h-72"
    >
      {/* 좌측: 원본 일반 벡터 선화 & 플랫 3D 배경 */}
      <g data-pane="before-raw-source">
        <rect x="8" y="8" width="344" height="248" rx="12" fill={RAW_NEUTRAL.bg} stroke={RAW_NEUTRAL.frame} strokeWidth="1.2" />
        <rect x="18" y="18" width="156" height="20" rx="6" fill={RAW_NEUTRAL.panel} stroke={RAW_NEUTRAL.frame} strokeWidth="0.9" />
        <text x="26" y="31" fill={RAW_NEUTRAL.line} fontSize="8.2" fontWeight="700">
          {is3dSync ? (isEn ? "BEFORE · FLAT 3D / 2D CUT" : "원본 · 플랫 3D 배경 / 2D 컷") : (isEn ? "BEFORE · RAW VECTOR STROKE" : "원본 · 일반 균일 벡터 선화")}
        </text>
        <text x="342" y="31" textAnchor="end" fill={RAW_NEUTRAL.muted} fontSize="7.4" fontFamily="monospace">
          {`HASH ${transform.originalStrokeDigest}`}
        </text>

        {/* 플랫 3D 회랑 건축 배경 + 석등 */}
        <polygon points="24,218 24,84 114,58 114,218" fill={RAW_NEUTRAL.flat3d} stroke={RAW_NEUTRAL.wire} strokeWidth={is3dSync ? "1.3" : "0.9"} strokeDasharray={is3dSync ? "3 2" : undefined} />
        <polygon points="114,58 214,76 214,218 114,218" fill={RAW_NEUTRAL.panel} stroke={RAW_NEUTRAL.wire} strokeWidth="0.9" />
        <polygon points="244,96 336,74 336,218 244,218" fill={RAW_NEUTRAL.flat3dSide} stroke={RAW_NEUTRAL.wire} strokeWidth={is3dSync ? "1.3" : "0.9"} strokeDasharray={is3dSync ? "3 2" : undefined} />
        <rect x="272" y="138" width="36" height="58" rx="2" fill={RAW_NEUTRAL.flat3d} stroke={RAW_NEUTRAL.wire} strokeWidth="1" />
        <line x1="24" y1="218" x2="338" y2="218" stroke={RAW_NEUTRAL.wire} strokeWidth="1.2" />

        {/* 원본 캐릭터 균일 벡터 선화 */}
        <path d="M 102 214 C 118 164 146 116 184 96 C 218 114 238 160 250 214" fill={RAW_NEUTRAL.panel} stroke={RAW_NEUTRAL.line} strokeWidth="2" strokeLinecap="round" />
        <circle cx="182" cy="90" r="24" fill={RAW_NEUTRAL.bg} stroke={RAW_NEUTRAL.line} strokeWidth="2" />
        <path d="M 132 178 C 160 162 204 166 232 192" fill="none" stroke={RAW_NEUTRAL.line} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M 158 76 C 176 62 202 64 214 82" fill="none" stroke={RAW_NEUTRAL.line} strokeWidth="1.5" strokeLinecap="round" />

        <rect x="18" y="224" width="324" height="22" rx="6" fill={RAW_NEUTRAL.panel} stroke={RAW_NEUTRAL.frame} strokeWidth="0.8" />
        <text x="28" y="238" fill={RAW_NEUTRAL.line} fontSize="7.5" fontFamily="monospace">
          {isEn ? "RAW VECTOR LOCKED · ZERO DESTRUCTIVE BAKE" : "원본 벡터 무손실 고정 · 언제든 화풍 즉시 교체 가능"}
        </text>
      </g>

      {/* 중앙 양방향 화살표 배지 */}
      <g data-pane="bidirectional-bridge">
        <line x1="360" y1="18" x2="360" y2="246" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.2" strokeDasharray="4 3" />
        <circle cx="360" cy="132" r="15" fill={cAccent} stroke={cPaper} strokeWidth="2" />
        <text x="360" y="135.5" textAnchor="middle" fill={cPaper} fontSize="10" fontWeight="700">⇄</text>
      </g>

      {/* 우측: AtelierStyle 선택 화풍 실시간 변환 결과 + 3D 배경 매칭 */}
      <g data-pane="after-stylized-result" data-active-style={style.id}>
        <rect x="368" y="8" width="344" height="248" rx="12" fill={cPaper} stroke={cAccent} strokeWidth="1.4" />

        {/* 화풍별 종이결/스크린톤/속도선/해칭 배경 레이어 */}
        {style.id === "korean-sumi-murim" && (
          <g data-fx="sumi-hanji-bleed" opacity={0.35 + (normalizedPaperGrain / 100) * 0.55}>
            <line x1="380" y1="68" x2="700" y2="64" stroke={cGrainLine} strokeWidth="0.9" strokeDasharray="18 6 4 5" />
            <line x1="384" y1="126" x2="696" y2="132" stroke={cGrainLine} strokeWidth="0.8" strokeDasharray="12 8 6 4" />
            <line x1="382" y1="188" x2="698" y2="182" stroke={cGrainLine} strokeWidth="0.9" strokeDasharray="22 7" />
            <circle cx="542" cy="112" r="54" fill={cBleed} />
            <rect x="668" y="54" width="18" height="18" rx="2" fill={cAccent} />
            <text x="677" y="66" textAnchor="middle" fill={cPaper} fontSize="8.2" fontWeight="700">墨</text>
          </g>
        )}

        {style.id === "rofan-watercolor-jewel" && (
          <g data-fx="rofan-halation-backrun" opacity={0.4 + (normalizedStrength / 100) * 0.55}>
            <ellipse cx="542" cy="108" rx="68" ry="52" fill={cGlow} />
            <ellipse cx="542" cy="112" rx="62" ry="46" fill="none" stroke={cAccent} strokeOpacity="0.4" strokeWidth="2.4" />
            <polygon points="434,74 439,84 449,89 439,94 434,104 429,94 419,89 429,84" fill={cRim} stroke={cAccent} strokeWidth="0.8" />
            <polygon points="654,68 658,75 665,79 658,83 654,90 650,83 643,79 650,75" fill={cRim} stroke={cAccent} strokeWidth="0.8" />
          </g>
        )}

        {style.id === "shonen-action-gpen" && (
          <g data-fx="shonen-speedlines-screentone">
            <line x1="376" y1="24" x2="486" y2="96" stroke={cInk} strokeWidth="1.2" strokeOpacity="0.45" />
            <line x1="704" y1="28" x2="594" y2="96" stroke={cInk} strokeWidth="1.4" strokeOpacity="0.5" />
            <line x1="376" y1="208" x2="478" y2="156" stroke={cInk} strokeWidth="1.1" strokeOpacity="0.4" />
            <line x1="704" y1="210" x2="602" y2="154" stroke={cInk} strokeWidth="1.3" strokeOpacity="0.48" />
            {[0, 1, 2, 3, 4, 5, 6].map((dot) => (
              <circle key={`bn-${dot}`} cx={396 + dot * 13} cy={176 + (dot % 2) * 9} r="1.8" fill={cInk} fillOpacity="0.42" />
            ))}
          </g>
        )}

        {style.id === "slice-pastel-crayon" && (
          <g data-fx="slice-pastel-grain" opacity={0.45 + (normalizedPaperGrain / 100) * 0.45}>
            <ellipse cx="456" cy="98" rx="46" ry="28" fill={cMid} fillOpacity="0.42" />
            <ellipse cx="634" cy="108" rx="42" ry="26" fill={cRim} fillOpacity="0.52" />
            <line x1="392" y1="154" x2="688" y2="154" stroke={cGrainLine} strokeWidth="2.2" strokeDasharray="3 3" />
          </g>
        )}

        {style.id === "noir-ink-hatching" && (
          <g data-fx="noir-crosshatching-grain">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <line key={`nh-a-${i}`} x1={382 + i * 14} y1="54" x2={414 + i * 14} y2="212" stroke={cRim} strokeOpacity="0.22" strokeWidth="1" />
            ))}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line key={`nh-b-${i}`} x1={614 + i * 14} y1="62" x2={582 + i * 14} y2="212" stroke={cRim} strokeOpacity="0.26" strokeWidth="1" />
            ))}
          </g>
        )}

        {style.id === "painterly-gouache-impasto" && (
          <g data-fx="painterly-sobel-impasto">
            <path d="M 392 98 C 430 82 468 88 492 114" fill="none" stroke={cRim} strokeWidth="7" strokeLinecap="round" strokeOpacity="0.65" />
            <path d="M 596 92 C 632 82 668 96 694 122" fill="none" stroke={cAccent} strokeWidth="6.5" strokeLinecap="round" strokeOpacity="0.52" />
            <path d="M 396 102 C 432 88 468 92 492 118" fill="none" stroke={cShadow} strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.4" />
          </g>
        )}

        {style.id === "cinema-cel-anime" && (
          <g data-fx="cinema-cel-rimlight">
            <polygon points="376,56 704,56 704,132 376,154" fill={cMid} fillOpacity="0.24" />
            <line x1="390" y1="66" x2="688" y2="66" stroke={cRim} strokeWidth="2" strokeOpacity="0.7" />
          </g>
        )}

        {/* 변환된 3D 배경 회랑 + 석등 (모드 B일 때 DNA 매칭 강조) */}
        <polygon points="384,218 384,84 474,58 474,218" fill={cMid} fillOpacity={is3dSync ? "0.78" : "0.46"} stroke={cInk} strokeWidth={is3dSync ? lineW : "1.2"} strokeDasharray={dashPattern} />
        <polygon points="474,58 574,76 574,218 474,218" fill={cPaper} fillOpacity="0.72" stroke={cShadow} strokeWidth="1" />
        <polygon points="604,96 696,74 696,218 604,218" fill={cShadow} fillOpacity={is3dSync ? "0.78" : "0.52"} stroke={cInk} strokeWidth={is3dSync ? lineW : "1.2"} strokeDasharray={dashPattern} />
        <rect x="632" y="138" width="36" height="58" rx="2" fill={cMid} stroke={is3dSync ? cAccent : cInk} strokeWidth={is3dSync ? "2" : "1.2"} />
        <line x1="632" y1="138" x2="668" y2="138" stroke={cRim} strokeWidth="2.4" />

        {/* 변환된 캐릭터 실루엣 + 화풍 선화 + 음영 + 림라이트 */}
        <path d="M 462 214 C 478 164 506 116 544 96 C 578 114 598 160 610 214" fill={cMid} stroke={cInk} strokeWidth={lineW} strokeLinecap="round" strokeDasharray={dashPattern} />
        <path d="M 544 96 C 578 114 598 160 610 214 L 548 214 C 546 168 545 126 544 96 Z" fill={cShadow} fillOpacity="0.62" />
        <circle cx="542" cy="90" r="24" fill={style.id === "rofan-watercolor-jewel" ? cMid : cPaper} stroke={cInk} strokeWidth={lineW} strokeDasharray={dashPattern} />
        <path d="M 542 66 A 24 24 0 0 1 564 98" fill="none" stroke={cRim} strokeWidth={style.id === "cinema-cel-anime" || style.id === "noir-ink-hatching" ? "3.2" : "2.1"} strokeLinecap="round" />
        <path d="M 492 178 C 520 162 564 166 592 192" fill="none" stroke={cAccent} strokeWidth={lineW} strokeLinecap="round" strokeDasharray={dashPattern} />
        {style.lineProfile.bristleSplitCount >= 16 && (
          <path d="M 488 184 C 518 169 560 172 588 197" fill="none" stroke={cInk} strokeOpacity="0.55" strokeWidth="1.1" strokeDasharray="8 3 4 2" />
        )}

        {/* 상단/하단 상태 바 */}
        <rect x="378" y="18" width="208" height="20" rx="6" fill={cInk} fillOpacity="0.88" />
        <text x="386" y="31" fill={cPaper} fontSize="8.1" fontWeight="700">
          {`${isEn ? "AFTER" : "변환"} · ${isEn ? style.labelEn : style.labelKo} (${normalizedStrength}%)`}
        </text>
        <text x="702" y="31" textAnchor="end" fill={fgText} fontSize="7.4" fontFamily="monospace" fontWeight="700">
          {is3dSync ? `3D DNA ${scene3dSyncPlan.matchedLineWidthPx}px` : `DNA ${transform.styleDna.shadingBandCount}B`}
        </text>

        <rect x="378" y="224" width="324" height="22" rx="6" fill={cInk} fillOpacity="0.88" />
        <text x="388" y="238" fill={cPaper} fontSize="7.4" fontFamily="monospace">
          {is3dSync
            ? (isEn ? `3D SYNC · ${scene3dSyncPlan.matchedLineWidthPx}px · ${scene3dSyncPlan.matchedShadingBands}-BAND · RIM ${scene3dSyncPlan.rimLightAngleDeg}°` : `3D 배경 동기화 · 외곽선 ${scene3dSyncPlan.matchedLineWidthPx}px · ${scene3dSyncPlan.matchedShadingBands}단 음영 · 림 ${scene3dSyncPlan.rimLightAngleDeg}°`)
            : (isEn ? `LIVE STROKE · ${style.lineProfile.bristleSplitCount} BRISTLE · GRAIN ${normalizedPaperGrain}%` : `실시간 작화 · 갈필 ${style.lineProfile.bristleSplitCount}모 · 종이결 ${normalizedPaperGrain}% · 대비 ${normalizedLineContrast}%`)}
        </text>
      </g>
    </svg>
  );
}

/** AtelierStyle 7대 웹툰 화풍 실시간 양방향 변환 & 최신 PC/모바일 온디바이스 AI 패널. */
export function StudioAtelierStyleOndevicePanel(props: StudioAtelierStyleOndevicePanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();
  const initialStyle = getAtelierWebtoonStyle(props.initialStyleId ?? "korean-sumi-murim").id;
  const initialMode: StyleTransformMode = props.initialMode === "scene-restyle-and-3d-sync" ? "scene-restyle-and-3d-sync" : "live-stroke-to-style";
  const initialSilicon = getToonSiliconProfile(props.initialSiliconId ?? "mobile-google-tensor-tpu").id;

  const [styleId, setStyleId] = useState<AtelierWebtoonStyleId>(initialStyle);
  const [mode, setMode] = useState<StyleTransformMode>(initialMode);
  const [siliconId, setSiliconId] = useState<ToonSiliconProfileId>(initialSilicon);
  const [styleStrength, setStyleStrength] = useState<number>(DEFAULT_STYLE_STRENGTH);
  const [paperGrainIntensity, setPaperGrainIntensity] = useState<number>(DEFAULT_PAPER_GRAIN_INTENSITY);
  const [lineContrast, setLineContrast] = useState<number>(DEFAULT_LINE_CONTRAST);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const copyReq = useRef(0);

  const snapshot = useMemo(
    () => buildAtelierStyleOndeviceSnapshot({ styleId, mode, siliconId, styleStrength, paperGrainIntensity, lineContrast }),
    [styleId, mode, siliconId, styleStrength, paperGrainIntensity, lineContrast],
  );
  const jsonOutput = useMemo(() => exportAtelierStyleOndeviceJson(snapshot), [snapshot]);
  const mobileSilicons = useMemo(() => TOON_SILICON_PROFILES.filter((s) => s.formFactor === "mobile"), []);
  const pcSilicons = useMemo(() => TOON_SILICON_PROFILES.filter((s) => s.formFactor === "pc"), []);

  const emitChange = (
    patch: Partial<{ styleId: AtelierWebtoonStyleId; mode: StyleTransformMode; siliconId: ToonSiliconProfileId; styleStrength: number; paperGrainIntensity: number; lineContrast: number }>,
  ): AtelierStyleOndeviceSnapshot => {
    copyReq.current += 1;
    const next = buildAtelierStyleOndeviceSnapshot({
      styleId: patch.styleId ?? styleId, mode: patch.mode ?? mode, siliconId: patch.siliconId ?? siliconId,
      styleStrength: patch.styleStrength ?? styleStrength, paperGrainIntensity: patch.paperGrainIntensity ?? paperGrainIntensity,
      lineContrast: patch.lineContrast ?? lineContrast,
    });
    props.onStyleChange?.(next);
    return next;
  };

  const handleSelectStyle = (nextStyleId: AtelierWebtoonStyleId): void => {
    setStyleId(nextStyleId);
    const next = emitChange({ styleId: nextStyleId });
    setStatusMessage(pick(
      `'${next.transform.style.labelKo}' 화풍 전환 완료 · 원본 벡터(${next.transform.originalStrokeDigest}) 무손실 유지`,
      `Switched to ${next.transform.style.labelEn} · Raw vector (${next.transform.originalStrokeDigest}) preserved.`,
    ));
  };

  const handleSelectMode = (nextMode: StyleTransformMode): void => {
    setMode(nextMode);
    const next = emitChange({ mode: nextMode });
    setStatusMessage(nextMode === "live-stroke-to-style"
      ? pick("모드 A(그리면서 실시간 화풍 변환) 활성화 · 원본 벡터 비파괴 바인딩", "Mode A (Live Stroke-to-Style) active · non-destructive raw vector binding.")
      : pick(`모드 B(완성 컷 · 3D 배경 화풍 동기화) 활성화 · 외곽선 ${next.transform.scene3dSyncPlan.matchedLineWidthPx}px 정렬`, `Mode B (Scene Restyle & 3D Sync) active · contour ${next.transform.scene3dSyncPlan.matchedLineWidthPx}px.`));
  };

  const handleSelectSilicon = (nextSiliconId: ToonSiliconProfileId): void => {
    setSiliconId(nextSiliconId);
    const next = emitChange({ siliconId: nextSiliconId });
    setStatusMessage(pick(
      `${next.dispatchMatrix.silicon.nameKo}의 연산 경로를 표시했습니다.`,
      `Showing planned compute paths for ${next.dispatchMatrix.silicon.nameEn}.`,
    ));
  };

  const handleCopyJson = async (): Promise<void> => {
    const req = ++copyReq.current;
    setShowJsonPreview(true);
    const copying = copyText(jsonOutput);
    let callbackOk = true;
    try { await props.onExportJson?.(jsonOutput, snapshot); } catch { callbackOk = false; }
    const copied = await copying;
    if (req !== copyReq.current) return;
    const base = copied
      ? pick("AtelierStyle · ToonSilicon JSON 매니페스트를 복사했습니다.", "Copied AtelierStyle · ToonSilicon JSON manifest.")
      : pick("JSON 미리보기를 열었습니다. 아래에서 직접 선택해 복사해 주세요.", "Opened JSON preview below for manual copy.");
    setStatusMessage(callbackOk ? base : `${base} ${pick("내보내기 콜백 전달 실패", "Export callback failed.")}`);
  };

  const handleCopyWgsl = async (): Promise<void> => {
    const req = ++copyReq.current;
    const copied = await copyText(snapshot.wgslKernel);
    if (req !== copyReq.current) return;
    setStatusMessage(copied
      ? pick(`'${snapshot.transform.style.labelKo}' WGSL 컴퓨트 커널을 복사했습니다.`, `Copied WGSL kernel for ${snapshot.transform.style.labelEn}.`)
      : pick("아래 WGSL 커널 코드 영역에서 직접 복사해 주세요.", "Copy the WGSL kernel from the preview below."));
  };

  const handleReset = (): void => {
    setStyleId(initialStyle); setMode(initialMode); setSiliconId(initialSilicon);
    setStyleStrength(DEFAULT_STYLE_STRENGTH); setPaperGrainIntensity(DEFAULT_PAPER_GRAIN_INTENSITY); setLineContrast(DEFAULT_LINE_CONTRAST);
    setShowJsonPreview(false);
    emitChange({ styleId: initialStyle, mode: initialMode, siliconId: initialSilicon, styleStrength: DEFAULT_STYLE_STRENGTH, paperGrainIntensity: DEFAULT_PAPER_GRAIN_INTENSITY, lineContrast: DEFAULT_LINE_CONTRAST });
    setStatusMessage(pick("화풍·변환 모드·슬라이더·실리콘 설정을 기본값으로 되돌렸습니다.", "Reset style, mode, sliders, and silicon selection."));
  };

  const strengthId = `${uid}-strength`;
  const grainId = `${uid}-grain`;
  const contrastId = `${uid}-contrast`;
  const activeStyle = snapshot.transform.style;

  return (
    <section
      data-testid="atelier-style-ondevice-panel"
      aria-label={pick("AtelierStyle 7대 웹툰 화풍 변환 및 온디바이스 AI 패널", "AtelierStyle 7 Webtoon Styles and On-Device AI Panel")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="atelier-style-brand-badge" className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              AtelierStyle · AtelierInk · ToonSilicon · PrismLight
            </span>
            <span data-testid="atelier-style-zero-upload-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good tabular-nums [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("미리보기 서버 전송 0B", "Preview upload: 0B")}
            </span>
            <span data-testid="atelier-style-violet-badge" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums [word-break:keep-all]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden="true" />
              {pick(`바이올렛 ${snapshot.violetAudit.violetPercent}%`, `Violet ${snapshot.violetAudit.violetPercent}%`)}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("7대 웹툰 화풍 실시간 양방향 변환 & PC·모바일 온디바이스 AI", "7 Webtoon Styles Bidirectional Transform & PC/Mobile On-Device AI")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("일곱 가지 화풍의 변환 결과를 미리 보고, 기기별 AI 연산 경로 계획을 확인합니다.", "Preview seven style transformations and see the planned AI paths for each device.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="atelier-style-copy-json-btn" onClick={() => void handleCopyJson()} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="atelier-style-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="atelier-style-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage || pick(
          `현재 '${activeStyle.labelKo}' 활성 · 원본 해시 ${snapshot.transform.originalStrokeDigest} 보존 · 선택 기기 '${snapshot.dispatchMatrix.silicon.nameKo}'`,
          `Active '${activeStyle.labelEn}' · Raw hash ${snapshot.transform.originalStrokeDigest} intact · Silicon '${snapshot.dispatchMatrix.silicon.nameEn}'`,
        )}
      </div>

      {/* 1. 7대 웹툰 장르 화풍 원클릭 스위처 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Brush className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("7대 웹툰 화풍 원클릭 스위처 (AtelierStyle)", "7 Webtoon Genre Style Presets (AtelierStyle)")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{activeStyle.brandStack}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label={pick("7대 웹툰 화풍 선택", "Select webtoon style preset")}>
          {ATELIER_WEBTOON_STYLES.map((preset) => {
            const active = preset.id === styleId;
            return (
              <button
                key={preset.id} type="button" data-testid={`atelier-style-preset-${preset.id}`} aria-pressed={active}
                onClick={() => handleSelectStyle(preset.id)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-bold">{`${preset.order}. ${isEn ? preset.labelEn : preset.labelKo}`}</span>
                  <span className="font-mono text-[10px] text-accent tabular-nums">{`${preset.shadingProfile.celBands}B`}</span>
                </div>
                <div className="flex w-full items-center gap-1" aria-hidden="true">
                  <span className="h-2.5 flex-1 rounded-sm border border-line" style={{ backgroundColor: formatOklch(preset.palette.paper) }} />
                  <span className="h-2.5 flex-1 rounded-sm border border-line" style={{ backgroundColor: formatOklch(preset.palette.midtone) }} />
                  <span className="h-2.5 flex-1 rounded-sm border border-line" style={{ backgroundColor: formatOklch(preset.palette.ink) }} />
                  <span className="h-2.5 w-5 rounded-sm border border-line" style={{ backgroundColor: formatOklch(preset.palette.accent) }} />
                  <span className="h-2.5 w-4 rounded-sm border border-line" style={{ backgroundColor: formatOklch(preset.palette.rimLight) }} />
                </div>
                <span className="text-[11px] text-fg-2">{isEn ? preset.signatureEn : preset.signatureKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 양방향 변환 모드 + 슬라이더 + 좌우 실시간 비교 SVG */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <ArrowLeftRight className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("양방향 비파괴 화풍 변환 & 좌우 실시간 비교", "Bidirectional Non-Destructive Transform & Live Compare")}
          </h3>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={pick("양방향 변환 모드 선택", "Select transform mode")}>
            <button
              type="button" data-testid="atelier-style-mode-live-stroke-to-style"
              aria-pressed={mode === "live-stroke-to-style"}
              onClick={() => handleSelectMode("live-stroke-to-style")}
              className={mode === "live-stroke-to-style" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {pick("모드 A · 실시간 작화 변환", "Mode A · Live Stroke")}
            </button>
            <button
              type="button" data-testid="atelier-style-mode-scene-restyle-and-3d-sync"
              aria-pressed={mode === "scene-restyle-and-3d-sync"}
              onClick={() => handleSelectMode("scene-restyle-and-3d-sync")}
              className={mode === "scene-restyle-and-3d-sync" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("모드 B · 완성 컷·3D 배경 동기화", "Mode B · Scene & 3D Sync")}
            </button>
          </div>
        </div>

        <StyleBeforeAfterCompareSvg snapshot={snapshot} isEn={isEn} />

        {/* 3축 실시간 슬라이더 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={strengthId} className="flex items-center gap-1 text-xs font-semibold text-fg [word-break:keep-all]">
                <SlidersHorizontal className="h-3 w-3 text-accent" aria-hidden="true" />{pick("화풍 강도", "Style Strength")}
              </label>
              <span data-testid="atelier-style-strength-value" className="font-mono text-xs font-bold text-accent tabular-nums">{`${styleStrength}%`}</span>
            </div>
            <input
              id={strengthId} data-testid="atelier-style-strength-slider" type="range" min={0} max={100} value={styleStrength}
              onChange={(e) => { const v = Number(e.target.value); setStyleStrength(v); emitChange({ styleStrength: v }); }}
              className={`mt-2 h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
            />
          </div>
          <div className="rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={grainId} className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("종이결 · 질감", "Paper Grain")}</label>
              <span data-testid="atelier-style-grain-value" className="font-mono text-xs font-bold text-accent tabular-nums">{`${paperGrainIntensity}%`}</span>
            </div>
            <input
              id={grainId} data-testid="atelier-style-grain-slider" type="range" min={0} max={100} value={paperGrainIntensity}
              onChange={(e) => { const v = Number(e.target.value); setPaperGrainIntensity(v); emitChange({ paperGrainIntensity: v }); }}
              className={`mt-2 h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
            />
          </div>
          <div className="rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={contrastId} className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("선화 대비", "Line Contrast")}</label>
              <span data-testid="atelier-style-contrast-value" className="font-mono text-xs font-bold text-accent tabular-nums">{`${lineContrast}%`}</span>
            </div>
            <input
              id={contrastId} data-testid="atelier-style-contrast-slider" type="range" min={0} max={100} value={lineContrast}
              onChange={(e) => { const v = Number(e.target.value); setLineContrast(v); emitChange({ lineContrast: v }); }}
              className={`mt-2 h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
            />
          </div>
        </div>

        {/* 비파괴 보존 & 3D 배경 화풍 DNA 요약 */}
        <div data-testid="atelier-style-dna-summary" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          <span>
            {mode === "scene-restyle-and-3d-sync"
              ? (isEn ? snapshot.transform.scene3dSyncPlan.syncSummaryEn : snapshot.transform.scene3dSyncPlan.syncSummaryKo)
              : pick(
                `원본 벡터 ${snapshot.transform.preservedOriginalStrokes.length}스트로크 무손실 보존(${snapshot.transform.originalStrokeDigest}) · 화풍 DNA ${snapshot.transform.styleDna.dnaFingerprint}`,
                `Preserved ${snapshot.transform.preservedOriginalStrokes.length} raw strokes (${snapshot.transform.originalStrokeDigest}) · DNA ${snapshot.transform.styleDna.dnaFingerprint}`,
              )}
          </span>
          <span className="font-mono text-[11px] font-semibold text-good tabular-nums">
            {`LINE ${snapshot.transform.styleDna.effectiveLineWidthPx}px · ${snapshot.transform.styleDna.shadingBandCount}B`}
          </span>
        </div>
      </div>

      {/* 3. 최신 PC/모바일 9종 실리콘 선택 & 온디바이스 AI 7대 기능 표 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("기기 9종의 AI 연산 경로 계획", "Planned AI Paths Across 9 Devices")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{snapshot.modelKind}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-1.5 rounded-lg border border-line bg-card p-3">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
              <Smartphone className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("모바일 NPU · TPU (5종)", "Mobile NPU · TPU (5)")}
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("모바일 실리콘 선택", "Select mobile silicon")}>
              {mobileSilicons.map((s) => (
                <button
                  key={s.id} type="button" data-testid={`atelier-silicon-${s.id}`} aria-pressed={siliconId === s.id}
                  onClick={() => handleSelectSilicon(s.id)} className={siliconId === s.id ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? s.nameEn : s.nameKo}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 rounded-lg border border-line bg-card p-3">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
              <Monitor className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("PC NPU · GPU (4종)", "PC NPU · GPU (4)")}
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("PC 실리콘 선택", "Select PC silicon")}>
              {pcSilicons.map((s) => (
                <button
                  key={s.id} type="button" data-testid={`atelier-silicon-${s.id}`} aria-pressed={siliconId === s.id}
                  onClick={() => handleSelectSilicon(s.id)} className={siliconId === s.id ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? s.nameEn : s.nameKo}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p data-testid="atelier-silicon-honesty-note" className="rounded-lg border border-line bg-card px-3 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
          {`${isEn ? snapshot.dispatchMatrix.silicon.thermalPolicyEn : snapshot.dispatchMatrix.silicon.thermalPolicyKo} — ${isEn ? snapshot.dispatchMatrix.honestyNoticeEn : snapshot.dispatchMatrix.honestyNoticeKo}`}
        </p>

        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table data-testid="atelier-ondevice-ai-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-raised text-[11px] text-fg-2">
                <th className="px-3 py-2 font-semibold [word-break:keep-all]">{pick("온디바이스 AI 기능", "On-Device AI Task")}</th>
                <th className="px-3 py-2 font-semibold [word-break:keep-all]">{pick("양자화", "Quant")}</th>
                <th className="px-3 py-2 font-semibold [word-break:keep-all]">{pick("브라우저 표준 경로", "Web Standard")}</th>
                <th className="px-3 py-2 font-semibold [word-break:keep-all]">{pick("네이티브 브리지", "Native Bridge")}</th>
                <th className="px-3 py-2 font-semibold [word-break:keep-all]">{pick("프라이버시 · 오프라인", "Privacy · Offline")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {snapshot.dispatchMatrix.rows.map((row) => {
                const tier = ROUTE_TIER_META[row.routeHonestyTier];
                return (
                  <tr key={row.task.id} data-testid={`atelier-ai-row-${row.task.id}`} className="align-top">
                    <td className="px-3 py-2.5 [word-break:keep-all]">
                      <div className="font-semibold text-fg">{isEn ? row.task.titleEn : row.task.titleKo}</div>
                      <div className="mt-0.5 text-[11px] text-fg-2">{isEn ? row.task.summaryEn : row.task.summaryKo}</div>
                      <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tier.cls}`}>
                        {isEn ? tier.en : tier.ko}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-accent tabular-nums">{row.quantization}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-fg-2">{row.webStandardPath}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-fg-2">{row.nativeBridgePath}</td>
                    <td className="px-3 py-2.5">
                      <span
                        data-testid={`atelier-ai-zero-upload-${row.task.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-good tabular-nums [word-break:keep-all]"
                      >
                        {pick(`미리보기 전송 ${row.serverUploadBytes}B`, `Preview upload: ${row.serverUploadBytes}B`)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. WGSL 컴퓨트 커널 접기(<details>) + JSON 미리보기 */}
      <details data-testid="atelier-style-wgsl-details" className="rounded-xl border border-line bg-raised p-3.5">
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-fg [word-break:keep-all] ${FOCUS_RING}`}>
          <span className="flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick(`WGSL 화풍 변환 컴퓨트 커널 템플릿 보기 (${activeStyle.labelKo})`, `Inspect WGSL Style Compute Kernel (${activeStyle.labelEn})`)}
          </span>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${snapshot.wgslKernel.split("\n").length} lines`}</span>
        </summary>
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex justify-end">
            <button type="button" data-testid="atelier-style-copy-wgsl-btn" onClick={() => void handleCopyWgsl()} className={BTN_OUTLINE}>
              <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("WGSL 커널 복사", "Copy WGSL Kernel")}
            </button>
          </div>
          <pre data-testid="atelier-style-wgsl-code" className="max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg">
            {snapshot.wgslKernel}
          </pre>
        </div>
      </details>

      {showJsonPreview && (
        <div data-testid="atelier-style-json-preview" className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("JSON 매니페스트 미리보기", "JSON Manifest Preview")}</span>
            <button type="button" data-testid="atelier-style-close-json-btn" onClick={() => setShowJsonPreview(false)} className={BTN_OUTLINE}>
              {pick("닫기", "Close")}
            </button>
          </div>
          <pre className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg">
            {jsonOutput}
          </pre>
        </div>
      )}
    </section>
  );
}
