import { useEffect, useId, useRef, useState } from "react";
import {
  analyzeAssistantBottlenecks,
  ASSISTANT_DCC_LABELS_KO,
  ASSISTANT_PART_LABELS_KO,
  computeArtistCareerSummary,
  computeStudioMgRsSettlement,
  detectDelayedSeriesAndStages,
  KENAZ_SEVEN_STAGE_LABELS_KO,
  KENAZ_SEVEN_STAGE_ORDER,
  recommendAssistantLoadRebalance,
  STUDIO_ERP_TRACK_LABELS_KO,
  summarizeMultiSeriesErpFleet,
  validateAtoonSeriesSubmission,
  type KenazSevenStageKey,
  type SerializedSeriesErpEntry,
  type StudioAssistantNode,
} from "./production-studio-erp-bottleneck-model";

const INITIAL_SERIES_FLEET: readonly SerializedSeriesErpEntry[] = [
  {
    seriesId: "sr-01",
    title: "황궁의 회귀 검성",
    track: "production-investment",
    platform: "네이버웹툰 · 라인망가(JP)",
    serialDayOfWeek: "수",
    currentEpisodeNumber: 48,
    preProductionBufferEpisodes: 1,
    currentStage: "03-color",
    stageDelayHours: {
      "01-storyboard": 0,
      "02-lineart": 0,
      "03-color": 28,
      "04-background": 4,
      "05-postprocess": 0,
      "06-editing": 0,
      "07-localization": 0,
    },
    assignedColorAssistantId: "ast-color-1",
    assignedLineAssistantId: "ast-line-1",
    assignedBackgroundAssistantId: "ast-bg-1",
    pendingRedPenCount: 5,
    partnerCode: "KNZ-2026-JP01",
  },
  {
    seriesId: "sr-02",
    title: "던전 마스터의 영지 설계",
    track: "inhouse-studio",
    platform: "카카오페이지 · 픽코마(JP)",
    serialDayOfWeek: "금",
    currentEpisodeNumber: 32,
    preProductionBufferEpisodes: 4,
    currentStage: "03-color",
    stageDelayHours: {
      "01-storyboard": 0,
      "02-lineart": 0,
      "03-color": 12,
      "04-background": 0,
      "05-postprocess": 0,
      "06-editing": 0,
      "07-localization": 0,
    },
    assignedColorAssistantId: "ast-color-1",
    assignedLineAssistantId: "ast-line-1",
    assignedBackgroundAssistantId: "ast-bg-1",
    pendingRedPenCount: 2,
    partnerCode: "JDM-2026-KR02",
  },
  {
    seriesId: "sr-03",
    title: "별빛 아카데미의 흑마법사",
    track: "global-localization",
    platform: "태피툰(EN) · 포켓코믹스",
    serialDayOfWeek: "일",
    currentEpisodeNumber: 65,
    preProductionBufferEpisodes: 6,
    currentStage: "07-localization",
    stageDelayHours: {
      "01-storyboard": 0,
      "02-lineart": 0,
      "03-color": 0,
      "04-background": 0,
      "05-postprocess": 0,
      "06-editing": 0,
      "07-localization": 0,
    },
    assignedColorAssistantId: "ast-color-2",
    assignedLineAssistantId: "ast-line-1",
    assignedBackgroundAssistantId: "ast-bg-1",
    pendingRedPenCount: 0,
    partnerCode: "KNZ-2026-GL03",
  },
  {
    seriesId: "sr-04",
    title: "천마의 현대 요리 일지",
    track: "management",
    platform: "네이버시리즈",
    serialDayOfWeek: "월",
    currentEpisodeNumber: 19,
    preProductionBufferEpisodes: 3,
    currentStage: "02-lineart",
    stageDelayHours: {
      "01-storyboard": 0,
      "02-lineart": 8,
      "03-color": 0,
      "04-background": 0,
      "05-postprocess": 0,
      "06-editing": 0,
      "07-localization": 0,
    },
    assignedColorAssistantId: "ast-color-2",
    assignedLineAssistantId: "ast-line-1",
    assignedBackgroundAssistantId: "ast-bg-1",
    pendingRedPenCount: 1,
    partnerCode: null,
  },
];

