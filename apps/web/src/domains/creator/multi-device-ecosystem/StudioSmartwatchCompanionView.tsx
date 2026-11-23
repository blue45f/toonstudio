/**
 * 스마트워치 드로잉 · 크라운 컴패니언 뷰 (`200–260px` 원형/사각 워치 대응).
 *
 * - 디지털 크라운 브러시 크기 / 캔버스 줌 실시간 다이얼
 * - 3초 썸네일 콘티 패드 & 1탭 Undo
 * - 4원색 잉크 팔레트(CSS OKLCH 토큰 전용, TSX 원시 색상 0건)
 * - 보이스-투-말풍선 대사 캡처 및 BroadcastChannel 크로스-디바이스 동기화
 */

import { Mic, Minus, Plus, RotateCcw, Send, Watch } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";

import {
  MULTI_DEVICE_SPRITE_PATHS,
  resolveHandednessLayout,
  type DeviceHandedness,
  type MultiDeviceSyncBridge,
} from "./device-form-factor-engine";

export type WatchShapeMode = "round" | "rect";
export type WatchCrownTarget = "brush" | "zoom";
export type WatchSwatchId = "ink" | "coral" | "cobalt" | "gold";
export type VoiceBubbleTone = "normal" | "shout" | "whisper";

interface WatchContiStroke {
  readonly id: number;
  readonly swatch: WatchSwatchId;
  readonly widthPx: number;
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

export interface StudioSmartwatchCompanionViewProps {
  readonly handedness?: DeviceHandedness;
  readonly syncBridge?: MultiDeviceSyncBridge | null;
  readonly initialShape?: WatchShapeMode;
  readonly onActionFeedback?: (messageKo: string) => void;
}

const WATCH_SWATCHES: readonly {
  readonly id: WatchSwatchId;
  readonly labelKo: string;
  readonly strokeClass: string;
}[] = Object.freeze([
  Object.freeze({ id: "ink", labelKo: "먹선 블랙", strokeClass: "mde-stroke-ink" }),
  Object.freeze({ id: "coral", labelKo: "코랄 포인트", strokeClass: "mde-stroke-coral" }),
  Object.freeze({ id: "cobalt", labelKo: "코발트 러프", strokeClass: "mde-stroke-cobalt" }),
  Object.freeze({ id: "gold", labelKo: "골드 하이라이트", strokeClass: "mde-stroke-gold" }),
]);

const QUICK_VOICE_LINES: readonly string[] = Object.freeze([
  "잠깐, 저기 봐!",
  "지금 바로 출발하자.",
  "이 컷은 클로즈업으로!",
]);

function strokeToSvgPath(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
}

function swatchStrokeClass(swatch: WatchSwatchId): string {
  return WATCH_SWATCHES.find((item) => item.id === swatch)?.strokeClass ?? "mde-stroke-ink";
}

export function StudioSmartwatchCompanionView({
  handedness = "right",
  syncBridge = null,
  initialShape = "round",
  onActionFeedback,
}: StudioSmartwatchCompanionViewProps): ReactElement {
  const voiceInputId = useId();
  const sizeSliderId = useId();
  const [shape, setShape] = useState<WatchShapeMode>(initialShape);
  const [watchDiameterPx, setWatchDiameterPx] = useState<number>(232);
  const [crownTarget, setCrownTarget] = useState<WatchCrownTarget>("brush");
  const [brushSizePx, setBrushSizePx] = useState<number>(12);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [activeSwatch, setActiveSwatch] = useState<WatchSwatchId>("coral");
  const [strokes, setStrokes] = useState<readonly WatchContiStroke[]>([
    {
      id: 1,
      swatch: "cobalt",
      widthPx: 3,
      points: [
        { x: 24, y: 58 },
        { x: 58, y: 24 },
        { x: 102, y: 42 },
        { x: 146, y: 20 },
      ],
    },
  ]);
  const [voiceDraft, setVoiceDraft] = useState<string>("");
  const [voiceTone, setVoiceTone] = useState<VoiceBubbleTone>("normal");
  const [capturedBubbles, setCapturedBubbles] = useState<readonly string[]>([]);
  const [statusKo, setStatusKo] = useState<string>(
    "크라운을 돌려 브러시 크기나 줌을 조절하고 3초 썸네일 콘티를 남겨 보세요.",
  );

  const drawingRef = useRef<boolean>(false);
  const nextStrokeIdRef = useRef<number>(2);

  const formFactor = shape === "round" ? "watch-round" : "watch-rect";
  const layout = resolveHandednessLayout(formFactor, handedness);

  const reportStatus = (message: string): void => {
    setStatusKo(message);
    onActionFeedback?.(message);
  };

  const adjustCrown = (direction: 1 | -1): void => {
    if (crownTarget === "brush") {
      const nextSize = Math.min(64, Math.max(2, brushSizePx + direction * 2));
      setBrushSizePx(nextSize);
      syncBridge?.publish({
        kind: "brush.delta",
        sizePx: nextSize,
        opacity: 1,
        colorTokenId: activeSwatch,
      });
      reportStatus(`워치 크라운 · 브러시 크기 ${nextSize}px 동기화`);
      return;
    }

    const nextZoom = Math.min(400, Math.max(25, zoomPercent + direction * 15));
    setZoomPercent(nextZoom);
    syncBridge?.publish({
      kind: "canvas.zoom",
      zoomPercent: nextZoom,
      rotationDeg: 0,
    });
    reportStatus(`워치 크라운 · 캔버스 줌 ${nextZoom}% 동기화`);
  };

  const handleCrownKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "+") {
      event.preventDefault();
      adjustCrown(1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "-") {
      event.preventDefault();
      adjustCrown(-1);
    }
  };

