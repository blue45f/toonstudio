import { useEffect, useRef, useState } from "react";

import { downloadQualityJson } from "../CiQualityDialogs";
import { qualityDate } from "../quality-ui";

import { exportDependencyReviewBoard, updateDependencyRecord, validateDependencyReviewBoard } from "./dependency-review-model";
import { createDependencyReviewBoard } from "./dependency-review-seed";
import { getDependencyReviewStorageKey, loadDependencyReviewBoard, saveDependencyReviewBoard } from "./dependency-review-storage";
import { DependencyJsonDialog, DependencyRecordDialog } from "./DependencyReviewDialogs";
import { DependencyReviewClosingItems, DependencyReviewComparisons, DependencyReviewWorkItems } from "./DependencyReviewViews";

import type { DependencyReviewBoard, ReviewRecord } from "./dependency-review-types";

import "./dependency-review.css";

type ReviewModal = { kind: "record"; id: string } | { kind: "json"; base: DependencyReviewBoard; recovering: boolean } | null;

export function DependencyReviewPanel({ userIdentity, onUnsavedChange }: { userIdentity: string; onUnsavedChange?: (dirty: boolean) => void }) {
  if (!userIdentity.trim() || userIdentity.length > 256) return <p role="alert">관리자 인증을 확인한 뒤 의존성 검토 기록을 열 수 있습니다.</p>;
  return <DependencyReviewWorkspace key={userIdentity} userIdentity={userIdentity} onUnsavedChange={onUnsavedChange} />;
}

