import { useState } from "react";

import { qualityDate } from "../quality-ui";

import { getRecordFreshness } from "./dependency-review-model";
import { workflowStatuses } from "./dependency-review-types";

import type { DependencyReviewBoard, ReviewRecord, WorkflowStatus } from "./dependency-review-types";

const statusTone: Record<WorkflowStatus, string> = {
  "미확인": "unknown", "진행 중": "progress", "검토 필요": "review",
  "승인 대기": "approval", "검증 완료": "verified", "main 머지 완료": "merged",
};

export function ReviewStatusBadge({ status }: { status: WorkflowStatus }) {
  return <span className={`ci-quality-status dependency-status--${statusTone[status]}`}>{status}</span>;
}

export function ReviewFreshnessBadge({ record, board, now }: { record: ReviewRecord; board: DependencyReviewBoard; now: number }) {
  const freshness = getRecordFreshness(record, board, now);
  return <span className={`dependency-freshness dependency-freshness--${freshness.kind}`} title={freshness.reason}>{freshness.label}</span>;
}

export function DependencyCopyBlock({ title, text }: { title: string; text: string }) {
  const [notice, setNotice] = useState("");
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("복사를 지원하지 않는 브라우저입니다. 아래 내용을 선택해 복사하세요.");
      await navigator.clipboard.writeText(text);
      setNotice("내용을 복사했습니다. 명령은 실행하지 않았습니다.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "복사하지 못했습니다. 아래 내용을 선택해 복사하세요.");
    }
  }
  return <div className="dependency-copy-block">
    <div className="ci-quality-section-heading"><h3>{title}</h3><button type="button" disabled={!text.trim()} onClick={() => { void copy(); }} aria-label={`${title} 복사`}>복사</button></div>
    <pre tabIndex={0}>{text || "미등록"}</pre>
    {notice && <p role="status">{notice}</p>}
  </div>;
}

export function ReviewSourceDetails({ record }: { record: ReviewRecord }) {
  return <dl className="ci-quality-detail-grid dependency-source-details">
    <div><dt>원본 관측 결과</dt><dd>{record.result || "미확인"}</dd></div>
    <div><dt>과거 실행 결과</dt><dd>{record.historicalResult || "미확인"}</dd></div>
    <div><dt>원본 증빙 SHA</dt><dd><code>{record.snapshotSha}</code></dd></div>
    <div><dt>수동 검증 SHA · 결과</dt><dd><code>{record.verificationSha || "미등록"}</code><br />{record.recordedResult}</dd></div>
    <div><dt>회귀 분류</dt><dd>{record.regression || "미확인"}</dd></div>
    <div><dt>근거 확실성</dt><dd>{record.confidence || "미확인"}</dd></div>
    {record.sourceStatus && <div><dt>가져온 원본 상태</dt><dd>{record.sourceStatus}</dd></div>}
    {record.sourceResult && <div><dt>가져온 원본 결과</dt><dd>{record.sourceResult}</dd></div>}
    <div className="ci-quality-full"><dt>관련 근거</dt><dd>{record.links.length ? <ul className="dependency-links">{record.links.map((link, index) => <li key={`${link.url}:${index}`}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label || "근거 열기"}</a></li>)}</ul> : "미확인"}</dd></div>
  </dl>;
}

function CiLinks({ record }: { record: ReviewRecord }) {
  const urls = [...new Set([
    ...record.ciLinks.split(/\s+/u).filter(Boolean),
    ...record.links.filter(link => link.url.includes("/actions/runs/")).map(link => link.url),
  ])];
  return urls.length ? <ul className="dependency-links">{urls.map((url, index) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{record.links.find(link => link.url === url)?.label || `CI 로그 ${index + 1}`}</a></li>)}</ul> : <span className="ci-quality-muted">미확인</span>;
}

