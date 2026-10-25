import { useEffect, useId, useRef, useState } from "react";
import {
  addCutRedPenFeedback,
  buildSvgPathFromRedPenPoints,
  computeCorePipelineDashboardSummary,
  computeLargeManuscriptDeltaRevision,
  INITIAL_CUT_PIPELINE,
  INITIAL_LARGE_IMAGE_TILES,
  INITIAL_PSD_MANIFEST,
  INITIAL_REDPEN_FEEDBACKS,
  inspectPsdClipLayerSeparation,
  STANDARD_LAYER_ROLE_LABELS_KO,
  summarizeCutRedPenByCutAndStage,
  transitionCutRedPenStatus,
  WEBTOON_NOW_CORE_STAGES,
  WEBTOON_SUB_STAGE_LABELS_KO,
  type CutRedPenFeedbackItem,
  type PsdClipFileManifest,
  type RedPenInkColor,
  type RedPenPoint,
  type RedPenToolKind,
  type StandardWebtoonLayerRole,
  type WebtoonCutPipelineItem,
  type WebtoonNowCoreStage,
} from "./production-webtoon-now-pms-model";

const WEBTOON_NOW_TABLE_CSS = `
.webtoon-now-table-wrapper {
  overflow: auto;
  max-inline-size: 100%;
  max-block-size: min(440px, 75vh);
  container-type: inline-size;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
}
.webtoon-now-table-wrapper table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.78rem;
  --label-2: "공정 단계";
  --label-3: "세부 파트";
  --label-4: "담당 작업자";
  --label-5: "PSD/CLIP 레이어";
  --label-6: "빨간펜 피드백";
  --label-7: "진행 상태";
}
.webtoon-now-table-wrapper thead {
  position: sticky;
  inset-block-start: 0;
  z-index: 2;
  background: #f1f5f9;
}
.webtoon-now-table-wrapper thead th {
  text-align: left;
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid #cbd5e1;
  color: #0f172a;
}
.webtoon-now-table-wrapper tbody th {
  position: sticky;
  inset-inline-start: 0;
  z-index: 1;
  background: #f8fafc;
  text-align: left;
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid #e2e8f0;
}
.webtoon-now-table-wrapper tbody td {
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid #e2e8f0;
  font-variant-numeric: tabular-nums;
}
@container (width < 600px) {
  .webtoon-now-table-wrapper table,
  .webtoon-now-table-wrapper thead,
  .webtoon-now-table-wrapper tbody,
  .webtoon-now-table-wrapper tr,
  .webtoon-now-table-wrapper th,
  .webtoon-now-table-wrapper td {
    display: block;
  }
  .webtoon-now-table-wrapper thead { display: none; }
  .webtoon-now-table-wrapper tr { margin-block-end: 0.75rem; border: 1px solid #cbd5e1; }
  .webtoon-now-table-wrapper tbody th { position: sticky; inset-block-start: 0; z-index: 2; background: #e2e8f0; }
  .webtoon-now-table-wrapper td:nth-child(2)::before { content: var(--label-2) ": "; font-weight: 700; }
  .webtoon-now-table-wrapper td:nth-child(3)::before { content: var(--label-3) ": "; font-weight: 700; }
  .webtoon-now-table-wrapper td:nth-child(4)::before { content: var(--label-4) ": "; font-weight: 700; }
  .webtoon-now-table-wrapper td:nth-child(5)::before { content: var(--label-5) ": "; font-weight: 700; }
  .webtoon-now-table-wrapper td:nth-child(6)::before { content: var(--label-6) ": "; font-weight: 700; }
  .webtoon-now-table-wrapper td:nth-child(7)::before { content: var(--label-7) ": "; font-weight: 700; }
}
`;

