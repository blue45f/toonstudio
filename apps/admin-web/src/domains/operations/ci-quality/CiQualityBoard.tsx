import { useEffect, useRef, useState } from "react";

import { appendQualityHistory, exportQualityBoardJson, statusLabels, summarizeQualityBoard, validateQualityBoard } from "./ci-quality-model";
import { loadQualityBoard, saveQualityBoard } from "./ci-quality-storage";
import { CiQualityCheckEditor } from "./CiQualityCheckEditor";
import { CiQualityGateDialog, CiQualityJsonDialog, CiQualityQaDialog, CiQualitySettingsDialog } from "./CiQualityDialogs";
import { CiQualityApprovals, CiQualityChecklist, CiQualityEvidence, CiQualityFailures, CiQualityQa } from "./CiQualityViews";
import { QualityDialog, qualityDate } from "./quality-ui";

import type { QualityApproval, QualityBoard, QualityCheck, QualityQaResult } from "./ci-quality-model";
import type { QualityPage } from "./CiQualityViews";


import "./ci-quality.css";

type QualityModal = { kind: "check"; id: string; tab?: "evidence" | "failure" | "json" } | { kind: "picker" | "json" | "settings" | "gate" } | { kind: "qa"; id?: string } | null;

const pages: readonly [QualityPage, string][] = [["checks", "검증 보드"], ["failures", "실패 분석"], ["evidence", "근거 기록"], ["qa", "외부 QA 카탈로그"], ["approvals", "승인 대기"]];

export function CiQualityBoard({ userIdentity }: { userIdentity: string }) {
  if (!userIdentity.trim()) return <p role="alert">관리자 인증을 확인한 뒤 CI·QA 보드를 열 수 있습니다.</p>;
  return <CiQualityWorkspace key={userIdentity} userIdentity={userIdentity} />;
}

