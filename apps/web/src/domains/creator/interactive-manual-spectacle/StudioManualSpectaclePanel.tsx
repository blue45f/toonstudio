import "./interactive-manual-spectacle.css";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_IP_VALUATION_INPUT,
  InteractiveManualEngine,
  MANUAL_COLOR_TONES,
  MANUAL_STEP_DEFINITIONS,
  StudioSpectacleThemeEngine,
  evaluateWebtoonIpValuation,
  formatOklch,
  searchManualRecipes,
  type AtelierGenreThemeId,
  type CanvasStrokePoint,
  type ManualPracticeSnapshot,
  type ManualRecipeContext,
  type SecondaryExpansionId,
  type WebtoonIpValuationInput,
} from "./interactive-manual-and-ip-valuation-engine";
import { StudioIpValuationSection } from "./StudioIpValuationSection";
import { StudioSpectacleShowcaseSection } from "./StudioSpectacleShowcaseSection";

const RECIPE_CONTEXT_OPTIONS: readonly {
  readonly id: ManualRecipeContext;
  readonly label: string;
}[] = [
  { id: "all", label: "전체 레시피" },
  { id: "canvas", label: "드로잉" },
  { id: "color", label: "채색" },
  { id: "lettering", label: "식자·말풍선" },
  { id: "scene3d", label: "3D 배경" },
  { id: "theme", label: "무드 테마" },
  { id: "ip", label: "IP 평가" },
];

const SAMPLE_PRACTICE_STROKE: readonly CanvasStrokePoint[] = [
  { x: 56, y: 146 },
  { x: 88, y: 86 },
  { x: 132, y: 58 },
  { x: 174, y: 84 },
  { x: 192, y: 144 },
];

const themeEngine = new StudioSpectacleThemeEngine();

function detectReducedMotionPreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function strokePointsToSvgPath(points: readonly CanvasStrokePoint[]): string {
  if (points.length === 0) return "";
  return points.map((pt, index) => `${index === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
}

/**
 * 3분 인터랙티브 실습 매뉴얼 · OKLCH 프리즘 비포/애프터 쇼케이스 ·
 * 4대 장르 아틀리에 무드 테마 · IP 디지털 자산 시장 가치 시뮬레이터 통합 패널.
 */
export function StudioManualSpectaclePanel() {
  const [themeId, setThemeId] = useState<AtelierGenreThemeId>("rofan-cream-gold");
  const [curtainPercent, setCurtainPercent] = useState<number>(50);
  const [reducedMotionOverride, setReducedMotionOverride] = useState<boolean>(
    detectReducedMotionPreference,
  );
  const [manualSnapshot, setManualSnapshot] = useState<ManualPracticeSnapshot>(() =>
    new InteractiveManualEngine().getSnapshot(),
  );
  const [selectedToneId, setSelectedToneId] = useState<string>(MANUAL_COLOR_TONES[0]!.id);
  const [dialogueText, setDialogueText] = useState<string>("오늘 원고, 3분 만에 시작해 볼까?");
  const [draftPoints, setDraftPoints] = useState<readonly CanvasStrokePoint[]>([]);
  const [recipeQuery, setRecipeQuery] = useState<string>("");
  const [recipeContext, setRecipeContext] = useState<ManualRecipeContext>("all");
  const [valuationInput, setValuationInput] = useState<WebtoonIpValuationInput>(
    DEFAULT_IP_VALUATION_INPUT,
  );

  const drawingCanvasRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotionOverride(event.matches);
    };
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  const themes = useMemo(() => themeEngine.listThemes(), []);
  const activeTheme = useMemo(() => themeEngine.getTheme(themeId), [themeId]);
  const themeStyle = useMemo(
    () => themeEngine.toCssVariables(themeId) as CSSProperties,
    [themeId],
  );
  const curtainState = useMemo(
    () => themeEngine.buildCurtainComparison(curtainPercent, themeId),
    [curtainPercent, themeId],
  );
  const achievementPulse = useMemo(
    () =>
      themeEngine.resolveAchievementPulse({
        triggered: manualSnapshot.celebrationTriggered,
        prefersReducedMotion: reducedMotionOverride,
        themeId,
      }),
    [manualSnapshot.celebrationTriggered, reducedMotionOverride, themeId],
  );
  const recipeMatches = useMemo(
    () => searchManualRecipes(recipeQuery, recipeContext),
    [recipeQuery, recipeContext],
  );
  const valuationReport = useMemo(
    () => evaluateWebtoonIpValuation(valuationInput),
    [valuationInput],
  );
  const activeTone = useMemo(
    () =>
      MANUAL_COLOR_TONES.find((tone) => tone.id === manualSnapshot.selectedColorToneId) ??
      MANUAL_COLOR_TONES[0]!,
    [manualSnapshot.selectedColorToneId],
  );

  const toCanvasPoint = (event: ReactPointerEvent<SVGSVGElement>): CanvasStrokePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 160, y: 100 };
    }
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * 320),
      y: Math.round(((event.clientY - rect.top) / rect.height) * 200),
    };
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    drawingCanvasRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraftPoints([toCanvasPoint(event)]);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingCanvasRef.current) return;
    const pt = toCanvasPoint(event);
    setDraftPoints((prev) => [...prev, pt]);
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingCanvasRef.current) return;
    drawingCanvasRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const finalPoints = [...draftPoints, toCanvasPoint(event)];
    setDraftPoints([]);
    const engine = InteractiveManualEngine.fromSnapshot(manualSnapshot);
    setManualSnapshot(engine.recordCanvasStroke(finalPoints).snapshot);
  };

  const handleSampleStroke = () => {
    const engine = InteractiveManualEngine.fromSnapshot(manualSnapshot);
    setManualSnapshot(engine.recordCanvasStroke(SAMPLE_PRACTICE_STROKE).snapshot);
  };

  const handleApplyAutoColor = () => {
    const engine = InteractiveManualEngine.fromSnapshot(manualSnapshot);
    setManualSnapshot(engine.applyOneTapColor(selectedToneId).snapshot);
  };

  const handlePlaceBubble = () => {
    const engine = InteractiveManualEngine.fromSnapshot(manualSnapshot);
    setManualSnapshot(engine.placeSpeechBubble(dialogueText).snapshot);
  };

  const handleResetManual = () => {
    const engine = InteractiveManualEngine.fromSnapshot(manualSnapshot);
    setManualSnapshot(engine.reset().snapshot);
    setDraftPoints([]);
  };

  const handleUpdateValuation = (patch: Partial<WebtoonIpValuationInput>) => {
    setValuationInput((prev) => ({ ...prev, ...patch }));
  };

  const handleToggleExpansion = (id: SecondaryExpansionId) => {
    setValuationInput((prev) => {
      const exists = prev.secondaryExpansions.includes(id);
      const next = exists
        ? prev.secondaryExpansions.filter((item) => item !== id)
        : [...prev.secondaryExpansions, id];
      return { ...prev, secondaryExpansions: next };
    });
  };

  return (
    <section
      className="ims-shell"
      style={themeStyle}
      data-testid="studio-manual-spectacle-panel"
      data-atelier-theme={activeTheme.id}
      aria-label="3분 인터랙티브 스튜디오 매뉴얼과 IP 가치 평가"
    >
      <div className="ims-stack">
        <StudioSpectacleShowcaseSection
          themes={themes}
          activeTheme={activeTheme}
          curtainState={curtainState}
          reducedMotion={reducedMotionOverride}
          onSelectTheme={setThemeId}
          onChangeCurtain={(value) =>
            setCurtainPercent(themeEngine.buildCurtainComparison(value, themeId).positionPercent)
          }
          onToggleReducedMotion={() => setReducedMotionOverride((prev) => !prev)}
        />

        {/* 3분 인터랙티브 실습 캔버스 + 15초 숏폼 레시피·단축키 검색 */}
        <section className="ims-section" aria-labelledby="ims-manual-heading">
          <div className="ims-section-head">
            <div>
              <h3 id="ims-manual-heading" className="ims-section-title">
                3분 인터랙티브 실습 매뉴얼 &amp; 15초 숏폼 레시피
              </h3>
              <p className="ims-section-desc">현재 문맥 팁: {manualSnapshot.contextualTip}</p>
            </div>
            <div className="ims-btn-row">
              <span className="ims-contrast-pill ims-num" data-testid="ims-manual-progress">
                진척률 {manualSnapshot.progressPercent}% · 남은 예상{" "}
                {manualSnapshot.estimatedRemainingSec}초
              </span>
              <button
                type="button"
                className="ims-btn"
                data-testid="ims-manual-reset-btn"
                onClick={handleResetManual}
              >
                실습 초기화
              </button>
            </div>
          </div>

          <div
            className="ims-progress-track"
            role="progressbar"
            aria-label="3분 실습 매뉴얼 진척률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={manualSnapshot.progressPercent}
          >
            <div
              className="ims-progress-fill"
              style={{ width: `${manualSnapshot.progressPercent}%` }}
            />
          </div>

          <ol className="ims-step-list">
            {MANUAL_STEP_DEFINITIONS.map((step) => {
              const done = manualSnapshot.completedStepIds.includes(step.id);
              const active = manualSnapshot.currentStepId === step.id;
              return (
                <li
                  key={step.id}
                  className="ims-step-card"
                  data-testid={`ims-step-${step.id}`}
                  data-status={done ? "done" : active ? "active" : "pending"}
                >
                  <strong>{step.title}</strong>
                  <span className="ims-theme-btn-sub">
                    단축키 <kbd className="ims-kbd">{step.shortcutHint}</kbd> ·{" "}
                    {done ? "완료" : active ? "진행 중" : "대기"}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="ims-two-col">
            <div className="ims-stack" style={{ padding: 0, gap: "0.75rem" }}>
              <div className="ims-canvas-shell">
                <svg
                  viewBox="0 0 320 200"
                  className="ims-practice-svg"
                  data-testid="ims-practice-canvas"
                  role="img"
                  aria-label="3분 체험 실습 캔버스: 드래그하거나 1획 긋기 버튼으로 선을 그릴 수 있습니다"
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                >
                  <rect width="320" height="200" fill={formatOklch(activeTheme.tokens.card)} />
                  <rect
                    x="14"
                    y="14"
                    width="292"
                    height="172"
                    rx="10"
                    fill="none"
                    stroke={formatOklch(activeTheme.tokens.border)}
                    strokeWidth="2"
                  />
                  <path
                    d="M 60 156 C 74 96 106 66 136 66 C 166 66 190 96 198 156 Z"
                    fill={manualSnapshot.autoColorApplied ? activeTone.fillOklch : "none"}
                    stroke={formatOklch(activeTheme.tokens.border)}
                    strokeDasharray={manualSnapshot.autoColorApplied ? undefined : "5 4"}
                    strokeWidth="2"
                  />
                  {manualSnapshot.autoColorApplied ? (
                    <path
                      d="M 136 66 C 166 66 190 96 198 156 L 146 156 C 144 114 140 86 136 66 Z"
                      fill={activeTone.shadowOklch}
                      fillOpacity="0.65"
                    />
                  ) : null}
                  {manualSnapshot.strokes.map((stroke) => (
                    <path
                      key={stroke.id}
                      d={strokePointsToSvgPath(stroke.points)}
                      fill="none"
                      stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {draftPoints.length > 1 ? (
                    <path
                      d={strokePointsToSvgPath(draftPoints)}
                      fill="none"
                      stroke={formatOklch(activeTheme.tokens.accent)}
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {manualSnapshot.speechBubble ? (
                    <g data-testid="ims-canvas-speech-bubble">
                      <rect
                        x={manualSnapshot.speechBubble.x - 84}
                        y={manualSnapshot.speechBubble.y - 24}
                        width="168"
                        height="48"
                        rx="22"
                        fill={formatOklch(activeTheme.tokens.card)}
                        stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                        strokeWidth="2.2"
                      />
                      <polygon
                        points={`${manualSnapshot.speechBubble.x - 36},${manualSnapshot.speechBubble.y + 22} ${manualSnapshot.speechBubble.x - 52},${manualSnapshot.speechBubble.y + 38} ${manualSnapshot.speechBubble.x - 16},${manualSnapshot.speechBubble.y + 22}`}
                        fill={formatOklch(activeTheme.tokens.card)}
                        stroke={formatOklch(activeTheme.tokens.inkPrimary)}
                        strokeWidth="2"
                      />
                      <text
                        x={manualSnapshot.speechBubble.x}
                        y={manualSnapshot.speechBubble.y + 4}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="700"
                        fill={formatOklch(activeTheme.tokens.inkPrimary)}
                      >
                        {manualSnapshot.speechBubble.text.slice(0, 20)}
                      </text>
                    </g>
                  ) : null}
                </svg>
              </div>

              <div className="ims-btn-row">
                <button
                  type="button"
                  className="ims-btn ims-btn-primary"
                  data-testid="ims-step1-stroke-btn"
                  onClick={handleSampleStroke}
                >
                  1단계 · 샘플 1획 긋기 (B)
                </button>
                <button
                  type="button"
                  className="ims-btn"
                  data-testid="ims-step2-color-btn"
                  onClick={handleApplyAutoColor}
                >
                  2단계 · 원탭 자동 채색 (G)
                </button>
              </div>

              <div className="ims-btn-row" role="group" aria-label="원탭 자동 채색 팔레트 톤">
                {MANUAL_COLOR_TONES.map((tone) => (
                  <button
                    key={tone.id}
                    type="button"
                    className={`ims-btn ${selectedToneId === tone.id ? "ims-btn-active" : ""}`}
                    aria-pressed={selectedToneId === tone.id}
                    onClick={() => setSelectedToneId(tone.id)}
                  >
                    <span
                      className="ims-theme-swatch"
                      style={{ backgroundColor: tone.fillOklch }}
                      aria-hidden="true"
                    />
                    <span>{tone.label}</span>
                  </button>
                ))}
              </div>

              <div className="ims-btn-row">
                <label htmlFor="ims-dialogue-input" className="sr-only">
                  말풍선 대사 입력
                </label>
                <input
                  id="ims-dialogue-input"
                  data-testid="ims-dialogue-input"
                  className="ims-input"
                  style={{ flex: "1 1 12rem" }}
                  type="text"
                  maxLength={60}
                  value={dialogueText}
                  placeholder="말풍선에 넣을 대사를 입력하세요"
                  onChange={(event) => setDialogueText(event.target.value)}
                />
                <button
                  type="button"
                  className="ims-btn ims-btn-primary"
                  data-testid="ims-step3-bubble-btn"
                  onClick={handlePlaceBubble}
                >
                  3단계 · 말풍선 배치 · 완주 (T)
                </button>
              </div>

              <p className="ims-status-banner" role="status" data-testid="ims-manual-status">
                {manualSnapshot.statusMessage}
              </p>

              {manualSnapshot.badge ? (
                <div
                  className="ims-achievement-card"
                  role="status"
                  data-testid="ims-completion-badge"
                  data-pulse-mode={achievementPulse.mode}
                  data-pulse-duration-ms={achievementPulse.durationMs}
                >
                  <strong>배지 획득 · {manualSnapshot.badge.title}</strong>
                  <p className="ims-section-desc" style={{ marginTop: "0.25rem" }}>
                    {manualSnapshot.badge.subtitle}
                  </p>
                  <div className="ims-sparkle-row">
                    <span>
                      {achievementPulse.mode === "prism-pulse"
                        ? `1.5초 프리즘 스튜디오 맥박 · 스파클 노드 ${achievementPulse.sparkleNodes}개`
                        : "정적 고대비 완료 배지 (prefers-reduced-motion 준수)"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="ims-stack" style={{ padding: 0, gap: "0.75rem" }}>
              <label htmlFor="ims-recipe-search" className="ims-range-label">
                <span>15초 숏폼 레시피 &amp; 단축키 검색</span>
                <span className="ims-num" data-testid="ims-recipe-count">
                  {recipeMatches.length}건
                </span>
              </label>
              <input
                id="ims-recipe-search"
                data-testid="ims-recipe-search"
                className="ims-input"
                type="search"
                value={recipeQuery}
                placeholder="기능·키워드·단축키 입력 (예: 말풍선, 채색, Ctrl+Z, 3D)"
                onChange={(event) => setRecipeQuery(event.target.value)}
              />

              <div className="ims-btn-row" role="group" aria-label="레시피 문맥 필터">
                {RECIPE_CONTEXT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`ims-btn ${recipeContext === opt.id ? "ims-btn-active" : ""}`}
                    data-testid={`ims-recipe-ctx-${opt.id}`}
                    aria-pressed={recipeContext === opt.id}
                    onClick={() => setRecipeContext(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <ul className="ims-recipe-list" data-testid="ims-recipe-results">
                {recipeMatches.length === 0 ? (
                  <li className="ims-recipe-card">
                    <strong>일치하는 레시피가 없습니다.</strong>
                    <span className="ims-section-desc">
                      &ldquo;선화&rdquo;, &ldquo;채색&rdquo;, &ldquo;말풍선&rdquo;, &ldquo;B&rdquo;,
                      &ldquo;Ctrl+Z&rdquo;처럼 검색해 보세요.
                    </span>
                  </li>
                ) : (
                  recipeMatches.slice(0, 4).map(({ recipe }) => (
                    <li
                      key={recipe.id}
                      className="ims-recipe-card"
                      data-testid={`ims-recipe-${recipe.id}`}
                    >
                      <div className="ims-recipe-head">
                        <strong>{recipe.title}</strong>
                        <span className="ims-num">
                          <kbd className="ims-kbd">{recipe.shortcut}</kbd> · {recipe.durationSec}초
                        </span>
                      </div>
                      <ol className="ims-recipe-steps">
                        {recipe.steps.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ol>
                      <p className="ims-section-desc">문맥 팁: {recipe.proTip}</p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>

        <StudioIpValuationSection
          report={valuationReport}
          onUpdateInput={handleUpdateValuation}
          onToggleExpansion={handleToggleExpansion}
        />
      </div>
    </section>
  );
}
