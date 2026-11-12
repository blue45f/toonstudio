import { useState } from "react";

import { createQualityBoard, createQualityGate, exportQualityBoardJson, parseQualityBoardJson, statusLabels, summarizeQualityBoard } from "./ci-quality-model";
import { QualityDialog, QualityFormError, qualityFormValue, qualityIsoTime, qualityLocalTime } from "./quality-ui";

import type { QualityBoard, QualityCheck, QualityQaResult, QualityStatus } from "./ci-quality-model";

export function downloadQualityJson(filename: string, content: string): void {
  if (typeof URL.createObjectURL !== "function") throw new Error("이 브라우저는 파일 내보내기를 지원하지 않습니다. JSON 내용을 복사해 백업하세요.");
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CiQualityJsonDialog({ board, onImport, onClose }: { board: QualityBoard | null; onImport: (board: QualityBoard) => string | null; onClose: () => void }) {
  const [initial] = useState(() => {
    try { return { json: board ? exportQualityBoardJson(board) : "", error: "" }; }
    catch (cause) { return { json: "", error: cause instanceof Error ? cause.message : "현재 기록을 JSON으로 읽지 못했습니다." }; }
  });
  const [json, setJson] = useState(initial.json);
  const [error, setError] = useState(initial.error);
  const [pending, setPending] = useState<QualityBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  function exportFile(template = false) {
    try {
      downloadQualityJson(template ? "toonstudio-ci-qa-template.json" : `toonstudio-ci-qa-${new Date().toISOString().slice(0, 10)}.json`, exportQualityBoardJson(template ? createQualityBoard() : board ?? createQualityBoard()));
      setNotice("JSON 파일을 내보냈습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "내보내기를 완료하지 못했습니다."); }
  }

  return <QualityDialog title="JSON 관리" description="수동 기록을 백업하거나 다른 브라우저로 옮깁니다. 가져오기는 검토 후 현재 보드의 전체 기록을 대체합니다." onClose={onClose}>
    <div className="ci-quality-dialog-body">
      <p className="ci-quality-warning">기존 기록을 먼저 내보내세요. 토큰·쿠키·키를 포함하지 마세요. 가져온 JSON으로 Testifly 후보 상태나 작업 실행 제한을 바꿀 수 없습니다.</p>
      <label>보드 JSON<textarea className="ci-quality-json" rows={15} value={json} maxLength={2000000} onChange={(event) => { setJson(event.target.value); setPending(null); setError(""); }} /></label>
      <label>JSON 파일 가져오기<input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        setPending(null);
        if (file.size > 2000000) { setError("JSON 파일은 2MB 이하만 허용합니다."); return; }
        setBusy(true);
        void file.text().then((text) => { setJson(text); setError(""); setNotice("파일을 읽었습니다. 가져오기 검토로 형식을 확인하세요."); })
          .catch(() => setError("파일을 읽지 못했습니다."))
          .finally(() => setBusy(false));
      }} /></label>
      <div className="ci-quality-actions"><button type="button" onClick={() => exportFile(true)}>초기 양식 다운로드</button><button type="button" disabled={!board} onClick={() => { if (board) { try { setJson(exportQualityBoardJson(board)); setPending(null); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "현재 기록을 JSON으로 읽지 못했습니다."); } } }}>현재 기록 다시 불러오기</button></div>
      {pending && <section className="ci-quality-card" aria-label="가져오기 검토 결과"><h3>가져오기 검토 완료</h3><p>{summarizeQualityBoard(pending).tracked}개 검사 · 기준 SHA {pending.commit.sha.slice(0, 9)} · Testifly reference-only</p><p>현재 검증·참고 QA·승인 메모·이력을 모두 대체합니다. 외부 작업은 실행하지 않습니다.</p></section>}
      {notice && <p role="status">{notice}</p>}
      <QualityFormError error={error} />
    </div>
    <footer className="ci-quality-dialog-footer"><button type="button" disabled={!board || busy} onClick={() => exportFile()}>현재 기록 내보내기</button>{pending ? <button type="button" className="ci-quality-primary" onClick={() => { try { const message = onImport(pending); if (message) setError(message); } catch (cause) { setError(cause instanceof Error ? cause.message : "기록을 가져오지 못했습니다."); } }}>전체 대체 확인</button> : <button type="button" className="ci-quality-primary" disabled={busy} onClick={() => { try { setPending(parseQualityBoardJson(json)); setError(""); setNotice(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "JSON 형식을 확인하세요."); } }}>가져오기 검토</button>}</footer>
  </QualityDialog>;
}

