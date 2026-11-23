import { Shuffle } from "lucide-react";
import { useId } from "react";

import {
  CROWD_SCENE_IDS,
  CROWD_SCENE_LABELS,
  CUT_MOOD_IDS,
  CUT_MOOD_LABELS,
  pickLocaleText,
  type BilingualLabel,
  type CreatorReliefLocale,
  type CrowdSceneId,
  type CutCompositionCard,
  type CutMoodId,
  type PerspectiveCrowdResult,
} from "./creator-relief-engine";

function t(locale: CreatorReliefLocale, ko: string, en: string): string {
  return locale === "ko" ? ko : en;
}

/* ============================================================================
 * 탭 1: 빈 캔버스 막힘 해소 — 3종 실전 구도 추천 뷰
 * ============================================================================ */

export interface CutCompositionTabProps {
  readonly locale: CreatorReliefLocale;
  readonly dialogue: string;
  readonly mood: CutMoodId;
  readonly cards: readonly [CutCompositionCard, CutCompositionCard, CutCompositionCard];
  readonly selectedIndex: 0 | 1 | 2;
  readonly onDialogueChange: (value: string) => void;
  readonly onMoodChange: (mood: CutMoodId) => void;
  readonly onSelectIndex: (index: 0 | 1 | 2) => void;
}

const DIALOGUE_SAMPLES: readonly { readonly mood: CutMoodId; readonly line: BilingualLabel }[] = [
  {
    mood: "shock",
    line: {
      ko: "잠깐… 그 봉인을 네가 열었다고?!",
      en: "Wait... you were the one who broke that seal?!",
    },
  },
  {
    mood: "romance",
    line: {
      ko: "이번 생에선, 절대 네 손을 놓지 않을게.",
      en: "In this life, I will never let go of your hand.",
    },
  },
  {
    mood: "action",
    line: {
      ko: "지금이야! 정면 돌파한다!",
      en: "Now! Breaking straight through the front line!",
    },
  },
];

