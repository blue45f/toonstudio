import { CheckCircle2, Cpu, Eye, FileCheck2, Film, ShieldAlert, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  applyPreflightAutoFix,
  createDefaultPreflightEpisode,
  getPlatformPublishingSpec,
  PLATFORM_PUBLISHING_SPECS,
  runMultiFormatReflow,
  runPlatformPreflightPackage,
  type EpisodeCutInput,
  type PublishingPlatformId,
} from "./platform-preflight-reflow-engine";
import {
  analyzeReaderRetentionHeatmap,
  computeOklchDeltaE,
  createDefaultOutsourceSubmission,
  evaluateCrashGuardState,
  evaluateOutsourceSampleSubmission,
  issueOutsourceSampleTest,
  MOBILE_READER_VIEWPORT,
  type CrashGuardDeviceClass,
  type OutsourceSampleSubmission,
  type ReaderHandedness,
  type TextureResolutionPx,
} from "./reader-oom-sample-guard-engine";

import "./publishing-preflight-pro.css";

type PreflightSuiteTabId = "preflight" | "reflow" | "reader" | "crash-guard" | "outsource";

interface StudioPublishingPreflightPanelProps {
  readonly projectId?: string;
  readonly seriesTitle?: string;
  readonly episodeNumber?: number;
  readonly initialCuts?: readonly EpisodeCutInput[];
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function verdictBadgeClass(status: "READY" | "NEEDS_FIX" | "BLOCKED" | "HEALTHY" | "WARNING" | "EMERGENCY" | "PASS" | "REVISE" | "HOLD"): string {
  if (status === "READY" || status === "HEALTHY" || status === "PASS") return "ppf-badge ppf-badge-good";
  if (status === "NEEDS_FIX" || status === "WARNING" || status === "REVISE") return "ppf-badge ppf-badge-warn";
  return "ppf-badge ppf-badge-bad";
}

/**
 * 웹툰 출판 프리플라이트 · 멀티포맷 리플로우 · 독자 이탈 예측 · OOM 크래시 가드 · 10분 외주 샘플 검증 관제 패널.
 */
export function StudioPublishingPreflightPanel({
  projectId = "ep-project",
  seriesTitle = "밤의 우편배달부",
  episodeNumber = 12,
  initialCuts,
}: StudioPublishingPreflightPanelProps) {
  const [activeTab, setActiveTab] = useState<PreflightSuiteTabId>("preflight");
  const [platformId, setPlatformId] = useState<PublishingPlatformId>("naver-webtoon");
  const [autoFixApplied, setAutoFixApplied] = useState(false);
  const [showManifestJson, setShowManifestJson] = useState(false);

  // 독자 이탈 시뮬레이터 상태
  const [handedness, setHandedness] = useState<ReaderHandedness>("right");

  // OOM · WebGPU 크래시 가드 상태
  const [deviceClass, setDeviceClass] = useState<CrashGuardDeviceClass>("ipad");
  const [memoryPercentInput, setMemoryPercentInput] = useState<number>(82);
  const [textureResolutionPx, setTextureResolutionPx] = useState<TextureResolutionPx>(4096);
  const [webglContextLost, setWebglContextLost] = useState(false);
  const [webgpuDeviceLost, setWebgpuDeviceLost] = useState(false);

  // 10분 외주 3컷 샘플 검증 상태
  const [applicantName, setApplicantName] = useState("김민수 프리랜서");
  const [applicantRegion, setApplicantRegion] = useState<"KR" | "SEA" | "GLOBAL">("SEA");
  const [issueCount, setIssueCount] = useState(1);
  const [outsourcePreset, setOutsourcePreset] = useState<"pass" | "revise" | "hold">("pass");
  const [lineWidthOffsetPx, setLineWidthOffsetPx] = useState<number>(0);

  const episodeId = `${projectId}-ep${String(episodeNumber).padStart(3, "0")}`;
  const baseCuts = useMemo(() => initialCuts ?? createDefaultPreflightEpisode(60), [initialCuts]);
  const activeCuts = useMemo(
    () => (autoFixApplied ? applyPreflightAutoFix(baseCuts, platformId) : baseCuts),
    [autoFixApplied, baseCuts, platformId],
  );

  const selectedSpec = useMemo(() => getPlatformPublishingSpec(platformId), [platformId]);

  const preflightResult = useMemo(
    () =>
      runPlatformPreflightPackage({
        episodeId,
        seriesTitle,
        episodeNumber,
        platformId,
        cuts: activeCuts,
      }),
    [activeCuts, episodeId, episodeNumber, platformId, seriesTitle],
  );

  const reflowResult = useMemo(
    () => runMultiFormatReflow(episodeId, activeCuts),
    [activeCuts, episodeId],
  );

  const readerAnalysis = useMemo(
    () => analyzeReaderRetentionHeatmap(activeCuts, handedness),
    [activeCuts, handedness],
  );

  const crashGuardEvaluation = useMemo(() => {
    const heapLimitMb = deviceClass === "ipad" ? 1536 : deviceClass === "low-spec-laptop" ? 2048 : 4096;
    const usedHeapMb = Math.round((heapLimitMb * memoryPercentInput) / 100);
    return evaluateCrashGuardState({
      episodeId,
      deviceClass,
      usedHeapMb,
      heapLimitMb,
      textureResolutionPx,
      activeCacheMb: 320,
      idleLayerCacheMb: 280,
      undoStackFrames: 42,
      activeCutCount: activeCuts.length,
      webglContextLost,
      webgpuDeviceLost,
    });
  }, [activeCuts.length, deviceClass, episodeId, memoryPercentInput, textureResolutionPx, webglContextLost, webgpuDeviceLost]);

  const samplePacket = useMemo(
    () =>
      issueOutsourceSampleTest({
        applicantName,
        region: applicantRegion,
        issuedAtIso: `2026-11-22T09:${String(issueCount % 60).padStart(2, "0")}:00.000Z`,
      }),
    [applicantName, applicantRegion, issueCount],
  );

  const sampleSubmission = useMemo<OutsourceSampleSubmission>(() => {
    const presetSubmission = createDefaultOutsourceSubmission(samplePacket, outsourcePreset);
    if (lineWidthOffsetPx === 0) return presetSubmission;
    return {
      ...presetSubmission,
      cuts: [
        { ...presetSubmission.cuts[0], submittedLineWidthPx: Number((presetSubmission.cuts[0].submittedLineWidthPx + lineWidthOffsetPx).toFixed(2)) },
        { ...presetSubmission.cuts[1], submittedLineWidthPx: Number((presetSubmission.cuts[1].submittedLineWidthPx + lineWidthOffsetPx).toFixed(2)) },
        { ...presetSubmission.cuts[2], submittedLineWidthPx: Number((presetSubmission.cuts[2].submittedLineWidthPx + lineWidthOffsetPx).toFixed(2)) },
      ],
    };
  }, [lineWidthOffsetPx, outsourcePreset, samplePacket]);

  const sampleEvaluation = useMemo(
    () => evaluateOutsourceSampleSubmission(samplePacket, sampleSubmission),
    [samplePacket, sampleSubmission],
  );

  const firstCutLiveDeltaE = useMemo(
    () => computeOklchDeltaE(samplePacket.cuts[0].targetColor, sampleSubmission.cuts[0].submittedColor),
    [samplePacket, sampleSubmission],
  );

  const tabs: ReadonlyArray<{ readonly id: PreflightSuiteTabId; readonly labelKo: string; readonly icon: typeof FileCheck2 }> = [
    { id: "preflight", labelKo: "6대 플랫폼 프리플라이트", icon: FileCheck2 },
    { id: "reflow", labelKo: "멀티포맷 리플로우", icon: Film },
    { id: "reader", labelKo: "독자 이탈·호흡", icon: Eye },
    { id: "crash-guard", labelKo: "OOM·GPU 크래시 가드", icon: Cpu },
    { id: "outsource", labelKo: "10분 외주 샘플 검증", icon: UserCheck },
  ];

  const statusLabelKo =
    preflightResult.status === "READY"
      ? "납품 준비 완료"
      : preflightResult.status === "NEEDS_FIX"
        ? "경고 확인 필요"
        : "출고 차단 · 수정 필요";

  return (
    <section
      className="ppf-panel"
      aria-label="출판 프리플라이트 및 품질 관제 스위트"
      data-testid="studio-publishing-preflight-panel"
    >
      <div className="ppf-header">
        <div>
          <h3 className="ppf-title">
            {seriesTitle} {episodeNumber}화 · 출판 프리플라이트 &amp; 품질 관제
          </h3>
          <p className="ppf-subtitle">
            원고 {activeCuts.length}컷 기준으로 6대 플랫폼 규격 패키징, 3종 멀티포맷 리플로우, 독자 이탈 예측, 크래시 보호, 외주 3컷 검증을 한 자리에서 점검합니다.
          </p>
        </div>
        <span className={verdictBadgeClass(preflightResult.status)} data-testid="ppf-overall-status">
          <CheckCircle2 size={14} aria-hidden="true" />
          {selectedSpec.labelKo} · {statusLabelKo} ({preflightResult.readinessScore}점)
        </span>
      </div>

      <div className="ppf-tablist" role="tablist" aria-label="출판 관제 기능 탭">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ppf-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`ppf-tabpanel-${tab.id}`}
              className="ppf-tab"
              data-testid={`ppf-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon size={16} aria-hidden="true" />
              <span>{tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "preflight" ? (
        <div
          role="tabpanel"
          id="ppf-tabpanel-preflight"
          aria-labelledby="ppf-tab-preflight"
          className="ppf-section"
          data-testid="ppf-panel-preflight"
        >
          <div className="ppf-chip-row" role="group" aria-label="연재 플랫폼 선택">
            {PLATFORM_PUBLISHING_SPECS.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className="ppf-chip"
                aria-pressed={platformId === spec.id}
                data-testid={`ppf-platform-${spec.id}`}
                onClick={() => setPlatformId(spec.id)}
              >
                {spec.labelKo}
              </button>
            ))}
          </div>

          <p className="ppf-subtitle" data-testid="ppf-platform-spec-note">
            규격 정본: {selectedSpec.notesKo}
          </p>

          <div className="ppf-kpi-grid">
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">출고 적합도</span>
              <span className="ppf-kpi-value" data-testid="ppf-readiness-score">
                {preflightResult.readinessScore} / 100
              </span>
              <span className="ppf-kpi-meta">{statusLabelKo}</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">자동 분할 조각</span>
              <span className="ppf-kpi-value" data-testid="ppf-slice-count">
                {preflightResult.slicePlan.length}장
              </span>
              <span className="ppf-kpi-meta">최대 높이 {selectedSpec.maxSliceHeightPx}px 기준</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">예상 총 용량</span>
              <span className="ppf-kpi-value">
                {formatMb(preflightResult.compressionPlan.projectedTotalBytes)}
              </span>
              <span className="ppf-kpi-meta">
                상한 {selectedSpec.maxEpisodeTotalMb}MB · JPEG Q{preflightResult.compressionPlan.targetJpegQuality}
              </span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">여백 · 대사 검출</span>
              <span className="ppf-kpi-value" data-testid="ppf-violation-summary">
                여백 {preflightResult.marginViolations.length}건 · 대사 {preflightResult.textFlags.length}건
              </span>
              <span className="ppf-kpi-meta">좌우 안전 여백 {selectedSpec.balloonSafeMarginX}px</span>
            </div>
          </div>

          <div className="ppf-chip-row">
            <button
              type="button"
              className={autoFixApplied ? "ppf-btn" : "ppf-btn ppf-btn-primary"}
              data-testid="ppf-toggle-autofix"
              onClick={() => setAutoFixApplied((prev) => !prev)}
            >
              {autoFixApplied ? "원본 원고 상태로 되돌리기" : "규격·안전여백·오타 자동 교정 적용"}
            </button>
            <button
              type="button"
              className="ppf-btn"
              data-testid="ppf-toggle-manifest"
              onClick={() => setShowManifestJson((prev) => !prev)}
            >
              {showManifestJson ? "매니페스트 JSON 닫기" : "납품 매니페스트 JSON 보기"}
            </button>
          </div>

          {preflightResult.issues.length > 0 ? (
            <ul className="ppf-list" aria-label="프리플라이트 검사 항목">
              {preflightResult.issues.slice(0, 6).map((issue, idx) => (
                <li key={`${issue.code}-${idx}`} className="ppf-list-item">
                  <span>{issue.messageKo}</span>
                  <span className={issue.severity === "error" ? "ppf-badge ppf-badge-bad" : issue.severity === "warn" ? "ppf-badge ppf-badge-warn" : "ppf-badge ppf-badge-info"}>
                    {issue.severity === "error" ? "필수 수정" : issue.severity === "warn" ? "확인 권고" : "자동 분할"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ppf-badge ppf-badge-good">모든 규격·안전여백·금지어 검사를 통과했습니다.</p>
          )}

          {showManifestJson ? (
            <pre className="ppf-code" data-testid="ppf-manifest-json">
              {preflightResult.manifestJson}
            </pre>
          ) : null}
        </div>
      ) : null}

      {activeTab === "reflow" ? (
        <div
          role="tabpanel"
          id="ppf-tabpanel-reflow"
          aria-labelledby="ppf-tab-reflow"
          className="ppf-section"
          data-testid="ppf-panel-reflow"
        >
          <div className="ppf-card-grid ppf-card-grid-3">
            <article className="ppf-card" data-testid="ppf-reflow-b6">
              <span className="ppf-badge ppf-badge-info">A · 단행본 출판</span>
              <h4 className="ppf-title">{reflowResult.bookB6.formatLabelKo}</h4>
              <p className="ppf-subtitle">{reflowResult.bookB6.trimSpec}</p>
              <p className="ppf-kpi-value">{reflowResult.bookB6.totalPages}페이지</p>
              <p className="ppf-kpi-meta">
                페이지당 {reflowResult.bookB6.minCutsPerPage}~{reflowResult.bookB6.maxCutsPerPage}컷 · 컷 보존 {reflowResult.bookB6.preservedCutCount}/{reflowResult.bookB6.sourceCutCount}컷 (100%)
              </p>
              <ul className="ppf-list">
                {reflowResult.bookB6.pages.slice(0, 3).map((page) => (
                  <li key={page.pageNumber} className="ppf-list-item">
                    <span>
                      P{page.pageNumber} ({page.side === "right" ? "오른쪽" : "왼쪽"} · 제본 {page.innerBindingMarginMm}mm)
                    </span>
                    <span>{page.panels.length}컷 배분</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="ppf-card" data-testid="ppf-reflow-shorts">
              <span className="ppf-badge ppf-badge-good">B · 숏폼 모션 예고편</span>
              <h4 className="ppf-title">{reflowResult.shortsTrailer.formatLabelKo}</h4>
              <p className="ppf-subtitle">
                {reflowResult.shortsTrailer.aspectRatio} ({reflowResult.shortsTrailer.resolutionPx.width}×{reflowResult.shortsTrailer.resolutionPx.height}) · {reflowResult.shortsTrailer.fps}fps
              </p>
              <p className="ppf-kpi-value">
                {reflowResult.shortsTrailer.clipCount}컷 · {reflowResult.shortsTrailer.totalDurationSec}초
              </p>
              <ul className="ppf-list">
                {reflowResult.shortsTrailer.clips.slice(0, 4).map((clip) => (
                  <li key={clip.clipIndex} className="ppf-list-item">
                    <span>
                      #{clip.clipIndex} ({clip.sourceCutOrder}컷 · {clip.durationSec}초)
                    </span>
                    <span>
                      {clip.cameraMotion} · {clip.startScale}x→{clip.endScale}x
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="ppf-card" data-testid="ppf-reflow-cardnews">
              <span className="ppf-badge ppf-badge-warn">C · SNS 홍보 카드</span>
              <h4 className="ppf-title">{reflowResult.snsCardNews.formatLabelKo}</h4>
              <p className="ppf-subtitle">
                {reflowResult.snsCardNews.aspectRatio} ({reflowResult.snsCardNews.resolutionPx.width}×{reflowResult.snsCardNews.resolutionPx.height}) 하이라이트 구성
              </p>
              <p className="ppf-kpi-value">{reflowResult.snsCardNews.cardCount}장 패키지</p>
              <ul className="ppf-list">
                {reflowResult.snsCardNews.cards.map((card) => (
                  <li key={card.cardIndex} className="ppf-list-item">
                    <span>{card.roleKo}</span>
                    <span>{card.sourceCutOrder}컷 선별</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === "reader" ? (
        <div
          role="tabpanel"
          id="ppf-tabpanel-reader"
          aria-labelledby="ppf-tab-reader"
          className="ppf-section"
          data-testid="ppf-panel-reader"
        >
          <div className="ppf-chip-row" role="group" aria-label="모바일 엄지 가림 기준 선택">
            {(
              [
                { id: "right", label: "오른손 엄지 (390×844)" },
                { id: "left", label: "왼손 엄지 (390×844)" },
                { id: "both", label: "양손 최악 기준" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                className="ppf-chip"
                aria-pressed={handedness === option.id}
                data-testid={`ppf-hand-${option.id}`}
                onClick={() => setHandedness(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="ppf-kpi-grid">
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">완독 예측 점수</span>
              <span className="ppf-kpi-value" data-testid="ppf-completion-score">
                {readerAnalysis.completionScore}점
              </span>
              <span className="ppf-kpi-meta">마지막 컷 잔존율 {readerAnalysis.endingRetentionPct}%</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">텍스트 벽 경고</span>
              <span className="ppf-kpi-value" data-testid="ppf-text-wall-count">
                {readerAnalysis.textWallCount}개 컷
              </span>
              <span className="ppf-kpi-meta">말풍선 과밀 집중 구간</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">지루함 빈 여백</span>
              <span className="ppf-kpi-value">{readerAnalysis.boredomGapCount}개 구간</span>
              <span className="ppf-kpi-meta">스크롤 호흡: {readerAnalysis.scrollTempo}</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">엄지 가림 최대 침범률</span>
              <span className="ppf-kpi-value" data-testid="ppf-thumb-occlusion">
                {readerAnalysis.peakThumbOcclusionPct}%
              </span>
              <span className="ppf-kpi-meta">
                기준 뷰포트 {MOBILE_READER_VIEWPORT.widthPx}×{MOBILE_READER_VIEWPORT.heightPx}px
              </span>
            </div>
          </div>

          <div className="ppf-heatmap-strip" aria-label="컷별 독자 이탈 위험 히트맵" data-testid="ppf-heatmap-strip">
            {readerAnalysis.heatmapSegments.map((seg) => (
              <span
                key={seg.cutId}
                title={`${seg.cutOrder}컷 · 이탈 위험 ${seg.dropOffRisk} · 잔존 ${seg.predictedRetentionPct}%`}
                className={`ppf-heatmap-cell ppf-heatmap-${seg.riskLevel}`}
              />
            ))}
          </div>

          <ul className="ppf-list" aria-label="독자 이탈 개선 포인트">
            {readerAnalysis.recommendations.slice(0, 5).map((item) => (
              <li key={`${item.cutId}-${item.category}`} className="ppf-list-item">
                <span>{item.actionKo}</span>
                <span className={item.severity === "high" ? "ppf-badge ppf-badge-bad" : "ppf-badge ppf-badge-warn"}>
                  {item.cutOrder}컷
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeTab === "crash-guard" ? (
        <div
          role="tabpanel"
          id="ppf-tabpanel-crash-guard"
          aria-labelledby="ppf-tab-crash-guard"
          className="ppf-section"
          data-testid="ppf-panel-crash-guard"
        >
          <div className="ppf-chip-row">
            {(
              [
                { id: "low-spec-laptop", label: "저사양 노트북 (2GB)" },
                { id: "ipad", label: "아이패드 (1.5GB)" },
                { id: "desktop", label: "데스크톱 (4GB)" },
              ] as const
            ).map((dev) => (
              <button
                key={dev.id}
                type="button"
                className="ppf-chip"
                aria-pressed={deviceClass === dev.id}
                onClick={() => setDeviceClass(dev.id)}
              >
                {dev.label}
              </button>
            ))}
          </div>

          <div className="ppf-chip-row">
            <button
              type="button"
              className="ppf-btn"
              data-testid="ppf-mem-healthy"
              onClick={() => {
                setMemoryPercentInput(58);
                setWebglContextLost(false);
                setWebgpuDeviceLost(false);
              }}
            >
              안정 58%
            </button>
            <button
              type="button"
              className="ppf-btn"
              data-testid="ppf-mem-warning"
              onClick={() => {
                setMemoryPercentInput(82);
                setWebglContextLost(false);
                setWebgpuDeviceLost(false);
              }}
            >
              경고 82% (&gt;78%)
            </button>
            <button
              type="button"
              className="ppf-btn ppf-btn-danger"
              data-testid="ppf-mem-emergency"
              onClick={() => {
                setMemoryPercentInput(92);
                setWebglContextLost(false);
                setWebgpuDeviceLost(false);
              }}
            >
              비상 92% (&gt;88%)
            </button>
            <button
              type="button"
              className={webglContextLost ? "ppf-btn ppf-btn-danger" : "ppf-btn"}
              aria-pressed={webglContextLost}
              data-testid="ppf-toggle-webgl-lost"
              onClick={() => setWebglContextLost((prev) => !prev)}
            >
              webglcontextlost {webglContextLost ? "발생" : "시뮬레이션"}
            </button>
            <button
              type="button"
              className={webgpuDeviceLost ? "ppf-btn ppf-btn-danger" : "ppf-btn"}
              aria-pressed={webgpuDeviceLost}
              data-testid="ppf-toggle-webgpu-lost"
              onClick={() => setWebgpuDeviceLost((prev) => !prev)}
            >
              device.lost {webgpuDeviceLost ? "발생" : "시뮬레이션"}
            </button>
            <button
              type="button"
              className="ppf-btn"
              onClick={() =>
                setTextureResolutionPx((prev) => (prev === 4096 ? 2048 : prev === 2048 ? 1024 : 4096))
              }
            >
              현재 텍스처: {textureResolutionPx / 1024}K
            </button>
          </div>

          <div className="ppf-kpi-grid">
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">가드 상태</span>
              <span className={verdictBadgeClass(crashGuardEvaluation.level)} data-testid="ppf-crash-level">
                <ShieldAlert size={14} aria-hidden="true" />
                {crashGuardEvaluation.levelLabelKo}
              </span>
              <span className="ppf-kpi-meta">현재 힙 {crashGuardEvaluation.memoryUsagePercent}%</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">비상 체크포인트</span>
              <span className="ppf-kpi-value" data-testid="ppf-checkpoint-id">
                {crashGuardEvaluation.emergencyCheckpoint ? crashGuardEvaluation.emergencyCheckpoint.checkpointId : "대기"}
              </span>
              <span className="ppf-kpi-meta">OPFS SQLite WAL 즉시 보존</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">3D 텍스처 다운스케일</span>
              <span className="ppf-kpi-value" data-testid="ppf-texture-downscale">
                {crashGuardEvaluation.textureDownscale.fromPx / 1024}K → {crashGuardEvaluation.textureDownscale.toPx / 1024}K
              </span>
              <span className="ppf-kpi-meta">
                VRAM {crashGuardEvaluation.textureDownscale.estimatedVramSavedMb}MB 절감
              </span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">캐시 해제 후 예상 점유</span>
              <span className="ppf-kpi-value">{crashGuardEvaluation.projectedUsagePercent}%</span>
              <span className="ppf-kpi-meta">총 {crashGuardEvaluation.estimatedFreedMb}MB 회수 예정</span>
            </div>
          </div>

          {crashGuardEvaluation.cacheReleasePlan.length > 0 ? (
            <ul className="ppf-list" aria-label="자동 크래시 가드 실행 플랜">
              {crashGuardEvaluation.cacheReleasePlan.map((step) => (
                <li key={step.stepId} className="ppf-list-item">
                  <span>{step.labelKo}</span>
                  <span className="ppf-badge ppf-badge-info">-{step.freedMb}MB</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ppf-subtitle">현재 메모리와 GPU 컨텍스트가 안정 범위 안에 있습니다.</p>
          )}
        </div>
      ) : null}

      {activeTab === "outsource" ? (
        <div
          role="tabpanel"
          id="ppf-tabpanel-outsource"
          aria-labelledby="ppf-tab-outsource"
          className="ppf-section"
          data-testid="ppf-panel-outsource"
        >
          <div className="ppf-form-grid">
            <label className="ppf-field" htmlFor="ppf-applicant-name">
              <span>지원자 이름</span>
              <input
                id="ppf-applicant-name"
                type="text"
                className="ppf-input"
                value={applicantName}
                onChange={(event) => setApplicantName(event.target.value)}
              />
            </label>

            <label className="ppf-field" htmlFor="ppf-applicant-region">
              <span>지원 지역</span>
              <select
                id="ppf-applicant-region"
                className="ppf-input"
                value={applicantRegion}
                onChange={(event) => setApplicantRegion(event.target.value as "KR" | "SEA" | "GLOBAL")}
              >
                <option value="SEA">동남아 스튜디오·프리랜서</option>
                <option value="KR">국내 프리랜서</option>
                <option value="GLOBAL">글로벌 파트너</option>
              </select>
            </label>

            <label className="ppf-field" htmlFor="ppf-linewidth-offset">
              <span>선폭 편차 미세 조정 ({lineWidthOffsetPx >= 0 ? `+${lineWidthOffsetPx}` : lineWidthOffsetPx}px)</span>
              <input
                id="ppf-linewidth-offset"
                type="range"
                min={-0.6}
                max={0.9}
                step={0.1}
                className="ppf-input"
                value={lineWidthOffsetPx}
                onChange={(event) => setLineWidthOffsetPx(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="ppf-chip-row">
            <button
              type="button"
              className="ppf-btn ppf-btn-primary"
              data-testid="ppf-issue-sample"
              onClick={() => setIssueCount((count) => count + 1)}
            >
              본편 격리 3컷 샘플 재발급 ({samplePacket.watermarkToken})
            </button>
            <button
              type="button"
              className="ppf-chip"
              aria-pressed={outsourcePreset === "pass"}
              data-testid="ppf-outsource-preset-pass"
              onClick={() => {
                setOutsourcePreset("pass");
                setLineWidthOffsetPx(0);
              }}
            >
              PASS 예시 (즉시 투입)
            </button>
            <button
              type="button"
              className="ppf-chip"
              aria-pressed={outsourcePreset === "revise"}
              data-testid="ppf-outsource-preset-revise"
              onClick={() => {
                setOutsourcePreset("revise");
                setLineWidthOffsetPx(0);
              }}
            >
              REVISE 예시 (부분 수정)
            </button>
            <button
              type="button"
              className="ppf-chip"
              aria-pressed={outsourcePreset === "hold"}
              data-testid="ppf-outsource-preset-hold"
              onClick={() => {
                setOutsourcePreset("hold");
                setLineWidthOffsetPx(0);
              }}
            >
              HOLD 예시 (보류)
            </button>
          </div>

          <p className="ppf-subtitle" data-testid="ppf-leak-protection-note">
            보안 정책: {samplePacket.isolationPolicyKo} · 제한 시간 {samplePacket.expiresInMinutes}분
          </p>

          <div className="ppf-kpi-grid">
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">자동 판정</span>
              <span className={verdictBadgeClass(sampleEvaluation.verdict)} data-testid="ppf-outsource-verdict">
                {sampleEvaluation.verdictLabelKo}
              </span>
              <span className="ppf-kpi-meta">종합 {sampleEvaluation.totalScore}점</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">평균 선폭 오차</span>
              <span className="ppf-kpi-value">{sampleEvaluation.avgLineWidthDeltaPx} px</span>
              <span className="ppf-kpi-meta">선화 점수 {sampleEvaluation.lineWidthScore}점</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">OKLCH 색차 (ΔE)</span>
              <span className="ppf-kpi-value" data-testid="ppf-outsource-deltae">
                ΔE {sampleEvaluation.avgColorDeltaE}
              </span>
              <span className="ppf-kpi-meta">1컷 실측 ΔE {firstCutLiveDeltaE}</span>
            </div>
            <div className="ppf-kpi-card">
              <span className="ppf-kpi-label">3컷 총 납기 속도</span>
              <span className="ppf-kpi-value">{sampleEvaluation.totalTurnaroundMinutes}분</span>
              <span className="ppf-kpi-meta">목표 10분 · 속도 점수 {sampleEvaluation.speedScore}점</span>
            </div>
          </div>

          <ul className="ppf-list" aria-label="외주 샘플 3컷 상세 채점">
            {sampleEvaluation.cutDetails.map((detail) => (
              <li key={detail.sampleCutId} className="ppf-list-item">
                <span>
                  {detail.titleKo} · 선폭 오차 {detail.lineWidthDeltaPx}px · ΔE {detail.colorDeltaE} · {detail.turnaroundMinutes}분
                </span>
                <span className={verdictBadgeClass(detail.status)}>
                  {detail.status} ({detail.cutScore}점)
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