function CauseCard({ record, board, now, onEdit }: { record: ReviewRecord; board: DependencyReviewBoard; now: number; onEdit: (record: ReviewRecord) => void }) {
  const checks = board.records.filter(check => check.category === "check" && check.causeIds.includes(record.id));
  return <article className="ci-quality-card dependency-cause-card" aria-label={`${record.title} 원인 묶음`}>
    <div className="ci-quality-section-heading"><div><p className="ci-quality-eyebrow">독립 원인 · {record.id}</p><h3>{record.title}</h3></div><ReviewStatusBadge status={record.status} /></div>
    <p>{record.summary || "원인 요약 미확인"}</p>
    <ReviewFreshnessBadge record={record} board={board} now={now} />
    <dl className="dependency-cause-summary"><div><dt>원인 가설</dt><dd>{record.hypothesis || "미확인"}</dd></div><div><dt>확정 근거</dt><dd>{record.evidence || "미확인"}</dd></div></dl>
    <p className="dependency-related-label">연결된 검사 {checks.length}개 · 같은 원인의 반복 실패를 함께 검토합니다.</p>
    <ul className="dependency-related-checks">{checks.map(check => <li key={check.id}><span>{check.title}</span><ReviewStatusBadge status={check.status} /></li>)}</ul>
    <button type="button" onClick={() => onEdit(record)} aria-label={`${record.title} 기록 열기`}>원인·패치 기록 열기</button>
  </article>;
}

