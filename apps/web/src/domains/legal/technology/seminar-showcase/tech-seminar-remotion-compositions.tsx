/**
 * Remotion 1280×720 기술 세미나 인터랙티브 아키텍처 모션 도식 컴포지션.
 *
 * - `TechSeminarDiagramComposition`은 `@remotion/player` 안에서 `useCurrentFrame()`을 읽어
 *   프레임 단위 단계 하이라이트·데이터 흐름 화살표·발표자 한 줄 요약을 렌더링한다.
 * - `TechSeminarDiagramFrameView`는 동일한 순수 프레임을 외부 상태(정적 미리보기·오류 폴백·
 *   `prefers-reduced-motion` 스냅샷·Vitest 프레임 단위 검증)에서도 그대로 재사용한다.
 */

import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import {
  SEMINAR_CHAPTER_DURATION_FRAMES,
  SEMINAR_REMOTION_FPS,
  SEMINAR_TOTAL_DURATION_FRAMES,
  TECH_SEMINAR_MOTION_CHAPTERS,
  clampSeminarFrame,
  formatSeminarTimestamp,
  seminarChapterAtFrame,
  seminarStageIndexInChapter,
  seminarStageProgress,
} from "./tech-seminar-remotion-data";

export type TechSeminarDiagramCompositionProps = {
  readonly reducedMotion: boolean;
  readonly showPresenterBar: boolean;
};

export type TechSeminarDiagramFrameViewProps = TechSeminarDiagramCompositionProps & {
  readonly frame: number;
  readonly fps: number;
};

/** Calm Atelier 프로젝터/화면 공유용 고대비 스튜디오 보드 팔레트(보라·네온 금지). */
const STAGE_PALETTE = Object.freeze({
  bg: "#161513",
  bgGrid: "rgba(245, 240, 232, 0.045)",
  panel: "#211f1b",
  card: "#272420",
  cardBorder: "rgba(245, 240, 232, 0.14)",
  ink: "#f7f3ec",
  inkMuted: "#c8c0b4",
  inkSubtle: "#9e9588",
  arrowMuted: "rgba(200, 192, 180, 0.42)",
  trackBg: "rgba(245, 240, 232, 0.12)",
  presenterBg: "rgba(18, 17, 15, 0.94)",
});

const CARD_X_POSITIONS = [48, 356, 664, 972] as const;
const CARD_WIDTH = 260;
const CARD_Y = 188;
const CARD_HEIGHT = 276;
const ARROW_Y = CARD_Y + 114;

