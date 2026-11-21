import { useId, useMemo, useState } from "react";
import {
  analyzeEpisodeTensionCurve,
  auditReadabilityForDarkAndCvd,
  buildCutReuseBankIndex,
  buildSpoilerFreeRecap,
  computeContrastRatio,
  createCanvasInsertPayload,
  READER_BACKGROUND_PRESETS,
  relativeLuminance,
  searchCutReuseBank,
  simulateColorVision,
  toOklchCss,
  validateBranchingStoryGraph,
  type BranchingStoryGraph,
  type CanvasReuseInsertPayload,
  type ColorVisionMode,
  type ReaderBackgroundPresetId,
  type ReuseAssetCategory,
  type ReuseAssetEmotion,
} from "./a11y-reuse-tension-engine";
import {
  DEFAULT_BRANCHING_GRAPH,
  DEFAULT_CUT_REUSE_BANK,
  DEFAULT_READABILITY_LAYERS,
  DEFAULT_STORY_BIBLE,
  DEFAULT_TENSION_CUTS,
} from "./ip-creative-presets";

const VISION_MODE_LABELS: Readonly<Record<ColorVisionMode, string>> = {
  normal: "일반 시야",
  protanopia: "적색맹 (Protanopia)",
  deuteranopia: "녹색맹 (Deuteranopia)",
  tritanopia: "청황색맹 (Tritanopia)",
};

const CATEGORY_LABELS: Readonly<Record<ReuseAssetCategory | "all", string>> = {
  all: "전체 카테고리",
  expression: "표정",
  hand: "손동작",
  prop: "소품",
};

const EMOTION_LABELS: Readonly<Record<ReuseAssetEmotion | "all", string>> = {
  all: "전체 감정",
  anger: "분노",
  shock: "충격",
  smirk: "비웃음",
  focus: "집중",
  calm: "차분",
  joy: "기쁨",
  sadness: "슬픔",
};