const INITIAL_ASSISTANTS: readonly StudioAssistantNode[] = [
  {
    assistantId: "ast-color-1",
    name: "한소희 채색팀장",
    primaryPart: "shading",
    dccTool: "clip-studio",
    proficiency: "high",
    workMode: "in-house",
    availability: "busy",
    assignedSeriesIds: ["sr-01", "sr-02", "sr-04"],
    wipCutCount: 64,
    dailyCapacityCuts: 18,
    openRevisionLoops: 4,
    ratePerEpisodeKrw: 450000,
  },
  {
    assistantId: "ast-color-2",
    name: "오민재 채색어시",
    primaryPart: "shading",
    dccTool: "clip-studio",
    proficiency: "high",
    workMode: "remote",
    availability: "immediate",
    assignedSeriesIds: ["sr-03"],
    wipCutCount: 12,
    dailyCapacityCuts: 20,
    openRevisionLoops: 0,
    ratePerEpisodeKrw: 420000,
  },
  {
    assistantId: "ast-line-1",
    name: "장태양 선화어시",
    primaryPart: "lineart",
    dccTool: "clip-studio",
    proficiency: "high",
    workMode: "in-house",
    availability: "negotiable",
    assignedSeriesIds: ["sr-01", "sr-04"],
    wipCutCount: 34,
    dailyCapacityCuts: 16,
    openRevisionLoops: 1,
    ratePerEpisodeKrw: 520000,
  },
  {
    assistantId: "ast-bg-1",
    name: "배경준 3D어시",
    primaryPart: "background",
    dccTool: "sketchup",
    proficiency: "high",
    workMode: "remote",
    availability: "immediate",
    assignedSeriesIds: ["sr-01", "sr-02"],
    wipCutCount: 14,
    dailyCapacityCuts: 15,
    openRevisionLoops: 0,
    ratePerEpisodeKrw: 380000,
  },
];

const STUDIO_ERP_TABLE_CSS = `
.studio-erp-table-wrapper {
  overflow: auto;
  max-inline-size: 100%;
  max-block-size: min(460px, 75vh);
  container-type: inline-size;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
}
.studio-erp-table-wrapper table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.78rem;
  --label-2: "사업 트랙";
  --label-3: "현재 공정";
  --label-4: "채색 지연";
  --label-5: "사전제작 세이브";
  --label-6: "상태 진단";
}
.studio-erp-table-wrapper thead {
  position: sticky;
  inset-block-start: 0;
  z-index: 2;
  background: #f1f5f9;
}
.studio-erp-table-wrapper thead th {
  text-align: left;
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid #cbd5e1;
  color: #0f172a;
}
.studio-erp-table-wrapper tbody th {
  position: sticky;
  inset-inline-start: 0;
  z-index: 1;
  background: #f8fafc;
  text-align: left;
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid #e2e8f0;
}
.studio-erp-table-wrapper tbody td {
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid #e2e8f0;
  font-variant-numeric: tabular-nums;
}
@container (width < 600px) {
  .studio-erp-table-wrapper table,
  .studio-erp-table-wrapper thead,
  .studio-erp-table-wrapper tbody,
  .studio-erp-table-wrapper tr,
  .studio-erp-table-wrapper th,
  .studio-erp-table-wrapper td {
    display: block;
  }
  .studio-erp-table-wrapper thead {
    display: none;
  }
  .studio-erp-table-wrapper tr {
    margin-block-end: 0.75rem;
    border: 1px solid #cbd5e1;
  }
  .studio-erp-table-wrapper tbody th {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
    background: #e2e8f0;
  }
  .studio-erp-table-wrapper td:nth-child(2)::before { content: var(--label-2) ": "; font-weight: 700; }
  .studio-erp-table-wrapper td:nth-child(3)::before { content: var(--label-3) ": "; font-weight: 700; }
  .studio-erp-table-wrapper td:nth-child(4)::before { content: var(--label-4) ": "; font-weight: 700; }
  .studio-erp-table-wrapper td:nth-child(5)::before { content: var(--label-5) ": "; font-weight: 700; }
  .studio-erp-table-wrapper td:nth-child(6)::before { content: var(--label-6) ": "; font-weight: 700; }
}
`;

