/**
 * 커스텀 브러시 · 3D 배경 셰이더 마켓/SNS 공유용 초경량 인터랙티브 Before/After 시연 카드
 *
 * - Calm Atelier 의미 토큰과 1px 헤어라인 보더를 사용하며 장식용 네온 그라디언트를 배제한다.
 * - 포인터 드래그와 키보드(ArrowLeft/ArrowRight/Home/End/PageUp/PageDown)로 전후 비교를 조작한다.
 * - 최소 44×44px 핸들(`min-h-11 min-w-11`), `prefers-reduced-motion`, `[word-break:keep-all]`,
 *   실시간 임베드 스니펫(iframe · 웹 컴포넌트 · 마크다운) 생성을 지원한다.
 */

import { Check, Code2, Copy, MoveHorizontal } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";

import {
  buildBeforeAfterEmbedSnippets,
  clampComparisonPct,
  computePointerComparisonPct,
  SHOWCASE_CATEGORY_LABEL_KO,
  stepComparisonPctForKey,
  type BeforeAfterShowcaseAsset,
  type EmbedSnippetKind,
  type ShowcaseCategory,
} from "./before-after-showcase-model";

export interface StudioBeforeAfterShowcaseCardProps {
  readonly asset: BeforeAfterShowcaseAsset;
  readonly onPositionChange?: (positionPct: number) => void;
  readonly onCopySnippet?: (kind: EmbedSnippetKind, code: string) => void;
  readonly defaultShowEmbed?: boolean;
  readonly baseOrigin?: string;
  readonly compact?: boolean;
  readonly className?: string;
}

const EMBED_KIND_OPTIONS: readonly { readonly kind: EmbedSnippetKind; readonly label: string }[] = [
  { kind: "iframe", label: "HTML iframe" },
  { kind: "web-component", label: "웹 컴포넌트" },
  { kind: "markdown", label: "SNS 링크" },
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mediaQuery.matches);
    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }
    return undefined;
  }, []);

  return reduced;
}

