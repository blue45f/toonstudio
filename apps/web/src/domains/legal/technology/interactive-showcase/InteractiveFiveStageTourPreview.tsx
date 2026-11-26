import {
  CheckCircle2,
  Columns2,
  FileCode2,
  Layers,
  MessageSquareText,
  PaintBucket,
  PenTool,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import "./interactive-showcase.css";
import { FIVE_STAGE_TOUR_ITEMS, type CreationStageId } from "./interactive-showcase-data";
import { pickShowcaseText, showcaseBi } from "./interactive-showcase-models";

import { cx } from "@/shared/lib/cx";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const STAGE_ICONS: Readonly<Record<CreationStageId, LucideIcon>> = {
  "line-stabilize": PenTool,
  "gap-autoflat": PaintBucket,
  "bg3d-perspective": Layers,
  "balloon-multilang": MessageSquareText,
  "cmyk-audiotoon-qa": CheckCircle2,
};

function StageArtworkSvg({
  stageId,
  variant,
}: {
  readonly stageId: CreationStageId;
  readonly variant: "before" | "after";
}) {
  const isAfter = variant === "after";

  if (stageId === "line-stabilize") {
    return (
      <g>
        <rect x="0" y="0" width="640" height="220" fill="var(--color-canvas)" />
        <line x1="48" y1="184" x2="592" y2="184" stroke="var(--color-line)" strokeDasharray="5 5" />
        {isAfter ? (
          <>
            <path
              d="M 64 156 C 180 42, 340 42, 572 136"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 96 172 C 210 88, 360 88, 546 154"
              fill="none"
              stroke="var(--color-good)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </>
        ) : (
          <polyline
            points="64,156 92,134 118,142 148,105 176,112 208,78 240,86 274,64 308,74 344,62 380,78 418,74 456,98 494,94 532,124 572,136"
            fill="none"
            stroke="var(--color-warn)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
        )}
      </g>
    );
  }

  if (stageId === "gap-autoflat") {
    return (
      <g>
        <rect x="0" y="0" width="640" height="220" fill="var(--color-canvas)" />
        {!isAfter ? (
          <rect x="0" y="0" width="640" height="220" fill="var(--color-warning-soft)" />
        ) : null}
        {isAfter ? (
          <>
            <circle
              cx="320"
              cy="110"
              r="68"
              fill="var(--color-good-soft)"
              stroke="var(--color-fg)"
              strokeWidth="4"
            />
            <line
              x1="378"
              y1="72"
              x2="388"
              y2="92"
              stroke="var(--color-accent)"
              strokeWidth="5"
              strokeDasharray="4 3"
            />
          </>
        ) : (
          <path
            d="M 384 96 A 68 68 0 1 1 372 66"
            fill="var(--color-warning-soft)"
            stroke="var(--color-fg-2)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}
      </g>
    );
  }

  if (stageId === "bg3d-perspective") {
    return (
      <g>
        <rect x="0" y="0" width="640" height="220" fill="var(--color-canvas)" />
        <line x1="40" y1="96" x2="600" y2="96" stroke="var(--color-cool)" strokeDasharray="6 4" />
        {[120, 220, 420, 520].map((x) => (
          <line
            key={x}
            x1="320"
            y1="96"
            x2={x}
            y2="208"
            stroke={isAfter ? "var(--color-good)" : "var(--color-fg-3)"}
            strokeWidth={isAfter ? "2" : "1.2"}
          />
        ))}
        <rect
          x="180"
          y="46"
          width="96"
          height="118"
          rx="6"
          fill={isAfter ? "var(--color-info-soft)" : "var(--color-canvas)"}
          stroke={isAfter ? "var(--color-fg)" : "var(--color-fg-3)"}
          strokeWidth="2.5"
        />
        <rect
          x="368"
          y="54"
          width="88"
          height="108"
          rx="6"
          fill={isAfter ? "var(--color-accent-soft)" : "var(--color-canvas)"}
          stroke={isAfter ? "var(--color-fg)" : "var(--color-fg-3)"}
          strokeWidth="2.5"
        />
      </g>
    );
  }

  if (stageId === "balloon-multilang") {
    return (
      <g>
        <rect x="0" y="0" width="640" height="220" fill="var(--color-canvas)" />
        <ellipse
          cx="220"
          cy="108"
          rx={isAfter ? 124 : 88}
          ry={isAfter ? 58 : 44}
          fill="var(--color-card)"
          stroke={isAfter ? "var(--color-good)" : "var(--color-warn)"}
          strokeWidth="3"
        />
        <text
          x="220"
          y="104"
          textAnchor="middle"
          fill="var(--color-fg)"
          fontSize="14"
          fontWeight="800"
        >
          {isAfter ? "마감 전 다국어 식자 완료!" : "Translated dialogue overflows box..."}
        </text>
        <text
          x="220"
          y="126"
          textAnchor="middle"
          fill={isAfter ? "var(--color-good)" : "var(--color-warn)"}
          fontSize="12"
          fontWeight="700"
        >
          {isAfter ? "KO · EN · JA · RTL 여백 통과" : "Overflow +18px"}
        </text>
        <rect
          x="392"
          y="58"
          width="184"
          height="102"
          rx="16"
          fill="var(--color-panel)"
          stroke="var(--color-line-strong)"
          strokeWidth="2"
        />
        <text x="484" y="102" textAnchor="middle" fill="var(--color-accent)" fontSize="13" fontWeight="800">
          {isAfter ? "컷 순서 L→R / R→L 자동 정합" : "수동 말풍선 크기 재조정"}
        </text>
        <text x="484" y="126" textAnchor="middle" fill="var(--color-fg-2)" fontSize="11.5" fontWeight="600">
          {isAfter ? "대사 시트 양방향 동기화" : "언어별 파일 사본 수동 관리"}
        </text>
      </g>
    );
  }

  return (
    <g>
      <rect x="0" y="0" width="640" height="220" fill="var(--color-canvas)" />
      <rect
        x="56"
        y="44"
        width="240"
        height="132"
        rx="16"
        fill="var(--color-card)"
        stroke={isAfter ? "var(--color-good)" : "var(--color-warn)"}
        strokeWidth="2.5"
      />
      <text x="78" y="80" fill="var(--color-fg)" fontSize="13.5" fontWeight="800">
        {isAfter ? "CMYK PDF/X-4 · TAC <= 300%" : "형광 RGB 색역 이탈 미검출"}
      </text>
      <text x="78" y="108" fill="var(--color-fg-2)" fontSize="12" fontWeight="600">
        {isAfter ? "OKLCH 소프트프루프 통과" : "단행본 인쇄 시 채도 급락 위험"}
      </text>
      <text
        x="78"
        y="146"
        fill={isAfter ? "var(--color-good)" : "var(--color-warn)"}
        fontSize="12"
        fontWeight="800"
      >
        {isAfter ? "Rights BOM + WOTS+ 진본 서명 완료" : "외부 폰트·3D 라이선스 미확인"}
      </text>

      <rect
        x="336"
        y="44"
        width="248"
        height="132"
        rx="16"
        fill="var(--color-panel)"
        stroke="var(--color-line-strong)"
        strokeWidth="2"
      />
      {[0, 1, 2, 3, 4, 5, 6].map((barIdx) => {
        const barH = isAfter ? 28 + ((barIdx * 17) % 52) : 16;
        return (
          <rect
            key={barIdx}
            x={364 + barIdx * 28}
            y={144 - barH}
            width="16"
            height={barH}
            rx="4"
            fill={isAfter ? "var(--color-accent)" : "var(--color-fg-3)"}
          />
        );
      })}
      <text x="364" y="72" fill="var(--color-fg)" fontSize="12.5" fontWeight="800">
        {isAfter ? "HRTF 스크롤 오디오 스템 동기화" : "무음 정적 컷만 내보내기"}
      </text>
    </g>
  );
}

export interface InteractiveFiveStageTourPreviewProps {
  readonly className?: string;
}

export function InteractiveFiveStageTourPreview({
  className,
}: InteractiveFiveStageTourPreviewProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const stageRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [stageId, setStageId] = useState<CreationStageId>("line-stabilize");
  const [scrubPercent, setScrubPercent] = useState<number>(62);

  const activeStage =
    FIVE_STAGE_TOUR_ITEMS.find((item) => item.id === stageId) ?? FIVE_STAGE_TOUR_ITEMS[0]!;

  const headingId = `${baseId}-tour-heading`;
  const scrubInputId = `${baseId}-scrub-slider`;
  const clipPathId = `${baseId}-after-clip`;
  const splitX = Number(((scrubPercent / 100) * 640).toFixed(1));

  function handleStageKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const total = FIVE_STAGE_TOUR_ITEMS.length;
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % total;
    else if (event.key === "ArrowLeft") next = (index - 1 + total) % total;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = total - 1;

    if (next >= 0) {
      event.preventDefault();
      const target = FIVE_STAGE_TOUR_ITEMS[next];
      if (target) {
        setStageId(target.id);
        stageRefs.current[next]?.focus();
      }
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      data-showcase-widget="five-stage-tour"
      className={cx(
        "rounded-3xl border border-line/80 bg-panel/75 p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            {showcaseBi("5단계 웹툰 제작 공정 프리뷰", "5-Stage Creation Pipeline Walkthrough")}
          </p>
          <h3
            id={headingId}
            className="mt-1.5 text-balance break-keep text-xl font-black tracking-tight text-fg sm:text-2xl"
          >
            {showcaseBi(
              "선화부터 CMYK·오디오툰 출고까지 전후(Before/After) 비교 슬라이더",
              "Interactive Before/After Scrub Across All 5 Webtoon Production Stages",
            )}
          </h3>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs font-bold tabular-nums text-fg-2">
          <Columns2 size={14} className="text-accent" aria-hidden="true" />
          {showcaseBi("전후 비교", "Split")}: {scrubPercent}%
        </span>
      </div>

      {/* 5단계 탭 선택기 */}
      <div
        role="tablist"
        aria-label={showcaseBi("5단계 창작 공정 선택", "Select creation stage")}
        className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      >
        {FIVE_STAGE_TOUR_ITEMS.map((stage, index) => {
          const Icon = STAGE_ICONS[stage.id];
          const selected = stage.id === activeStage.id;
          return (
            <button
              key={stage.id}
              ref={(el) => {
                stageRefs.current[index] = el;
              }}
              id={`${baseId}-stage-tab-${stage.id}`}
              type="button"
              role="tab"
              tabIndex={selected ? 0 : -1}
              aria-selected={selected}
              aria-controls={`${baseId}-stage-panel`}
              onClick={() => setStageId(stage.id)}
              onKeyDown={(event) => handleStageKeyDown(event, index)}
              className={cx(
                "tech-showcase-node inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-left text-xs font-black break-keep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card/75 text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <Icon size={15} aria-hidden="true" className="shrink-0" />
              <span>{pickShowcaseText(stage.shortTab)}</span>
            </button>
          );
        })}
      </div>

      {/* 활성 단계 상세 + Before/After 비교 뷰포트 */}
      <div
        id={`${baseId}-stage-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-stage-tab-${activeStage.id}`}
        data-active-tour-stage={activeStage.id}
        className="mt-4 grid gap-4 rounded-3xl border border-line bg-card/80 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-black break-keep text-fg sm:text-lg">
            {pickShowcaseText(activeStage.title)}
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 font-mono text-[0.7rem] font-bold text-accent">
              {pickShowcaseText(activeStage.engineBadge)}
            </span>
            <span className="rounded-full border border-good/35 bg-good-soft px-2.5 py-0.5 text-[0.7rem] font-bold text-good">
              {pickShowcaseText(activeStage.metricBadge)}
            </span>
          </div>
        </div>

        {/* SVG Before/After 클립 스플릿 */}
        <figure className="m-0 overflow-hidden rounded-2xl border border-line-strong bg-canvas">
          <svg
            role="img"
            aria-label={`${pickShowcaseText(activeStage.shortTab)} — ${pickShowcaseText(activeStage.beforeLabel)} vs ${pickShowcaseText(activeStage.afterLabel)} (${scrubPercent}%)`}
            viewBox="0 0 640 220"
            className="block h-auto w-full"
          >
            <defs>
              <clipPath id={clipPathId}>
                <rect x="0" y="0" width={splitX} height="220" />
              </clipPath>
            </defs>

            {/* 전체 폭에 깔리는 Before 레이어 */}
            <StageArtworkSvg stageId={activeStage.id} variant="before" />

            {/* 좌측 0..splitX 구간에만 드러나는 After 레이어 */}
            <g clipPath={`url(#${clipPathId})`}>
              <StageArtworkSvg stageId={activeStage.id} variant="after" />
            </g>

            {/* 분할선 핸들 표시 */}
            <line
              x1={splitX}
              y1="0"
              x2={splitX}
              y2="220"
              stroke="var(--color-accent)"
              strokeWidth="3"
            />
            <circle cx={splitX} cy="110" r="13" fill="var(--color-accent)" />
            <text
              x={splitX}
              y="114"
              textAnchor="middle"
              fill="var(--color-on-accent)"
              fontSize="10"
              fontWeight="900"
            >
              ↔
            </text>

            {/* 좌/우 상태 배지 */}
            <rect x="14" y="12" width="198" height="24" rx="999" fill="var(--color-panel)" />
            <text x="26" y="28" fill="var(--color-good)" fontSize="11" fontWeight="800">
              {pickShowcaseText(activeStage.afterLabel)}
            </text>

            <rect x="412" y="12" width="214" height="24" rx="999" fill="var(--color-panel)" />
            <text x="424" y="28" fill="var(--color-warn)" fontSize="11" fontWeight="800">
              {pickShowcaseText(activeStage.beforeLabel)}
            </text>
          </svg>
        </figure>

        {/* 키보드 접근성 + >= 44px 터치 타깃 비교 슬라이더 */}
        <div className="grid gap-2 rounded-2xl border border-line/80 bg-panel/80 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={scrubInputId} className="text-xs font-black break-keep text-fg">
              {showcaseBi(
                "전후 비교 분할선 조절 (0% 보정 전 ↔ 100% 보정 후)",
                "Scrub Before/After Split (0% Before ↔ 100% After)",
              )}
            </label>
            <div className="flex items-center gap-1.5">
              {[0, 50, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setScrubPercent(preset)}
                  className={cx(
                    "tech-showcase-node min-h-11 min-w-11 rounded-xl border px-2.5 py-1 font-mono text-xs font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    scrubPercent === preset
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>

          <input
            id={scrubInputId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={scrubPercent}
            aria-valuetext={`${showcaseBi("보정 후 적용 비율", "After reveal")} ${scrubPercent}%`}
            onChange={(event) => setScrubPercent(Number(event.currentTarget.value))}
            className="tech-showcase-range"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-warn/35 bg-panel/75 p-3.5">
            <p className="text-xs font-black text-warn">{pickShowcaseText(activeStage.beforeLabel)}</p>
            <p className="mt-1 text-xs leading-6 break-keep text-fg-2">
              {pickShowcaseText(activeStage.beforeSummary)}
            </p>
          </div>
          <div className="rounded-2xl border border-good/40 bg-panel/75 p-3.5">
            <p className="text-xs font-black text-good">{pickShowcaseText(activeStage.afterLabel)}</p>
            <p className="mt-1 text-xs leading-6 break-keep text-fg-2">
              {pickShowcaseText(activeStage.afterSummary)}
            </p>
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
          <FileCode2 size={14} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="font-bold">{showcaseBi("근거 커널:", "Kernel source:")}</span>
          <code className="break-all rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[0.68rem] text-fg-2">
            {activeStage.evidencePath}
          </code>
        </p>
      </div>
    </section>
  );
}