export function CutCompositionTabView({
  locale,
  dialogue,
  mood,
  cards,
  selectedIndex,
  onDialogueChange,
  onMoodChange,
  onSelectIndex,
}: CutCompositionTabProps) {
  const inputId = useId();

  return (
    <div className="cra-section" data-testid="cra-panel-composition">
      <div className="cra-controls-row">
        <div className="cra-field">
          <label className="cra-label" htmlFor={inputId}>
            <span>{t(locale, "대사 1줄 입력", "One-Line Dialogue")}</span>
            <span className="cra-label-muted cra-num">
              {dialogue.trim().length} {t(locale, "자", "chars")}
            </span>
          </label>
          <input
            id={inputId}
            type="text"
            className="cra-input"
            data-testid="cra-dialogue-input"
            value={dialogue}
            placeholder={t(
              locale,
              "예: 잠깐… 그 봉인을 네가 열었다고?!",
              "e.g., Wait... you were the one who broke that seal?!",
            )}
            onChange={(event) => onDialogueChange(event.target.value)}
          />
        </div>
      </div>

      <div
        className="cra-controls-row"
        role="group"
        aria-label={t(locale, "장면 감정 선택", "Scene Mood")}
      >
        {CUT_MOOD_IDS.map((moodId) => (
          <button
            key={moodId}
            type="button"
            className="cra-chip"
            data-testid={`cra-mood-${moodId}`}
            aria-pressed={mood === moodId}
            onClick={() => onMoodChange(moodId)}
          >
            {pickLocaleText(CUT_MOOD_LABELS[moodId], locale)}
          </button>
        ))}
      </div>

      <div className="cra-controls-row">
        <span className="cra-label-muted">{t(locale, "빠른 예시:", "Quick samples:")}</span>
        {DIALOGUE_SAMPLES.map((sample, idx) => (
          <button
            key={sample.mood}
            type="button"
            className="cra-preset-btn"
            data-testid={`cra-dialogue-sample-${idx}`}
            onClick={() => {
              onMoodChange(sample.mood);
              onDialogueChange(pickLocaleText(sample.line, locale));
            }}
          >
            {pickLocaleText(CUT_MOOD_LABELS[sample.mood], locale)}
          </button>
        ))}
      </div>

      <div className="cra-comp-grid">
        {cards.map((card) => {
          const isSelected = card.variantIndex === selectedIndex;
          const wf = card.wireframe;
          const bx = (card.balloonAnchor.x / 100) * wf.viewBoxWidth;
          const by = (card.balloonAnchor.y / 100) * wf.viewBoxHeight;
          const fx = (wf.focalPoint.x / 100) * wf.viewBoxWidth;
          const fy = (wf.focalPoint.y / 100) * wf.viewBoxHeight;

          return (
            <article
              key={card.id}
              className="cra-comp-card"
              data-selected={isSelected}
              data-testid={`cra-comp-card-${card.variantIndex}`}
            >
              <div className="cra-controls-row">
                <span className="cra-badge" data-tone={isSelected ? "good" : undefined}>
                  {card.shotSize}
                </span>
                <span className="cra-label-muted">
                  {pickLocaleText(card.cameraAngleLabel, locale)}
                </span>
              </div>

              <div className="cra-svg-frame">
                <svg
                  className="cra-comp-svg"
                  viewBox={`0 0 ${wf.viewBoxWidth} ${wf.viewBoxHeight}`}
                  role="img"
                  aria-label={pickLocaleText(card.title, locale)}
                >
                  <rect
                    x="1"
                    y="1"
                    width={wf.viewBoxWidth - 2}
                    height={wf.viewBoxHeight - 2}
                    rx="4"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.4"
                    strokeWidth="1"
                  />
                  <line
                    x1={wf.ruleOfThirdsX[0]}
                    y1="0"
                    x2={wf.ruleOfThirdsX[0]}
                    y2={wf.viewBoxHeight}
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeDasharray="2 2"
                  />
                  <line
                    x1={wf.ruleOfThirdsX[1]}
                    y1="0"
                    x2={wf.ruleOfThirdsX[1]}
                    y2={wf.viewBoxHeight}
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeDasharray="2 2"
                  />
                  <line
                    x1="0"
                    y1={wf.ruleOfThirdsY[0]}
                    x2={wf.viewBoxWidth}
                    y2={wf.ruleOfThirdsY[0]}
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeDasharray="2 2"
                  />
                  <line
                    x1="0"
                    y1={wf.ruleOfThirdsY[1]}
                    x2={wf.viewBoxWidth}
                    y2={wf.ruleOfThirdsY[1]}
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeDasharray="2 2"
                  />
                  <g
                    transform={`rotate(${wf.dutchAngleDeg} ${wf.viewBoxWidth / 2} ${wf.viewBoxHeight / 2})`}
                  >
                    <line
                      x1="-12"
                      y1={wf.horizonY}
                      x2={wf.viewBoxWidth + 12}
                      y2={wf.horizonY}
                      stroke="currentColor"
                      strokeOpacity="0.3"
                      strokeDasharray="4 3"
                    />
                    {wf.speedLines.map((seg, lineIdx) => (
                      <line
                        key={`${card.id}-sl-${lineIdx}`}
                        x1={seg.x1}
                        y1={seg.y1}
                        x2={seg.x2}
                        y2={seg.y2}
                        stroke="currentColor"
                        strokeOpacity="0.22"
                        strokeWidth="0.7"
                      />
                    ))}
                    {wf.figures.map((fig, figIdx) => (
                      <g
                        key={`${card.id}-fig-${figIdx}`}
                        opacity={fig.role === "primary" ? 0.9 : 0.45}
                      >
                        <path
                          d={fig.shoulderPath}
                          fill="currentColor"
                          fillOpacity="0.22"
                          stroke="currentColor"
                          strokeWidth="1.1"
                        />
                        <circle
                          cx={fig.headCx}
                          cy={fig.headCy}
                          r={fig.headR}
                          fill="currentColor"
                          fillOpacity="0.12"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                        <line
                          x1={fig.headCx}
                          y1={fig.headCy}
                          x2={fig.headCx + fig.gazeDx}
                          y2={fig.headCy + fig.gazeDy}
                          stroke="currentColor"
                          strokeOpacity="0.55"
                          strokeWidth="0.9"
                          strokeDasharray="2 1.5"
                        />
                      </g>
                    ))}
                  </g>
                  <circle
                    cx={fx}
                    cy={fy}
                    r={wf.focalRingRadius}
                    fill="none"
                    stroke="var(--cra-accent)"
                    strokeWidth="1.2"
                    strokeDasharray="2.5 2"
                  />
                  <ellipse
                    cx={bx}
                    cy={by}
                    rx="18"
                    ry="10"
                    fill="var(--color-panel)"
                    fillOpacity="0.88"
                    stroke="var(--cra-good)"
                    strokeWidth="1.25"
                    strokeDasharray={card.recommendedBalloonStyle === "thought" ? "3 2" : undefined}
                  />
                </svg>
              </div>

              <h3 className="cra-comp-title">{pickLocaleText(card.title, locale)}</h3>
              <p className="cra-comp-desc">{pickLocaleText(card.rationale, locale)}</p>

              <div className="cra-comp-meta cra-num">
                <span>
                  {t(locale, "3분할 앵커", "Thirds")}:{" "}
                  <strong>
                    {card.thirdsAnchor.x}%, {card.thirdsAnchor.y}%
                  </strong>
                </span>
                <span>
                  {t(locale, "말풍선", "Balloon")}:{" "}
                  <strong>
                    {card.balloonAnchor.x}%, {card.balloonAnchor.y}%
                  </strong>
                </span>
                <span>
                  {t(locale, "컷 여백", "Gutter")}: <strong>{card.gutterPx}px</strong>
                </span>
                <span>
                  {t(locale, "체류 호흡", "Beat")}: <strong>{card.pacingBeatSec}s</strong>
                </span>
              </div>

              <button
                type="button"
                className={isSelected ? "cra-btn cra-btn-primary" : "cra-btn"}
                data-testid={`cra-select-comp-${card.variantIndex}`}
                aria-pressed={isSelected}
                onClick={() => onSelectIndex(card.variantIndex)}
              >
                {isSelected
                  ? t(locale, "내보내기 대상 선택됨", "Selected for Export")
                  : t(locale, "이 구도 선택", "Select Cut")}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
 * 탭 2: 배경 군중/엑스트라 1클릭 생성 뷰
 * ============================================================================ */

export interface PerspectiveCrowdTabProps {
  readonly locale: CreatorReliefLocale;
  readonly scene: CrowdSceneId;
  readonly count: number;
  readonly horizonPct: number;
  readonly seed: number;
  readonly result: PerspectiveCrowdResult;
  readonly onSceneChange: (scene: CrowdSceneId) => void;
  readonly onCountChange: (count: number) => void;
  readonly onHorizonChange: (horizonPct: number) => void;
  readonly onReshuffleSeed: () => void;
}

export function PerspectiveCrowdTabView({
  locale,
  scene,
  count,
  horizonPct,
  seed,
  result,
  onSceneChange,
  onCountChange,
  onHorizonChange,
  onReshuffleSeed,
}: PerspectiveCrowdTabProps) {
  const countSliderId = useId();
  const horizonSliderId = useId();
  const minScale = result.silhouettes[0]?.scale ?? 0;
  const maxScale = result.silhouettes[result.silhouettes.length - 1]?.scale ?? 0;

  return (
    <div className="cra-section" data-testid="cra-panel-crowd">
      <div
        className="cra-controls-row"
        role="group"
        aria-label={t(locale, "배경 장면 선택", "Background Scene")}
      >
        {CROWD_SCENE_IDS.map((sceneId) => (
          <button
            key={sceneId}
            type="button"
            className="cra-chip"
            data-testid={`cra-scene-${sceneId}`}
            aria-pressed={scene === sceneId}
            onClick={() => onSceneChange(sceneId)}
          >
            {pickLocaleText(CROWD_SCENE_LABELS[sceneId], locale)}
          </button>
        ))}

        <button
          type="button"
          className="cra-btn"
          data-testid="cra-crowd-reshuffle"
          onClick={onReshuffleSeed}
        >
          <Shuffle size={15} aria-hidden="true" />
          <span>{t(locale, "배치 다시 섞기", "Reshuffle Layout")}</span>
        </button>
      </div>

      <div className="cra-controls-row">
        <div className="cra-field">
          <label className="cra-label" htmlFor={countSliderId}>
            <span>{t(locale, "엑스트라 인원 수", "Extra Count")}</span>
            <span className="cra-num">
              {count} {t(locale, "명", "figures")}
            </span>
          </label>
          <input
            id={countSliderId}
            type="range"
            className="cra-range"
            data-testid="cra-crowd-count-slider"
            min={3}
            max={24}
            step={1}
            value={count}
            onChange={(event) => onCountChange(Number(event.target.value))}
          />
        </div>

        <div className="cra-field">
          <label className="cra-label" htmlFor={horizonSliderId}>
            <span>{t(locale, "소실점 눈높이(지평선)", "Horizon Line")}</span>
            <span className="cra-num">{horizonPct}%</span>
          </label>
          <input
            id={horizonSliderId}
            type="range"
            className="cra-range"
            data-testid="cra-crowd-horizon-slider"
            min={15}
            max={85}
            step={1}
            value={horizonPct}
            onChange={(event) => onHorizonChange(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="cra-crowd-stage">
        <svg
          className="cra-crowd-svg"
          data-testid="cra-crowd-svg"
          viewBox={`0 0 ${result.viewBoxWidth} ${result.viewBoxHeight}`}
          role="img"
          aria-label={t(
            locale,
            `${pickLocaleText(CROWD_SCENE_LABELS[scene], "ko")} 원근 군중 실루엣 ${result.count}명`,
            `${pickLocaleText(CROWD_SCENE_LABELS[scene], "en")} perspective crowd of ${result.count} figures`,
          )}
        >
          {result.perspectiveGuides.map((guide, idx) => (
            <line
              key={`guide-${idx}`}
              x1={guide.x1}
              y1={guide.y1}
              x2={guide.x2}
              y2={guide.y2}
              stroke="currentColor"
              strokeOpacity={idx === 0 ? 0.34 : 0.16}
              strokeDasharray="3 3"
              strokeWidth={idx === 0 ? 1 : 0.8}
            />
          ))}
          <circle
            cx={(result.vanishingPoint.x / 100) * result.viewBoxWidth}
            cy={(result.vanishingPoint.y / 100) * result.viewBoxHeight}
            r="3"
            fill="var(--cra-accent)"
          />
          {result.silhouettes.map((person) => (
            <g key={person.id} opacity={person.opacity}>
              <path d={person.bodyPath} fill="currentColor" />
              <circle cx={person.headCx} cy={person.headCy} r={person.headR} fill="currentColor" />
              {person.propPath ? (
                <path d={person.propPath} fill="var(--cra-cool)" fillOpacity="0.68" />
              ) : null}
            </g>
          ))}
        </svg>
      </div>

      <div className="cra-metrics-strip cra-num">
        <div className="cra-metric-box">
          <span className="cra-metric-label">{t(locale, "생성 인원", "Generated")}</span>
          <span className="cra-metric-value">
            {result.count} {t(locale, "명", "extras")}
          </span>
        </div>
        <div className="cra-metric-box">
          <span className="cra-metric-label">{t(locale, "원근 스케일 (원→근)", "Depth Scale")}</span>
          <span className="cra-metric-value">
            {minScale.toFixed(2)}× → {maxScale.toFixed(2)}×
          </span>
        </div>
        <div className="cra-metric-box">
          <span className="cra-metric-label">{t(locale, "소실점 (VP)", "Vanishing Point")}</span>
          <span className="cra-metric-value">
            {result.vanishingPoint.x}%, {result.vanishingPoint.y}%
          </span>
        </div>
        <div className="cra-metric-box">
          <span className="cra-metric-label">{t(locale, "결정론 시드", "Seed")}</span>
          <span className="cra-metric-value">#{seed}</span>
        </div>
      </div>
    </div>
  );
}
