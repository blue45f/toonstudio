import { useEffect, useState } from "react";

import { getFreshness, statusLabels, summarizeQualityBoard } from "./ci-quality-model";
import { QualityStatusBadge, qualityDate } from "./quality-ui";

import type { QualityApproval, QualityBoard, QualityCheck, QualityQaResult } from "./ci-quality-model";

export type QualityPage = "checks" | "failures" | "evidence" | "qa" | "approvals";

function Freshness({ check, board, now }: { check: QualityCheck; board: QualityBoard; now: number }) {
  const fresh = getFreshness(check, board, now);
  return <span className={`ci-quality-freshness ci-quality-freshness--${fresh.kind}`} title={fresh.reason}>{fresh.label}</span>;
}

export function CiQualityChecklist({ board, now, onEdit, onAddGate }: { board: QualityBoard; now: number; onEdit: (check: QualityCheck) => void; onAddGate: () => void }) {
  const [view, setView] = useState<"list" | "board">("list");
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = board.checks.filter((check) => (group === "all" || group === check.group) && (status === "all" || check.status === status) && `${check.name} ${check.subtitle} ${check.command}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section aria-labelledby="ci-quality-checklist-title">
    <div className="ci-quality-section-heading"><h2 id="ci-quality-checklist-title">검증 체크리스트 <small>{board.checks.length} checks</small></h2><div className="ci-quality-actions"><button type="button" onClick={onAddGate}>전용 게이트 추가</button><div role="group" aria-label="검사 보기 방식"><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>목록</button><button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>보드</button></div></div></div>
    <div className="ci-quality-card ci-quality-filters">
      <div role="group" aria-label="검사 범주">{[["all", "전체"], ["tests", "테스트"], ["quality", "품질"], ["gates", "전용 게이트"]].map(([key, label]) => <button type="button" key={key} aria-pressed={group === key} onClick={() => setGroup(key)}>{label}</button>)}</div>
      <label>검사 검색<input type="search" placeholder="이름·설명·명령 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>상태 필터<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">모든 상태</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {filtered.length === 0 ? <div className="ci-quality-card ci-quality-empty"><h3>일치하는 검사가 없습니다</h3><p>검색어 또는 필터를 변경하세요.</p><button type="button" onClick={() => { setQuery(""); setGroup("all"); setStatus("all"); }}>필터 초기화</button></div> : view === "list" ? <div className="ci-quality-table-scroll">
      <table className="ci-quality-table"><caption className="ci-quality-sr-only">검증 항목의 상태와 근거 최신성. 항목별 결과 기록 버튼으로 편집합니다.</caption><thead><tr><th scope="col">검증 항목</th><th scope="col">진행 상태</th><th scope="col">Evidence freshness</th><th scope="col">근거 범위</th><th scope="col">기록</th></tr></thead><tbody>{filtered.map((check) => <tr key={check.id}><th scope="row"><strong>{check.name}</strong><small>{check.subtitle}</small></th><td><QualityStatusBadge status={check.status} /></td><td><Freshness check={check} board={board} now={now} /></td><td>{check.scope || <span className="ci-quality-muted">미등록</span>}</td><td><button type="button" aria-label={`${check.name} 결과 기록`} onClick={() => onEdit(check)}>결과 기록</button></td></tr>)}</tbody></table>
    </div> : <div className="ci-quality-kanban" aria-label="상태별 검증 보드">{Object.entries(statusLabels).map(([key, label]) => <section className="ci-quality-kanban-column" key={key} aria-label={`${label} 검사`}><h3>{label} <small>{filtered.filter((check) => check.status === key).length}</small></h3>{filtered.filter((check) => check.status === key).map((check) => <button className="ci-quality-kanban-item" type="button" key={check.id} aria-label={`${check.name} 결과 기록`} onClick={() => onEdit(check)}><strong>{check.name}</strong><small>{check.subtitle}</small><Freshness check={check} board={board} now={now} /></button>)}{!filtered.some((check) => check.status === key) && <p className="ci-quality-muted">아직 항목이 없습니다.</p>}</section>)}</div>}
    <p className="ci-quality-muted ci-quality-caption">{filtered.length} / {board.checks.length}개 표시 · 완료 상태와 근거 유효성은 별도로 계산합니다.</p>
  </section>;
}

export function CiQualityFailures({ board, now, onEdit }: { board: QualityBoard; now: number; onEdit: (check: QualityCheck) => void }) {
  const failures = board.checks.filter((check) => check.status === "failed");
  const fields = [["change", "관련 변경"], ["baseline", "이전 정상 상태"], ["diff", "이전 정상 상태와의 차이"], ["cause", "원인 · 근거"], ["action", "권장 조치"]] as const;
  return <section aria-label="실패 분석"><h2>실패 분석 <small>{failures.length}개</small></h2><p>실패 신호를 변경·원인·권장 조치까지 이어지는 기록으로 남깁니다. 코드 수정이나 재실행은 수행하지 않습니다.</p>{failures.length === 0 ? <div className="ci-quality-card ci-quality-empty"><h3>등록된 실패 검사가 없습니다</h3><p>모든 검사가 성공했다는 의미는 아닙니다. 실행 결과가 없으면 미확인 상태를 유지합니다.</p></div> : failures.map((check) => <article className="ci-quality-card" key={check.id}><div className="ci-quality-section-heading"><h3>{check.name}</h3><QualityStatusBadge status={check.status} /></div><p><Freshness check={check} board={board} now={now} /> · {{ unknown: "분류 미확인", regression: "회귀", transient: "일시 오류" }[check.failure.classification]}</p><dl className="ci-quality-detail-grid">{fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{check.failure[key] || "미등록"}</dd></div>)}<div><dt>로그 링크</dt><dd>{check.logUrl ? <a href={check.logUrl} target="_blank" rel="noopener noreferrer">실행 로그 열기 ↗</a> : "미등록"}</dd></div></dl><button type="button" onClick={() => onEdit(check)} aria-label={`${check.name} 실패 분석 편집`}>실패 분석 편집</button></article>)}</section>;
}

export function CiQualityEvidence({ board, now, onEdit, onJson }: { board: QualityBoard; now: number; onEdit: (check: QualityCheck) => void; onJson: () => void }) {
  const summary = summarizeQualityBoard(board, now);
  const labels = [["passed", "통과"], ["failed", "실패"], ["skipped", "건너뜀"], ["total", "전체 테스트"]] as const;
  return <section aria-label="근거 기록"><div className="ci-quality-section-heading"><h2>근거 기록</h2><button type="button" onClick={onJson}>CI 결과 요약 JSON</button></div><p>입력된 테스트 통계만 표시합니다. 미입력은 미확인이며 부분·중복 실행 통계는 전체 suite의 보증이 아닙니다. 외부 QA는 합산하지 않습니다.</p><div className="ci-quality-metrics">{labels.map(([key, label]) => <div className="ci-quality-card ci-quality-metric" key={key}><span>{label}</span><strong>{summary.testStats[key] === null ? "미확인" : summary.testStats[key]?.toLocaleString()}</strong><small>기록된 테스트 범위만 합산 · 중복 가능</small></div>)}</div><p className="ci-quality-muted">통계 입력된 검사 {summary.testStats.recordedChecks}개 · 미입력 값은 0으로 추정하지 않습니다.</p><div className="ci-quality-card"><h3>Evidence ledger</h3><ul className="ci-quality-record-list">{board.checks.map((check) => <li key={check.id}><div><strong>{check.name}</strong><p><code>{check.sha ? check.sha.slice(0, 9) : "SHA 미등록"}</code> · {qualityDate(check.executedAt)} · {check.scope || "범위 미등록"}</p><Freshness check={check} board={board} now={now} /></div><button type="button" onClick={() => onEdit(check)} aria-label={`${check.name} 근거 보기`}>근거 보기</button></li>)}</ul></div><div className="ci-quality-card"><h3>로컬 기록 이력</h3><p>이 브라우저의 수동 기록 이력이며 서버 감사 로그가 아닙니다.</p>{board.history.length === 0 ? <p className="ci-quality-muted">아직 변경 이력이 없습니다.</p> : <ol className="ci-quality-history">{board.history.slice(0, 30).map((entry) => <li key={entry.id}><strong>{entry.text}</strong><time dateTime={entry.at}>{qualityDate(entry.at)}</time></li>)}</ol>}</div></section>;
}

export function CiQualityQa({ board, onEdit, onApprovals }: { board: QualityBoard; onEdit: (result?: QualityQaResult) => void; onApprovals: () => void }) {
  return <section aria-label="외부 QA 카탈로그"><h2>외부 QA 카탈로그</h2><p>정본은 Vitest·Playwright·저장소 검증 스크립트입니다. 외부 결과는 참고용으로 분리합니다.</p><article className="ci-quality-card"><div className="ci-quality-section-heading"><div><p className="ci-quality-eyebrow">외부 QA 카탈로그 · 결과 뷰어 후보</p><h3>Testifly</h3></div><span className="ci-quality-reference">reference-only · 연결 전 후보</span></div><p>실제 연결·실행 근거가 확인되기 전에는 ‘사용 중’으로 표시하지 않습니다. 이 보드는 연결이나 계정 설정 변경을 수행하지 않습니다.</p><dl className="ci-quality-detail-grid"><div><dt>현재 역할</dt><dd>외부 QA 카탈로그·결과 뷰어 후보 · 정본 CI 아님</dd></div><div><dt>연결 검토에 필요한 근거</dt><dd>프로젝트 연결 확인 · 실행 결과 · 대상 SHA · 로그</dd></div><div><dt>저장소 기준</dt><dd><code>docs/technology/engineering-story.md</code></dd></div><div><dt>무료 범위</dt><dd>수동 참고 기록만 · 유료 연동 없음</dd></div></dl><div className="ci-quality-actions"><button type="button" onClick={() => onEdit()}>참고 결과 기록</button><button type="button" onClick={onApprovals}>연결 검토 메모 남기기</button></div></article><article className="ci-quality-card"><h3>외부 QA 참고 결과 <small>{board.qa.results.length}개</small></h3>{board.qa.results.length === 0 ? <div className="ci-quality-empty"><p>참고 결과가 아직 없습니다. 결과를 등록해도 Testifly는 후보 상태를 유지합니다.</p></div> : <ul className="ci-quality-record-list">{board.qa.results.map((result) => <li key={result.id}><div><strong>{result.title}</strong> <QualityStatusBadge status={result.status} /><p><code>{result.sha ? result.sha.slice(0, 9) : "SHA 미등록"}</code> · {qualityDate(result.executedAt)}</p><p>{result.summary || "요약 미등록"}</p>{result.url && <a href={result.url} target="_blank" rel="noopener noreferrer">참고 결과 보기 ↗</a>}<small>정본 CI 통계·완료 수에서 제외</small></div><button type="button" onClick={() => onEdit(result)} aria-label={`${result.title} 참고 결과 편집`}>기록 편집</button></li>)}</ul>}</article></section>;
}

function ApprovalMemo({ approval, onSave }: { approval: QualityApproval; onSave: (id: QualityApproval["id"], note: string) => void }) {
  const [note, setNote] = useState(approval.note);
  useEffect(() => { setNote(approval.note); }, [approval.note, approval.updatedAt]);
  return <article className="ci-quality-card"><p className="ci-quality-eyebrow">{approval.category}</p><div className="ci-quality-section-heading"><h3>{approval.title}</h3><QualityStatusBadge status="approval" /></div><p>{approval.description}</p><label>{approval.title} 검토 메모<textarea rows={5} maxLength={8000} placeholder="목적·범위·필요한 근거·비용 영향을 기록하세요." value={note} onChange={(event) => setNote(event.target.value)} /></label><div className="ci-quality-section-heading"><button type="button" onClick={() => onSave(approval.id, note)}>{approval.title} 메모 저장</button><small>{note !== approval.note ? "미저장 변경 있음" : "현재 화면 기록과 동일"}</small></div><small>{approval.updatedAt ? qualityDate(approval.updatedAt) : "아직 저장된 메모가 없습니다."} · 무료 범위만 · 실행 기능 없음</small></article>;
}

export function CiQualityApprovals({ board, onSave }: { board: QualityBoard; onSave: (id: QualityApproval["id"], note: string) => void }) {
  return <section aria-label="승인 대기"><h2>승인 대기</h2><p className="ci-quality-warning">저장은 검토 메모 기록입니다. 승인·작업 실행·유료 전환을 수행하지 않습니다. 세 항목의 상태는 승인 대기로 유지합니다.</p><div className="ci-quality-approval-grid">{board.approvals.map((approval) => <ApprovalMemo key={approval.id} approval={approval} onSave={onSave} />)}</div></section>;
}