  const handleSelectSwatch = (swatch: WatchSwatchId): void => {
    setActiveSwatch(swatch);
    syncBridge?.publish({
      kind: "brush.delta",
      sizePx: brushSizePx,
      opacity: 1,
      colorTokenId: swatch,
    });
    const label = WATCH_SWATCHES.find((item) => item.id === swatch)?.labelKo ?? swatch;
    reportStatus(`워치 4원색 팔레트 · ${label} 선택`);
  };

  const handleUndo = (): void => {
    setStrokes((prev) => prev.slice(0, -1));
    syncBridge?.publish({
      kind: "canvas.undo",
      reasonKo: "워치 1탭 실행 취소",
    });
    reportStatus("워치 1탭 실행 취소 전송됨");
  };

  const handleQuickContiStroke = (): void => {
    const id = nextStrokeIdRef.current;
    nextStrokeIdRef.current += 1;
    const offset = ((id * 17) % 40) - 16;
    const stroke: WatchContiStroke = {
      id,
      swatch: activeSwatch,
      widthPx: Math.max(2, Math.min(8, Math.round(brushSizePx / 4))),
      points: [
        { x: 20, y: 46 + offset * 0.4 },
        { x: 74, y: 26 + offset * 0.3 },
        { x: 138, y: 54 - offset * 0.3 },
      ],
    };
    setStrokes((prev) => [...prev, stroke]);
    reportStatus(`3초 썸네일 콘티 획 #${id} 추가`);
  };

  const readLocalPoint = (event: PointerEvent<SVGSVGElement>): { readonly x: number; readonly y: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 176;
    const height = rect.height > 0 ? rect.height : 84;
    const x = ((event.clientX - rect.left) / width) * 176;
    const y = ((event.clientY - rect.top) / height) * 84;
    return {
      x: Math.min(172, Math.max(4, Number.isFinite(x) ? x : 88)),
      y: Math.min(80, Math.max(4, Number.isFinite(y) ? y : 42)),
    };
  };

  const handlePadPointerDown = (event: PointerEvent<SVGSVGElement>): void => {
    drawingRef.current = true;
    const point = readLocalPoint(event);
    const id = nextStrokeIdRef.current;
    nextStrokeIdRef.current += 1;
    const widthPx = Math.max(2, Math.min(8, Math.round(brushSizePx / 4)));
    setStrokes((prev) => [...prev, { id, swatch: activeSwatch, widthPx, points: [point] }]);
  };