export function ProductionWebtoonNowPmsSuite() {
  const captionId = useId();
  const layerDialogTitleId = useId();
  const layerDialogRef = useRef<HTMLDialogElement | null>(null);

  const [cuts, setCuts] = useState<readonly WebtoonCutPipelineItem[]>(INITIAL_CUT_PIPELINE);
  const [selectedCoreStage, setSelectedCoreStage] = useState<WebtoonNowCoreStage | "all">("all");
  const [manifest, setManifest] = useState<PsdClipFileManifest>(INITIAL_PSD_MANIFEST);
  const [inspectStage, setInspectStage] = useState<WebtoonNowCoreStage>("coloring");

  const [redPenFeedbacks, setRedPenFeedbacks] = useState<readonly CutRedPenFeedbackItem[]>(INITIAL_REDPEN_FEEDBACKS);
  const [activeCutNumber, setActiveCutNumber] = useState<number>(12);
  const [activeTool, setActiveTool] = useState<RedPenToolKind>("freehand-pen");
  const [activeColor, setActiveColor] = useState<RedPenInkColor>("#ef4444");
  const [targetStage, setTargetStage] = useState<WebtoonNowCoreStage>("lineart");
  const [targetLayer, setTargetLayer] = useState<StandardWebtoonLayerRole>("lineart");
  const [draftInstruction, setDraftInstruction] = useState<string>("");
  const [draftPoints, setDraftPoints] = useState<readonly RedPenPoint[]>([
    { x: 0.18, y: 0.28 },
    { x: 0.42, y: 0.54 },
    { x: 0.68, y: 0.44 },
  ]);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // `closedby="any"` 미지원 브라우저용 light-dismiss 폴백
  useEffect(() => {
    const dialog = layerDialogRef.current;
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

  const stageSummaries = computeCorePipelineDashboardSummary(cuts);
  const visibleCuts = selectedCoreStage === "all" ? cuts : cuts.filter((item) => item.coreStage === selectedCoreStage);
  const layerInspection = inspectPsdClipLayerSeparation(manifest, inspectStage);
  const deltaRevision = computeLargeManuscriptDeltaRevision({
    fileName: manifest.fileName,
    format: manifest.format,
    fullFileSizeMb: manifest.totalSizeMb,
    tiles: INITIAL_LARGE_IMAGE_TILES,
  });
  const redPenSummary = summarizeCutRedPenByCutAndStage(redPenFeedbacks);

  const handleUnmergeBaseColorLayer = () => {
    setManifest((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) => (layer.id === "lyr-base" ? { ...layer, isMergedOrFlattened: false } : layer)),
    }));
    setCuts((prev) => prev.map((cut) => (cut.id === "cut-12-color" ? { ...cut, layerSeparatedValid: true } : cut)));
  };

  const handleCanvasPointerClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 360;
    const height = rect.height > 0 ? rect.height : 200;
    const normX = Math.max(0.05, Math.min(0.95, (event.clientX - rect.left) / width));
    const normY = Math.max(0.05, Math.min(0.95, (event.clientY - rect.top) / height));
    setDraftPoints((prev) => [...prev.slice(-5), { x: normX, y: normY }]);
  };

  const handleSubmitRedPenFeedback = () => {
    const result = addCutRedPenFeedback(redPenFeedbacks, {
      id: `rp-${redPenFeedbacks.length + 1}`,
      episodeNumber: 12,
      cutNumber: activeCutNumber,
      targetCoreStage: targetStage,
      targetLayerRole: targetLayer,
      authorName: "총괄 연출 PD",
      instruction: draftInstruction,
      priority: activeColor === "#ef4444" ? "critical" : "normal",
      strokes: [{ id: `stroke-${Date.now()}`, tool: activeTool, color: activeColor, strokeWidthPx: 3, points: draftPoints }],
      createdAtIso: "2026-10-26T15:30:00.000Z",
    });

    if (!result.added) {
      setFeedbackError(result.errorKo);
      return;
    }

    setFeedbackError(null);
    setRedPenFeedbacks(result.items);
    setDraftInstruction("");
  };

  const draftSvgPath = buildSvgPathFromRedPenPoints(draftPoints, 360, 180);

  return (
    <section
      aria-label="웹툰나우(Webtoon Now) 전용 파이프라인(콘티·선화·채색·후가공), PSD/CLIP 레이어 검수 및 빨간 펜 칸별 피드백"
      data-testid="production-webtoon-now-pms-suite"
      style={{ display: "grid", gap: "1rem", padding: "1rem", borderRadius: "12px", border: "1px solid var(--border-subtle, #cbd5e1)", background: "var(--surface-elevated, #ffffff)" }}
    >
      <style>{WEBTOON_NOW_TABLE_CSS}</style>

      {/* 1. 콘티 ➡️ 선화 ➡️ 채색 ➡️ 후가공 4단계 핵심 파이프라인 대시보드 */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "0.95rem" }}>
            웹툰나우(Webtoon Now) 4단계 핵심 공정 대시보드 (콘티 ➡️ 선화 ➡️ 채색 ➡️ 후가공)
          </h3>
          <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#475569" }}>
            레이어 분리 파일(PSD/CLIP) 상태, 대용량 이미지 델타 수정, 칸별 빨간 펜 피드백을 한눈에 관제합니다.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          <button
            type="button"
            data-testid="webtoon-now-stage-filter-all"
            aria-pressed={selectedCoreStage === "all"}
            onClick={() => setSelectedCoreStage("all")}
            style={{ padding: "0.28rem 0.6rem", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: selectedCoreStage === "all" ? "#0f172a" : "#ffffff", color: selectedCoreStage === "all" ? "#ffffff" : "#0f172a" }}
          >
            전체 공정 ({cuts.length}컷)
          </button>
          {WEBTOON_NOW_CORE_STAGES.map((stage) => (
            <button
              key={stage.coreStage}
              type="button"
              data-testid={`webtoon-now-stage-filter-${stage.coreStage}`}
              aria-pressed={selectedCoreStage === stage.coreStage}
              onClick={() => setSelectedCoreStage(stage.coreStage)}
              style={{ padding: "0.28rem 0.6rem", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: selectedCoreStage === stage.coreStage ? "#0284c7" : "#f8fafc", color: selectedCoreStage === stage.coreStage ? "#ffffff" : "#0f172a" }}
            >
              {stage.order}. {stage.labelKo}
            </button>
          ))}
        </div>
      </div>

      {/* 4단계 파이프라인 카드 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.65rem" }}>
        {stageSummaries.map((summary, idx) => (
          <div
            key={summary.coreStage}
            data-testid={`core-stage-card-${summary.coreStage}`}
            style={{ padding: "0.75rem", borderRadius: "10px", border: summary.handoffGateBlocked ? "1px solid #f87171" : "1px solid #cbd5e1", background: summary.handoffGateBlocked ? "#fef2f2" : "#f8fafc", fontVariantNumeric: "tabular-nums" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", fontWeight: 700 }}>
              <span>{idx + 1}. {summary.labelKo} {idx < 3 ? "➡️" : "✅"}</span>
              <span>{summary.completionPercent}%</span>
            </div>
            <div style={{ fontSize: "0.74rem", color: "#334155", marginTop: "0.35rem" }}>
              승인 {summary.approvedCuts}컷 · 진행 {summary.inProgressCuts}컷 · 빨간펜 {summary.redlineRequestedCuts}컷
            </div>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: summary.blockReasonKo ? "#b91c1c" : "#15803d", fontWeight: 600 }}>
              {summary.blockReasonKo ? `인계 보류: ${summary.blockReasonKo}` : "다음 공정 인계 가능"}
            </p>
          </div>
        ))}
      </div>

      {/* 칸별(컷별) 공정 현황 테이블 (responsive-table 가이드 준수) */}
      <div role="region" aria-labelledby={captionId} className="webtoon-now-table-wrapper" data-testid="webtoon-now-cut-table-region">
        <table>
          <caption id={captionId} style={{ textAlign: "left", padding: "0.45rem 0.65rem", fontWeight: 700, fontSize: "0.78rem" }}>
            12화 칸별(컷별) 콘티 ➡️ 선화 ➡️ 채색 ➡️ 후가공 진행 매트릭스
          </caption>
          <thead>
            <tr>
              <th scope="col">칸(컷) 번호</th>
              <th scope="col">공정 단계</th>
              <th scope="col">세부 파트</th>
              <th scope="col">담당 작업자</th>
              <th scope="col">PSD/CLIP 레이어</th>
              <th scope="col">빨간펜 피드백</th>
              <th scope="col">진행 상태</th>
            </tr>
          </thead>
          <tbody>
            {visibleCuts.map((cut) => {
              const coreLabel = WEBTOON_NOW_CORE_STAGES.find((s) => s.coreStage === cut.coreStage)?.labelKo ?? cut.coreStage;
              return (
                <tr key={cut.id} data-testid={`cut-pipeline-row-${cut.cutNumber}`}>
                  <th scope="row">{cut.episodeNumber}화 · {cut.cutNumber}컷</th>
                  <td>{coreLabel}</td>
                  <td>{WEBTOON_SUB_STAGE_LABELS_KO[cut.subStage]}</td>
                  <td>{cut.assigneeName}</td>
                  <td>{cut.layerSeparatedValid ? "분리 정상" : "병합 오류 감지"}</td>
                  <td>{cut.openRedPenCount > 0 ? `미해결 ${cut.openRedPenCount}건` : "해결 완료"}</td>
                  <td>{cut.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2. 레이어 분리 파일(PSD/CLIP) 구조 검수 & 대용량 이미지 타일·컷 델타 수정 */}
      <div style={{ display: "grid", gap: "0.6rem", padding: "0.8rem", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#f8fafc", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <div>
            <strong style={{ fontSize: "0.85rem" }}>
              레이어 분리 파일({manifest.format}: {manifest.fileName}) 검수 &amp; 대용량 이미지({manifest.totalSizeMb}MB) 델타 수정
            </strong>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.75rem", color: "#475569" }}>
              전체 {deltaRevision.fullFileSizeMb}MB 중 변경된 타일({deltaRevision.changedTileIndices.join(", ")}번 · 대상 {deltaRevision.affectedCutNumbers.length}개 컷)만 부분 동기화하여 전송량 {deltaRevision.deltaTransferMb}MB ({deltaRevision.bandwidthSavedPercent}% 절감)
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <select
              aria-label="PSD/CLIP 검수 대상 공정 선택"
              data-testid="psd-clip-inspect-stage-select"
              value={inspectStage}
              onChange={(e) => setInspectStage(e.target.value as WebtoonNowCoreStage)}
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: "6px" }}
            >
              {WEBTOON_NOW_CORE_STAGES.map((st) => (
                <option key={st.coreStage} value={st.coreStage}>{st.labelKo} 공정 기준 검수</option>
              ))}
            </select>

            <button
              type="button"
              data-testid="unmerge-psd-clip-layer-btn"
              onClick={handleUnmergeBaseColorLayer}
              style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid #0284c7", background: "#e0f2fe", color: "#0369a1" }}
            >
              병합된 밑색 레이어 분리 복구
            </button>

            <button
              type="button"
              data-testid="open-psd-clip-inspector-modal-btn"
              onClick={() => layerDialogRef.current?.showModal()}
              style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid #334155", background: "#ffffff" }}
            >
              레이어 트리 상세 검수 열기
            </button>
          </div>
        </div>

        <div data-testid="psd-clip-inspection-summary" style={{ fontSize: "0.76rem" }}>
          <span>검수 점수: <strong>{layerInspection.score}점</strong> ({layerInspection.valid ? "통과" : "분리 오류 존재"})</span>
          {layerInspection.issues.length > 0 && (
            <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem", color: "#b91c1c" }}>
              {layerInspection.issues.map((issue, idx) => <li key={`${issue.code}-${idx}`}>{issue.messageKo}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* PSD/CLIP 레이어 트리 상세 모달 (light-dismiss-a-dialog 가이드 준수) */}
      <dialog
        ref={layerDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-labelledby={layerDialogTitleId}
        data-testid="psd-clip-layer-dialog"
        style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "1rem", maxWidth: "520px", width: "92%" }}
      >
        <div style={{ display: "grid", gap: "0.65rem" }}>
          <h4 id={layerDialogTitleId} style={{ margin: 0, fontSize: "0.9rem" }}>
            {manifest.fileName} 레이어 분리 트리 ({manifest.canvasWidthPx}×{manifest.canvasHeightPx}px · {manifest.dpi}DPI)
          </h4>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.76rem", display: "grid", gap: "0.25rem" }}>
            {manifest.layers.map((lyr) => (
              <li key={lyr.id}>
                <strong>{lyr.name}</strong> ({lyr.blendMode} · {lyr.byteSizeMb}MB) — {lyr.isMergedOrFlattened ? "병합 오류" : "독립 분리됨"}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              data-testid="close-psd-clip-inspector-modal-btn"
              onClick={() => layerDialogRef.current?.close()}
              style={{ padding: "0.28rem 0.65rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #94a3b8" }}
            >
              닫기
            </button>
          </div>
        </div>
      </dialog>

      {/* 3. 이미지 위 마우스 빨간 펜 치기(Red-Pen Markup) & 칸별 피드백 워크스테이션 */}
      <div style={{ display: "grid", gap: "0.7rem", padding: "0.85rem", borderRadius: "10px", border: "1px solid #fecaca", background: "#fff5f5" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <div>
            <strong style={{ fontSize: "0.86rem", color: "#991b1b" }}>
              원고 이미지 위 마우스 빨간 펜 치기 (Red-Pen Markup) &amp; 칸별 피드백
            </strong>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.75rem", color: "#7f1d1d" }}>
              전체 피드백 {redPenSummary.totalCount}건 (미해결 {redPenSummary.openCount} · 수정본 업로드 {redPenSummary.revisedUploadedCount} · 검수 완료 {redPenSummary.resolvedCount})
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", fontSize: "0.75rem" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              대상 컷:
              <select aria-label="빨간 펜 피드백 대상 칸 번호" data-testid="redpen-cut-select" value={activeCutNumber} onChange={(e) => setActiveCutNumber(Number(e.target.value))} style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}>
                <option value={4}>12화 · 4컷 (콘티)</option>
                <option value={12}>12화 · 12컷 (선화)</option>
                <option value={18}>12화 · 18컷 (채색)</option>
                <option value={24}>12화 · 24컷 (후가공)</option>
              </select>
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              펜 도구:
              <select aria-label="빨간 펜 마킹 도구" data-testid="redpen-tool-select" value={activeTool} onChange={(e) => setActiveTool(e.target.value as RedPenToolKind)} style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}>
                <option value="freehand-pen">빨간 펜 자유곡선</option>
                <option value="arrow">지시 화살표</option>
                <option value="rect-box">수정 영역 박스</option>
                <option value="highlight">형광펜 강조</option>
              </select>
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              잉크 색상:
              <select aria-label="빨간 펜 잉크 색상" data-testid="redpen-color-select" value={activeColor} onChange={(e) => setActiveColor(e.target.value as RedPenInkColor)} style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}>
                <option value="#ef4444">빨간 펜 (필수 작화/채색 교정)</option>
                <option value="#3b82f6">파란 펜 (구도/투시 가이드)</option>
                <option value="#eab308">노란 펜 (조명/이펙트 체크)</option>
              </select>
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              대상 레이어:
              <select aria-label="빨간 펜 타깃 레이어" data-testid="redpen-layer-select" value={targetLayer} onChange={(e) => setTargetLayer(e.target.value as StandardWebtoonLayerRole)} style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}>
                {(Object.keys(STANDARD_LAYER_ROLE_LABELS_KO) as StandardWebtoonLayerRole[]).map((role) => (
                  <option key={role} value={role}>{STANDARD_LAYER_ROLE_LABELS_KO[role]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* 인터랙티브 빨간 펜 마킹 캔버스 & 코멘트 입력 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem", alignItems: "start" }}>
          <div style={{ border: "1px solid #f87171", borderRadius: "8px", background: "#1e293b", padding: "0.5rem" }}>
            <div style={{ fontSize: "0.72rem", color: "#f8fafc", marginBottom: "0.3rem" }}>
              12화 {activeCutNumber}컷 원고 캔버스 (클릭하여 마우스로 빨간 펜 마킹 좌표 추가)
            </div>
            <svg
              viewBox="0 0 360 180"
              role="img"
              aria-label={`12화 ${activeCutNumber}컷 빨간 펜 피드백 드로잉 캔버스`}
              data-testid="redpen-drawing-canvas"
              onClick={handleCanvasPointerClick}
              style={{ width: "100%", height: "150px", background: "#0f172a", borderRadius: "6px", cursor: "crosshair", display: "block" }}
            >
              <rect x="12" y="12" width="336" height="156" fill="var(--color-panel)" stroke="var(--color-fg-3)" strokeDasharray="4 4" />
              <text x="24" y="34" fill="var(--color-line)" fontSize="11">
                CUT #{activeCutNumber} · {STANDARD_LAYER_ROLE_LABELS_KO[targetLayer]}
              </text>
              {draftSvgPath && (
                <path d={draftSvgPath} fill="none" stroke={activeColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" data-testid="redpen-active-stroke-path" />
              )}
            </svg>
          </div>

          <div style={{ display: "grid", gap: "0.45rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#7f1d1d" }}>
              칸별 수정 요청 코멘트 ({activeCutNumber}컷 · {STANDARD_LAYER_ROLE_LABELS_KO[targetLayer]}):
              <input
                type="text"
                aria-label="칸별 빨간 펜 피드백 코멘트 입력"
                data-testid="redpen-instruction-input"
                placeholder="예: 손가락 외곽선 두께 보강 및 역광 그림자 경계 수정"
                value={draftInstruction}
                onChange={(e) => {
                  setDraftInstruction(e.target.value);
                  setTargetStage(activeCutNumber <= 4 ? "storyboard" : activeCutNumber <= 12 ? "lineart" : activeCutNumber <= 18 ? "coloring" : "postprocess");
                }}
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.38rem 0.55rem", fontSize: "0.76rem", borderRadius: "6px", border: "1px solid #fca5a5" }}
              />
            </label>

            {feedbackError && (
              <p role="alert" data-testid="redpen-feedback-error" style={{ margin: 0, fontSize: "0.74rem", color: "#b91c1c" }}>
                {feedbackError}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button
                type="button"
                data-testid="submit-redpen-feedback-btn"
                onClick={handleSubmitRedPenFeedback}
                style={{ padding: "0.32rem 0.75rem", fontSize: "0.76rem", fontWeight: 700, borderRadius: "6px", border: "1px solid #dc2626", background: "#dc2626", color: "#ffffff" }}
              >
                빨간 펜 피드백 등록
              </button>
              <button
                type="button"
                data-testid="clear-redpen-strokes-btn"
                onClick={() => setDraftPoints([{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }])}
                style={{ padding: "0.32rem 0.65rem", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff" }}
              >
                마킹 초기화
              </button>
            </div>
          </div>
        </div>

        {/* 등록된 칸별 빨간 펜 피드백 리스트 */}
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
          {redPenFeedbacks.map((item) => (
            <li
              key={item.id}
              data-testid={`redpen-feedback-item-${item.id}`}
              style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.65rem", borderRadius: "8px", border: "1px solid #fecaca", background: "#ffffff", fontSize: "0.75rem" }}
            >
              <div>
                <strong>[{item.episodeNumber}화 {item.cutNumber}컷 · {STANDARD_LAYER_ROLE_LABELS_KO[item.targetLayerRole]}]</strong>{" "}
                <span>{item.instruction}</span>{" "}
                <span style={{ color: "#64748b" }}>(마킹 획 {item.strokes.length}개 · 상태: {item.status})</span>
              </div>

              <div style={{ display: "flex", gap: "0.35rem" }}>
                {item.status !== "resolved" ? (
                  <button
                    type="button"
                    data-testid={`resolve-redpen-btn-${item.id}`}
                    onClick={() => setRedPenFeedbacks((prev) => transitionCutRedPenStatus(prev, item.id, "resolved", "2026-10-26T16:00:00.000Z"))}
                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem", borderRadius: "6px", border: "1px solid #16a34a", background: "#dcfce7", color: "#166534" }}
                  >
                    검수 완료 처리
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`reopen-redpen-btn-${item.id}`}
                    onClick={() => setRedPenFeedbacks((prev) => transitionCutRedPenStatus(prev, item.id, "open", "2026-10-26T16:05:00.000Z"))}
                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem", borderRadius: "6px", border: "1px solid #dc2626", background: "#fee2e2", color: "#991b1b" }}
                  >
                    재요청 전환
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
