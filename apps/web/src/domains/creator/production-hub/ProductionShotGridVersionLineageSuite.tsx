import { useMemo, useState } from "react";
import {
  analyzePublishedFileDownstreamImpact,
  buildVersionLineageChain,
  computeBeforeAfterVersionDiff,
  filterShotGridVersions,
  INITIAL_SHOTGRID_NOTES,
  INITIAL_SHOTGRID_PUBLISHED_FILES,
  INITIAL_SHOTGRID_VERSIONS,
  SHOTGRID_STATUS_META,
  SHOTGRID_STEP_LABELS,
  transitionShotGridVersionStatus,
  type ShotGridPipelineStep,
  type ShotGridReviewCompareMode,
  type ShotGridStatusCode,
  type ShotGridVersionRecord,
} from "./production-shotgrid-version-lineage-model";

const COMPARE_MODE_LABELS: Readonly<Record<ShotGridReviewCompareMode, string>> = {
  "side-by-side": "나란히 대조 (Side-by-Side)",
  "ab-wipe": "A/B 와이프 분할 (Wipe)",
  "onion-skin": "어니언 스킨 중첩 (Onion Skin)",
  "diff-matte": "픽셀 변경 매트 (ΔE Diff Matte)",
};

const BOX_STYLE = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "0.85rem",
  display: "grid",
  gap: "0.55rem",
} as const;

const INPUT_STYLE = {
  minHeight: 44,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  padding: "0 0.5rem",
  background: "#ffffff",
} as const;