function DefaultShowcaseArtwork({
  category,
  variant,
}: {
  readonly category: ShowcaseCategory;
  readonly variant: "before" | "after";
}): ReactElement {
  if (category === "bg3d-shader") {
    return (
      <svg
        viewBox="0 0 480 280"
        className="h-full w-full select-none"
        role="img"
        aria-hidden="true"
      >
        <rect
          width="480"
          height="280"
          fill={variant === "before" ? "var(--color-panel)" : "var(--color-card)"}
        />
        {variant === "before" ? (
          <g stroke="var(--color-fg-3)" strokeWidth="1.2" fill="none">
            <path d="M40 230 L170 155 L335 155 L445 230" />
            <path d="M170 40 L170 155 M335 40 L335 155" />
            <rect x="70" y="75" width="76" height="118" fill="var(--color-raised)" />
            <rect x="355" y="62" width="70" height="132" fill="var(--color-raised)" />
            <line x1="40" y1="230" x2="445" y2="230" />
            <line x1="170" y1="100" x2="335" y2="100" strokeDasharray="4 4" />
            <line x1="252" y1="40" x2="252" y2="230" strokeDasharray="4 4" />
          </g>
        ) : (
          <g>
            <rect x="0" y="0" width="480" height="158" fill="var(--color-accent-soft)" />
            <polygon points="40,230 170,155 335,155 445,230" fill="var(--color-raised)" />
            <polygon
              points="70,75 146,75 146,193 70,193"
              fill="var(--color-good-soft)"
              stroke="var(--color-fg)"
              strokeWidth="2.4"
            />
            <polygon
              points="146,75 170,88 170,155 146,193"
              fill="var(--color-panel)"
              stroke="var(--color-fg)"
              strokeWidth="2"
            />
            <rect
              x="92"
              y="102"
              width="32"
              height="36"
              fill="var(--color-warn)"
              fillOpacity="0.65"
              stroke="var(--color-fg)"
              strokeWidth="1.8"
            />
            <polygon
              points="355,62 425,62 425,194 355,194"
              fill="var(--color-accent)"
              fillOpacity="0.38"
              stroke="var(--color-fg)"
              strokeWidth="2.4"
            />
            <rect
              x="374"
              y="88"
              width="32"
              height="40"
              fill="var(--color-warn)"
              fillOpacity="0.72"
              stroke="var(--color-fg)"
              strokeWidth="1.8"
            />
            <path d="M170 155 L335 155" stroke="var(--color-fg)" strokeWidth="2.2" />
            <path d="M40 230 L170 155 M445 230 L335 155" stroke="var(--color-fg)" strokeWidth="2.2" />
          </g>
        )}
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 480 280"
      className="h-full w-full select-none"
      role="img"
      aria-hidden="true"
    >
      <rect
        width="480"
        height="280"
        fill={variant === "before" ? "var(--color-panel)" : "var(--color-card)"}
      />
      {variant === "before" ? (
        <g stroke="var(--color-fg-2)" strokeWidth="1.8" strokeLinecap="round" fill="none">
          <path d="M72 208 C135 130, 195 92, 260 118 C312 138, 355 104, 412 68" />
          <path d="M88 232 C158 180, 232 162, 318 172 C360 176, 392 162, 424 140" />
          <circle cx="178" cy="116" r="24" />
          <path d="M168 114 Q178 106 188 114" />
        </g>
      ) : (
        <g>
          <path
            d="M66 212 C132 126, 198 84, 264 114 C318 138, 356 100, 416 62"
            stroke="var(--color-good)"
            strokeOpacity="0.28"
            strokeWidth="22"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M72 208 C135 130, 195 92, 260 118 C312 138, 355 104, 412 68"
            stroke="var(--color-fg)"
            strokeWidth="5.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M84 234 C156 178, 232 158, 320 170 C362 175, 394 160, 426 136"
            stroke="var(--color-accent)"
            strokeOpacity="0.48"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M88 232 C158 180, 232 162, 318 172 C360 176, 392 162, 424 140"
            stroke="var(--color-fg)"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
          <circle
            cx="178"
            cy="116"
            r="26"
            fill="var(--color-good-soft)"
            stroke="var(--color-fg)"
            strokeWidth="3.2"
          />
          <path
            d="M166 114 Q178 103 190 114"
            stroke="var(--color-fg)"
            strokeWidth="2.8"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}
    </svg>
  );
}

export function StudioBeforeAfterShowcaseCard({
  asset,
  onPositionChange,
  onCopySnippet,
  defaultShowEmbed = false,
  baseOrigin,
  compact = false,
  className = "",
}: StudioBeforeAfterShowcaseCardProps): ReactElement {
  const idPrefix = useId();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  const [positionPct, setPositionPct] = useState<number>(() =>
    clampComparisonPct(asset.initialPositionPct ?? 50),
  );
  const [isDragging, setIsDragging] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(defaultShowEmbed);
  const [embedKind, setEmbedKind] = useState<EmbedSnippetKind>("iframe");
  const [copiedKind, setCopiedKind] = useState<EmbedSnippetKind | null>(null);

  const commitPosition = useCallback(
    (nextPct: number) => {
      const clamped = clampComparisonPct(nextPct);
      setPositionPct(clamped);
      onPositionChange?.(clamped);
    },
    [onPositionChange],
  );

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0) return;
      commitPosition(computePointerComparisonPct(clientX, rect.left, rect.width));
    },
    [commitPosition],
  );

  const handleStagePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      draggingRef.current = true;
      setIsDragging(true);
      try {
        if (typeof event.currentTarget.setPointerCapture === "function") {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      } catch {
        // jsdom 또는 일부 브라우저에서 포인터 캡처 미지원 시 무시한다.
      }
      updateFromClientX(event.clientX);
    },
    [updateFromClientX],
  );

  const handleStagePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      updateFromClientX(event.clientX);
    },
    [updateFromClientX],
  );

  const handleStagePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    try {
      if (typeof event.currentTarget.releasePointerCapture === "function") {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // 캡처 해제 실패 시 안전하게 무시한다.
    }
  }, []);

  const handleSliderKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const next = stepComparisonPctForKey(positionPct, event.key, event.shiftKey);
      if (next === null) return;
      event.preventDefault();
      commitPosition(next);
    },
    [commitPosition, positionPct],
  );

  const snippets = useMemo(
    () => buildBeforeAfterEmbedSnippets(asset, positionPct, { baseOrigin }),
    [asset, baseOrigin, positionPct],
  );

  const activeSnippetCode =
    embedKind === "iframe"
      ? snippets.iframeHtml
      : embedKind === "web-component"
        ? snippets.webComponentSnippet
        : snippets.markdownBadge;

  const handleCopySnippet = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeSnippetCode);
      }
    } catch {
      // 클립보드 권한 제한 환경에서도 콜백과 복사 상태 표시는 유지한다.
    }
    setCopiedKind(embedKind);
    onCopySnippet?.(embedKind, activeSnippetCode);
  }, [activeSnippetCode, embedKind, onCopySnippet]);

  const categoryLabel = SHOWCASE_CATEGORY_LABEL_KO[asset.category];
  const transitionClass = reducedMotion ? "" : "motion-reduce:transition-none transition-colors duration-150";

  return (
    <article
      data-studio-before-after-card="true"
      data-asset-id={asset.id}
      data-compare-pct={positionPct}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      className={`flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs text-fg break-keep [word-break:keep-all] ${className}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-line/60 pb-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg-2">
              {categoryLabel}
            </span>
            <span className="text-[0.68rem] text-fg-3">{asset.creatorHandle}</span>
          </div>
          <h3 className="text-sm font-semibold leading-[1.35] tracking-[-0.01em] text-fg">
            {asset.title}
          </h3>
          {!compact ? (
            <p className="text-[0.72rem] leading-[1.5] text-fg-2">{asset.summary}</p>
          ) : null}
        </div>
        <span
          className="shrink-0 rounded-md bg-panel px-2 py-1 text-[0.7rem] font-semibold tabular-nums text-fg-2"
          aria-hidden="true"
        >
          {positionPct}%
        </span>
      </header>

      {/* 인터랙티브 Before/After 비교 스테이지 */}
      <div
        ref={stageRef}
        data-compare-stage="true"
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerEnd}
        onPointerCancel={handleStagePointerEnd}
        className={`relative w-full select-none overflow-hidden rounded-lg border border-line-strong bg-panel touch-none ${
          compact ? "h-40" : "h-52"
        } ${isDragging ? "cursor-ew-resize" : "cursor-col-resize"}`}
      >
        {/* Before 레이어 (전체 배경) */}
        <div className="absolute inset-0" data-compare-layer="before">
          {asset.beforeImageUrl ? (
            <img
              src={asset.beforeImageUrl}
              alt={`${asset.title} — ${asset.beforeLabel}`}
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <DefaultShowcaseArtwork category={asset.category} variant="before" />
          )}
        </div>

        {/* After 레이어 (clip-path로 비율 왜곡 없이 클리핑) */}
        <div
          className="absolute inset-0"
          data-compare-layer="after"
          style={{ clipPath: `inset(0 ${100 - positionPct}% 0 0)` }}
        >
          {asset.afterImageUrl ? (
            <img
              src={asset.afterImageUrl}
              alt={`${asset.title} — ${asset.afterLabel}`}
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <DefaultShowcaseArtwork category={asset.category} variant="after" />
          )}
        </div>

        {/* 전/후 배지 */}
        <span className="pointer-events-none absolute top-2 left-2 rounded-md border border-line bg-card/90 px-2 py-0.5 text-[0.66rem] font-semibold text-fg">
          {asset.afterLabel}
        </span>
        <span className="pointer-events-none absolute top-2 right-2 rounded-md border border-line bg-card/90 px-2 py-0.5 text-[0.66rem] font-semibold text-fg-2">
          {asset.beforeLabel}
        </span>

        {/* 중앙 분할선 + 44×44px 키보드/터치 핸들 */}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent"
          style={{ left: `${positionPct}%` }}
          aria-hidden="true"
        />
        <button
          type="button"
          role="slider"
          aria-label={`${asset.title} 전후 비교 슬라이더`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={positionPct}
          aria-valuetext={`${asset.afterLabel} ${positionPct}% 표시`}
          data-compare-handle="true"
          onKeyDown={handleSliderKeyDown}
          onClick={(event) => event.stopPropagation()}
          style={{ left: `${positionPct}%` }}
          className={`absolute top-1/2 flex h-11 w-11 min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-accent bg-card text-fg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${transitionClass}`}
        >
          <MoveHorizontal className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* 캡션 + 빠른 위치 버튼 + 임베드 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="비교 위치 빠른 이동">
          {([0, 50, 100] as const).map((presetPct) => (
            <button
              key={presetPct}
              type="button"
              onClick={() => commitPosition(presetPct)}
              aria-pressed={positionPct === presetPct}
              className={`inline-flex min-h-11 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold tabular-nums ${transitionClass} ${
                positionPct === presetPct
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              {presetPct === 0 ? asset.beforeLabel : presetPct === 100 ? asset.afterLabel : "50:50"}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-expanded={embedOpen}
          aria-controls={`${idPrefix}-embed-panel`}
          onClick={() => setEmbedOpen((open) => !open)}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-[0.72rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${transitionClass}`}
        >
          <Code2 className="size-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          <span>{embedOpen ? "임베드 코드 닫기" : "임베드 코드 보기"}</span>
        </button>
      </div>

      {embedOpen ? (
        <div
          id={`${idPrefix}-embed-panel`}
          data-embed-panel="true"
          className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="임베드 코드 형식">
              {EMBED_KIND_OPTIONS.map((option) => {
                const active = embedKind === option.kind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setEmbedKind(option.kind);
                      setCopiedKind(null);
                    }}
                    className={`inline-flex min-h-11 items-center rounded-md border px-2.5 text-[0.7rem] font-semibold ${transitionClass} ${
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                void handleCopySnippet();
              }}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-[0.72rem] font-semibold text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${transitionClass}`}
            >
              {copiedKind === embedKind ? (
                <>
                  <Check className="size-3.5 text-good" strokeWidth={1.8} aria-hidden="true" />
                  <span>복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                  <span>스니펫 복사</span>
                </>
              )}
            </button>
          </div>

          <pre className="overflow-x-auto rounded-md border border-line bg-card p-2 text-[0.68rem] leading-[1.45] text-fg-2">
            <code data-embed-code="true">{activeSnippetCode}</code>
          </pre>
        </div>
      ) : null}
    </article>
  );
}