export function ProductionStudioErpBottleneckSuite() {
  const tableCaptionId = useId();
  const erpModalTitleId = useId();
  const erpDialogRef = useRef<HTMLDialogElement | null>(null);

  const [seriesList, setSeriesList] = useState<readonly SerializedSeriesErpEntry[]>(INITIAL_SERIES_FLEET);
  const [assistants, setAssistants] = useState<readonly StudioAssistantNode[]>(INITIAL_ASSISTANTS);
  const [stageFilter, setStageFilter] = useState<KenazSevenStageKey | "all">("all");
  const [onlyColoringDelayed, setOnlyColoringDelayed] = useState<boolean>(false);
  const [rebalanceNotice, setRebalanceNotice] = useState<string | null>(null);

  // 투니스트/에이툰(ATOON) 투고 & MG/RS 정산 상태
  const [pitchTitle, setPitchTitle] = useState<string>("회귀자의 만렙 공방");
  const [pitchBannerWidth, setPitchBannerWidth] = useState<number>(1920);
  const [grossRevenueKrw, setGrossRevenueKrw] = useState<number>(28000000);

  // `closedby="any"` 미지원 브라우저용 light-dismiss 폴백
  useEffect(() => {
    const dialog = erpDialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY
        && event.clientY <= rect.top + rect.height
        && rect.left <= event.clientX
        && event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dialog.close();
    };

    dialog.addEventListener("click", handleBackdropClick);
    return () => dialog.removeEventListener("click", handleBackdropClick);
  }, []);

  const fleetSummary = summarizeMultiSeriesErpFleet(seriesList);
  const allDiagnoses = detectDelayedSeriesAndStages(seriesList, stageFilter);
  const visibleDiagnoses = onlyColoringDelayed
    ? allDiagnoses.filter((d) => d.isColoringDelayed)
    : allDiagnoses;

  const bottleneckDiagnoses = analyzeAssistantBottlenecks(assistants, seriesList);

  const careerSummary = computeArtistCareerSummary([
    { workTitle: "창공의 기사단", startYearMonth: "2023-01", endYearMonth: "2024-06" },
    { workTitle: "심연의 연금술사", startYearMonth: "2025-01", endYearMonth: "2026-04" },
  ]);

  const atoonValidation = validateAtoonSeriesSubmission({
    title: pitchTitle,
    genres: ["판타지", "액션"],
    hashtags: ["#회귀", "#먼치킨", "#스튜디오사전제작"],
    synopsis: "대장장이로 회귀한 주인공이 신화급 아티팩트를 제작하며 대륙의 전쟁을 종결시키는 판타지 웹툰.",
    expectedEpisodeCount: 60,
    allowKrJpStudioMatching: true,
    bannerSizePx: { width: pitchBannerWidth, height: 1080, sizeMb: 1.4 },
    mainThumbSizePx: { width: 300, height: 420, sizeMb: 0.8 },
    episodeThumbSizePx: { width: 250, height: 125, sizeMb: 0.4 },
    sampleEpisodeCount: 3,
  });

  const settlement = computeStudioMgRsSettlement({
    grossPlatformRevenueKrw: grossRevenueKrw,
    minimumGuaranteePerEpisodeKrw: 2500000,
    episodeCount: 4,
    creatorRsPercent: 50,
    assistantLaborCostKrw: 3200000,
  });

  const handleRebalanceBottleneck = (assistantId: string) => {
    const result = recommendAssistantLoadRebalance(assistants, seriesList, assistantId);
    if (result.rebalanced) {
      setAssistants(result.assistants);
      setSeriesList(result.seriesList);
    }
    setRebalanceNotice(result.messageKo);
  };

  return (
    <section
      aria-label="투니스트(Toonist) 및 대형 웹툰 스튜디오 전용 ERP (재담미디어·케나즈·스피노프) 동시 연재작·채색 지연·어시스턴트 병목 관제"
      data-testid="production-studio-erp-bottleneck-suite"
      style={{
        display: "grid",
        gap: "1rem",
        padding: "1rem",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle, #cbd5e1)",
        background: "var(--surface-elevated, #ffffff)",
      }}
    >
      <style>{STUDIO_ERP_TABLE_CSS}</style>

      {/* 헤더 & 필터 바 */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "0.95rem" }}>
            투니스트(Toonist) · 웹툰 스튜디오 전용 ERP (동시 연재작 채색 지연 &amp; 어시스턴트 병목 실시간 관제)
          </h3>
          <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#475569" }}>
            재담미디어 4대 사업 트랙 · 케나즈 7단계 사전제작(Pre-Production) · 스피노프 9대 파트 어시스턴트 병목 지수를 통합 모니터링합니다.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem" }}>
            <input
              type="checkbox"
              data-testid="filter-coloring-delayed-checkbox"
              checked={onlyColoringDelayed}
              onChange={(e) => setOnlyColoringDelayed(e.target.checked)}
            />
            <strong>채색(03 컬러) 밀림 작품만 보기</strong>
          </label>

          <select
            aria-label="케나즈 7단계 공정 필터"
            data-testid="erp-stage-filter-select"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as KenazSevenStageKey | "all")}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: "6px" }}
          >
            <option value="all">전 공정 (01 콘티 ~ 07 현지화)</option>
            {KENAZ_SEVEN_STAGE_ORDER.map((key) => (
              <option key={key} value={key}>
                {KENAZ_SEVEN_STAGE_LABELS_KO[key]}
              </option>
            ))}
          </select>

          <button
            type="button"
            data-testid="open-toonist-atoon-erp-modal-btn"
            onClick={() => erpDialogRef.current?.showModal()}
            style={{
              padding: "0.28rem 0.65rem",
              fontSize: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#ffffff",
            }}
          >
            투니스트·에이툰 투고 규격 &amp; MG/RS 정산 원장
          </button>
        </div>
      </div>

      {/* 스튜디오 플릿 KPI 카드 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
          gap: "0.6rem",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div
          data-testid="erp-kpi-total-series"
          style={{ padding: "0.65rem", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
        >
          <div style={{ fontSize: "0.73rem", color: "#475569" }}>동시 가동 연재작</div>
          <strong style={{ fontSize: "1.05rem" }}>{fleetSummary.totalSeriesCount}편</strong>
        </div>
        <div
          data-testid="erp-kpi-coloring-delayed"
          style={{
            padding: "0.65rem",
            borderRadius: "8px",
            border: fleetSummary.coloringDelayedCount > 0 ? "1px solid #f87171" : "1px solid #cbd5e1",
            background: fleetSummary.coloringDelayedCount > 0 ? "#fef2f2" : "#f8fafc",
          }}
        >
          <div style={{ fontSize: "0.73rem", color: "#991b1b" }}>채색(03 컬러) 밀림 작품</div>
          <strong style={{ fontSize: "1.05rem", color: "#b91c1c" }}>{fleetSummary.coloringDelayedCount}편</strong>
        </div>
        <div
          data-testid="erp-kpi-low-buffer"
          style={{ padding: "0.65rem", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
        >
          <div style={{ fontSize: "0.73rem", color: "#475569" }}>사전제작 세이브 부족(&lt;2화)</div>
          <strong style={{ fontSize: "1.05rem" }}>{fleetSummary.lowBufferSeriesCount}편</strong>
        </div>
        <div
          data-testid="erp-kpi-avg-buffer"
          style={{ padding: "0.65rem", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
        >
          <div style={{ fontSize: "0.73rem", color: "#475569" }}>평균 사전제작 세이브</div>
          <strong style={{ fontSize: "1.05rem" }}>{fleetSummary.averageBufferEpisodes}화</strong>
        </div>
      </div>

      {/* 1. 동시 연재작 멀티트랙 공정 & 채색 지연 테이블 (responsive-table 준수) */}
      <div
        role="region"
        aria-labelledby={tableCaptionId}
        className="studio-erp-table-wrapper"
        data-testid="studio-erp-series-table-region"
      >
        <table>
          <caption id={tableCaptionId} style={{ textAlign: "left", padding: "0.45rem 0.65rem", fontWeight: 700, fontSize: "0.78rem" }}>
            동시 연재작 7단계 사전제작 파이프라인 및 채색 지연 모니터링 현황표
          </caption>
          <thead>
            <tr>
              <th scope="col">연재 작품명 (플랫폼)</th>
              <th scope="col">사업 트랙</th>
              <th scope="col">현재 공정</th>
              <th scope="col">채색 지연</th>
              <th scope="col">사전제작 세이브</th>
              <th scope="col">상태 진단</th>
            </tr>
          </thead>
          <tbody>
            {visibleDiagnoses.map((diag) => {
              const rawSeries = seriesList.find((s) => s.seriesId === diag.seriesId);
              const currentStageLabel = rawSeries
                ? KENAZ_SEVEN_STAGE_LABELS_KO[rawSeries.currentStage]
                : "—";
              return (
                <tr key={diag.seriesId} data-testid={`erp-series-row-${diag.seriesId}`}>
                  <th scope="row">
                    {diag.title} ({diag.currentEpisodeNumber}화 · {diag.platform})
                  </th>
                  <td>{STUDIO_ERP_TRACK_LABELS_KO[diag.track]}</td>
                  <td>{currentStageLabel}</td>
                  <td style={{ color: diag.isColoringDelayed ? "#b91c1c" : "#15803d", fontWeight: 700 }}>
                    {diag.isColoringDelayed ? `+${diag.coloringDelayHours}h 지연` : "정상"}
                  </td>
                  <td>{diag.preProductionBufferEpisodes}화 비축</td>
                  <td>{diag.summaryKo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2. 어시스턴트 병목 현상 실시간 감지 & 1클릭 부하 분산 재배치 */}
      <div
        style={{
          display: "grid",
          gap: "0.65rem",
          padding: "0.85rem",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          background: "#f8fafc",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div>
          <strong style={{ fontSize: "0.86rem" }}>
            어시스턴트 병목 현상(Bottleneck) 실시간 감지 &amp; 1클릭 부하 분산 재배치 (스피노프 9파트 × 4툴 매칭)
          </strong>
          <p style={{ margin: "0.15rem 0 0", fontSize: "0.75rem", color: "#475569" }}>
            동시 담당 작품 수, 잔여 컷(WIP), 일일 처리 속도(cuts/day), 빨간펜 재수정 루프를 기반으로 병목 원인을 자동 진단합니다.
          </p>
        </div>

        {rebalanceNotice && (
          <p
            role="status"
            data-testid="assistant-rebalance-notice"
            style={{
              margin: 0,
              padding: "0.45rem 0.65rem",
              borderRadius: "6px",
              background: "#dcfce7",
              color: "#166534",
              fontSize: "0.76rem",
              fontWeight: 600,
            }}
          >
            {rebalanceNotice}
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "0.6rem" }}>
          {bottleneckDiagnoses.map((diag) => (
            <div
              key={diag.assistantId}
              data-testid={`assistant-bottleneck-card-${diag.assistantId}`}
              style={{
                padding: "0.7rem",
                borderRadius: "8px",
                border: diag.bottleneckLevel === "critical" ? "1px solid #ef4444" : "1px solid #cbd5e1",
                background: diag.bottleneckLevel === "critical" ? "#fff1f2" : "#ffffff",
                display: "grid",
                gap: "0.3rem",
                fontSize: "0.75rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>
                  {diag.assistantName} ({ASSISTANT_PART_LABELS_KO[diag.primaryPart]})
                </strong>
                <span style={{ fontWeight: 700, color: diag.bottleneckLevel === "critical" ? "#b91c1c" : "#0f172a" }}>
                  병목 {diag.bottleneckScore}점
                </span>
              </div>
              <div style={{ color: "#475569" }}>
                툴: {ASSISTANT_DCC_LABELS_KO[diag.dccTool]} · 배정 {diag.assignedSeriesCount}작품 · 잔여 {diag.wipCutCount}컷 (일 {diag.dailyCapacityCuts}컷)
              </div>
              <div style={{ color: diag.bottleneckLevel === "critical" ? "#991b1b" : "#15803d", fontWeight: 600 }}>
                원인: {diag.rootCauseLabelKo}
              </div>
              {diag.bottleneckLevel === "critical" || diag.bottleneckLevel === "warning" ? (
                <button
                  type="button"
                  data-testid={`rebalance-assistant-btn-${diag.assistantId}`}
                  onClick={() => handleRebalanceBottleneck(diag.assistantId)}
                  style={{
                    marginTop: "0.25rem",
                    padding: "0.28rem 0.55rem",
                    fontSize: "0.73rem",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "1px solid #0284c7",
                    background: "#0284c7",
                    color: "#ffffff",
                  }}
                >
                  여유 어시스턴트에게 병목 물량 분산 재배치
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* 3. 투니스트/에이툰(ATOON) 투고 규격 검증 & MG/RS 정산 모달 (light-dismiss-a-dialog 준수) */}
      <dialog
        ref={erpDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-labelledby={erpModalTitleId}
        data-testid="toonist-atoon-erp-dialog"
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          padding: "1rem",
          maxWidth: "560px",
          width: "92%",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div style={{ display: "grid", gap: "0.75rem", fontSize: "0.78rem" }}>
          <h4 id={erpModalTitleId} style={{ margin: 0, fontSize: "0.92rem" }}>
            투니스트(Toonist) · 에이툰(ATOON) 작가 경력·투고 규격 검증 및 MG/RS 정산 원장
          </h4>

          <div style={{ padding: "0.6rem", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <strong>작가 연재 경력 자동 계산기 (ATOON `/creator/artist/`):</strong>{" "}
            <span data-testid="atoon-career-summary-text">{careerSummary.formattedKo}</span>
          </div>

          <div style={{ padding: "0.6rem", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "0.4rem" }}>
            <strong>작품 투고 &amp; 3종 썸네일 규격 검증기 (ATOON `/creator/series/`):</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
              <label>
                작품명(30자 이내):{" "}
                <input
                  type="text"
                  aria-label="에이툰 투고 작품명"
                  data-testid="atoon-pitch-title-input"
                  value={pitchTitle}
                  onChange={(e) => setPitchTitle(e.target.value)}
                  style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
                />
              </label>
              <label>
                대표 배너 가로(px):{" "}
                <input
                  type="number"
                  aria-label="에이툰 대표 배너 가로 픽셀"
                  data-testid="atoon-banner-width-input"
                  value={pitchBannerWidth}
                  onChange={(e) => setPitchBannerWidth(Number(e.target.value) || 0)}
                  style={{ width: "5rem", padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
                />
              </label>
            </div>
            <div data-testid="atoon-validation-status" style={{ color: atoonValidation.valid ? "#15803d" : "#b91c1c", fontWeight: 600 }}>
              {atoonValidation.valid
                ? "검증 통과: 대표배너(1920×1080) · 메인(300×420) · 회차(250×125) 및 한·일 스튜디오 매칭 규격 충족"
                : `규격 오류: ${atoonValidation.errorsKo.join(" / ")}`}
            </div>
          </div>

          <div style={{ padding: "0.6rem", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "0.35rem" }}>
            <strong>스튜디오 MG(미니멈 개런티) + RS(수익 배분) &amp; 어시스턴트 공정비 정산:</strong>
            <label>
              월간 플랫폼 총매출(원):{" "}
              <input
                type="number"
                aria-label="월간 플랫폼 총매출"
                data-testid="studio-gross-revenue-input"
                value={grossRevenueKrw}
                onChange={(e) => setGrossRevenueKrw(Number(e.target.value) || 0)}
                style={{ width: "8rem", padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
              />
            </label>
            <div data-testid="studio-settlement-summary">
              월 MG 합계 {settlement.totalMgKrw.toLocaleString("ko-KR")}원 · 초과 RS 배분 {settlement.excessRsPayoutKrw.toLocaleString("ko-KR")}원 · 어시 공정비 공제 후 작가 실수령{" "}
              <strong>{settlement.creatorNetAfterAssistantKrw.toLocaleString("ko-KR")}원</strong>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              data-testid="close-toonist-atoon-erp-modal-btn"
              onClick={() => erpDialogRef.current?.close()}
              style={{ padding: "0.28rem 0.65rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
            >
              닫기
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