export function ProductionShotGridVersionLineageSuite() {
  const [versions, setVersions] = useState<readonly ShotGridVersionRecord[]>(INITIAL_SHOTGRID_VERSIONS);
  const [stepFilter, setStepFilter] = useState<ShotGridPipelineStep | "all">("all");
  const [cutFilterInput, setCutFilterInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [beforeVersionId, setBeforeVersionId] = useState("sg-ver-1");
  const [afterVersionId, setAfterVersionId] = useState("sg-ver-3");
  const [compareMode, setCompareMode] = useState<ShotGridReviewCompareMode>("side-by-side");
  const [blendPercent, setBlendPercent] = useState(50);
  const [selectedPublishedFileId, setSelectedPublishedFileId] = useState("pub-clip-line-v2");
  const [newCutNumber, setNewCutNumber] = useState(42);
  const [newBeforeNote, setNewBeforeNote] = useState("기존 음영 경계선");
  const [newAfterNote, setNewAfterNote] = useState("역광 그라데이션 및 매화검기 색수차 미세 보정");
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const parsedCutFilter = useMemo(() => {
    const trimmed = cutFilterInput.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  }, [cutFilterInput]);

  const filteredVersions = useMemo(
    () => filterShotGridVersions(versions, { step: stepFilter, cutNumber: parsedCutFilter, searchQuery }),
    [versions, stepFilter, parsedCutFilter, searchQuery],
  );
  const lineageChain = useMemo(() => buildVersionLineageChain(versions, afterVersionId), [versions, afterVersionId]);
  const diffReport = useMemo(
    () => computeBeforeAfterVersionDiff(versions, beforeVersionId, afterVersionId, INITIAL_SHOTGRID_NOTES),
    [versions, beforeVersionId, afterVersionId],
  );
  const downstreamImpact = useMemo(
    () => analyzePublishedFileDownstreamImpact(INITIAL_SHOTGRID_PUBLISHED_FILES, selectedPublishedFileId),
    [selectedPublishedFileId],
  );

  const handleStatusChange = (versionId: string, nextStatus: ShotGridStatusCode) => {
    const result = transitionShotGridVersionStatus(versions, versionId, nextStatus);
    if (!result.updated) {
      setStatusFeedback("최종 마감(FIN) 상태인 버전은 잠겨 있어 상태를 되돌릴 수 없습니다.");
      return;
    }
    setVersions(result.versions);
    setStatusFeedback(`버전 상태를 '${SHOTGRID_STATUS_META[nextStatus].labelKo}'(으)로 변경했습니다.`);
  };

  const handleAppendVersion = () => {
    const latest = versions.at(-1);
    if (!latest) return;
    const nextNumber = latest.versionNumber + 1;
    const nextCode = `v${String(nextNumber).padStart(3, "0")}`;
    const nextId = `sg-ver-${nextNumber}`;
    const created: ShotGridVersionRecord = {
      id: nextId,
      versionCode: nextCode,
      versionNumber: nextNumber,
      episodeId: latest.episodeId,
      episodeLabel: latest.episodeLabel,
      step: latest.step,
      cutRange: latest.cutRange,
      status: "rev",
      artistId: latest.artistId,
      artistName: latest.artistName,
      createdAt: new Date().toISOString(),
      parentVersionId: latest.id,
      byteHash: `sha256-48c${nextNumber}00d2`,
      resolution: latest.resolution,
      fileSizeBytes: latest.fileSizeBytes + 920_000,
      comment: `${newCutNumber}컷 수정 전/후 히스토리 반영 (${newAfterNote})`,
      triggeredByNoteId: "note-retake-3",
      changeRegions: [
        {
          regionId: `reg-${nextCode}-c${newCutNumber}`,
          cutNumber: newCutNumber,
          label: `${newCutNumber}컷 리테이크 반영 히스토리`,
          xPercent: 16,
          yPercent: 20,
          widthPercent: 60,
          heightPercent: 50,
          changedPixelRatio: 0.25,
          deltaE: 8.4,
          beforeSummary: newBeforeNote.trim() || "수정 전 상태",
          afterSummary: newAfterNote.trim() || "수정 후 상태",
          linkedNoteId: "note-retake-3",
        },
      ],
      publishedFileIds: [`pub-psd-${nextCode}`],
    };
    setVersions((prev) => [...prev, created]);
    setBeforeVersionId(latest.id);
    setAfterVersionId(nextId);
    setStatusFeedback(`${nextCode} 버전을 등록하고 수정 전(${latest.versionCode}) ↔ 수정 후(${nextCode}) 비교로 전환했습니다.`);
  };

  return (
    <section
      aria-label="ShotGrid 원고 버전 히스토리 및 수정 전·후 정밀 추적"
      data-testid="shotgrid-version-lineage-suite"
      style={{ border: "1px solid #cbd5e1", borderRadius: 14, padding: "1rem", background: "#f8fafc", display: "grid", gap: "1rem" }}
    >
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <span style={{ display: "inline-block", fontSize: "0.7rem", fontWeight: 800, color: "#0f766e", background: "#ccfbf1", padding: "0.15rem 0.5rem", borderRadius: 999 }}>
            ShotGrid (Flow Production Tracking) 내재화
          </span>
          <h3 style={{ margin: "0.3rem 0 0", fontSize: "1rem", fontWeight: 800, color: "#0f172a" }}>
            원고 버전 계보(v001→v00N) · 수정 전(Before) ↔ 수정 후(After) 컷별 히스토리 추적기
          </h3>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "#475569" }}>
            노블코믹스·대형 스튜디오 공정별로 수정 전 원고와 수정 후 원고의 컷 단위 색차(ΔE), 픽셀 변경률, PD 리테이크 반영 여부 및 원본 파일(.clip/.psd/.skp) 의존성을 추적합니다.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
            공정 필터
            <select
              aria-label="ShotGrid 공정 필터"
              value={stepFilter}
              onChange={(event) => setStepFilter(event.target.value as ShotGridPipelineStep | "all")}
              style={{ ...INPUT_STYLE, marginLeft: 6 }}
            >
              <option value="all">전체 공정</option>
              {(Object.keys(SHOTGRID_STEP_LABELS) as ShotGridPipelineStep[]).map((step) => (
                <option key={step} value={step}>{SHOTGRID_STEP_LABELS[step]}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
            컷 번호
            <input
              type="number"
              aria-label="ShotGrid 컷 번호 필터"
              placeholder="예: 14"
              value={cutFilterInput}
              onChange={(event) => setCutFilterInput(event.target.value)}
              style={{ ...INPUT_STYLE, marginLeft: 6, width: 82 }}
            />
          </label>
          <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
            검색
            <input
              type="search"
              aria-label="ShotGrid 버전 히스토리 검색"
              placeholder="버전·작가·수정 내역 검색"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              style={{ ...INPUT_STYLE, marginLeft: 6 }}
            />
          </label>
        </div>
      </header>

      {statusFeedback ? (
        <p
          role="status"
          data-testid="shotgrid-status-feedback"
          style={{ margin: 0, padding: "0.5rem 0.75rem", borderRadius: 8, background: "#ecfeff", border: "1px solid #a5f3fc", fontSize: "0.78rem", fontWeight: 700, color: "#155e75" }}
        >
          {statusFeedback}
        </p>
      ) : null}

      <div style={{ ...BOX_STYLE, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
          수정 전 원고 (Before Version)
          <select
            aria-label="수정 전 버전 선택"
            data-testid="shotgrid-before-select"
            value={beforeVersionId}
            onChange={(event) => setBeforeVersionId(event.target.value)}
            style={INPUT_STYLE}
          >
            {versions.map((ver) => (
              <option key={ver.id} value={ver.id}>{ver.versionCode} · {ver.comment.slice(0, 28)}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
          수정 후 원고 (After Version)
          <select
            aria-label="수정 후 버전 선택"
            data-testid="shotgrid-after-select"
            value={afterVersionId}
            onChange={(event) => setAfterVersionId(event.target.value)}
            style={INPUT_STYLE}
          >
            {versions.map((ver) => (
              <option key={ver.id} value={ver.id}>{ver.versionCode} · {ver.comment.slice(0, 28)}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
          Screening Room 비교 렌즈
          <select
            aria-label="Screening Room 비교 렌즈"
            data-testid="shotgrid-compare-mode-select"
            value={compareMode}
            onChange={(event) => setCompareMode(event.target.value as ShotGridReviewCompareMode)}
            style={INPUT_STYLE}
          >
            {(Object.keys(COMPARE_MODE_LABELS) as ShotGridReviewCompareMode[]).map((mode) => (
              <option key={mode} value={mode}>{COMPARE_MODE_LABELS[mode]}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
          와이프 / 어니언 스킨 비율 ({blendPercent}%)
          <input
            type="range"
            aria-label="와이프 및 어니언 스킨 비율"
            min={0}
            max={100}
            value={blendPercent}
            onChange={(event) => setBlendPercent(Number(event.target.value))}
            style={{ minHeight: 44 }}
          />
        </label>
      </div>

      {diffReport ? (
        <div data-testid="shotgrid-before-after-diff-summary" style={{ ...BOX_STYLE, gap: "0.75rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#0f172a" }}>
              히스토리 계보 경로: <span style={{ color: "#0284c7" }}>{diffReport.lineagePathCodes.join(" → ")}</span> ({COMPARE_MODE_LABELS[compareMode]} · {blendPercent}%)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", fontSize: "0.74rem", fontWeight: 700 }}>
              <span style={{ background: "#dbeafe", color: "#1e40af", padding: "0.2rem 0.55rem", borderRadius: 999 }}>
                변경된 컷: {diffReport.modifiedCutNumbers.map((c) => `${c}컷`).join(", ") || "없음"}
              </span>
              <span style={{ background: "#fef3c7", color: "#92400e", padding: "0.2rem 0.55rem", borderRadius: 999 }}>
                평균 색차 ΔE {diffReport.averageDeltaE} (최대 ΔE {diffReport.maxDeltaE})
              </span>
              <span style={{ background: "#dcfce7", color: "#166534", padding: "0.2rem 0.55rem", borderRadius: 999 }}>
                리테이크 검증 완료 {diffReport.verifiedNoteIds.length}건 · 미반영 {diffReport.unverifiedNoteIds.length}건
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: "0.55rem" }}>
            {diffReport.changeRegions.map((region) => (
              <div
                key={region.regionId}
                style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.65rem 0.8rem", background: "#f8fafc", display: "grid", gap: "0.35rem" }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.4rem" }}>
                  <strong style={{ fontSize: "0.8rem", color: "#0f172a" }}>[{region.cutNumber}컷] {region.label}</strong>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#475569" }}>
                    변경 픽셀 {Math.round(region.changedPixelRatio * 100)}% · ΔE {region.deltaE} · 영역 ({region.xPercent}%, {region.yPercent}%)
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.5rem", fontSize: "0.76rem" }}>
                  <div style={{ padding: "0.45rem 0.6rem", borderRadius: 6, background: "#fee2e2", color: "#991b1b" }}>
                    <strong>수정 전 ({diffReport.beforeVersionCode}):</strong> {region.beforeSummary}
                  </div>
                  <div style={{ padding: "0.45rem 0.6rem", borderRadius: 6, background: "#dcfce7", color: "#166534" }}>
                    <strong>수정 후 ({diffReport.afterVersionCode}):</strong> {region.afterSummary}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
        <div style={BOX_STYLE}>
          <h4 style={{ margin: 0, fontSize: "0.84rem", fontWeight: 800, color: "#0f172a" }}>
            버전 히스토리 목록 ({filteredVersions.length}개 · 계보 체인 {lineageChain.length}단계)
          </h4>
          {filteredVersions.map((ver) => {
            const statusMeta = SHOTGRID_STATUS_META[ver.status];
            return (
              <div key={ver.id} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "0.6rem", display: "grid", gap: "0.35rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
                  <strong style={{ fontSize: "0.8rem", color: "#0f172a" }}>
                    {ver.versionCode} · {SHOTGRID_STEP_LABELS[ver.step]} ({ver.cutRange[0]}~{ver.cutRange[1]}컷)
                  </strong>
                  <span style={{ fontSize: "0.68rem", fontWeight: 800, padding: "0.15rem 0.45rem", borderRadius: 999, background: statusMeta.bg, color: statusMeta.color }}>
                    {statusMeta.labelKo}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#334155" }}>{ver.comment}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {(["rev", "fix", "apr", "fin"] as const).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleStatusChange(ver.id, code)}
                      style={{
                        minHeight: 36,
                        padding: "0.2rem 0.55rem",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        background: ver.status === code ? "#0f172a" : "#f8fafc",
                        color: ver.status === code ? "#ffffff" : "#334155",
                        cursor: "pointer",
                      }}
                    >
                      {SHOTGRID_STATUS_META[code].labelKo}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gap: "0.75rem" }}>
          <div style={BOX_STYLE}>
            <h4 style={{ margin: 0, fontSize: "0.84rem", fontWeight: 800, color: "#0f172a" }}>새 리테이크 반영 버전(수정 후 스냅샷) 기록</h4>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "0.45rem" }}>
              <input
                type="number"
                aria-label="수정 컷 번호 입력"
                value={newCutNumber}
                onChange={(event) => setNewCutNumber(Number(event.target.value) || 1)}
                style={INPUT_STYLE}
              />
              <input
                type="text"
                aria-label="수정 전 상태 요약"
                value={newBeforeNote}
                onChange={(event) => setNewBeforeNote(event.target.value)}
                placeholder="수정 전 요약"
                style={INPUT_STYLE}
              />
            </div>
            <input
              type="text"
              aria-label="수정 후 반영 내역 요약"
              value={newAfterNote}
              onChange={(event) => setNewAfterNote(event.target.value)}
              placeholder="수정 후 반영 내역 요약"
              style={INPUT_STYLE}
            />
            <button
              type="button"
              data-testid="shotgrid-register-version-btn"
              onClick={handleAppendVersion}
              style={{ minHeight: 44, borderRadius: 8, border: "none", background: "#0f766e", color: "#ffffff", fontWeight: 800, fontSize: "0.78rem", cursor: "pointer" }}
            >
              신규 수정 후 버전(v00{versions.length + 1}) 스냅샷 등록 및 Before/After 대조
            </button>
          </div>

          <div style={BOX_STYLE}>
            <h4 style={{ margin: 0, fontSize: "0.84rem", fontWeight: 800, color: "#0f172a" }}>
              PublishedFile 원본 에셋(.clip/.psd/.skp) 업스트림·다운스트림 의존성 추적
            </h4>
            <select
              aria-label="PublishedFile 기준 원본 파일 선택"
              value={selectedPublishedFileId}
              onChange={(event) => setSelectedPublishedFileId(event.target.value)}
              style={INPUT_STYLE}
            >
              {INITIAL_SHOTGRID_PUBLISHED_FILES.map((file) => (
                <option key={file.id} value={file.id}>{file.code} ({SHOTGRID_STEP_LABELS[file.step]})</option>
              ))}
            </select>
            {downstreamImpact ? (
              <p data-testid="shotgrid-downstream-impact" style={{ margin: 0, fontSize: "0.75rem", color: "#334155", lineHeight: 1.5 }}>
                <strong>{downstreamImpact.modifiedFileCode}</strong> 갱신 시 연쇄 재작업 확인 대상 파일{" "}
                <strong>{downstreamImpact.transitiveDownstreamIds.length}개</strong> · 영향 공정:{" "}
                <strong>{downstreamImpact.affectedSteps.map((step) => SHOTGRID_STEP_LABELS[step]).join(" → ") || "하위 의존 공정 없음"}</strong>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
