import { STATUSES, safeEvidenceUrl } from "@toonstudio/contracts/ai-operations";

import { aiDate, statusTone } from "./ai-operations-model";

import type { AiPage } from "./ai-operations-model";
import type { AiOperationsView, BoardItem, BoardSnapshot, BoardSource } from "@toonstudio/contracts/ai-operations";

export function AiStatus({ item }: { item: BoardItem }) { return <span className={`ai-ops-badge ${statusTone(item.status)}`}>{item.status}</span>; }
function value(item: BoardItem, ...keys: string[]): string { return item.fields.find((field) => keys.includes(field.key))?.value.trim() || "미확인"; }
function ItemButton({ item, onItem }: { item: BoardItem; onItem: (item: BoardItem) => void }) { return <button type="button" className="ai-ops-item-link" onClick={() => onItem(item)}>{item.title}</button>; }

export function AiOverview({ snapshot, items, onItem }: { snapshot: BoardSnapshot; items: BoardItem[]; onItem: (item: BoardItem) => void }) {
  const alerts = items.filter((item) => item.type === "alert");
  return <>
    <div className="ai-ops-metrics" aria-label="기록 현황"><article><span>필터에 맞는 기록</span><strong>{items.length}</strong><small>운영 트래픽 통계 아님</small></article><article><span>모델 기록</span><strong>{items.filter((item) => ["model", "retired-model"].includes(item.type)).length}</strong><small>코드 구성과 실제 사용 구분</small></article><article><span>Onpod 알림 기록</span><strong>{alerts.length}</strong><small>원문의 측정 구간별 기록</small></article><article><span>승인 대기 기록</span><strong>{items.filter((item) => item.status === "승인 대기").length}</strong><small>운영 변경 자동 실행 없음</small></article></div>
    <section className="ai-ops-callout"><h2>기록과 근거를 함께 확인하세요</h2><p>Cloudflare 오류 대응과 Onpod 한도 초과 원인을 한곳에서 추적합니다. 실제 호출 빈도·운영 환경·비용은 해당 관측 근거가 있어야 확정할 수 있습니다.</p><p>공식 종료 예정일: <strong>{snapshot.meta.deadline || "미확인"}</strong> · 정확한 시각과 시간대는 공지를 확인하세요. {safeEvidenceUrl(snapshot.meta.noticeUrl) && <a href={snapshot.meta.noticeUrl} target="_blank" rel="noopener noreferrer">공식 공지 열기 ↗</a>}</p></section>
    <div className="ai-ops-overview-grid"><section className="ai-ops-panel"><h2>다음 조치</h2>{items.filter((item) => !["검증 완료", "main 반영 완료"].includes(item.status)).slice(0, 8).map((item) => <article key={item.id} className="ai-ops-next"><div><AiStatus item={item} /> <span className="ai-ops-muted">{item.priority} · {item.provider}</span></div><ItemButton item={item} onItem={onItem} /><p>{item.nextAction || "다음 조치 미등록"}</p></article>)}{!items.length && <p>필터에 맞는 기록이 없습니다.</p>}</section>
      <section className="ai-ops-panel"><h2>Onpod 관측 기록</h2><p className="ai-ops-muted">초과 시간을 합산하거나 장애 지속 시간으로 해석하지 않습니다.</p>{alerts.slice(0, 5).map((item) => <article key={item.id} className="ai-ops-next"><ItemButton item={item} onItem={onItem} /><dl><dt>알림 시각</dt><dd>{value(item, "notificationTime", "receivedAt")}</dd><dt>관측된 초과 시간</dt><dd>{value(item, "exceededTime", "durationMinutes")}</dd><dt>측정 구간</dt><dd>{value(item, "measurementWindow")}</dd></dl></article>)}{!alerts.length && <p>이 필터에 표시할 알림이 없습니다. 알림이 없었다는 의미는 아닙니다.</p>}</section></div>
  </>;
}

