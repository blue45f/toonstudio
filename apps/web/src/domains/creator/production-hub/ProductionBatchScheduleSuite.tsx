import { useEffect, useRef, useState } from "react";
import {
  batchDeleteDeadlines,
  computeBatchEpisodeNumbers,
  deleteEpisodeWithOptionalPull,
  filterEpisodesByTreatment,
  generateBatchDeadlines,
  shiftDeadlinesCascade,
  type BatchDeadlineItem,
  type DeadlineShiftCascadeMode,
  type EpisodeCreationKind,
  type ManagedEpisodeEntry,
  type SpecialEpisodePlacement,
  type TimelineSlotQuickAddKind,
} from "./production-batch-schedule-model";

const INITIAL_MANAGED_EPISODES: readonly ManagedEpisodeEntry[] = [
  {
    episodeId: "ep-1",
    episodeNumber: 1,
    title: "잿빛 성채의 서막",
    treatment: "주인공 카엘이 북부 요새에 부임하며 고대 봉인석을 발견한다.",
    isSpecial: false,
    referenceEpisodeId: null,
    placement: null,
  },
  {
    episodeId: "ep-special-1",
    episodeNumber: null,
    title: "세계관 설정집 · 북부 기사단 편",
    treatment: "특별 외전: 4대 기사단 문장과 마도 병기 설정 도감.",
    isSpecial: true,
    referenceEpisodeId: "ep-1",
    placement: "after",
  },
  {
    episodeId: "ep-2",
    episodeNumber: 2,
    title: "심야의 추격전",
    treatment: "봉인석을 노리는 그림자 길드 자객들과 지붕 위 추격전을 벌인다.",
    isSpecial: false,
    referenceEpisodeId: null,
    placement: null,
  },
  {
    episodeId: "ep-3",
    episodeNumber: 3,
    title: "지하 수로의 비밀",
    treatment: "수로 끝에서 잊힌 왕국의 벽화와 첫 번째 열쇠를 확보한다.",
    isSpecial: false,
    referenceEpisodeId: null,
    placement: null,
  },
];

const DEFAULT_PROCESS_KEYS = [
  { key: "storyboard", label: "콘티" },
  { key: "lineart", label: "선화" },
  { key: "coloring", label: "채색·음영" },
] as const;

