import { CLAIM_KINDS, FACT_STATUS, claimIssues, effectiveFact, freshness, todayKst, validateClaim } from "@toonstudio/contracts/business-plan";
import { useState } from "react";

import { BusinessPlanBadge, BusinessPlanDialog, BusinessPlanError, BusinessPlanFormFooter, BusinessPlanLink, BusinessPlanPanel, CheckField, SelectField, TextAreaField, TextField, businessPlanDate, businessPlanDateInput, businessPlanId, formText } from "./business-plan-ui";

import type { BusinessPlanCommit } from "./business-plan-ui";
import type { BusinessPlanClaim, BusinessPlanState } from "@toonstudio/contracts/business-plan";

function newClaim(taskId: string): BusinessPlanClaim {
  return { id: businessPlanId("claim"), taskId, title: "", text: "", kind: "정성 주장", value: "", unit: "", period: "", scope: "", factStatus: "미확인", sourceUrl: "", sourceTitle: "", publisher: "", publishedAt: "", sourceLocation: "", originalExcerpt: "", crossSourceUrl: "", crossSourceTitle: "", crossNotes: "", verifiedAt: "", reviewer: "", reviewDays: 30, notes: "", assumptions: "", formula: "", updatedAt: new Date().toISOString() };
}

export function BusinessPlanClaims({ board, onCommit, now }: { board: BusinessPlanState; onCommit: BusinessPlanCommit; now: Date }) {
  const [filter, setFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("");
  const [editing, setEditing] = useState<BusinessPlanClaim | null>(null);
  const claims = board.claims.filter((claim) => {
    const fact = effectiveFact(claim, now); const fresh = freshness(claim, now);
    return (!taskFilter || claim.taskId === taskFilter) && (filter === "all" || (filter === "unknown" && !["근거 확인", "가정·산식 검토"].includes(fact)) || (filter === "stale" && fresh.level !== "good") || (filter === "conflict" && fact === "출처 상충"));
  });
  return <BusinessPlanPanel id="bp-claims" title="주장과 근거 검증" eyebrow="EVIDENCE REGISTER" description="필수 출처와 검증 기록을 갖추기 전에는 수치·시장 규모·비교 결과를 확정하지 않습니다." className="bp-section" actions={<button type="button" className="bp-button bp-button--small" onClick={() => setEditing(newClaim(board.tasks[0]?.id ?? ""))}>주장 추가</button>}>
    <div className="bp-toolbar"><div className="bp-segmented" role="group" aria-label="주장 검증 필터">{[["all", "전체"], ["unknown", "미확인"], ["stale", "최신성 점검"], ["conflict", "출처 상충"]].map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div><label><span className="bp-sr-only">연결 작업 필터</span><select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}><option value="">전체 작업</option>{board.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><span className="bp-muted bp-small">{claims.length}/{board.claims.length}개 주장</span></div>
    <div className="bp-table-wrap"><table className="bp-table"><caption className="bp-sr-only">주장별 사실 확인 상태, 원문 출처, 검증일과 최신성</caption><thead><tr><th scope="col">주장·확인 대상</th><th scope="col">사실 확인</th><th scope="col">원문 근거</th><th scope="col">검증일·최신성</th><th scope="col">기록</th></tr></thead><tbody>
      {claims.map((claim) => {
        const fact = effectiveFact(claim, now); const fresh = freshness(claim, now); const reviewed = ["근거 확인", "가정·산식 검토"].includes(fact); const issues = claimIssues(claim, now);
        return <tr key={claim.id}><td><strong>{claim.title}</strong><small>{claim.kind} · {board.tasks.find((task) => task.id === claim.taskId)?.title ?? "연결 작업 없음"}</small>{claim.kind !== "정성 주장" && <span className={`bp-value ${reviewed ? "" : "bp-value--unknown"}`}>{reviewed ? claim.kind === "매출 전망" ? `전망 가정: ${claim.value} ${claim.unit}` : claim.value ? `${claim.value} ${claim.unit}` : "비교·구현 근거 기록 확인" : "미확인"}</span>}</td><td><BusinessPlanBadge tone={reviewed ? "good" : fact === "출처 상충" ? "danger" : "warn"}>{fact}</BusinessPlanBadge>{!reviewed && <small>{issues.length ? `필수 근거 ${issues.length}개 확인 필요` : "검증 상태 확인 필요"}</small>}{claim.kind === "매출 전망" && <small>실제 매출과 별도 관리</small>}</td><td><BusinessPlanLink url={claim.sourceUrl}>{claim.sourceTitle || "원문 링크"}</BusinessPlanLink><small>{claim.publisher || "발행 주체 미등록"}</small>{claim.crossSourceUrl && <small><BusinessPlanLink url={claim.crossSourceUrl}>{claim.crossSourceTitle || "교차검증 자료"}</BusinessPlanLink></small>}</td><td><span>{businessPlanDate(claim.verifiedAt)}</span><small>{claim.reviewer || "검증 담당 미등록"}</small><BusinessPlanBadge tone={fresh.level === "good" ? "good" : fresh.level === "danger" ? "danger" : "warn"}>{fresh.label}</BusinessPlanBadge><small>{fresh.detail}</small></td><td><button type="button" className="bp-button bp-button--small" onClick={() => setEditing(claim)} aria-label={`${claim.title} 근거 편집`}>검증 기록</button></td></tr>;
      })}
    </tbody></table></div>{!claims.length && <p className="bp-empty">조건에 맞는 주장이 없습니다. 확인할 주장을 등록하세요.</p>}
    <div className="bp-panel-footer">출처 링크를 등록하는 것만으로 사실 확인이 완료되지 않습니다. 최신성은 입력된 검증일·발행일·변경일·검토 주기를 기준으로 판정합니다.</div>
    {editing && <ClaimEditor key={editing.id} claim={editing} board={board} onCommit={onCommit} onClose={() => setEditing(null)} />}
  </BusinessPlanPanel>;
}

function ClaimEditor({ claim, board, onCommit, onClose }: { claim: BusinessPlanClaim; board: BusinessPlanState; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const [tab, setTab] = useState("claim");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const exists = board.claims.some((item) => item.id === claim.id);
  return <BusinessPlanDialog title={exists ? `${claim.title} 검증 기록` : "검증할 주장 추가"} description="실제 원문을 확인한 기록만 근거 확인으로 표시하세요. 미확인 수치는 입력 후보로 보존되며 확정 수치로 표시하지 않습니다." dirty={dirty} wide onClose={onClose}>
    <form noValidate onChange={() => setDirty(true)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const value = (name: string) => formText(data, name);
      const factStatus = FACT_STATUS.find((item) => item === value("factStatus")); const kind = CLAIM_KINDS.find((item) => item === value("kind"));
      if (!factStatus || !kind) { setError("주장 유형과 사실 확인 상태를 선택하세요."); return; }
      if (factStatus === "근거 확인" && data.get("verificationConfirmed") !== "on") { setError("실제 원문 확인 체크를 완료하거나 사실 확인 상태를 검증 중으로 변경하세요."); return; }
      const at = new Date().toISOString();
      const publishedAt = value("publishedAt") === businessPlanDateInput(claim.publishedAt) ? claim.publishedAt : value("publishedAt");
      const verifiedAt = factStatus === "근거 확인" && value("verifiedAt") === todayKst() ? at : value("verifiedAt") === businessPlanDateInput(claim.verifiedAt) ? claim.verifiedAt : value("verifiedAt");
      const candidate: BusinessPlanClaim = { ...claim, title: value("title"), taskId: value("taskId"), text: value("text"), kind, factStatus, value: value("value"), unit: value("unit"), period: value("period"), scope: value("scope"), sourceUrl: value("sourceUrl"), sourceTitle: value("sourceTitle"), publisher: value("publisher"), publishedAt, sourceLocation: value("sourceLocation"), originalExcerpt: value("originalExcerpt"), crossSourceUrl: value("crossSourceUrl"), crossSourceTitle: value("crossSourceTitle"), crossNotes: value("crossNotes"), verifiedAt, reviewer: value("reviewer"), reviewDays: Number(value("reviewDays")), assumptions: value("assumptions"), formula: value("formula"), notes: value("notes"), updatedAt: at };
      const check = validateClaim(candidate);
      if (!check.ok) { setError(check.errors.join(" · ")); return; }
      const failure = onCommit({ ...board, claims: exists ? board.claims.map((item) => item.id === claim.id ? candidate : item) : [...board.claims, candidate] }, `${candidate.title}: 주장 검증 기록 ${exists ? "수정" : "추가"}`);
      if (failure) setError(failure); else onClose();
    }}>
      <div className="bp-dialog-body"><div className="bp-tabs" role="group" aria-label="주장 기록 구역">{[["claim", "주장·수치"], ["source", "원문·검증"], ["cross", "교차검증·전망"]].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
        <div className="bp-form-grid" hidden={tab !== "claim"}>
          <TextField label="주장 제목" name="title" value={claim.title} maxLength={500} required full />
          <SelectField label="연결 작업" name="taskId" value={claim.taskId} options={board.tasks.map((task) => ({ value: task.id, label: task.title }))} />
          <SelectField label="주장 유형" name="kind" value={claim.kind} options={CLAIM_KINDS} />
          <TextAreaField label="검증할 주장 원문" name="text" value={claim.text} full />
          <SelectField label="사실 확인 상태" name="factStatus" value={claim.factStatus} options={FACT_STATUS} />
          <TextField label="재검토 간격 (일)" name="reviewDays" value={String(claim.reviewDays)} type="number" hint="1~365일. 검토 주기 경과 시 경고합니다." />
          <TextField label="확인 대상 수치" name="value" value={claim.value} hint="모르면 비워 두세요. 확인한 0은 0으로 입력합니다." />
          <TextField label="단위" name="unit" value={claim.unit} />
          <TextField label="기준 기간" name="period" value={claim.period} />
          <TextAreaField label="지표·비교 범위와 정의" name="scope" value={claim.scope} />
          <TextAreaField label="검증 메모" name="notes" value={claim.notes} full />
        </div>
        <div className="bp-form-grid" hidden={tab !== "source"}>
          <TextField label="원문 링크" name="sourceUrl" value={claim.sourceUrl} type="url" full />
          <TextField label="원문 제목" name="sourceTitle" value={claim.sourceTitle} />
          <TextField label="발행 주체" name="publisher" value={claim.publisher} />
          <TextField label="원문 발행일" name="publishedAt" value={businessPlanDateInput(claim.publishedAt)} type="date" />
          <TextField label="원문 페이지·표·문단 위치" name="sourceLocation" value={claim.sourceLocation} />
          <TextAreaField label="원문에서 실제 확인한 내용" name="originalExcerpt" value={claim.originalExcerpt} full hint="주장과 연결되는 내용, 단위와 기간을 확인해 기록합니다." />
          <TextField label="주장 검증일" name="verifiedAt" value={businessPlanDateInput(claim.verifiedAt)} type="date" hint="오늘 원문을 확인한 경우 확인 시각도 함께 기록합니다." />
          <TextField label="검증 담당자" name="reviewer" value={claim.reviewer} maxLength={500} />
        </div>
        <div className="bp-form-grid" hidden={tab !== "cross"}>
          <p className="bp-notice bp-full">시장 규모·매출 전망은 서로 다른 출처의 기준 기간·단위·정의를 대조합니다. 매출 전망에는 가정과 산식이 필요하며 실제 매출로 확정하지 않습니다.</p>
          <TextField label="교차검증 출처 링크" name="crossSourceUrl" value={claim.crossSourceUrl} type="url" />
          <TextField label="교차검증 출처 제목" name="crossSourceTitle" value={claim.crossSourceTitle} />
          <TextAreaField label="교차검증 기록·출처 독립성" name="crossNotes" value={claim.crossNotes} full />
          <TextAreaField label="매출 전망 가정" name="assumptions" value={claim.assumptions} />
          <TextAreaField label="매출 전망 산식" name="formula" value={claim.formula} />
        </div>
        <CheckField label="실제 원문을 직접 확인했으며 위 검증 기록과 일치합니다" name="verificationConfirmed" hint="‘근거 확인’으로 반영할 때마다 새로 확인합니다. 링크 등록이나 JSON 형식 검사로 대신하지 않습니다." />
        <BusinessPlanError error={error} />
      </div><BusinessPlanFormFooter />
    </form>
  </BusinessPlanDialog>;
}