/** 프레임 번호만으로 결정론적 1280×720 도식 장면을 그리는 순수 뷰. */
function TechSeminarDiagramFrameView({
  frame,
  fps,
  reducedMotion,
  showPresenterBar,
}: TechSeminarDiagramFrameViewProps) {
  const safeFrame = clampSeminarFrame(frame);
  const safeFps = fps > 0 ? fps : SEMINAR_REMOTION_FPS;
  const chapter = seminarChapterAtFrame(safeFrame);
  const localFrame = safeFrame - chapter.startFrame;
  const activeStageIndex = seminarStageIndexInChapter(localFrame, chapter.stages.length);
  const stageProgress = seminarStageProgress(localFrame, chapter.stages.length);
  const chapterProgress = Math.min(1, Math.max(0, localFrame / SEMINAR_CHAPTER_DURATION_FRAMES));

  const titleOpacity = reducedMotion
    ? 1
    : interpolate(localFrame, [0, 14], [0.25, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleTranslateY = reducedMotion
    ? 0
    : interpolate(localFrame, [0, 14], [10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const activeStage = chapter.stages[activeStageIndex] ?? chapter.stages[0];

  return (
    <div
      data-seminar-remotion-frame={safeFrame}
      data-seminar-chapter-id={chapter.id}
      data-seminar-stage-index={activeStageIndex}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: STAGE_PALETTE.bg,
        backgroundImage: `linear-gradient(to right, ${STAGE_PALETTE.bgGrid} 1px, transparent 1px), linear-gradient(to bottom, ${STAGE_PALETTE.bgGrid} 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
        color: STAGE_PALETTE.ink,
        fontFamily:
          '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* 상단 챕터 헤더 + 진행 표시줄 */}
      <div
        style={{
          position: "absolute",
          top: 30,
          left: 48,
          right: 48,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 24,
          opacity: titleOpacity,
          transform: `translateY(${titleTranslateY}px)`,
        }}
      >
        <div style={{ maxWidth: 880 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "5px 12px",
                borderRadius: 999,
                backgroundColor: chapter.accentSoftHex,
                border: `1.5px solid ${chapter.accentHex}`,
                color: chapter.accentHex,
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: "0.04em",
              }}
            >
              CHAPTER 0{chapter.order} / 0{TECH_SEMINAR_MOTION_CHAPTERS.length} · {chapter.shortLabel}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "5px 12px",
                borderRadius: 999,
                backgroundColor: STAGE_PALETTE.panel,
                border: `1px solid ${STAGE_PALETTE.cardBorder}`,
                color: STAGE_PALETTE.inkMuted,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {chapter.invariantBadge}
            </span>
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              wordBreak: "keep-all",
              color: STAGE_PALETTE.ink,
            }}
          >
            {chapter.title}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 16,
              fontWeight: 500,
              color: STAGE_PALETTE.inkMuted,
              lineHeight: 1.4,
            }}
          >
            {chapter.subtitle}
          </div>
        </div>

        {/* 우측 상단 타임코드 + 5챕터 진행 점 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 10,
              backgroundColor: STAGE_PALETTE.panel,
              border: `1px solid ${STAGE_PALETTE.cardBorder}`,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 17,
              fontWeight: 700,
              color: STAGE_PALETTE.ink,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatSeminarTimestamp(safeFrame, safeFps)} /{" "}
            {formatSeminarTimestamp(SEMINAR_TOTAL_DURATION_FRAMES - 1, safeFps)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {TECH_SEMINAR_MOTION_CHAPTERS.map((item) => {
              const isCurrent = item.id === chapter.id;
              const isPast = item.order < chapter.order;
              return (
                <div
                  key={item.id}
                  style={{
                    width: isCurrent ? 34 : 12,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: isCurrent
                      ? item.accentHex
                      : isPast
                        ? "rgba(247, 243, 236, 0.55)"
                        : "rgba(247, 243, 236, 0.16)",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* 중앙 4단계 아키텍처 파이프라인 SVG + 데이터 흐름 화살표 */}
      <svg
        width={1280}
        height={720}
        viewBox="0 0 1280 720"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        aria-hidden="true"
      >
        <defs>
          <marker
            id={`seminar-arrow-${chapter.id}`}
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 1.5 L 10 6 L 0 10.5 z" fill={chapter.accentHex} />
          </marker>
          <marker
            id={`seminar-arrow-muted-${chapter.id}`}
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 1.5 L 10 6 L 0 10.5 z" fill={STAGE_PALETTE.arrowMuted} />
          </marker>
        </defs>

        {/* 단계 간 화살표 3개 (0→1, 1→2, 2→3) */}
        {[0, 1, 2].map((edgeIndex) => {
          const fromX = CARD_X_POSITIONS[edgeIndex] + CARD_WIDTH + 4;
          const toX = CARD_X_POSITIONS[edgeIndex + 1] - 6;
          const isReached = activeStageIndex > edgeIndex;
          const isFlowing = activeStageIndex === edgeIndex;
          const packetT = reducedMotion ? 0.5 : stageProgress;
          const packetX = fromX + (toX - fromX) * packetT;
          const labelX = (fromX + toX) / 2;
          const edgeLabel = chapter.stages[edgeIndex]?.arrowLabel ?? "";

          return (
            <g key={edgeIndex}>
              <line
                x1={fromX}
                y1={ARROW_Y}
                x2={toX}
                y2={ARROW_Y}
                stroke={isReached || isFlowing ? chapter.accentHex : "rgba(200, 192, 180, 0.35)"}
                strokeWidth={isFlowing ? 3.5 : 2.5}
                strokeDasharray={isFlowing && !reducedMotion ? "7 5" : undefined}
                markerEnd={
                  isReached || isFlowing
                    ? `url(#seminar-arrow-${chapter.id})`
                    : `url(#seminar-arrow-muted-${chapter.id})`
                }
              />
              {isFlowing ? (
                <circle
                  cx={packetX}
                  cy={ARROW_Y}
                  r={reducedMotion ? 5 : 6.5}
                  fill={chapter.accentHex}
                  stroke={STAGE_PALETTE.bg}
                  strokeWidth={2}
                />
              ) : null}
              <text
                x={labelX}
                y={ARROW_Y + 26}
                textAnchor="middle"
                fill={isFlowing ? chapter.accentHex : STAGE_PALETTE.inkSubtle}
                fontSize={11.5}
                fontWeight={isFlowing ? 700 : 500}
              >
                {edgeLabel.length > 22 ? `${edgeLabel.slice(0, 21)}…` : edgeLabel}
              </text>
            </g>
          );
        })}

        {/* 하단 전체 챕터 진행 트랙 */}
        <rect x={48} y={502} width={1184} height={5} rx={3} fill={STAGE_PALETTE.trackBg} />
        <rect
          x={48}
          y={502}
          width={Math.max(12, 1184 * chapterProgress)}
          height={5}
          rx={3}
          fill={chapter.accentHex}
        />
      </svg>

      {/* 4단계 카드 본체 */}
      {chapter.stages.map((stage, stageIndex) => {
        const isActive = stageIndex === activeStageIndex;
        const isCompleted = stageIndex < activeStageIndex;
        const localStageFrame = Math.max(0, localFrame - stageIndex * 90);
        const popScale =
          reducedMotion || !isActive
            ? 1
            : 1 +
              0.03 *
                spring({
                  frame: localStageFrame,
                  fps: safeFps,
                  config: { damping: 16, stiffness: 180, mass: 0.7 },
                });

        return (
          <div
            key={stage.id}
            data-stage-active={isActive ? "true" : "false"}
            style={{
              position: "absolute",
              left: CARD_X_POSITIONS[stageIndex],
              top: CARD_Y,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              borderRadius: 20,
              padding: "18px 18px 16px",
              boxSizing: "border-box",
              backgroundColor: isActive ? "#2e2a24" : STAGE_PALETTE.card,
              border: isActive
                ? `2.5px solid ${chapter.accentHex}`
                : isCompleted
                  ? `1.5px solid rgba(247, 243, 236, 0.34)`
                  : `1.5px solid ${STAGE_PALETTE.cardBorder}`,
              boxShadow: isActive ? `0 16px 36px rgba(0, 0, 0, 0.42)` : "none",
              opacity: isActive ? 1 : isCompleted ? 0.9 : 0.64,
              transform: `scale(${popScale.toFixed(4)})`,
              transformOrigin: "center center",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: isActive ? chapter.accentHex : STAGE_PALETTE.inkSubtle,
                    letterSpacing: "0.02em",
                  }}
                >
                  {stage.role}
                </span>
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: 8,
                    backgroundColor: isActive ? chapter.accentSoftHex : "rgba(247, 243, 236, 0.08)",
                    color: isActive ? chapter.accentHex : STAGE_PALETTE.inkMuted,
                    fontSize: 12,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {stage.metric}
                </span>
              </div>

              <div
                style={{
                  marginTop: 12,
                  fontSize: 19,
                  fontWeight: 900,
                  lineHeight: 1.3,
                  color: STAGE_PALETTE.ink,
                  wordBreak: "keep-all",
                }}
              >
                {stage.label}
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: STAGE_PALETTE.inkMuted,
                  wordBreak: "keep-all",
                }}
              >
                {stage.speakerCue}
              </div>
            </div>

            <div>
              <div
                style={{
                  padding: "7px 10px",
                  borderRadius: 10,
                  backgroundColor: "rgba(12, 11, 10, 0.65)",
                  border: `1px solid ${STAGE_PALETTE.cardBorder}`,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 11.5,
                  color: isActive ? chapter.accentHex : STAGE_PALETTE.inkMuted,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {stage.codeRef}
              </div>
              <div
                style={{
                  marginTop: 10,
                  height: 4,
                  borderRadius: 99,
                  backgroundColor: "rgba(247, 243, 236, 0.1)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: isCompleted ? "100%" : isActive ? `${Math.round(stageProgress * 100)}%` : "0%",
                    height: "100%",
                    backgroundColor: chapter.accentHex,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* 하단 발표자 한 줄 요약 & 근거 경로 바 */}
      {showPresenterBar ? (
        <div
          data-seminar-presenter-bar="true"
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            bottom: 28,
            padding: "18px 24px",
            borderRadius: 18,
            backgroundColor: STAGE_PALETTE.presenterBg,
            border: `1.5px solid ${chapter.accentHex}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  padding: "3px 9px",
                  borderRadius: 6,
                  backgroundColor: chapter.accentHex,
                  color: "#141210",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                발표 한 줄 요약
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: chapter.accentHex }}>
                지금 강조: {activeStage.label}
              </span>
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                lineHeight: 1.4,
                color: STAGE_PALETTE.ink,
                wordBreak: "keep-all",
              }}
            >
              {chapter.presenterOneLiner}
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              maxWidth: 370,
              padding: "10px 14px",
              borderRadius: 12,
              backgroundColor: STAGE_PALETTE.panel,
              border: `1px solid ${STAGE_PALETTE.cardBorder}`,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 12,
              lineHeight: 1.55,
              color: STAGE_PALETTE.inkMuted,
            }}
          >
            <div style={{ color: STAGE_PALETTE.inkSubtle, fontWeight: 700, marginBottom: 3 }}>
              실제 구현 근거 ({chapter.sourcePaths.length}개 파일)
            </div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {chapter.sourcePaths[0]}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** `@remotion/player`가 마운트하는 최상위 Remotion 컴포지션. */
export function TechSeminarDiagramComposition({
  reducedMotion,
  showPresenterBar,
}: TechSeminarDiagramCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <TechSeminarDiagramFrameView
        frame={frame}
        fps={fps}
        reducedMotion={reducedMotion}
        showPresenterBar={showPresenterBar}
      />
    </AbsoluteFill>
  );
}