export function ProductionBatchScheduleSuite() {
  const [episodes, setEpisodes] = useState<readonly ManagedEpisodeEntry[]>(INITIAL_MANAGED_EPISODES);
  const [treatmentQuery, setTreatmentQuery] = useState<string>("");

  // 단일 에피소드 추가(일반 / 특별)
  const [singleKind, setSingleKind] = useState<EpisodeCreationKind>("normal");
  const [singleTitle, setSingleTitle] = useState<string>("붉은 달의 맹세");
  const [singleTreatment, setSingleTreatment] = useState<string>("보름달 아래 기사단 서약식을 진행한다.");
  const [specialRefEpisodeId, setSpecialRefEpisodeId] = useState<string>("ep-2");
  const [specialPlacement, setSpecialPlacement] = useState<SpecialEpisodePlacement>("after");

  // 복수 에피소드 범위 추가
  const [batchStartNum, setBatchStartNum] = useState<number>(2);
  const [batchEndNum, setBatchEndNum] = useState<number>(6);
  const [pullSubsequentOnDelete, setPullSubsequentOnDelete] = useState<boolean>(true);

  // 타임라인 슬롯 퀵 추가 및 데드라인 일괄 관리
  const [quickAddKind, setQuickAddKind] = useState<TimelineSlotQuickAddKind>("deadline");
  const [startDateIso, setStartDateIso] = useState<string>("2026-10-26");
  const [intervalDays, setIntervalDays] = useState<number>(7);
  const [includeWeekends, setIncludeWeekends] = useState<boolean>(false);
  const [ignoreSpecialEpisodes, setIgnoreSpecialEpisodes] = useState<boolean>(true);
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(true);
  const [cascadeMode, setCascadeMode] = useState<DeadlineShiftCascadeMode>("cascade");

  const [deadlines, setDeadlines] = useState<readonly BatchDeadlineItem[]>(() =>
    generateBatchDeadlines({
      episodes: INITIAL_MANAGED_EPISODES,
      processKeys: DEFAULT_PROCESS_KEYS,
      startDateIso: "2026-10-26",
      intervalDays: 7,
      includeWeekends: false,
      ignoreSpecialEpisodes: true,
      overwriteExisting: true,
      existingDeadlines: [],
    }).mergedDeadlines,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const batchModalRef = useRef<HTMLDialogElement | null>(null);

  // `closedby="any"` 미지원 환경용 light-dismiss 폴백
  useEffect(() => {
    const dialog = batchModalRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const handleFallbackClick = (event: MouseEvent) => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        event.clientY < rect.top
        || event.clientY > rect.bottom
        || event.clientX < rect.left
        || event.clientX > rect.right;
      if (clickedOutside && dialog.open) {
        dialog.close();
      }
    };
    dialog.addEventListener("click", handleFallbackClick);
    return () => dialog.removeEventListener("click", handleFallbackClick);
  }, []);

  const existingNormalNumbers = episodes
    .map((ep) => ep.episodeNumber)
    .filter((num): num is number => num !== null);

  const batchPreview = computeBatchEpisodeNumbers({
    startNumber: batchStartNum,
    endNumber: batchEndNum,
    existingNumbers: existingNormalNumbers,
  });

  const filteredEpisodes = filterEpisodesByTreatment(episodes, treatmentQuery);

  const handleAddSingleEpisode = () => {
    if (singleKind === "normal") {
      const nextNum = existingNormalNumbers.length > 0 ? Math.max(...existingNormalNumbers) + 1 : 1;
      setEpisodes((prev) => [
        ...prev,
        {
          episodeId: `ep-${nextNum}-${prev.length + 1}`,
          episodeNumber: nextNum,
          title: singleTitle.trim() || `${nextNum}화 신작`,
          treatment: singleTreatment.trim() || "트리트먼트 미작성",
          isSpecial: false,
          referenceEpisodeId: null,
          placement: null,
        },
      ]);
      setStatusMessage(`일반 회차 ${nextNum}화를 추가했습니다.`);
      return;
    }

    const specialTitle = singleTitle.trim() || "특별 외전";
    setEpisodes((prev) => [
      ...prev,
      {
        episodeId: `ep-special-${prev.length + 1}`,
        episodeNumber: null,
        title: specialTitle,
        treatment: singleTreatment.trim() || "특별편 트리트먼트",
        isSpecial: true,
        referenceEpisodeId: specialRefEpisodeId,
        placement: specialPlacement,
      },
    ]);
    setStatusMessage(
      `특별 회차 '${specialTitle}'을(를) 기준 회차 ${specialPlacement === "before" ? "앞" : "뒤"}에 배치했습니다.`,
    );
  };

  const handleAddBatchEpisodes = () => {
    if (batchPreview.createdNumbers.length === 0) {
      setStatusMessage("선택한 범위의 모든 일반 회차 번호가 이미 존재하여 건너뛰었습니다.");
      return;
    }
    const createdEntries: ManagedEpisodeEntry[] = batchPreview.createdNumbers.map((num) => ({
      episodeId: `ep-batch-${num}`,
      episodeNumber: num,
      title: `${num}화 · 정규 연재 회차`,
      treatment: `${num}화 트리트먼트 초안`,
      isSpecial: false,
      referenceEpisodeId: null,
      placement: null,
    }));
    setEpisodes((prev) => [...prev, ...createdEntries]);
    setStatusMessage(
      `복수 회차 생성 완료: ${batchPreview.createdNumbers.join(", ")}화 추가 (중복 건너뜀: ${
        batchPreview.skippedNumbers.join(", ") || "없음"
      })`,
    );
  };

  const handleDeleteEpisode = (episodeId: string) => {
    setEpisodes((prev) => deleteEpisodeWithOptionalPull(prev, episodeId, pullSubsequentOnDelete));
    setStatusMessage(
      pullSubsequentOnDelete
        ? "회차를 삭제하고 뒤이은 일반 회차 번호를 -1씩 앞당겼습니다."
        : "회차를 번호 변경 없이 삭제했습니다.",
    );
  };

  const handleApplyBatchDeadlines = () => {
    const result = generateBatchDeadlines({
      episodes,
      processKeys: DEFAULT_PROCESS_KEYS,
      startDateIso,
      intervalDays,
      includeWeekends,
      ignoreSpecialEpisodes,
      overwriteExisting,
      existingDeadlines: deadlines,
    });
    setDeadlines(result.mergedDeadlines);
    setStatusMessage(
      `데드라인 일괄 생성·주기 반영: ${result.createdOrUpdated.length}건 생성/갱신 (기존 유지 ${result.skippedConflictCount}건)`,
    );
  };

  const handleShiftDeadline = (anchorId: string, deltaDays: number) => {
    setDeadlines((prev) =>
      shiftDeadlinesCascade({
        deadlines: prev,
        anchorId,
        deltaDays,
        mode: cascadeMode,
      }),
    );
    setStatusMessage(
      cascadeMode === "cascade"
        ? `선택한 데드라인 및 후속 회차 동일 공정 데드라인을 ${deltaDays > 0 ? `+${deltaDays}` : deltaDays}일 연쇄 이동했습니다.`
        : `선택한 데드라인 1건만 ${deltaDays > 0 ? `+${deltaDays}` : deltaDays}일 이동했습니다.`,
    );
  };

  const handleBatchDeleteDeadlines = () => {
    const result = batchDeleteDeadlines({
      deadlines,
      episodeIds: new Set(episodes.map((ep) => ep.episodeId)),
      processKeys: new Set(["coloring"]),
    });
    setDeadlines(result.remaining);
    setStatusMessage(`채색·음영 공정 데드라인 ${result.deletedCount}건을 일괄 삭제했습니다.`);
  };

  return (
    <section
      aria-label="에피소드 복수 생성·특별편·회차 당기기 삭제·데드라인 일괄 관리"
      data-testid="production-batch-schedule-suite"
      style={{
        display: "grid",
        gap: "0.85rem",
        padding: "1rem",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle, #cbd5e1)",
        background: "var(--surface-elevated, #ffffff)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div>
          <strong style={{ fontSize: "0.95rem" }}>
            에피소드 단일(일반/특별편)·복수 추가 &amp; 데드라인 일괄 생성·연쇄 이동
          </strong>
          <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#475569" }}>
            중복 회차 번호 자동 건너뛰기, 삭제 시 기존 회차 당기기(-1), 주말·특별편 제외 데드라인 일괄 주기를 지원합니다.
          </p>
        </div>

        <button
          type="button"
          data-testid="open-batch-deadline-modal-btn"
          onClick={() => batchModalRef.current?.showModal()}
          style={{
            padding: "0.32rem 0.7rem",
            fontSize: "0.78rem",
            borderRadius: "8px",
            border: "1px solid #4f46e5",
            background: "#eef2ff",
            color: "#312e81",
            fontWeight: 600,
          }}
        >
          데드라인 일괄 설정 모달 열기
        </button>
      </div>

      {/* 1. 단일 에피소드(일반/특별 회차) 및 복수 에피소드 추가 */}
      <div
        style={{
          display: "grid",
          gap: "0.55rem",
          padding: "0.7rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          <strong style={{ fontSize: "0.8rem" }}>단일 추가:</strong>
          <select
            aria-label="단일 에피소드 유형"
            data-testid="single-episode-kind-select"
            value={singleKind}
            onChange={(e) => setSingleKind(e.target.value as EpisodeCreationKind)}
            style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
          >
            <option value="normal">일반 회차 (마지막 번호 +1)</option>
            <option value="special">특별 회차 (외전·휴재공지 — 번호 미부여)</option>
          </select>

          <input
            type="text"
            aria-label="신규 회차 제목"
            value={singleTitle}
            onChange={(e) => setSingleTitle(e.target.value)}
            placeholder="회차 제목"
            style={{ fontSize: "0.75rem", padding: "0.2rem 0.45rem", width: "10rem" }}
          />
          <input
            type="text"
            aria-label="신규 회차 트리트먼트"
            value={singleTreatment}
            onChange={(e) => setSingleTreatment(e.target.value)}
            placeholder="트리트먼트(시놉시스)"
            style={{ fontSize: "0.75rem", padding: "0.2rem 0.45rem", width: "14rem" }}
          />

          {singleKind === "special" && (
            <>
              <select
                aria-label="특별 회차 기준 에피소드"
                value={specialRefEpisodeId}
                onChange={(e) => setSpecialRefEpisodeId(e.target.value)}
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
              >
                {episodes.map((ep) => (
                  <option key={ep.episodeId} value={ep.episodeId}>
                    기준: {ep.episodeNumber !== null ? `${ep.episodeNumber}화` : "특별편"} · {ep.title}
                  </option>
                ))}
              </select>
              <select
                aria-label="특별 회차 배치 위치"
                value={specialPlacement}
                onChange={(e) => setSpecialPlacement(e.target.value as SpecialEpisodePlacement)}
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
              >
                <option value="before">앞에 배치</option>
                <option value="after">뒤에 배치</option>
              </select>
            </>
          )}

          <button
            type="button"
            data-testid="add-single-episode-btn"
            onClick={handleAddSingleEpisode}
            style={{ padding: "0.22rem 0.55rem", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid #0284c7" }}
          >
            단일 회차 추가
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          <strong style={{ fontSize: "0.8rem" }}>복수 범위 추가:</strong>
          <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            시작 화:
            <input
              type="number"
              aria-label="복수 추가 시작 번호"
              min={1}
              value={batchStartNum}
              onChange={(e) => setBatchStartNum(Number(e.target.value) || 1)}
              style={{ width: "3.5rem", fontSize: "0.75rem", padding: "0.15rem 0.3rem" }}
            />
          </label>
          <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            종료 화:
            <input
              type="number"
              aria-label="복수 추가 종료 번호"
              min={1}
              value={batchEndNum}
              onChange={(e) => setBatchEndNum(Number(e.target.value) || 1)}
              style={{ width: "3.5rem", fontSize: "0.75rem", padding: "0.15rem 0.3rem" }}
            />
          </label>
          <span data-testid="batch-episode-preview-readout" style={{ fontSize: "0.74rem", color: "#334155" }}>
            생성 예정: <strong>{batchPreview.createdNumbers.join(", ") || "없음"}화</strong> (기존 번호 자동 건너뜀:{" "}
            {batchPreview.skippedNumbers.join(", ") || "없음"})
          </span>
          <button
            type="button"
            data-testid="add-batch-episodes-btn"
            onClick={handleAddBatchEpisodes}
            style={{
              padding: "0.22rem 0.6rem",
              fontSize: "0.75rem",
              borderRadius: "6px",
              border: "1px solid #0f766e",
              background: "#ccfbf1",
              color: "#115e59",
            }}
          >
            복수 추가 실행
          </button>
        </div>
      </div>

      {/* 2. 트리트먼트 검색 및 회차 당기기 삭제 */}
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              트리트먼트·제목 검색:
              <input
                type="search"
                aria-label="트리트먼트 검색"
                data-testid="treatment-search-input"
                value={treatmentQuery}
                onChange={(e) => setTreatmentQuery(e.target.value)}
                placeholder="시놉시스 키워드 검색 (예: 봉인석, 추격전)"
                style={{ width: "15rem", padding: "0.2rem 0.45rem", fontSize: "0.75rem" }}
              />
            </label>
            <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <input
                type="checkbox"
                checked={pullSubsequentOnDelete}
                onChange={(e) => setPullSubsequentOnDelete(e.target.checked)}
              />
              삭제하고 기존 회차 당기기 (뒤이은 일반 회차 번호 -1)
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
            <span>타임라인 빈 슬롯 퀵 추가 모드:</span>
            {(
              [
                { id: "schedule", label: "일정 추가" },
                { id: "milestone", label: "마일스톤 추가" },
                { id: "deadline", label: "데드라인 추가" },
              ] as const
            ).map((slotMode) => (
              <button
                key={slotMode.id}
                type="button"
                aria-pressed={quickAddKind === slotMode.id}
                onClick={() => setQuickAddKind(slotMode.id)}
                style={{
                  padding: "0.18rem 0.45rem",
                  fontSize: "0.73rem",
                  borderRadius: "4px",
                  border: "1px solid #94a3b8",
                  background: quickAddKind === slotMode.id ? "#334155" : "#ffffff",
                  color: quickAddKind === slotMode.id ? "#ffffff" : "#1e293b",
                }}
              >
                {slotMode.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.3rem" }}>
          {filteredEpisodes.map((ep) => (
            <div
              key={ep.episodeId}
              data-testid={`managed-episode-row-${ep.episodeId}`}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                padding: "0.35rem 0.6rem",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
                fontSize: "0.75rem",
              }}
            >
              <div>
                <strong>{ep.episodeNumber !== null ? `${ep.episodeNumber}화` : "[특별 회차]"}</strong>{" "}
                <span>{ep.title}</span> — <span style={{ color: "#475569" }}>{ep.treatment}</span>
              </div>
              <button
                type="button"
                data-testid={`delete-episode-btn-${ep.episodeId}`}
                onClick={() => handleDeleteEpisode(ep.episodeId)}
                style={{
                  padding: "0.15rem 0.45rem",
                  fontSize: "0.72rem",
                  borderRadius: "4px",
                  border: "1px solid #ef4444",
                  color: "#b91c1c",
                  background: "#fef2f2",
                }}
              >
                {pullSubsequentOnDelete ? "삭제 + 번호 당기기" : "단순 삭제"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 인라인 데드라인 연쇄 이동 및 일괄 제어 바 */}
      <div
        style={{
          display: "grid",
          gap: "0.45rem",
          padding: "0.65rem",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.45rem" }}>
            <strong style={{ fontSize: "0.8rem" }}>데드라인 목록 ({deadlines.length}건)</strong>
            <select
              aria-label="데드라인 이동 시 연쇄 반영 모드"
              data-testid="deadline-cascade-mode-select"
              value={cascadeMode}
              onChange={(e) => setCascadeMode(e.target.value as DeadlineShiftCascadeMode)}
              style={{ fontSize: "0.74rem", padding: "0.18rem 0.35rem" }}
            >
              <option value="cascade">일괄 수정 (후속 회차 동일 공정 데드라인 연쇄 이동)</option>
              <option value="single">해당 일정만 수정 (단일 이동)</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              type="button"
              data-testid="batch-generate-deadlines-inline-btn"
              onClick={handleApplyBatchDeadlines}
              style={{ padding: "0.2rem 0.55rem", fontSize: "0.74rem", borderRadius: "6px", border: "1px solid #0284c7" }}
            >
              주기 데드라인 일괄 생성·갱신
            </button>
            <button
              type="button"
              data-testid="batch-delete-coloring-deadlines-btn"
              onClick={handleBatchDeleteDeadlines}
              style={{ padding: "0.2rem 0.55rem", fontSize: "0.74rem", borderRadius: "6px", border: "1px solid #dc2626", color: "#b91c1c" }}
            >
              채색 공정 데드라인 일괄 삭제
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {deadlines.slice(0, 6).map((item) => (
            <div
              key={item.id}
              data-testid={`deadline-chip-${item.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.22rem 0.5rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontSize: "0.73rem",
              }}
            >
              <span>
                {item.episodeLabel} · <strong>{item.processLabel}</strong>: {item.dueDateIso}
              </span>
              <button
                type="button"
                data-testid={`shift-deadline-plus2-${item.id}`}
                onClick={() => handleShiftDeadline(item.id, 2)}
                style={{ padding: "0.1rem 0.3rem", fontSize: "0.7rem", borderRadius: "4px", border: "1px solid #94a3b8" }}
              >
                +2일
              </button>
            </div>
          ))}
        </div>
      </div>

      {statusMessage && (
        <p data-testid="batch-schedule-status-message" style={{ margin: 0, fontSize: "0.75rem", color: "#0f766e" }}>
          {statusMessage}
        </p>
      )}

      {/* 데드라인 일괄 설정 모달 (`closedby="any"` + light-dismiss 폴백) */}
      <dialog
        ref={batchModalRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-labelledby="batch-deadline-modal-title"
        data-testid="batch-deadline-generator-dialog"
        style={{
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          padding: "1rem 1.25rem",
          maxWidth: "34rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.65rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 id="batch-deadline-modal-title" style={{ margin: 0, fontSize: "0.95rem" }}>
              데드라인 일괄 추가 &amp; 반복 주기 수정
            </h3>
            <button
              type="button"
              onClick={() => batchModalRef.current?.close()}
              style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
            >
              닫기
            </button>
          </div>

          <div style={{ display: "grid", gap: "0.45rem", fontSize: "0.78rem" }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              시작 기준일:
              <input
                type="date"
                value={startDateIso}
                onChange={(e) => setStartDateIso(e.target.value)}
              />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              반복 주기 (일):
              <input
                type="number"
                min={1}
                max={30}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value) || 7)}
              />
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={includeWeekends}
                onChange={(e) => setIncludeWeekends(e.target.checked)}
              />
              주말(토·일) 포함하여 계산
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={ignoreSpecialEpisodes}
                onChange={(e) => setIgnoreSpecialEpisodes(e.target.checked)}
              />
              특별 회차 무시 (정규 번호 회차에만 데드라인 배치)
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
              />
              기존 설정된 데드라인 덮어쓰기
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
            <button
              type="button"
              onClick={() => {
                handleApplyBatchDeadlines();
                batchModalRef.current?.close();
              }}
              style={{
                padding: "0.3rem 0.7rem",
                fontSize: "0.78rem",
                borderRadius: "6px",
                border: "1px solid #4f46e5",
                background: "#4f46e5",
                color: "#ffffff",
              }}
            >
              데드라인 일괄 적용
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
