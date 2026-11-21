import { type PointerEvent as ReactPointerEvent, useRef } from "react";

import {
  formatOklch,
  type AtelierGenreTheme,
  type AtelierGenreThemeId,
  type BeforeAfterCurtainState,
} from "./interactive-manual-and-ip-valuation-engine";

export interface StudioSpectacleShowcaseSectionProps {
  readonly themes: readonly AtelierGenreTheme[];
  readonly activeTheme: AtelierGenreTheme;
  readonly curtainState: BeforeAfterCurtainState;
  readonly reducedMotion: boolean;
  readonly onSelectTheme: (themeId: AtelierGenreThemeId) => void;
  readonly onChangeCurtain: (percent: number) => void;
  readonly onToggleReducedMotion: () => void;
}

/**
 * 4대 장르 아틀리에 OKLCH 무드 스위처 + 프리즘 광택 보더 비포/애프터 드래그 커튼 쇼케이스.
 */
export function StudioSpectacleShowcaseSection({
  themes,
  activeTheme,
  curtainState,
  reducedMotion,
  onSelectTheme,
  onChangeCurtain,
  onToggleReducedMotion,
}: StudioSpectacleShowcaseSectionProps) {
  const curtainStageRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<boolean>(false);

  const updateFromClientX = (clientX: number) => {
    const rect = curtainStageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    onChangeCurtain(((clientX - rect.left) / rect.width) * 100);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromClientX(event.clientX);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <>
      <header className="ims-header">
        <div className="ims-header-top">
          <div>
            <p className="ims-kicker">무과금 ₩0 · 오프라인 결정론 엔진 · WCAG AA 고대비 OKLCH</p>
            <h2 className="ims-title">
              3분 체험 매뉴얼 · 비포/애프터 쇼케이스 · 4대 장르 아틀리에 · IP 가치 평가
            </h2>
            <p className="ims-subtitle">
              선 1획 긋기부터 원탭 채색·말풍선 배치, 러프 콘티 대 3D 풀컬러 비교, 장르별 아틀리에
              무드 전환, 연재 IP 가치 추정까지 한 화면에서 직접 확인하세요.
            </p>
          </div>
          <div className="ims-contrast-pill ims-num" data-testid="ims-theme-contrast-badge">
            <span>{activeTheme.name}</span>
            <span>·</span>
            <span>실측 대비 {activeTheme.contrast.primaryTextRatio}:1 (AA 통과)</span>
          </div>
        </div>

        <div className="ims-theme-grid" role="group" aria-label="4대 장르 아틀리에 무드 테마">
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className="ims-theme-btn"
              data-testid={`ims-theme-${theme.id}`}
              aria-pressed={theme.id === activeTheme.id}
              onClick={() => onSelectTheme(theme.id)}
            >
              <span className="ims-theme-btn-title">
                <span
                  className="ims-theme-swatch"
                  style={{
                    background: `linear-gradient(135deg, ${formatOklch(theme.tokens.bg)} 50%, ${formatOklch(theme.tokens.accent)} 50%)`,
                  }}
                  aria-hidden="true"
                />
                <span>{theme.name}</span>
              </span>
              <span className="ims-theme-btn-sub">
                {theme.genreTag} · 본문 {theme.contrast.primaryTextRatio}:1
              </span>
            </button>
          ))}
        </div>
      </header>

      <section className="ims-section" aria-labelledby="ims-curtain-heading">
        <div className="ims-section-head">
          <div>
            <h3 id="ims-curtain-heading" className="ims-section-title">
              러프 콘티 ↔ 3D·풀컬러 완성 드래그 커튼 쇼케이스
            </h3>
            <p className="ims-section-desc" data-testid="ims-curtain-stage-summary">
              {curtainState.activeStageLabel} — {curtainState.stageSummary}
            </p>
          </div>
          <button
            type="button"
            className={`ims-btn ${reducedMotion ? "ims-btn-active" : ""}`}
            data-testid="ims-reduced-motion-toggle"
            aria-pressed={reducedMotion}
            onClick={onToggleReducedMotion}
          >
            {reducedMotion ? "모션 감쇠 켜짐 (정적 배지)" : "모션 감쇠 끄기 (1.5초 맥박)"}
          </button>
        </div>

        <div className="ims-prism-frame">
          <div
            ref={curtainStageRef}
            className="ims-curtain-stage"
            data-testid="ims-curtain-stage"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* 오른쪽 바탕: 3D·풀컬러 완성 레이어 */}
            <div className="ims-curtain-layer" aria-hidden="true">
              <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="ims-polished-sky" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={formatOklch(activeTheme.tokens.prismStart)} />
                    <stop offset="52%" stopColor={formatOklch(activeTheme.tokens.prismMid)} />
                    <stop offset="100%" stopColor={formatOklch(activeTheme.tokens.prismEnd)} />
                  </linearGradient>
                  <linearGradient id="ims-polished-floor" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={formatOklch(activeTheme.tokens.surface)} />
                    <stop offset="100%" stopColor={formatOklch(activeTheme.tokens.accent)} />
                  </linearGradient>
                </defs>
                <rect width="640" height="360" fill="url(#ims-polished-sky)" />
                <polygon points="0,248 640,248 640,360 0,360" fill="url(#ims-polished-floor)" />
                <polygon
                  points="64,250 184,96 296,120 244,250"
                  fill={formatOklch(activeTheme.tokens.card)}
                  fillOpacity="0.88"
                  stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                  strokeWidth="2.5"
                />
                <polygon
                  points="388,250 456,74 592,102 558,250"
                  fill={formatOklch(activeTheme.tokens.card)}
                  fillOpacity="0.92"
                  stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                  strokeWidth="2.5"
                />
                <circle
                  cx="326"
                  cy="118"
                  r="38"
                  fill={formatOklch(activeTheme.tokens.card)}
                  fillOpacity="0.95"
                />
                <path
                  d="M 274 282 C 282 204 316 174 342 174 C 372 174 398 206 408 282 Z"
                  fill={formatOklch(activeTheme.tokens.accent)}
                  stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                  strokeWidth="3"
                />
                <circle
                  cx="340"
                  cy="148"
                  r="24"
                  fill={formatOklch(activeTheme.tokens.card)}
                  stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                  strokeWidth="3"
                />
              </svg>
            </div>

            {/* 왼쪽 클립: 러프 콘티·투시 가이드 레이어 */}
            <div
              className="ims-curtain-layer"
              data-testid="ims-curtain-before-layer"
              style={{ clipPath: `inset(0 ${curtainState.polishedPercent}% 0 0)` }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">
                <rect width="640" height="360" fill={formatOklch(activeTheme.tokens.card)} />
                <line
                  x1="0"
                  y1="248"
                  x2="640"
                  y2="248"
                  stroke={formatOklch(activeTheme.tokens.border)}
                  strokeDasharray="6 6"
                  strokeWidth="2"
                />
                <line
                  x1="326"
                  y1="118"
                  x2="0"
                  y2="340"
                  stroke={formatOklch(activeTheme.tokens.border)}
                  strokeDasharray="4 6"
                  strokeWidth="1.5"
                />
                <line
                  x1="326"
                  y1="118"
                  x2="640"
                  y2="340"
                  stroke={formatOklch(activeTheme.tokens.border)}
                  strokeDasharray="4 6"
                  strokeWidth="1.5"
                />
                <polygon
                  points="64,250 184,96 296,120 244,250"
                  fill="none"
                  stroke={formatOklch(activeTheme.tokens.inkSecondary)}
                  strokeDasharray="7 4"
                  strokeWidth="2"
                />
                <polygon
                  points="388,250 456,74 592,102 558,250"
                  fill="none"
                  stroke={formatOklch(activeTheme.tokens.inkSecondary)}
                  strokeDasharray="7 4"
                  strokeWidth="2"
                />
                <path
                  d="M 274 282 C 282 204 316 174 342 174 C 372 174 398 206 408 282"
                  fill="none"
                  stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                  strokeDasharray="8 5"
                  strokeWidth="2.5"
                />
                <circle
                  cx="340"
                  cy="148"
                  r="24"
                  fill="none"
                  stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                  strokeDasharray="5 4"
                  strokeWidth="2.2"
                />
              </svg>
            </div>

            <span className="ims-curtain-badge ims-curtain-badge-before">
              러프 콘티 ({curtainState.roughPercent}%)
            </span>
            <span className="ims-curtain-badge ims-curtain-badge-after">
              3D·풀컬러 ({curtainState.polishedPercent}%)
            </span>
            <div
              className="ims-curtain-divider"
              style={{ left: `${curtainState.positionPercent}%` }}
              aria-hidden="true"
            >
              <span className="ims-curtain-knob ims-num">
                {Math.round(curtainState.positionPercent)}%
              </span>
            </div>
          </div>
        </div>

        <div className="ims-curtain-controls">
          <div className="ims-range-wrap">
            <label htmlFor="ims-curtain-slider" className="ims-range-label">
              <span>비포/애프터 커튼 위치</span>
              <span className="ims-num" data-testid="ims-curtain-percent-value">
                {curtainState.positionPercent}%
              </span>
            </label>
            <input
              id="ims-curtain-slider"
              data-testid="ims-curtain-slider"
              className="ims-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={curtainState.positionPercent}
              aria-label="러프 콘티와 3D 풀컬러 비교 커튼 위치"
              onChange={(event) => onChangeCurtain(Number(event.target.value))}
            />
          </div>
          <div className="ims-btn-row" role="group" aria-label="비교 커튼 빠른 프리셋">
            <button type="button" className="ims-btn" onClick={() => onChangeCurtain(15)}>
              풀컬러 중심 (15%)
            </button>
            <button type="button" className="ims-btn" onClick={() => onChangeCurtain(50)}>
              반반 대조 (50%)
            </button>
            <button type="button" className="ims-btn" onClick={() => onChangeCurtain(85)}>
              콘티 중심 (85%)
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
