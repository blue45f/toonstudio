import { downloadBrushStudioSource } from "./brush-studio-source-download";
import { brushCanvasStatusText } from "../studio-brush-canvas-status-i18n";
import { useState, type ReactNode } from "react";
import { createBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";
import { parseBrushStudioV6Import } from "./brush-studio-v6-experiments";
import { migrateBrushStudioV6LegacyMixboxAuthoring, type BrushStudioV6LegacyPigmentAuthoringMigration } from "./brush-studio-v6-authoring-document";

interface DraftState {
  readonly program: BrushStudioV6Program | null;
  readonly raw: string | null;
  readonly error: string | null;
  readonly migration: BrushStudioV6LegacyPigmentAuthoringMigration | null;
}

function readDraft(scope: string): DraftState {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(`toonstudio.brush-program-v6:${encodeURIComponent(scope)}`) ?? null;
    return { program: raw === null ? createBrushStudioV6Program() : parseBrushStudioV6Import(raw), raw, error: null, migration: null };
  } catch (error) {
    let migration: BrushStudioV6LegacyPigmentAuthoringMigration | null = null;
    try { if (raw !== null) migration = migrateBrushStudioV6LegacyMixboxAuthoring(raw); } catch { /* 손상된 원본은 이주하지 않는다. */ }
    return { program: null, raw, migration, error: error instanceof Error ? error.message : brushCanvasStatusText("studio.brushCanvasStatus.brushLab.v6SettingsReadFailed", "브러시 설정을 읽지 못했습니다.") };
  }
}

/** Do not mount an autosaving editor when restoring an execution-bound draft failed. */
export function StudioBrushV6DraftGuard({ scope, initialProgram, children }: {
  readonly scope: string;
  readonly initialProgram?: BrushStudioV6Program;
  readonly children: (program: BrushStudioV6Program) => ReactNode;
}) {
  const [draft, setDraft] = useState<DraftState>(() => initialProgram ? { program: initialProgram, raw: null, error: null, migration: null } : readDraft(scope));
  const [migrationError, setMigrationError] = useState("");
  const applyMigration = () => {
    const migration = draft.migration;
    if (!migration) return;
    try {
      const key = `toonstudio.brush-program-v6:${encodeURIComponent(scope)}`;
      if (globalThis.localStorage.getItem(key) !== migration.sourceAuthoring) {
        throw new Error("원본 초안이 변경되었습니다. 새로 열어 가장 최근의 원본을 확인하세요.");
      }
      // 자동 저장 편집기를 열기 전에 원문을 별도 키에 복제하고 다시 읽어 확인한다.
      let backupKey = `${key}:source-mixbox`;
      let suffix = 0;
      while (globalThis.localStorage.getItem(backupKey) !== null
        && globalThis.localStorage.getItem(backupKey) !== migration.sourceAuthoring) {
        suffix += 1;
        if (suffix > 100) throw new Error("원본 백업 공간을 확인하지 못했습니다.");
        backupKey = `${key}:source-mixbox:${suffix}`;
      }
      globalThis.localStorage.setItem(backupKey, migration.sourceAuthoring);
      if (globalThis.localStorage.getItem(backupKey) !== migration.sourceAuthoring) throw new Error("원본 백업을 확인하지 못했습니다.");
      setDraft({ ...draft, program: migration.program, error: null });
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : "원본을 보존하지 못해 자체 안료로 전환하지 않았습니다.");
    }
  };
  if (draft.program) return children(draft.program);
  return <section role="alert" className="space-y-3 rounded-2xl border border-warning p-4">
    <h2 className="font-bold">브러시 원본을 변경하지 않고 보존했습니다</h2>
    <p className="text-sm">{draft.error}</p>
    <p className="text-sm">{draft.migration
      ? "이전 Mixbox 브러시를 자체 잠재 안료로 가져올 수 있습니다. 팁·입력·질감 설정은 보존하며 색 결과는 달라질 수 있습니다. 원문은 별도 백업에 보존하고 새 획은 자체 엔진을 사용합니다."
      : "다른 엔진이나 기본 브러시로 바꾸지 않았습니다. 원본을 보관한 뒤 지원되는 브러시를 선택하세요."}</p>
    {draft.raw !== null && <button type="button" className="min-h-11 rounded border px-3"
      onClick={() => downloadBrushStudioSource(draft.raw!, "brush-original.json")}>원본 JSON 보관</button>}
    {draft.migration && <button type="button" className="min-h-11 rounded border px-3" onClick={applyMigration}>자체 안료로 가져오기</button>}
    {migrationError && <p role="alert" className="text-sm">{migrationError}</p>}
    <a href="/studio/assets/brushes" className="inline-flex min-h-11 items-center px-3">브러시 목록으로</a>
  </section>;
}