function DependencyReviewWorkspace({ userIdentity, onUnsavedChange }: { userIdentity: string; onUnsavedChange?: (dirty: boolean) => void }) {
  const [loaded] = useState(() => loadDependencyReviewBoard(userIdentity));
  const source = useRef(loaded.source);
  const [board, setBoard] = useState<DependencyReviewBoard | null>(loaded.board);
  const [storageError, setStorageError] = useState(loaded.error ?? "");
  const [unsaved, setUnsaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<ReviewModal>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    const checkLatest = () => {
      const latest = loadDependencyReviewBoard(userIdentity);
      if (latest.source !== source.current) {
        setConflict(true);
        setStorageError(latest.error || "다른 탭에서 의존성 기록이 변경되었습니다. 현재 입력을 보존하며 저장을 차단했습니다.");
        setNotice("현재 기록을 JSON으로 백업한 뒤 최신 저장본을 다시 읽으세요.");
      }
    };
    const changed = (event: StorageEvent) => {
      if (event.key !== null && event.key !== getDependencyReviewStorageKey(userIdentity)) return;
      checkLatest();
    };
    // 숨겨진 탭에서 멈춘 효과가 다시 시작할 때 놓친 저장 변경도 확인한다.
    checkLatest();
    window.addEventListener("storage", changed);
    return () => { window.clearInterval(timer); window.removeEventListener("storage", changed); };
  }, [userIdentity]);

  useEffect(() => {
    if (onUnsavedChange) { onUnsavedChange(unsaved || draftDirty); return; }
    if (!unsaved && !draftDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved, draftDirty, onUnsavedChange]);

  function closeModal() { setModal(null); setDraftDirty(false); }

  function persist(next: DependencyReviewBoard, successMessage: string): boolean {
    if (conflict) {
      setUnsaved(true);
      setNotice("입력은 현재 화면에 남아 있습니다. 충돌을 해결하기 전에 의존성 JSON을 백업하세요.");
      return false;
    }
    const result = saveDependencyReviewBoard(userIdentity, next, source.current);
    if (result.ok) {
      source.current = result.source;
      setStorageError("");
      setUnsaved(false);
      setConflict(false);
      setNotice(successMessage);
    } else {
      setStorageError(result.error);
      setUnsaved(true);
      setConflict(result.conflict);
      setNotice("저장하지 못한 기록은 현재 화면에 남아 있습니다. 의존성 JSON으로 백업할 수 있습니다.");
    }
    return result.ok;
  }

  function commit(next: DependencyReviewBoard, successMessage: string): string | null {
    try {
      const validated = validateDependencyReviewBoard(next);
      exportDependencyReviewBoard(validated);
      setBoard(validated);
      persist(validated, successMessage);
      setNow(Date.now());
      return null;
    } catch (cause) { return cause instanceof Error ? cause.message : "의존성 검토 기록을 확인하세요."; }
  }

  function saveRecord(draft: ReviewRecord): string | null {
    if (!board) return "저장된 기록을 복구한 뒤 편집하세요.";
    try {
      return commit(updateDependencyRecord(board, draft), "이 관리자의 브라우저에 검토 기록을 저장했습니다. 검사 성공 판정이나 외부 작업은 수행하지 않았습니다.");
    } catch (cause) { return cause instanceof Error ? cause.message : "검토 기록을 확인하세요."; }
  }

  function reload() {
    const latest = loadDependencyReviewBoard(userIdentity);
    setConfirmReload(false);
    if (!latest.board) {
      setStorageError(latest.error || "저장된 의존성 기록을 읽지 못했습니다.");
      setNotice("현재 화면의 기록은 유지했습니다. 원문을 백업하거나 JSON으로 복구하세요.");
      return;
    }
    source.current = latest.source;
    setBoard(latest.board);
    setStorageError("");
    setUnsaved(false);
    setConflict(false);
    closeModal();
    setNotice("최신 의존성 저장본을 다시 읽었습니다.");
    setNow(Date.now());
  }

  function openJson() {
    try { setModal({ kind: "json", base: board ?? createDependencyReviewBoard(), recovering: !board }); }
    catch (cause) { setStorageError(cause instanceof Error ? cause.message : "복구 기준을 읽지 못했습니다."); }
  }

  function backup(original = false) {
    try {
      const text = original ? source.current : board ? exportDependencyReviewBoard(board) : null;
      if (typeof text !== "string") throw new Error("내보낼 저장 원문을 읽지 못했습니다. 저장소 접근 상태를 확인하세요.");
      downloadQualityJson(original ? "toonstudio-dependency-stored-source.json" : `toonstudio-dependency-review-${new Date().toISOString().slice(0, 10)}.json`, text);
      setNotice(original ? "저장 원문을 백업했습니다." : "현재 화면의 의존성 검토와 가져온 원본 JSON을 내보냈습니다.");
    } catch (cause) { setStorageError(cause instanceof Error ? cause.message : "백업 파일을 내보내지 못했습니다."); }
  }

  const editing = board && modal?.kind === "record" ? board.records.find(record => record.id === modal.id) : null;
  const staleSnapshot = board ? now - Date.parse(board.snapshot.checkedAt) > board.ttlHours * 3_600_000 : false;

  return <section className="dependency-review" aria-labelledby="dependency-review-title">
    <header className="ci-quality-section-heading dependency-header">
      <div><p className="ci-quality-eyebrow">MAIN / 의존성·회귀 검토</p><h2 id="dependency-review-title">의존성·회귀 검토</h2><p>원인과 검사 결과를 대조하고 최소 수정안을 검토합니다.</p></div>
      <div className="ci-quality-actions"><button type="button" onClick={openJson}>의존성 JSON 관리</button><button type="button" disabled={!board} onClick={() => backup()}>검토 기록 내보내기</button></div>
    </header>
    <p className="dependency-recording-note">관리 상태와 관측 결과는 별도입니다. 수동 기록 저장이나 가져오기가 최신 main의 CI 성공을 뜻하지 않습니다.</p>
    {storageError && <div role="alert" className="ci-quality-error dependency-storage-error">
      <strong>의존성 기록의 브라우저 저장을 확인하세요.</strong><p>{storageError}</p><p>손상된 저장본은 자동 초기화하지 않으며 현재 화면의 초안을 보존합니다.</p>
      <div className="ci-quality-actions">{board && unsaved && <button type="button" disabled={conflict} onClick={() => persist(board, "의존성 검토 기록을 다시 저장했습니다.")}>의존성 저장 다시 시도</button>}<button type="button" onClick={() => { if (unsaved || conflict) setConfirmReload(true); else reload(); }}>의존성 저장본 다시 읽기</button><button type="button" disabled={typeof source.current !== "string"} onClick={() => backup(true)}>저장 원문 백업</button><button type="button" onClick={openJson}>의존성 JSON 복구·백업</button></div>
      {confirmReload && <div className="dependency-reload-confirm"><p>현재 화면의 기록과 저장되지 않은 변경을 버리고 최신 저장본을 읽습니다. 먼저 의존성 JSON으로 백업하세요.</p><div className="ci-quality-actions"><button type="button" onClick={reload}>현재 기록을 버리고 최신 의존성 저장본 읽기</button><button type="button" onClick={() => setConfirmReload(false)}>다시 읽기 취소</button></div></div>}
    </div>}
    {notice && <p role="status" className="dependency-notice">{notice}</p>}
    {board ? <>
      <section className="ci-quality-card dependency-baseline" aria-label="의존성 검토 기준 스냅샷">
        <div><span className="ci-quality-eyebrow">기준 main 관측</span><a href={board.snapshot.commitUrl} target="_blank" rel="noopener noreferrer"><code>{board.snapshot.sha}</code></a><p>{board.snapshot.summary}</p></div>
        <div><strong>{staleSnapshot ? "기준 관측 갱신 필요" : "저장된 기준 관측"}</strong><small>관측 {qualityDate(board.snapshot.checkedAt)} · TTL {board.ttlHours}h</small><small>GitHub 자동 동기화 없음</small>{board.snapshot.ciUrl ? <a href={board.snapshot.ciUrl} target="_blank" rel="noopener noreferrer">기준 CI 보기</a> : <small>기준 CI 미확인</small>}</div>
      </section>
      <nav className="dependency-jump-links" aria-label="의존성 검토 구역"><a href="#dependency-work">원인·5개 검사</a><a href="#dependency-files">파일·버전 대조</a><a href="#dependency-prs">PR·CI 비교</a><a href="#dependency-approvals">실행 승인 대기</a><a href="#dependency-archive">완료 보관함</a></nav>
      <DependencyReviewWorkItems board={board} now={now} onEdit={record => setModal({ kind: "record", id: record.id })} />
      <DependencyReviewComparisons board={board} />
      <DependencyReviewClosingItems board={board} now={now} onEdit={record => setModal({ kind: "record", id: record.id })} />
    </> : <div className="ci-quality-card ci-quality-empty"><h3>의존성 저장본을 복구한 뒤 검토할 수 있습니다</h3><p>기존 CI·QA 검사 기록은 별도 저장되어 영향을 받지 않습니다. 저장 원문을 백업하고 올바른 JSON을 검토해 복구하세요.</p><button type="button" onClick={openJson}>의존성 복구 JSON 열기</button></div>}
    <footer className="ci-quality-footer dependency-footer"><span>현재 관리자별 브라우저 저장 · 서버·다른 기기와 자동 공유하지 않습니다.</span><span>{unsaved ? "저장되지 않은 의존성 기록 있음 · JSON 백업 필요" : "의존성 검토는 별도 저장 · 기존 CI·QA 기록 유지"}</span></footer>
    {editing && board && <DependencyRecordDialog key={editing.id} record={editing} board={board} now={now} onSave={saveRecord} onDirtyChange={setDraftDirty} onClose={closeModal} />}
    {modal?.kind === "json" && <DependencyJsonDialog board={modal.base} recovering={modal.recovering} onImport={next => commit(next, "검토한 의존성 기록과 원본 JSON을 저장했습니다. 현재 CI 결과를 새로 검증한 것은 아닙니다.")} onDirtyChange={setDraftDirty} onClose={closeModal} />}
  </section>;
}