export function ReadabilityAuditTab() {
  const idPrefix = useId();
  const [presetId, setPresetId] = useState<ReaderBackgroundPresetId>("naver-kakao-dark");
  const [visionMode, setVisionMode] = useState<ColorVisionMode>("protanopia");
  const [haloAppliedIds, setHaloAppliedIds] = useState<readonly string[]>([]);

  const effectiveLayers = useMemo(
    () =>
      DEFAULT_READABILITY_LAYERS.map((layer) =>
        haloAppliedIds.includes(layer.id)
          ? { ...layer, hasOuterHalo: true, strokeWidthPx: 3.2 }
          : layer,
      ),
    [haloAppliedIds],
  );

  const report = useMemo(
    () => auditReadabilityForDarkAndCvd(effectiveLayers, presetId),
    [effectiveLayers, presetId],
  );

  const toggleHalo = (layerId: string) => {
    setHaloAppliedIds((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId],
    );
  };

  return (
    <div className="ipce-panel" data-testid="ipce-panel-a11y">
      <div className="ipce-controls-row">
        <div className="ipce-field">
          <label className="ipce-label" htmlFor={`${idPrefix}-bg`}>뷰어 배경 프리셋</label>
          <select
            id={`${idPrefix}-bg`}
            className="ipce-select"
            value={presetId}
            onChange={(event) => setPresetId(event.target.value as ReaderBackgroundPresetId)}
          >
            {READER_BACKGROUND_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.labelKo}
              </option>
            ))}
          </select>
        </div>

        <div className="ipce-field">
          <label className="ipce-label" htmlFor={`${idPrefix}-cvd`}>색각 시뮬레이션 미리보기</label>
          <select
            id={`${idPrefix}-cvd`}
            className="ipce-select"
            value={visionMode}
            onChange={(event) => setVisionMode(event.target.value as ColorVisionMode)}
          >
            {(Object.keys(VISION_MODE_LABELS) as ColorVisionMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {VISION_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="ipce-kpi-row">
        <div className="ipce-kpi">
          <span className="ipce-kpi-label">종합 가독성 등급</span>
          <span className="ipce-kpi-value" data-testid="ipce-a11y-grade">{report.overallGradeKo} ({report.overallScore}점)</span>
        </div>
        <div className="ipce-kpi">
          <span className="ipce-kpi-label">다크 매몰 탐지</span>
          <span className="ipce-kpi-value" data-testid="ipce-a11y-buried">{report.buriedSfxCount}건</span>
        </div>
        <div className="ipce-kpi">
          <span className="ipce-kpi-label">즉시 교정 / 주의</span>
          <span className="ipce-kpi-value">{report.criticalCount}건 / {report.warningCount}건</span>
        </div>
        <div className="ipce-kpi">
          <span className="ipce-kpi-label">배경 상대휘도 (L)</span>
          <span className="ipce-kpi-value">{relativeLuminance(report.preset.rgb).toFixed(4)}</span>
        </div>
      </div>

      <div className="ipce-grid ipce-grid-2">
        {report.items.map((entry) => {
          const simFg = simulateColorVision(entry.item.foreground, visionMode);
          const simBg = simulateColorVision(entry.effectiveBackground, visionMode);
          const simContrast = computeContrastRatio(simFg, simBg);
          const haloApplied = haloAppliedIds.includes(entry.item.id);
          return (
            <article key={entry.item.id} className="ipce-card">
              <div className="ipce-header">
                <h4 className="ipce-card-title">{entry.item.labelKo}</h4>
                <span className="ipce-pill" data-status={entry.severity}>
                  {entry.darkModeBuried ? "다크 매몰 위험" : entry.severity === "pass" ? "통과" : entry.severity === "warning" ? "주의" : "교정 필요"}
                </span>
              </div>

              <div
                className="ipce-preview-swatch"
                style={{
                  background: toOklchCss(simBg),
                  color: toOklchCss(simFg),
                  fontSize: `${Math.min(26, Math.max(14, entry.item.fontSizePx))}px`,
                  textShadow: haloApplied ? entry.haloCorrection.cssTextShadowPreview : "none",
                }}
              >
                {entry.item.labelKo}
              </div>

              <p className="ipce-subtitle">
                일반 대비 <strong>{entry.normalContrast}:1</strong> · 선택 시야({VISION_MODE_LABELS[visionMode]}) <strong>{simContrast}:1</strong> · 최악 색각({entry.worstCvdMode}) <strong>{entry.minCvdContrast}:1</strong>
              </p>
              <p className="ipce-subtitle">{entry.haloCorrection.reasonKo}</p>

              {entry.haloCorrection.recommended || haloApplied ? (
                <div className="ipce-controls-row">
                  <span className="ipce-pill">
                    권장 외곽선 {entry.haloCorrection.strokeWidthPx}px · {entry.haloCorrection.haloColorOklch} · 예상 {entry.haloCorrection.projectedContrast}:1
                  </span>
                  <button
                    type="button"
                    className="ipce-btn"
                    onClick={() => toggleHalo(entry.item.id)}
                  >
                    {haloApplied ? "외곽선 교정 해제" : "자동 밝은 외곽선 적용"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function CutReuseBankTab() {
  const idPrefix = useId();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<ReuseAssetCategory | "all">("all");
  const [emotion, setEmotion] = useState<ReuseAssetEmotion | "all">("all");
  const [characterName, setCharacterName] = useState<string>("all");
  const [lastPayload, setLastPayload] = useState<CanvasReuseInsertPayload | null>(null);

  const index = useMemo(() => buildCutReuseBankIndex(DEFAULT_CUT_REUSE_BANK), []);
  const hits = useMemo(
    () => searchCutReuseBank(index, { keyword, category, emotion, characterName }),
    [index, keyword, category, emotion, characterName],
  );

  return (
    <div className="ipce-panel" data-testid="ipce-panel-reuse">
      <div className="ipce-controls-row">
        <div className="ipce-field">
          <label className="ipce-label" htmlFor={`${idPrefix}-kw`}>표정·손·소품 검색</label>
          <input
            id={`${idPrefix}-kw`}
            className="ipce-input"
            type="search"
            value={keyword}
            placeholder="예: 분노, 검, 14화, 스마트폰"
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div className="ipce-field">
          <label className="ipce-label" htmlFor={`${idPrefix}-cat`}>카테고리</label>
          <select
            id={`${idPrefix}-cat`}
            className="ipce-select"
            value={category}
            onChange={(event) => setCategory(event.target.value as ReuseAssetCategory | "all")}
          >
            {(Object.keys(CATEGORY_LABELS) as (ReuseAssetCategory | "all")[]).map((key) => (
              <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="ipce-field">
          <label className="ipce-label" htmlFor={`${idPrefix}-emo`}>감정 태그</label>
          <select
            id={`${idPrefix}-emo`}
            className="ipce-select"
            value={emotion}
            onChange={(event) => setEmotion(event.target.value as ReuseAssetEmotion | "all")}
          >
            {(Object.keys(EMOTION_LABELS) as (ReuseAssetEmotion | "all")[]).map((key) => (
              <option key={key} value={key}>{EMOTION_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="ipce-field">
          <label className="ipce-label" htmlFor={`${idPrefix}-char`}>캐릭터</label>
          <select
            id={`${idPrefix}-char`}
            className="ipce-select"
            value={characterName}
            onChange={(event) => setCharacterName(event.target.value)}
          >
            <option value="all">전체 캐릭터</option>
            {index.characters.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="ipce-subtitle" role="status">
        인덱싱된 1~100화 자산 {index.totalAssets}건 중 <strong>{hits.length}건</strong> 일치
      </p>

      <div className="ipce-grid ipce-grid-3">
        {hits.map((hit) => (
          <article key={hit.asset.id} className="ipce-card">
            <div className="ipce-header">
              <h4 className="ipce-card-title">{hit.asset.titleKo}</h4>
              <span className="ipce-pill">EP.{hit.asset.episodeNumber}</span>
            </div>
            <p className="ipce-subtitle">
              {hit.asset.characterName} · {CATEGORY_LABELS[hit.asset.category]} · {EMOTION_LABELS[hit.asset.emotion]} · 재사용 {hit.asset.usageCount}회
            </p>
            <button
              type="button"
              className="ipce-btn"
              onClick={() => setLastPayload(createCanvasInsertPayload(hit.asset, { flipHorizontal: false }))}
            >
              1초 캔버스 삽입 페이로드 생성
            </button>
          </article>
        ))}
      </div>

      {lastPayload ? (
        <section className="ipce-card" aria-label="생성된 캔버스 삽입 페이로드" data-testid="ipce-reuse-payload">
          <h4 className="ipce-card-title">
            즉시 삽입 준비 완료 · {lastPayload.targetLayerName} (예상 절감 {lastPayload.estimatedTimeSavedMin}분)
          </h4>
          <pre className="ipce-code">{JSON.stringify(lastPayload, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}

export function StoryTensionBranchTab() {
  const idPrefix = useId();
  const [readUpToEpisode, setReadUpToEpisode] = useState(14);
  const [injectLoopDefect, setInjectLoopDefect] = useState(false);

  const recap = useMemo(
    () => buildSpoilerFreeRecap(DEFAULT_STORY_BIBLE, readUpToEpisode, 30),
    [readUpToEpisode],
  );
  const tension = useMemo(() => analyzeEpisodeTensionCurve(DEFAULT_TENSION_CUTS), []);

  const branchGraph: BranchingStoryGraph = useMemo(() => {
    if (!injectLoopDefect) return DEFAULT_BRANCHING_GRAPH;
    return {
      startNodeId: DEFAULT_BRANCHING_GRAPH.startNodeId,
      nodes: [
        ...DEFAULT_BRANCHING_GRAPH.nodes.map((node) =>
          node.id === "cut-solo"
            ? { ...node, choices: [{ id: "c-loop-back", labelKo: "갈림길로 되돌아간다", targetNodeId: "cut-start" }] }
            : node,
        ),
        { id: "cut-orphan", titleKo: "미연결 비밀 컷", isEnding: false, choices: [] },
      ],
    };
  }, [injectLoopDefect]);

  const branchReport = useMemo(() => validateBranchingStoryGraph(branchGraph), [branchGraph]);

  return (
    <div className="ipce-panel" data-testid="ipce-panel-story">
      <div className="ipce-grid ipce-grid-2">
        <section className="ipce-card" aria-label="무스포일러 캐릭터 관계도 및 30초 요약">
          <h4 className="ipce-card-title">무스포일러 관계도 &amp; 지난 화 30초 요약</h4>
          <div className="ipce-field">
            <label className="ipce-label" htmlFor={`${idPrefix}-ep`}>
              독자 최신 열람 회차: <strong>{readUpToEpisode}화</strong> (미래 스포일러 {recap.redactedCharacterCount + recap.redactedRelationshipCount + recap.redactedBeatCount}건 차단)
            </label>
            <input
              id={`${idPrefix}-ep`}
              className="ipce-input"
              type="range"
              min={1}
              max={30}
              value={readUpToEpisode}
              onChange={(event) => setReadUpToEpisode(Number(event.target.value))}
            />
          </div>

          <ul className="ipce-list" data-testid="ipce-spoiler-free-relations">
            {recap.visibleRelationships.map((rel) => (
              <li key={rel.id} className="ipce-list-item">
                <strong>{rel.labelKo} (EP.{rel.revealedEpisode} 공개)</strong>
                <span>{rel.summaryKo}</span>
              </li>
            ))}
          </ul>

          <p className="ipce-subtitle" data-testid="ipce-recap-budget">
            30초 복습 카드 {recap.recapCards.length}장 · 예상 읽기 <strong>{recap.totalReadSeconds}초</strong> (누출 {recap.spoilerLeakCount}건)
          </p>
          <ul className="ipce-list">
            {recap.recapCards.map((card) => (
              <li key={card.episodeNumber} className="ipce-list-item">
                <strong>{card.headlineKo} ({card.estimatedReadSeconds}초)</strong>
                <span>{card.summaryTextKo}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ipce-card" aria-label="연재 텐션 그래프 및 분기 컷 검증">
          <h4 className="ipce-card-title">
            연재 텐션 곡선 · 클라이맥스 {tension.climaxCutIndex}컷 ({tension.peakTension}점) · 엔딩 훅 {tension.endingHookScore}점
          </h4>
          <div className="ipce-tension-bars" role="img" aria-label="컷별 연재 텐션 막대 그래프">
            {tension.points.map((point) => (
              <div key={point.cutIndex} className="ipce-bar-col">
                <span className="ipce-kpi-label">{point.tensionScore}</span>
                <div className="ipce-bar-track">
                  <div className="ipce-bar-fill" style={{ height: `${point.tensionScore}%` }} />
                </div>
                <span className="ipce-kpi-label">{point.cutIndex}컷</span>
              </div>
            ))}
          </div>
          <ul className="ipce-list">
            {tension.recommendationsKo.map((note) => (
              <li key={note} className="ipce-list-item">{note}</li>
            ))}
          </ul>

          <div className="ipce-header">
            <h4 className="ipce-card-title">독자 참여형 분기 인터랙티브 컷 검증</h4>
            <span className="ipce-pill" data-status={branchReport.isValid ? "pass" : "critical"} data-testid="ipce-branch-status">
              {branchReport.isValid ? "정상 연결" : "결함 탐지"}
            </span>
          </div>
          <p className="ipce-subtitle">{branchReport.summaryKo}</p>
          <button
            type="button"
            className="ipce-btn"
            onClick={() => setInjectLoopDefect((prev) => !prev)}
          >
            {injectLoopDefect ? "정상 분기 그래프로 복원" : "무한 루프·도달 불가 결함 시뮬레이션"}
          </button>
        </section>
      </div>
    </div>
  );
}