export function CiQualitySettingsDialog({ board, onSave, onClose }: { board: QualityBoard; onSave: (board: QualityBoard) => string | null; onClose: () => void }) {
  const [error, setError] = useState("");
  return <QualityDialog title="기준 커밋과 최신성" description="기준 SHA나 TTL을 바꾸면 모든 근거의 최신성을 다시 계산합니다. 자동 GitHub 조회는 없습니다." onClose={onClose}>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const value = (key: string) => qualityFormValue(data, key);
      try {
        const sha = value("sha");
        const committedAt = value("committedAt") === qualityLocalTime(board.commit.committedAt) ? board.commit.committedAt : qualityIsoTime(value("committedAt"));
        const changedCommit = sha !== board.commit.sha || value("message") !== board.commit.message || committedAt !== board.commit.committedAt || value("url") !== board.commit.url;
        const next: QualityBoard = { ...board, ttlHours: Number(value("ttlHours")), commit: { ...board.commit, sha, message: value("message"), committedAt, url: value("url"), source: changedCommit ? "manual" : board.commit.source, observedAt: changedCommit ? new Date().toISOString() : board.commit.observedAt } };
        const message = onSave(next);
        if (message) setError(message);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "기준 정보를 확인하세요."); }
    }}>
      <div className="ci-quality-dialog-body ci-quality-form-grid">
        <label className="ci-quality-full">기준 커밋 SHA<input name="sha" required maxLength={40} defaultValue={board.commit.sha} spellCheck={false} /></label>
        <label className="ci-quality-full">커밋 메시지<input name="message" defaultValue={board.commit.message} maxLength={2000} /></label>
        <label>커밋 시각 (이 기기의 시간대)<input type="datetime-local" name="committedAt" defaultValue={qualityLocalTime(board.commit.committedAt)} /></label>
        <label>TTL (시간)<input type="number" name="ttlHours" min={1} max={720} step={1} required defaultValue={board.ttlHours} /></label>
        <label className="ci-quality-full">커밋 URL<input type="url" name="url" defaultValue={board.commit.url} maxLength={2048} /></label>
        <p className="ci-quality-full">기준 커밋 변경은 수동 기록입니다. 기존 결과를 현재 커밋의 성공으로 재사용하지 않습니다.</p>
        <div className="ci-quality-full"><QualityFormError error={error} /></div>
      </div>
      <footer className="ci-quality-dialog-footer"><span>최신성 기준은 1~720시간입니다.</span><button type="submit" className="ci-quality-primary">기준 저장</button></footer>
    </form>
  </QualityDialog>;
}

export function CiQualityGateDialog({ onAdd, onClose }: { onAdd: (check: QualityCheck) => string | null; onClose: () => void }) {
  const [error, setError] = useState("");
  return <QualityDialog title="전용 게이트 추가" description="추적할 검증 항목을 추가합니다. 입력한 명령은 실행하지 않습니다." onClose={onClose}>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try {
        const next = createQualityGate({ name: qualityFormValue(data, "name"), subtitle: qualityFormValue(data, "subtitle"), command: qualityFormValue(data, "command"), source: qualityFormValue(data, "source") });
        const message = onAdd(next);
        if (message) setError(message);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "게이트 정보를 확인하세요."); }
    }}>
      <div className="ci-quality-dialog-body ci-quality-form-grid">
        <label>게이트 이름<input name="name" required maxLength={160} /></label><label>게이트 설명<input name="subtitle" maxLength={500} /></label>
        <label className="ci-quality-full">참조 명령<textarea name="command" rows={3} maxLength={8000} /></label><label className="ci-quality-full">근거 출처<input name="source" maxLength={2048} /></label>
        <div className="ci-quality-full"><QualityFormError error={error} /></div>
      </div>
      <footer className="ci-quality-dialog-footer"><span>초기 상태는 미확인입니다.</span><button type="submit" className="ci-quality-primary">게이트 추가</button></footer>
    </form>
  </QualityDialog>;
}

export function CiQualityQaDialog({ result, onSave, onClose }: { result?: QualityQaResult; onSave: (result: QualityQaResult) => string | null; onClose: () => void }) {
  const [error, setError] = useState("");
  return <QualityDialog title="외부 QA 참고 결과 기록" description="Testifly 후보 상태는 유지되며 정본 CI의 통계·완료율에 합산하지 않습니다." onClose={onClose}>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const value = (key: string) => qualityFormValue(data, key);
      try {
        const next: QualityQaResult = { id: result?.id ?? crypto.randomUUID(), title: value("title"), status: value("status") as QualityStatus, sha: value("sha"), executedAt: result && value("executedAt") === qualityLocalTime(result.executedAt) ? result.executedAt : qualityIsoTime(value("executedAt")), url: value("url"), summary: value("summary") };
        const message = onSave(next);
        if (message) setError(message);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "참고 결과를 확인하세요."); }
    }}>
      <div className="ci-quality-dialog-body ci-quality-form-grid">
        <label>참고 결과 제목<input name="title" required defaultValue={result?.title} maxLength={160} /></label>
        <label>참고 결과 상태<select name="status" defaultValue={result?.status ?? "unknown"}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>참고 결과 SHA<input name="sha" defaultValue={result?.sha} maxLength={40} spellCheck={false} /></label>
        <label>참고 결과 실행 시각 (이 기기의 시간대)<input type="datetime-local" name="executedAt" required defaultValue={qualityLocalTime(result?.executedAt ?? "")} /></label>
        <label className="ci-quality-full">참고 결과 URL<input name="url" type="url" defaultValue={result?.url} maxLength={2048} /></label>
        <label className="ci-quality-full">참고 결과 요약<textarea name="summary" defaultValue={result?.summary} rows={4} maxLength={12000} /></label>
        <div className="ci-quality-full"><QualityFormError error={error} /></div>
      </div>
      <footer className="ci-quality-dialog-footer"><span>실제 연결·실행 증거를 확인한 것으로 간주하지 않습니다.</span><button type="submit" className="ci-quality-primary">참고 결과 저장</button></footer>
    </form>
  </QualityDialog>;
}
