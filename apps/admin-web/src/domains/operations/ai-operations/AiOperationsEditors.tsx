import { STATUSES } from "@toonstudio/contracts/ai-operations";
import { useState } from "react";

import { aiKstInput, aiKstIso, SOURCE_KINDS, ITEM_TYPES } from "./ai-operations-model";
import { AiOperationsDialog } from "./AiOperationsDialog";

import type { BoardItem, BoardSnapshot, BoardSource } from "@toonstudio/contracts/ai-operations";


export function AiItemEditor({ item, snapshot, canEdit, onApply, onClose, visible = true }: { item: BoardItem; snapshot: BoardSnapshot; canEdit: boolean; onApply: (item: BoardItem) => string | null; onClose: () => void; visible?: boolean }) {
  const [draft, setDraft] = useState<BoardItem>(() => structuredClone(item)); const [error, setError] = useState("");
  const change = <K extends keyof BoardItem>(key: K, value: BoardItem[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const kind = ITEM_TYPES.find(([type]) => type === item.type)?.[1] ?? item.type;
  function apply() { const result = onApply(draft); setError(result ?? ""); if (!result) onClose(); }
  return <AiOperationsDialog visible={visible} title={`${kind} 상세 기록`} description="근거가 없는 값은 미확인으로 남겨 주세요. 적용한 뒤 보드의 서버에 저장 버튼으로 확정합니다." onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); apply(); }}>
      <fieldset disabled={!canEdit} className="ai-ops-form-grid"><legend>기록 내용</legend>
        <label className="ai-span-all">제목<input value={draft.title} onChange={(event) => change("title", event.target.value)} maxLength={240} required /></label>
        <label>제공자<select value={draft.provider} onChange={(event) => change("provider", event.target.value as BoardItem["provider"])}>{["Cloudflare", "Onpod", "공통"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>진행 상태<select value={draft.status} onChange={(event) => change("status", event.target.value as BoardItem["status"])}>{STATUSES.map((value) => <option key={value} disabled={draft.approvalRequired && value !== "승인 대기"}>{value}</option>)}</select></label>
        <label>우선순위<select value={draft.priority} onChange={(event) => change("priority", event.target.value as BoardItem["priority"])}>{["P0", "P1", "P2"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>사실 확인 상태<select value={draft.assurance} onChange={(event) => change("assurance", event.target.value as BoardItem["assurance"])}>{["확인됨", "부분 확인", "가설", "미확인"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>담당자<input value={draft.owner} onChange={(event) => change("owner", event.target.value)} maxLength={200} /></label>
        <label>태그 (쉼표로 구분)<input value={draft.tags.join(", ")} onChange={(event) => change("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} maxLength={2000} /></label>
        <label className="ai-span-all">설명<textarea value={draft.description} onChange={(event) => change("description", event.target.value)} maxLength={12000} rows={3} /></label>
        <label className="ai-span-all">다음 조치<textarea value={draft.nextAction} onChange={(event) => change("nextAction", event.target.value)} maxLength={8000} rows={2} /></label>
        <label className="ai-span-all">메모<textarea value={draft.notes} onChange={(event) => change("notes", event.target.value)} maxLength={16000} rows={3} /></label>
        <label className="ai-span-all ai-check"><input type="checkbox" checked={draft.approvalRequired} disabled={item.approvalRequired} onChange={(event) => setDraft((current) => ({ ...current, approvalRequired: event.target.checked, status: event.target.checked ? "승인 대기" : current.status }))} />운영 변경 승인 대기로 관리</label>
      </fieldset>
      {draft.approvalRequired && <p className="ai-ops-callout">코드·배포·계정·요금제 변경은 승인 대기 기록만 관리합니다. 이 화면에서 실행하거나 완료 처리하지 않습니다.</p>}
      <fieldset disabled={!canEdit}><legend>세부 관측과 대응</legend><p className="ai-ops-muted">알림 시각·초과 시간·측정 구간과 운영 설정은 각각 근거를 남깁니다.</p>
        <div className="ai-ops-form-grid">{draft.fields.map((field, index) => <label key={field.key}>{field.label}<textarea value={field.value} rows={3} maxLength={8000} onChange={(event) => change("fields", draft.fields.map((entry, position) => position === index ? { ...entry, value: event.target.value } : entry))} /></label>)}</div>
        {canEdit && <button type="button" disabled={draft.fields.length >= 60} onClick={() => change("fields", [...draft.fields, { key: `custom-${crypto.randomUUID()}`, label: `추가 관측 ${draft.fields.length + 1}`, value: "미확인" }])}>관측 항목 추가</button>}
      </fieldset>
      <fieldset disabled={!canEdit} className="ai-ops-form-grid"><legend>검증·main 반영 근거</legend>
        <label>검증 시각 (KST)<input type="datetime-local" step="1" value={aiKstInput(draft.verifiedAt)} onChange={(event) => change("verifiedAt", event.target.value ? aiKstIso(event.target.value) : null)} /></label>
        <label>main 커밋 SHA (40자리)<input value={draft.mainSha ?? ""} maxLength={40} onChange={(event) => change("mainSha", event.target.value || null)} /></label>
        <label className="ai-span-all">실제 검증 결과<textarea value={draft.verificationNote} onChange={(event) => change("verificationNote", event.target.value)} maxLength={8000} rows={3} /></label>
        <div className="ai-span-all"><p>연결할 근거</p><div className="ai-ops-source-picker">{snapshot.sources.length ? snapshot.sources.map((source) => <label key={source.id} className="ai-check"><input type="checkbox" checked={draft.sourceIds.includes(source.id)} onChange={(event) => change("sourceIds", event.target.checked ? [...draft.sourceIds, source.id] : draft.sourceIds.filter((id) => id !== source.id))} />{source.kind} · {source.title}</label>) : <p className="ai-ops-muted">근거 자료에서 출처를 먼저 등록하세요.</p>}</div></div>
      </fieldset>
      <p className="ai-ops-muted">링크·SHA 형식 검사는 외부 CI·병합·배포 결과를 자동 확인한 증거가 아닙니다.</p>
      {error && <p role="alert" className="ai-ops-error">{error}</p>}
      <div className="ai-ops-actions">{canEdit && <button type="submit" className="ai-ops-primary">변경 적용</button>}<button type="button" onClick={onClose}>닫기</button></div>
    </form>
  </AiOperationsDialog>;
}

export function AiSourceEditor({ source, canEdit, onApply, onClose, visible = true }: { source: BoardSource; canEdit: boolean; onApply: (source: BoardSource) => string | null; onClose: () => void; visible?: boolean }) {
  const [draft, setDraft] = useState(source); const [error, setError] = useState("");
  const change = <K extends keyof BoardSource>(key: K, value: BoardSource[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <AiOperationsDialog visible={visible} title="근거 자료 기록" description="관측 시각과 근거가 증명하는 범위를 기록하세요. 메일 링크의 열람 권한은 원래 메일 계정에 따릅니다." onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); const problem = onApply(draft); setError(problem ?? ""); if (!problem) onClose(); }}>
      <fieldset disabled={!canEdit} className="ai-ops-form-grid"><legend>출처</legend>
        <label className="ai-span-all">근거 제목<input value={draft.title} onChange={(event) => change("title", event.target.value)} required maxLength={240} /></label>
        <label>근거 유형<select value={draft.kind} onChange={(event) => change("kind", event.target.value as BoardSource["kind"])}>{SOURCE_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <label>관측 시각 (KST)<input type="datetime-local" step="1" value={aiKstInput(draft.observedAt)} onChange={(event) => change("observedAt", aiKstIso(event.target.value))} /></label>
        <label className="ai-span-all">HTTPS 근거 URL<input type="url" value={draft.url} onChange={(event) => change("url", event.target.value)} required maxLength={4000} /></label>
        <label className="ai-span-all">근거의 범위<textarea value={draft.scope} onChange={(event) => change("scope", event.target.value)} rows={4} maxLength={8000} /></label>
      </fieldset>{error && <p role="alert" className="ai-ops-error">{error}</p>}<div className="ai-ops-actions">{canEdit && <button type="submit" className="ai-ops-primary">근거 적용</button>}<button type="button" onClick={onClose}>닫기</button></div>
    </form>
  </AiOperationsDialog>;
}

export function AiMetaEditor({ snapshot, onApply, onClose, visible = true }: { snapshot: BoardSnapshot; onApply: (snapshot: BoardSnapshot) => string | null; onClose: () => void; visible?: boolean }) {
  const [meta, setMeta] = useState(snapshot.meta); const [error, setError] = useState("");
  const change = <K extends keyof BoardSnapshot["meta"]>(key: K, value: BoardSnapshot["meta"][K]) => setMeta((current) => ({ ...current, [key]: value }));
  return <AiOperationsDialog visible={visible} title="기준 정보 기록" description="저장 시각과 근거 관측 시각은 별개입니다. 실제 재확인했을 때만 기준 시각과 SHA를 바꾸세요." onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); const problem = onApply({ ...snapshot, meta }); setError(problem ?? ""); if (!problem) onClose(); }}>
      <div className="ai-ops-form-grid"><label className="ai-span-all">보드 제목<input value={meta.title} onChange={(event) => change("title", event.target.value)} maxLength={240} required /></label>
        <label>기준 관측 시각 (KST)<input type="datetime-local" step="1" value={aiKstInput(meta.snapshotAt)} onChange={(event) => change("snapshotAt", aiKstIso(event.target.value))} /></label>
        <label>기준 main SHA (40자리)<input value={meta.mainSha} maxLength={40} onChange={(event) => change("mainSha", event.target.value)} /></label>
        <label className="ai-span-all">기준 커밋 URL<input value={meta.mainCommitUrl} type="url" maxLength={4000} onChange={(event) => change("mainCommitUrl", event.target.value)} /></label>
        <label>공식 종료 예정일<input value={meta.deadline} type="date" onChange={(event) => change("deadline", event.target.value)} /></label>
        <label>공식 공지 URL<input value={meta.noticeUrl} type="url" maxLength={4000} onChange={(event) => change("noticeUrl", event.target.value)} /></label>
        <label className="ai-span-all">근거 해석 주의사항 (줄바꿈으로 구분)<textarea value={meta.caveats.join("\n")} rows={5} onChange={(event) => change("caveats", event.target.value.split("\n").filter(Boolean))} /></label>
      </div>{error && <p role="alert" className="ai-ops-error">{error}</p>}<div className="ai-ops-actions"><button type="submit" className="ai-ops-primary">기준 정보 적용</button><button type="button" onClick={onClose}>취소</button></div>
    </form>
  </AiOperationsDialog>;
}
