import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { workspaceImportBytes, type StudioHybridDccWorkspace } from "../studio-hybrid-dcc-workspace";
import { readStudioNativeImportFile } from "./studio-hybrid-dcc-native-import-read";
import { readStudioNativeWorkspaceImportReport, StudioNativeWorkspaceImportError } from "./studio-hybrid-dcc-native-import-workspace";

import type { StudioHybridDccFileRun } from "../useStudioHybridDccFileTools";
import type { StudioNativeImportIssue } from "./studio-hybrid-dcc-native-import-contracts";

function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** 파일 읽기와 최종 발행을 같은 actor·문서·원본 세대에 묶는다. */
export function useStudioHybridDccNativeImport({ workspace, workspaceDocumentId, busy, run }: {
  readonly workspace: StudioHybridDccWorkspace; readonly workspaceDocumentId?: string;
  readonly busy: boolean; readonly run: StudioHybridDccFileRun;
}) {
  const bt = useBilingual("StudioHybridDccNativeImport");
  const revision = useSyncExternalStore(subscribeAuth, getAuthSessionRevision, getAuthSessionRevision);
  const actor = getAuthUserId();
  const owner = JSON.stringify([actor, revision, workspaceDocumentId, workspace.session.state.documentId]);
  const latest = useRef({ owner, workspace, busy }); latest.current = { owner, workspace, busy };
  const generation = useRef(0); const publishing = useRef<number | null>(null); const live = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "publishing">("idle");
  const [error, setError] = useState(""); const [issues, setIssues] = useState<readonly StudioNativeImportIssue[]>([]);
  const [notice, setNotice] = useState("");
  const invalidate = () => { generation.current += 1; controller.current?.abort(); controller.current = null; publishing.current = null; setPhase("idle"); };
  useLayoutEffect(() => { invalidate(); setError(""); setIssues([]); setNotice(""); }, [owner, workspace]);
  useLayoutEffect(() => {
    if (busy && controller.current && publishing.current === null) { invalidate(); setNotice(bt("다른 편집이 시작되어 모델 읽기를 중단했습니다.", "Model reading stopped because another edit started.")); }
  }, [busy, bt]);
  useEffect(() => { live.current = true; return () => { live.current = false; generation.current += 1; controller.current?.abort(); }; }, []);
  return {
    phase, error, issues, notice, report: readStudioNativeWorkspaceImportReport(workspace.lastImportReport),
    cancel: () => { invalidate(); setError(""); setIssues([]); setNotice(bt("모델 가져오기를 취소했습니다. 현재 작업은 그대로입니다.", "Model import cancelled. The current work is unchanged.")); },
    open: async (file: File) => {
      if (busy || publishing.current !== null) return;
      invalidate(); const own = generation.current;
      const abort = new AbortController(); controller.current = abort;
      const current = () => live.current && own === generation.current && !abort.signal.aborted
        && latest.current.owner === owner && latest.current.workspace === workspace
        && (!latest.current.busy || publishing.current === own)
        && getAuthSessionRevision() === revision && getAuthUserId() === actor;
      setPhase("reading"); setError(""); setIssues([]); setNotice("");
      try {
        const bytes = await readStudioNativeImportFile(file, abort.signal);
        if (!current()) return;
        publishing.current = own; setPhase("publishing");
        await run(bt("모델 가져오기", "Import model"), () => {
          try {
            if (!current()) throw new DOMException("문서가 바뀌어 모델 가져오기를 중단했습니다.", "AbortError");
            const result = workspaceImportBytes(workspace, file.name, bytes);
            const report = readStudioNativeWorkspaceImportReport(result.lastImportReport);
            if (report?.outcome === "unsupported") throw new StudioNativeWorkspaceImportError(report.issues);
            return result;
          } catch (cause) {
            if (current()) {
              if (cause instanceof StudioNativeWorkspaceImportError) setIssues(cause.issues);
              else setError(cause instanceof Error ? cause.message : bt("모델 검증에 실패했습니다.", "Model validation failed."));
            }
            throw cause;
          }
        }, current);
      } catch (cause) {
        if (current() && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : bt("모델 파일을 읽지 못했습니다.", "Could not read the model file."));
      } finally {
        if (own === generation.current && live.current) { publishing.current = null; controller.current = null; setPhase("idle"); }
      }
    },
  };
}

export type StudioHybridDccNativeImportModel = ReturnType<typeof useStudioHybridDccNativeImport>;