  const handlePadPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    if (!drawingRef.current) return;
    const point = readLocalPoint(event);
    setStrokes((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      const updated: WatchContiStroke = {
        ...last,
        points: [...last.points, point],
      };
      return [...prev.slice(0, -1), updated];
    });
  };

  const handlePadPointerUp = (): void => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    reportStatus(`3초 콘티 패드 저장 (총 ${strokes.length}획)`);
  };

  const handleCaptureVoiceBubble = (textInput?: string): void => {
    const cleaned = (textInput ?? voiceDraft).trim();
    if (!cleaned) return;
    setCapturedBubbles((prev) => [cleaned, ...prev.slice(0, 3)]);
    setVoiceDraft("");
    syncBridge?.publish({
      kind: "voice.bubble",
      text: cleaned,
      tone: voiceTone,
    });
    reportStatus(`보이스-투-말풍선 전송: "${cleaned}"`);
  };

  const watchFrameStyle = {
    "--mde-watch-size": `${watchDiameterPx}px`,
  } as CSSProperties;

  return (
    <section
      data-testid="studio-smartwatch-companion-view"
      aria-label="스마트워치 드로잉 및 크라운 컴패니언"
      className="mde-panel-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <img
            src={MULTI_DEVICE_SPRITE_PATHS.watch}
            alt="스마트워치 컴패니언 아이콘"
            width={44}
            height={44}
            className="mde-sprite-img"
            loading="lazy"
          />
          <div>
            <h3 className="text-sm font-bold text-fg">스마트워치 크라운 · 3초 콘티 컴패니언</h3>
            <p className="text-xs text-fg-2">
              {shape === "round" ? "원형 베젤" : "사각 베젤"} ·{" "}
              <span className="mde-num">{watchDiameterPx}px</span> · 크라운{" "}
              {layout.watchCrownSide === "left" ? "좌측(왼손)" : "우측(오른손)"}
            </p>
          </div>
        </div>

        <div className="mde-actions-row" role="group" aria-label="워치 베젤 형태">
          <button
            type="button"
            className="mde-chip"
            aria-pressed={shape === "round"}
            onClick={() => setShape("round")}
          >
            <Watch className="size-4" aria-hidden="true" />
            원형 워치
          </button>
          <button
            type="button"
            className="mde-chip"
            aria-pressed={shape === "rect"}
            onClick={() => setShape("rect")}
          >
            사각 워치
          </button>
        </div>
      </div>

      <div className="mde-watch-layout">
        <div
          className="mde-watch-bezel-wrap"
          data-crown-side={layout.watchCrownSide}
        >
          <div
            data-testid="smartwatch-physical-frame"
            data-watch-shape={shape}
            style={watchFrameStyle}
            className="mde-watch-face"
          >
            <div className="flex w-full items-center justify-between px-2 text-[0.68rem] font-bold text-fg-2">
              <span className="mde-num">
                {crownTarget === "brush" ? `펜 ${brushSizePx}px` : `줌 ${zoomPercent}%`}
              </span>
              <span className="mde-num">{strokes.length}획</span>
            </div>

            <svg
              data-testid="smartwatch-conti-pad"
              viewBox="0 0 176 84"
              role="img"
              aria-label="스마트워치 3초 썸네일 콘티 패드"
              className="mde-watch-conti-pad"
              onPointerDown={handlePadPointerDown}
              onPointerMove={handlePadPointerMove}
              onPointerUp={handlePadPointerUp}
              onPointerLeave={handlePadPointerUp}
            >
              {strokes.map((stroke) => (
                <path
                  key={stroke.id}
                  d={strokeToSvgPath(stroke.points)}
                  fill="none"
                  strokeWidth={stroke.widthPx}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={swatchStrokeClass(stroke.swatch)}
                />
              ))}
            </svg>

            <button
              type="button"
              data-testid="smartwatch-one-tap-undo"
              className="mde-btn"
              onClick={handleUndo}
              aria-label="워치 1탭 실행 취소"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              1탭 취소
            </button>
          </div>

          <div
            role="slider"
            tabIndex={0}
            aria-label={crownTarget === "brush" ? "디지털 크라운 브러시 크기 다이얼" : "디지털 크라운 캔버스 줌 다이얼"}
            aria-valuemin={crownTarget === "brush" ? 2 : 25}
            aria-valuemax={crownTarget === "brush" ? 64 : 400}
            aria-valuenow={crownTarget === "brush" ? brushSizePx : zoomPercent}
            data-testid="smartwatch-crown-dial"
            className="mde-watch-crown"
            onKeyDown={handleCrownKeyDown}
          >
            <button
              type="button"
              className="mde-btn"
              aria-label="크라운 올리기"
              onClick={() => adjustCrown(1)}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="mde-btn"
              aria-label="크라운 내리기"
              onClick={() => adjustCrown(-1)}
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="mde-chip"
              aria-pressed={crownTarget === "brush"}
              onClick={() => setCrownTarget("brush")}
            >
              크라운: 브러시 ({brushSizePx}px)
            </button>
            <button
              type="button"
              className="mde-chip"
              aria-pressed={crownTarget === "zoom"}
              onClick={() => setCrownTarget("zoom")}
            >
              크라운: 줌 ({zoomPercent}%)
            </button>
            <button
              type="button"
              className="mde-chip"
              onClick={handleQuickContiStroke}
            >
              3초 콘티 1획 찍기
            </button>
          </div>

          <div>
            <label htmlFor={sizeSliderId} className="block text-xs font-semibold text-fg-2">
              워치 화면 크기 시뮬레이터:{" "}
              <span className="mde-num font-bold text-fg">{watchDiameterPx}px</span> (200–260px)
            </label>
            <input
              id={sizeSliderId}
              type="range"
              min={200}
              max={260}
              step={4}
              value={watchDiameterPx}
              onChange={(event) => setWatchDiameterPx(Number(event.target.value))}
              className="mde-range"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-fg-2">4원색 원터치 팔레트</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="워치 4원색 팔레트">
              {WATCH_SWATCHES.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  data-swatch={swatch.id}
                  aria-label={swatch.labelKo}
                  aria-pressed={activeSwatch === swatch.id}
                  className="mde-watch-swatch"
                  onClick={() => handleSelectSwatch(swatch.id)}
                >
                  <span className="sr-only">{swatch.labelKo}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mde-divider-block">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={voiceInputId} className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <Mic className="size-3.5 text-accent" aria-hidden="true" />
                보이스-투-말풍선 캡처
              </label>
              <div className="flex gap-1" role="group" aria-label="말풍선 톤">
                {(
                  [
                    ["normal", "일반"],
                    ["shout", "외침"],
                    ["whisper", "속삭임"],
                  ] as const
                ).map(([toneId, label]) => (
                  <button
                    key={toneId}
                    type="button"
                    className="mde-chip"
                    aria-pressed={voiceTone === toneId}
                    onClick={() => setVoiceTone(toneId)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                id={voiceInputId}
                type="text"
                value={voiceDraft}
                onChange={(event) => setVoiceDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCaptureVoiceBubble();
                  }
                }}
                placeholder="떠오른 대사를 말하거나 바로 입력"
                className="mde-input"
              />
              <button
                type="button"
                className="mde-btn"
                onClick={() => handleCaptureVoiceBubble()}
                aria-label="말풍선 전송"
              >
                <Send className="size-4" aria-hidden="true" />
                전송
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_VOICE_LINES.map((line) => (
                <button
                  key={line}
                  type="button"
                  className="mde-chip"
                  onClick={() => handleCaptureVoiceBubble(line)}
                >
                  {line}
                </button>
              ))}
            </div>

            {capturedBubbles.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="최근 캡처 말풍선">
                {capturedBubbles.map((bubble, idx) => (
                  <li key={`${bubble}-${idx}`} className="mde-badge" data-tone="ready">
                    말풍선: {bubble}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <p role="status" aria-live="polite" className="text-xs text-fg-2">
        {statusKo}
      </p>
    </section>
  );
}