export function AiItemsTable({ page, items, onItem }: { page: AiPage; items: BoardItem[]; onItem: (item: BoardItem) => void }) {
  const columns: [string, string[]][] = page === "models" ? [["모델 ID", ["modelId"]], ["현재 코드·운영 상태", ["currentModelStatus", "codeRole"]], ["종료 예정일", ["retirementDate"]], ["대체 후보", ["candidate", "replacement"]], ["호출 경로", ["callPath"]], ["영향 기능", ["affectedFeatures", "feature"]], ["호출 빈도", ["frequency"]], ["오류 대응", ["errorHandling", "failureStatus"]]]
    : page === "alerts" ? [["알림 시각", ["notificationTime", "receivedAt"]], ["관측된 초과 시간", ["exceededTime", "durationMinutes"]], ["측정 구간", ["measurementWindow"]], ["로컬 rate limit", ["rateLimitConfig", "localRateLimit"]], ["실시간 클러스터", ["clusterConfig", "realtimeCluster"]], ["최근 변경", ["recentChange", "recentChanges"]], ["재현", ["reproduction"]], ["비용 영향", ["costImpact", "cost"]], ["무료 완화안", ["mitigation", "freeMitigation"]]]
      : [["원인 분류", ["category", "hypothesis"]], ["지지 근거", ["evidence", "support"]], ["반증·판단 제한", ["counterEvidence", "missing"]], ["재현", ["reproduction"]], ["저비용 검증", ["cheapValidation"]], ["비용 영향", ["costImpact", "cost"]]];
  const caption = page === "models" ? "모델 구성·종료 영향 비교" : page === "alerts" ? "Onpod 알림의 개별 관측값 비교" : "처리량·동시성·재시도·장시간 요청·중복 실행 가설 비교";
  return <><p className="ai-ops-muted">기록 제목을 열면 사용자 영향·변경 파일·롤백·검증 방법과 모든 근거를 확인할 수 있습니다.</p><div className="ai-ops-table-wrap" tabIndex={0} role="region" aria-label={caption}><table><caption>{caption}</caption><thead><tr><th>기록 / 관리 상태</th>{columns.map(([label]) => <th key={label}>{label}</th>)}<th>다음 조치</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><th scope="row"><ItemButton item={item} onItem={onItem} /><AiStatus item={item} /><small>{item.assurance} · {item.priority}</small></th>{columns.map(([label, keys]) => <td key={label}>{value(item, ...keys)}</td>)}<td>{item.nextAction || "미등록"}</td></tr>)}</tbody></table>{!items.length && <p className="ai-ops-empty">필터에 맞는 기록이 없습니다.</p>}</div></>;
}

export function AiTasks({ items, status, onItem }: { items: BoardItem[]; status: string; onItem: (item: BoardItem) => void }) {
  return <div className="ai-ops-kanban">{STATUSES.filter((entry) => !status || entry === status).map((entry) => <section key={entry} className="ai-ops-lane" aria-label={`${entry} 작업`}><h2>{entry}<span>{items.filter((item) => item.status === entry).length}</span></h2>{items.filter((item) => item.status === entry).map((item) => <article key={item.id}><p className="ai-ops-muted">{item.provider} · {item.priority} · {item.assurance}</p><ItemButton item={item} onItem={onItem} /><p>{item.nextAction || "다음 조치 미등록"}</p><small>담당: {item.owner || "미지정"}</small>{item.approvalRequired && <p className="ai-ops-muted">운영 변경 승인 대기</p>}</article>)}{!items.some((item) => item.status === entry) && <p className="ai-ops-muted">기록 없음</p>}</section>)}</div>;
}

export function AiSources({ sources, onSource }: { sources: BoardSource[]; onSource: (source: BoardSource) => void }) {
  return <div className="ai-ops-source-list">{sources.map((source) => <article key={source.id} className="ai-ops-panel"><div className="ai-ops-actions"><span className="ai-ops-badge">{source.kind}</span><small>{aiDate(source.observedAt)}</small></div><h2>{source.title}</h2><p>{source.scope || "근거 범위 미등록"}</p><div className="ai-ops-actions"><a href={source.url} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a><button type="button" onClick={() => onSource(source)}>근거 상세</button></div></article>)}{!sources.length && <p className="ai-ops-empty">표시할 근거가 없습니다. 검색 조건을 바꾸거나 출처를 등록하세요.</p>}</div>;
}

export function AiAudit({ server, snapshot }: { server: AiOperationsView; snapshot: BoardSnapshot }) {
  return <details className="ai-ops-panel ai-ops-history"><summary>서버 변경 이력 · 가져온 과거 이력</summary><h2>서버에 저장된 변경 이력</h2><p className="ai-ops-muted">기록 저장 이력입니다. 코드·배포·계정 변경을 실행한 이력이 아닙니다.</p>{server.audit.length ? <ol>{server.audit.map((entry) => <li key={entry.revision}>리비전 {entry.revision} · {aiDate(entry.at)} · 관리자 {entry.actorUserId}</li>)}</ol> : <p>저장된 서버 변경 이력이 없습니다.</p>}
    {snapshot.importedActivity?.length ? <><h2>가져온 과거 이력</h2><p className="ai-ops-muted">가져온 파일의 기록이며 서버에서 검증한 감사 이력으로 취급하지 않습니다.</p><ol>{snapshot.importedActivity.map((entry, index) => <li key={`${entry.id}-${index}`}>{entry.title} · {aiDate(entry.at)}</li>)}</ol></> : null}
  </details>;
}