function CiQualityWorkspace({ userIdentity }: { userIdentity: string }) {
  const [loaded] = useState(() => loadQualityBoard(userIdentity));
  const source = useRef(loaded.source);
  const [board, setBoard] = useState<QualityBoard | null>(loaded.board);
  const [storageError, setStorageError] = useState(loaded.error ?? "");
  const [unsaved, setUnsaved] = useState(false);
  const [storageConflict, setStorageConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [page, setPage] = useState<QualityPage>("checks");
  const [modal, setModal] = useState<QualityModal>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function persist(next: QualityBoard): boolean {
    const result = saveQualityBoard(userIdentity, next, source.current);
    if (result.ok) source.current = result.source;
    setStorageError(result.error ?? "");
    setUnsaved(!result.ok);
    setStorageConflict(!result.ok && result.conflict);
    setNotice(result.ok ? "이 관리자의 브라우저에 기록을 저장했습니다." : "기록은 현재 화면에 남아 있습니다. JSON으로 내보내 백업하세요.");
    return result.ok;
  }

  function reloadStoredBoard(): void {
    const result = loadQualityBoard(userIdentity);
    setStorageError(result.error ?? "");
    setConfirmReload(false);
    if (!result.board) return;
    source.current = result.source;
    setBoard(result.board);
    setUnsaved(false);
    setStorageConflict(false);
    setModal(null);
    setNotice("최신 저장본을 다시 읽었습니다.");
  }

  function commit(next: QualityBoard, text: string): { error: string | null; persisted: boolean } {
    try {
      const validated = validateQualityBoard(next);
      const updated = appendQualityHistory({ ...validated, snapshotAt: new Date().toISOString() }, text);
      exportQualityBoardJson(updated);
      setBoard(updated);
      const persisted = persist(updated);
      setNow(Date.now());
      return { error: null, persisted };
    } catch (cause) { return { error: cause instanceof Error ? cause.message : "기록 형식을 확인하세요.", persisted: false }; }
  }

  function saveCheck(check: QualityCheck): string | null {
    if (!board) return "보드를 불러온 뒤 기록하세요.";
    const { error } = commit({ ...board, checks: board.checks.map((current) => current.id === check.id ? check : current) }, `${check.name} · ${statusLabels[check.status]} 기록`);
    if (!error) setModal(null);
    return error;
  }

  function saveQa(result: QualityQaResult): string | null {
    if (!board) return "보드를 불러온 뒤 기록하세요.";
    const found = board.qa.results.some((current) => current.id === result.id);
    const results = found ? board.qa.results.map((current) => current.id === result.id ? result : current) : [...board.qa.results, result];
    const { error } = commit({ ...board, qa: { ...board.qa, results } }, "Testifly · 외부 QA 참고 결과 기록");
    if (!error) setModal(null);
    return error;
  }

  function saveApproval(id: QualityApproval["id"], note: string): void {
    if (!board) return;
    const title = board.approvals.find((current) => current.id === id)?.title ?? "작업";
    const { error, persisted } = commit({ ...board, approvals: board.approvals.map((current) => current.id === id ? { ...current, note: note.trim(), updatedAt: new Date().toISOString() } : current) }, `${title} · 승인 대기 메모 저장`);
    if (error) setNotice(error);
    else if (persisted) setNotice(`${title} 검토 메모만 저장했습니다. 작업은 실행하지 않았습니다.`);
  }

  const summary = board ? summarizeQualityBoard(board, now) : null;
  const editingCheck = board && modal?.kind === "check" ? board.checks.find((check) => check.id === modal.id) : null;
  const editingQa = board && modal?.kind === "qa" ? board.qa.results.find((result) => result.id === modal.id) : undefined;

  return <section className="ci-quality" aria-labelledby="ci-quality-title">
    <header className="ci-quality-header">
      <div><p className="ci-quality-eyebrow">ToonStudio / 검증 운영</p><h1 id="ci-quality-title">CI·QA 검증</h1><p>무료 범위의 수동 기록 · 자동 CI 연결 없음 · 외부 작업 실행 없음</p></div>
      <div className="ci-quality-actions"><button type="button" onClick={() => setModal({ kind: "json" })}>JSON 관리</button><button type="button" disabled={!board} onClick={() => setModal({ kind: "settings" })}>기준 커밋·최신성</button><button type="button" disabled={!board} className="ci-quality-primary" onClick={() => setModal({ kind: "picker" })}>결과 기록</button></div>
    </header>
    {storageError && <div role="alert" className="ci-quality-error"><strong>브라우저 저장을 확인하세요.</strong><p>{storageError}</p><p>기록을 자동 초기화하지 않습니다. JSON으로 복구하거나 백업할 수 있습니다.</p><div className="ci-quality-actions">{board && unsaved && <button type="button" disabled={storageConflict} onClick={() => persist(board)}>저장 다시 시도</button>}<button type="button" onClick={() => { if (unsaved) setConfirmReload(true); else reloadStoredBoard(); }}>저장된 기록 다시 읽기</button><button type="button" onClick={() => setModal({ kind: "json" })}>복구 JSON 관리</button></div>{confirmReload && <div><p>현재 화면의 미저장 변경을 버립니다. 먼저 JSON으로 백업하세요.</p><div className="ci-quality-actions"><button type="button" onClick={reloadStoredBoard}>미저장 변경을 버리고 최신 저장본 읽기</button><button type="button" onClick={() => setConfirmReload(false)}>다시 읽기 취소</button></div></div>}</div>}
    {notice && <p role="status" className="ci-quality-notice">{notice}</p>}
    {board && summary ? <>
      <nav className="ci-quality-nav" aria-label="CI·QA 보드 화면">{pages.map(([key, label]) => <button type="button" key={key} aria-pressed={page === key} onClick={() => setPage(key)}>{label}{key === "failures" ? ` ${summary.byStatus.failed}` : key === "approvals" ? " 3" : ""}</button>)}</nav>
      {page === "checks" && <CiQualityChecklist board={board} now={now} onEdit={(check) => setModal({ kind: "check", id: check.id })} onAddGate={() => setModal({ kind: "gate" })} />}
      {page === "failures" && <CiQualityFailures board={board} now={now} onEdit={(check) => setModal({ kind: "check", id: check.id, tab: "failure" })} />}
      {page === "evidence" && <CiQualityEvidence board={board} now={now} onEdit={(check) => setModal({ kind: "check", id: check.id })} onJson={() => setModal({ kind: "json" })} />}
      {page === "qa" && <CiQualityQa board={board} onEdit={(result) => setModal({ kind: "qa", id: result?.id })} onApprovals={() => setPage("approvals")} />}
      {page === "approvals" && <CiQualityApprovals board={board} onSave={saveApproval} />}
      <details className="ci-quality-overview">
        <summary>검증 전체 현황과 기준 커밋</summary>
      <section className="ci-quality-release" aria-label="기준 커밋과 검증 요약">
        <div><p className="ci-quality-eyebrow">RELEASE EVIDENCE</p><h2>완료 표시와 유효한 근거를<br className="ci-quality-desktop-break" /> 함께 확인합니다.</h2><p>현재 SHA·실행 시각·범위·로그를 대조하세요.<br />core·verify 녹색이나 부분 통계는 전체 suite 성공의 보증이 아닙니다.</p></div>
        <div className="ci-quality-commit"><span>기준 커밋 SHA</span><a href={board.commit.url || undefined} target="_blank" rel="noopener noreferrer"><code>{board.commit.sha.slice(0, 9)}</code></a><strong>{board.commit.message || "메시지 미등록"}</strong><small>커밋 {qualityDate(board.commit.committedAt)}</small><small>{board.commit.source === "remote-main" ? "원격 main 관측" : "수동 기준 기록"} · {qualityDate(board.commit.observedAt)}</small><p>core · {statusLabels[board.checks.find((check) => check.id === "ci-core")?.status ?? "unknown"]} / verify · {statusLabels[board.checks.find((check) => check.id === "ci-verify")?.status ?? "unknown"]}</p></div>
      </section>
      <div className="ci-quality-metrics" aria-label="검증 집계">
        <div className="ci-quality-card ci-quality-metric"><span>추적 중인 검사</span><strong>{summary.tracked}</strong><small>정본 CI · 전용 게이트</small></div>
        <div className="ci-quality-card ci-quality-metric"><span>완료한 검사</span><strong>{summary.byStatus.done} <small>/ {summary.tracked}</small></strong><small>유효한 완료 근거 {summary.validCompleted}개</small></div>
        <div className="ci-quality-card ci-quality-metric"><span>실패한 검사</span><strong>{summary.byStatus.failed}</strong><small>{summary.byStatus.failed ? "변경·원인·권장 조치 확인" : "실패 결과 미등록"}</small></div>
        <div className="ci-quality-card ci-quality-metric"><span>근거 확인 필요</span><strong>{summary.tracked - summary.fresh}</strong><small>stale {summary.stale} · 미등록 {summary.missing} · 오류 {summary.invalid}</small></div>
      </div>
      <div className="ci-quality-freshness-summary"><span><strong>Evidence freshness</strong> · 유효 {summary.fresh}/{summary.tracked} · TTL {board.ttlHours}h</span><span>{summary.stale || summary.invalid ? `stale warning · ${summary.stale + summary.invalid}개 근거를 다시 확인하세요.` : "SHA 불일치·TTL 초과·미래 시각은 유효 근거로 집계하지 않습니다."}</span></div>
      </details>
    </> : <div className="ci-quality-card ci-quality-empty"><h2>기록을 복구한 뒤 보드를 사용할 수 있습니다.</h2><p>저장된 데이터의 읽기·검증 실패를 확인하세요. JSON 관리에서 올바른 백업을 검토 후 가져올 수 있습니다.</p></div>}
    <footer className="ci-quality-footer"><span>현재 관리자의 브라우저 저장 · 서버·다른 기기와 자동 공유하지 않습니다.</span><span>{unsaved ? "저장되지 않은 기록 있음 · JSON 백업 필요" : "JSON 내보내기로 백업·이동 가능"}</span></footer>
    {modal?.kind === "picker" && board && <QualityDialog title="검증 결과 기록" description="실제 결과를 기록할 검사를 선택하세요." onClose={() => setModal(null)}><div className="ci-quality-dialog-body ci-quality-picker">{board.checks.map((check) => <button type="button" key={check.id} onClick={() => setModal({ kind: "check", id: check.id })}>{check.name}<small>{statusLabels[check.status]}</small></button>)}</div></QualityDialog>}
    {modal?.kind === "check" && board && editingCheck && <CiQualityCheckEditor check={editingCheck} board={board} initialTab={modal.tab} onSave={saveCheck} onClose={() => setModal(null)} />}
    {modal?.kind === "json" && <CiQualityJsonDialog board={board} onClose={() => setModal(null)} onImport={(next) => { const { error } = commit(next, "JSON 가져오기 · 보드 전체 기록 대체"); if (!error) setModal(null); return error; }} />}
    {modal?.kind === "settings" && board && <CiQualitySettingsDialog board={board} onClose={() => setModal(null)} onSave={(next) => { const { error } = commit(next, "기준 커밋·최신성 설정 기록"); if (!error) setModal(null); return error; }} />}
    {modal?.kind === "gate" && board && <CiQualityGateDialog onClose={() => setModal(null)} onAdd={(check) => { const { error } = commit({ ...board, checks: [...board.checks, check] }, `${check.name} · 전용 게이트 추가`); if (!error) setModal(null); return error; }} />}
    {modal?.kind === "qa" && board && <CiQualityQaDialog result={editingQa} onClose={() => setModal(null)} onSave={saveQa} />}
  </section>;
}
