import { useState } from "react";

import { downloadWorkJson, mergeWorkImport } from "./cloud-work-helpers";
import { WorkCallout, WorkDialog, WorkIcon } from "./cloud-work-ui";

import type { Board } from "@toonstudio/contracts/admin-cloud-workboard";

interface Props {
  incoming: Board; current: Board; openedRevision: number; revision: number;
  saving: boolean; unavailable: boolean; conflict: boolean; error: string;
  onSave: (board: Board) => Promise<boolean>; onClose: () => void; onReload: () => void;
}

export function CloudWorkImportDialog(props: Props) {
  const [error, setError] = useState("");
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const existingIds = new Set(props.current.tasks.map(task => task.id));
  const replacements = props.incoming.tasks.filter(task => existingIds.has(task.id));
  const added = props.incoming.tasks.length - replacements.length;
  const save = async () => {
    try {
      const merged = mergeWorkImport(props.current, props.incoming);
      if (await props.onSave(merged)) props.onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "가져올 내용을 확인해 주세요."); }
  };
  return <WorkDialog title="JSON 가져오기 미리보기" onClose={() => { if (!props.saving) props.onClose(); }} wide>
    <div className="cw-dialog-body">
      <WorkCallout title="작업 ID를 기준으로 병합합니다"><p>새 작업 {added}개를 추가하고 동일 ID {replacements.length}개를 가져온 값으로 교체합니다. 나머지 현재 작업은 유지합니다.</p><p>기존 서버 감사 이력은 보존합니다. 가져온 과거 이력 {(props.incoming.sourceHistory?.length ?? 0) + props.incoming.audit.length}개는 출처 기록으로 분리하며, 서버에서 확인한 감사 이력으로 취급하지 않습니다.</p></WorkCallout>
      <p className="cw-meta">이력 가져오기는 원본 결과와 확인 시각을 보존합니다. 근거가 오래되거나 현재 대상과 맞지 않는 결과는 현재 화면에서 미확인으로 표시됩니다.</p>
      {(error || props.error) && <div className="cw-error" role="alert">{error || props.error}</div>}
      {props.conflict && <WorkCallout tone="warning" title="최신 기록과 다시 비교해야 합니다"><p>가져올 내용은 유지했습니다. 최신 기록을 불러와 변경될 작업을 다시 확인하세요.</p><button type="button" onClick={props.onReload}>최신 기록 불러오기</button></WorkCallout>}
      {props.openedRevision !== props.revision && <p className="cw-warning-text">미리보기 이후 서버 기록이 변경되었습니다. 아래 목록은 최신 기록과 비교한 결과입니다.</p>}
      <ul className="cw-import-list">{props.incoming.tasks.map(task => <li key={task.id}><strong>{task.id}</strong><span>{task.project} · {task.title}</span><span>{existingIds.has(task.id) ? "동일 ID 교체" : "새 작업 추가"}</span></li>)}</ul>
      <details className="cw-json-preview"><summary>가져올 JSON 전체 확인</summary><pre>{JSON.stringify(props.incoming, null, 2)}</pre></details>
      <label className="cw-check"><input type="checkbox" checked={confirmedRevision === props.revision} onChange={event => setConfirmedRevision(event.target.checked ? props.revision : null)} />추가·교체 범위와 최신 기록을 확인했습니다</label>
    </div>
    <footer className="cw-dialog-footer"><button type="button" onClick={() => downloadWorkJson(props.incoming, true)}><WorkIcon name="download" />가져온 기록 JSON</button><div><button type="button" disabled={props.saving} onClick={props.onClose}>취소</button><button type="button" className="cw-primary" disabled={props.saving || props.unavailable || props.conflict || confirmedRevision !== props.revision} onClick={() => void save()}>{props.saving ? "저장 중…" : "확인한 내용 병합 저장"}</button></div></footer>
  </WorkDialog>;
}
