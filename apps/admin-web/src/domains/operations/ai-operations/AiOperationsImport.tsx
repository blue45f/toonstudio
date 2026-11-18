import { MAX_AI_OPERATIONS_BYTES, parseAiOperationsImport } from "@toonstudio/contracts/ai-operations";
import { useEffect, useRef, useState } from "react";

import { aiDate, preserveAiApprovals } from "./ai-operations-model";
import { AiOperationsDialog } from "./AiOperationsDialog";

import type { BoardSnapshot } from "@toonstudio/contracts/ai-operations";


export function AiOperationsImport({ current, onImport, onClose, visible = true }: { current: BoardSnapshot | null; onImport: (snapshot: BoardSnapshot) => string | null; onClose: () => void; visible?: boolean }) {
  const [text, setText] = useState(""); const [candidate, setCandidate] = useState<BoardSnapshot | null>(null); const [confirmed, setConfirmed] = useState(false); const [error, setError] = useState("");
  const [preserved, setPreserved] = useState(0);
  const [reading, setReading] = useState(false); const sequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; }, []);
  function update(value: string) { sequence.current += 1; setReading(false); setText(value); setCandidate(null); setConfirmed(false); setError(""); }
  async function read(file?: File) {
    if (!file) return;
    const currentRead = ++sequence.current; setCandidate(null); setConfirmed(false); setText(""); setError("");
    if (file.size > MAX_AI_OPERATIONS_BYTES) { setReading(false); setError("JSON 파일은 2 MiB 이하여야 합니다."); return; }
    setReading(true);
    try { const content = await file.text(); if (sequence.current === currentRead) setText(content); }
    catch { if (sequence.current === currentRead) setError("파일을 읽지 못했습니다. 현재 기록은 변경하지 않았습니다."); }
    finally { if (sequence.current === currentRead) setReading(false); }
  }
  return <AiOperationsDialog visible={visible} title="운영 보드 JSON 가져오기" description="Sites 보드에서 내보낸 전체 기록 JSON을 검토한 뒤 가져옵니다. 메일·내부 근거는 이 인증된 화면을 통해 이동합니다." onClose={onClose}>
    <div className="ai-ops-form-grid"><label className="ai-span-all">JSON 파일<input type="file" accept="application/json,.json" onChange={(event) => { void read(event.target.files?.[0]); }} /></label><label className="ai-span-all">또는 JSON 붙여넣기<textarea rows={10} value={text} onChange={(event) => update(event.target.value)} maxLength={MAX_AI_OPERATIONS_BYTES} spellCheck={false} /></label></div>
    {reading && <p role="status">선택한 JSON 파일을 읽고 있습니다.</p>}
    <button type="button" disabled={reading || !text.trim()} onClick={() => { try { const next = preserveAiApprovals(parseAiOperationsImport(text), current); setCandidate(next.snapshot); setPreserved(next.preserved); setConfirmed(false); setError(""); } catch (cause) { setCandidate(null); setError(cause instanceof Error ? cause.message : "JSON 형식을 확인하세요."); } }}>가져오기 내용 검토</button>
    {error && <p role="alert" className="ai-ops-error">{error}</p>}
    {candidate && <section className="ai-ops-callout" aria-label="가져오기 검토"><h3>{candidate.meta.title}</h3><p>기록 {candidate.items.length}개 · 출처 {candidate.sources.length}개 · 가져온 과거 이력 {candidate.importedActivity?.length ?? 0}개</p><p>기존 승인 대기 항목 {preserved}개와 해당 근거를 보존합니다.</p><p>기준 관측: {aiDate(candidate.meta.snapshotAt)}</p><p>기준 SHA: <code>{candidate.meta.mainSha || "미확인"}</code></p><label className="ai-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />기존 승인 항목을 보존하고 나머지 기록을 가져온 내용으로 바꿀 것을 확인했습니다.</label><p>서버 저장은 가져온 뒤 별도로 눌러야 합니다. 기존 승인 대기 제한은 해제할 수 없습니다.</p><button type="button" className="ai-ops-primary" disabled={!confirmed} onClick={() => { const problem = onImport(candidate); if (problem) setError(problem); else onClose(); }}>검토한 기록을 화면에 적용</button></section>}
  </AiOperationsDialog>;
}