export function DependencyReviewWorkItems({ board, now, onEdit }: { board: DependencyReviewBoard; now: number; onEdit: (record: ReviewRecord) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [cause, setCause] = useState("all");
  const [view, setView] = useState<"list" | "board">("list");
  const records = board.records.filter(record => record.category === "cause" || record.category === "check");
  const filtered = records.filter(record => {
    const matchesCause = cause === "all" || (cause === "independent" ? record.category === "check" && record.causeIds.length === 0 : record.id === cause || record.causeIds.includes(cause));
    const text = [record.id, record.title, record.summary, record.group, record.currentVersion, record.expectedVersion, record.workspace, record.relatedFiles, record.hypothesis, ...record.causeIds].join(" ").toLocaleLowerCase();
    return matchesCause && (status === "all" || record.status === status) && text.includes(query.trim().toLocaleLowerCase());
  });
  const causes = filtered.filter(record => record.category === "cause");
  const checks = filtered.filter(record => record.category === "check");
  function reset() { setQuery(""); setStatus("all"); setCause("all"); }

  return <section id="dependency-work" aria-labelledby="dependency-work-title">
    <div className="ci-quality-section-heading"><h3 id="dependency-work-title">원인별 작업 추적</h3><div role="group" aria-label="작업 보기 방식" className="ci-quality-actions"><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>원인별 목록</button><button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>6단계 보드</button></div></div>
    <div className="ci-quality-card dependency-filters">
      <label>의존성 작업 검색<input aria-label="의존성 작업 검색" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="원인·검사·버전·파일" /></label>
      <label>원인별 보기<select aria-label="원인별 보기" value={cause} onChange={event => setCause(event.target.value)}><option value="all">모든 원인</option><option value="remotion">Remotion</option><option value="deepmerge">deepmerge</option><option value="independent">별도 원인·미확인</option></select></label>
      <label>작업 상태 필터<select aria-label="작업 상태 필터" value={status} onChange={event => setStatus(event.target.value)}><option value="all">모든 상태</option>{workflowStatuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <button type="button" onClick={reset}>작업 필터 초기화</button>
    </div>
    <p className="ci-quality-caption">원인·검사 {filtered.length} / {records.length}개 표시 · 승인과 완료 보관 항목은 아래에서 별도로 관리합니다.</p>
    {!filtered.length ? <div className="ci-quality-card ci-quality-empty"><h3>일치하는 작업이 없습니다</h3><p>검색어나 원인·상태 필터를 확인하세요.</p></div> : view === "board" ? <div className="dependency-kanban" aria-label="6단계 의존성 작업 보드">{workflowStatuses.map(value => {
      const entries = filtered.filter(record => record.status === value);
      return <section key={value} className="ci-quality-kanban-column" aria-label={`${value} 작업`}><h3>{value}<small>{entries.length}</small></h3>{entries.map(record => <button key={record.id} type="button" className="ci-quality-kanban-item" onClick={() => onEdit(record)} aria-label={`${record.title} 기록 열기`}><strong>{record.title}</strong><small>{record.category === "cause" ? "원인" : "검사"} · {record.group}</small><ReviewFreshnessBadge record={record} board={board} now={now} /><small>수동 결과 · {record.recordedResult}</small></button>)}{!entries.length && <p>아직 항목이 없습니다.</p>}</section>;
    })}</div> : <>
      {!!causes.length && <div className="dependency-causes">{causes.map(record => <CauseCard key={record.id} record={record} board={board} now={now} onEdit={onEdit} />)}</div>}
      {!!checks.length && <section aria-labelledby="dependency-checks-title"><h3 id="dependency-checks-title">관련 검사 대조 <small>{checks.length}개</small></h3><div className="dependency-table-scroll"><table className="ci-quality-table dependency-check-table"><caption className="ci-quality-sr-only">프로덕션 빌드·Marketplace·ProductTourPlayer·Core product·Studio discovery 검사를 각각 대조합니다.</caption><thead><tr><th scope="col">검사·연결 원인</th><th scope="col">작업 상태·최신성</th><th scope="col">관측 결과·수동 기록</th><th scope="col">관련 CI</th><th scope="col">기록</th></tr></thead><tbody>{checks.map(record => <tr key={record.id}><th scope="row"><strong>{record.title}</strong><small>{record.causeIds.length ? record.causeIds.join(" · ") : "별도 원인 · 미확인"}</small></th><td><ReviewStatusBadge status={record.status} /><ReviewFreshnessBadge record={record} board={board} now={now} /></td><td><span>{record.result || "미확인"}</span><small>수동 검사 결과 · {record.recordedResult}</small><small>과거 · {record.historicalResult || "미확인"}</small></td><td><CiLinks record={record} /></td><td><button type="button" onClick={() => onEdit(record)} aria-label={`${record.title} 기록 열기`}>상세 기록</button></td></tr>)}</tbody></table></div></section>}
    </>}
  </section>;
}

export function DependencyReviewComparisons({ board }: { board: DependencyReviewBoard }) {
  return <>
    <details id="dependency-files" className="dependency-section" open>
      <summary>package.json · pnpm-lock.yaml · 워크스페이스 대조</summary>
      <p>기준 SHA의 선언과 잠금 해석입니다. 현재 설치 트리·CI 실행은 각 검사 증빙으로 확인하세요.</p>
      <div className="dependency-table-scroll"><table className="ci-quality-table dependency-comparison-table"><caption className="ci-quality-sr-only">선언 버전, 잠금 버전, 기대 버전과 워크스페이스 위치</caption><thead><tr><th scope="col">패키지·위치</th><th scope="col">선언 버전</th><th scope="col">잠금파일 해석 버전</th><th scope="col">기대 버전</th><th scope="col">해석·관련 파일</th></tr></thead><tbody>{board.dependencies.map((item, index) => <tr key={`${item.name}:${item.workspace}:${index}`}><th scope="row"><strong>{item.name}</strong><small>{item.workspace}</small></th><td>{item.declared || "미확인"}</td><td>{item.resolved || "미확인"}</td><td>{item.expected || "미확인"}</td><td><p>{item.interpretation || "미확인"}</p><a href={item.url} target="_blank" rel="noopener noreferrer">기준 파일 보기</a></td></tr>)}</tbody></table></div>
    </details>
    <details id="dependency-prs" className="dependency-section" open>
      <summary>PR · 병합 커밋 · 관련 CI 비교</summary>
      <p>PR head, 병합 결과와 CI의 실제 checkout SHA를 구분합니다. 확인하지 않은 값은 미확인으로 유지합니다.</p>
      <div className="dependency-table-scroll"><table className="ci-quality-table dependency-pr-table"><caption className="ci-quality-sr-only">PR 변경 내역, 병합 SHA와 CI 증빙을 비교하여 기존 문제와 회귀를 구분합니다.</caption><thead><tr><th scope="col">PR·역할</th><th scope="col">변경 내역·파일</th><th scope="col">병합·SHA</th><th scope="col">관련 CI·checkout</th><th scope="col">회귀 판정·근거</th></tr></thead><tbody>{board.prs.map(pr => <tr key={pr.number}><th scope="row"><a href={pr.url} target="_blank" rel="noopener noreferrer"><strong>#{pr.number} · {pr.title}</strong></a><small>{pr.role}</small></th><td><ul>{pr.changes.map((change, index) => <li key={index}>{change}</li>)}</ul><small>{pr.files || "변경 파일 미확인"}</small></td><td><a href={pr.commitUrl} target="_blank" rel="noopener noreferrer"><code>{pr.sha}</code></a><small>{pr.mergedAt || "병합 시각 미확인"}</small><small>base · <code>{pr.baseSha || "미확인"}</code></small><small>head · <code>{pr.headSha || "미확인"}</code></small></td><td>{pr.ciLinks?.length ? <ul className="dependency-links">{pr.ciLinks.map((link, index) => <li key={`${link.url}:${index}`}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}</ul> : "CI 미확인"}<small>checkout · <code>{pr.checkoutSha || "미확인"}</code></small></td><td>{pr.judgement || "미확인"}</td></tr>)}</tbody></table></div>
    </details>
    <details className="dependency-section">
      <summary>저비용 검증 방법 · 명령 초안</summary>
      <p>명령은 검토·복사 전용입니다. 이 화면에서 테스트·CI·코드 수정·배포를 실행하지 않습니다.</p>
      {board.commands.map((item, index) => <article key={`${item.title}:${index}`} className="ci-quality-card"><DependencyCopyBlock title={item.title} text={item.command} /><dl className="ci-quality-detail-grid"><div><dt>검증 범위</dt><dd>{item.scope}</dd></div><div><dt>비용</dt><dd>{item.cost}</dd></div><div className="ci-quality-full"><dt>검증 한계</dt><dd>{item.limitations}</dd></div></dl></article>)}
    </details>
  </>;
}

export function DependencyReviewClosingItems({ board, now, onEdit }: { board: DependencyReviewBoard; now: number; onEdit: (record: ReviewRecord) => void }) {
  const approvals = board.records.filter(record => record.category === "approval");
  const archives = board.records.filter(record => record.category === "archive");
  return <>
    <section id="dependency-approvals" className="dependency-section" aria-labelledby="dependency-approvals-title">
      <h3 id="dependency-approvals-title">실행 승인 대기 <small>{approvals.length}개</small></h3>
      <p>코드 수정·원격 푸시·PR 병합·운영 배포는 각각 승인 대기 항목으로 기록합니다. 메모 저장은 작업 실행이나 승인 처리로 연결되지 않습니다.</p>
      <div className="dependency-approvals">{approvals.map(record => <article className="ci-quality-card" key={record.id}><ReviewStatusBadge status={record.status} /><h3>{record.title}</h3><p>{record.summary}</p><p className="dependency-preserve">{record.nextAction || "다음 조치 미등록"}</p>{record.notes && <p className="dependency-preserve">{record.notes}</p>}<button type="button" onClick={() => onEdit(record)} aria-label={`${record.title} 기록 열기`}>검토 메모</button></article>)}</div>
    </section>
    <details id="dependency-archive" className="dependency-section">
      <summary>완료 보관함 · Studio exhaustive #2789</summary>
      <p>기존에 해결된 항목입니다. 이번 의존성 원인·관련 검사·실패 집계에 포함하지 않습니다.</p>
      {archives.map(record => <article className="ci-quality-card" key={record.id}><div className="ci-quality-section-heading"><h3>{record.title}</h3><ReviewStatusBadge status={record.status} /></div><p>{record.summary}</p><ReviewFreshnessBadge record={record} board={board} now={now} /><p>과거 완료 기록은 최신 main의 재실행 결과를 뜻하지 않습니다.</p><button type="button" onClick={() => onEdit(record)} aria-label={`${record.title} 기록 열기`}>완료 근거 보기</button></article>)}
    </details>
    <details className="dependency-section"><summary>의존성 검토 기록 이력 <small>{board.history.length}개</small></summary><p>현재 관리자의 브라우저 기록입니다. 서버 감사 로그와 구분합니다.</p>{board.history.length ? <ol className="ci-quality-history">{board.history.slice(0, 30).map(entry => <li key={entry.id}><strong>{entry.summary}</strong><time dateTime={entry.createdAt}>{qualityDate(entry.createdAt)}</time></li>)}</ol> : <p>아직 변경 이력이 없습니다.</p>}</details>
  </>;
}
