import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getCharacterDocumentV3Repository } from "../character-platform/document/character-document-v3-repository";
import { StudioCharacterShaper } from "./StudioCharacterShaper";
import { applyStudioCharacterCutRefresh, planStudioCharacterCutRefresh } from "./studio-character-linked-cut-refresh";

import type { StudioVrmPoserInsertResult } from "../scene-3d/studio-3d-insert-contract";
import type { StudioCuttoonEditorViewSession } from "../studio-cuttoon-editor/StudioCuttoonEditorViewSession";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { PageState } from "../studio-page-state";

export interface StudioLinkedCutRefreshRequest {
  readonly documentId: string;
  readonly page: PageState;
  readonly ticket: StudioEditorMutationTicket;
}

type Session = Pick<StudioCuttoonEditorViewSession, "canApplyStudioMutation" | "collaborationDocumentLocked"
  | "commit" | "currentPageIdRef" | "masterEditMode" | "pageEditLocked" | "pagesHiRef" | "pagesHistoryRef">;
type Target = ReturnType<typeof planStudioCharacterCutRefresh>["targets"][number];
type Captured = { result: StudioVrmPoserInsertResult } | { reason: string };
interface Job {
  target: Target;
  revision: number;
  index: number;
  total: number;
  onInsert: (result: StudioVrmPoserInsertResult) => boolean;
  onFailure: (reason: string) => void;
  onClose: () => void;
}
interface Summary {
  updated: number;
  skipped: number;
  failures: { elementId: string; reason: string }[];
  message?: string;
}

function writablePage(session: Session, request: StudioLinkedCutRefreshRequest) {
  if (session.currentPageIdRef.current !== request.page.id || session.masterEditMode || session.pageEditLocked
    || session.collaborationDocumentLocked || !session.canApplyStudioMutation(request.ticket)) return undefined;
  return session.pagesHistoryRef.current[session.pagesHiRef.current]?.find(page => page.id === request.page.id);
}

export default function StudioCharacterCutRefreshRunner({ request, session, onClose }: {
  request: StudioLinkedCutRefreshRequest; session: Session; onClose: () => void;
}) {
  const bt = useBilingual("StudioCharacterCutRefreshRunner");
  const latest = useRef({ session, bt });
  const cancel = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  useLayoutEffect(() => { latest.current = { session, bt }; }, [session, bt]);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element?.showModal) element.showModal();
    else element?.setAttribute("open", "");
    return () => { element?.close?.(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    cancel.current = controller;
    const t = latest.current.bt;
    const moved = t("페이지나 편집 권한이 바뀌어 갱신을 중단했습니다.", "The page or editing permission changed. Refresh stopped.");
    const changed = t("캐릭터가 변경되었습니다. 최신 외형으로 다시 갱신하세요.", "The character changed. Restart the refresh to use the latest appearance.");
    const noCapture = t("원본 컷을 다시 렌더링하지 못했습니다.", "Could not render this cut.");
    const results = new Map<string, StudioVrmPoserInsertResult>();
    const failures: Summary["failures"] = [];
    let matching = 0;

    function capture(target: Target, revision: number, index: number, total: number): Promise<Captured> {
      return new Promise(resolve => {
        let result: StudioVrmPoserInsertResult | undefined;
        let settled = false;
        const finish = (outcome: Captured) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          resolve(outcome);
        };
        const abort = () => finish({ reason: noCapture });
        const timer = setTimeout(() => finish({
          reason: t("이 컷의 3D 렌더 시간이 초과되었습니다.", "3D rendering timed out for this cut."),
        }), 75_000);
        signal.addEventListener("abort", abort, { once: true });
        setJob({
          target, revision, index, total,
          onInsert: value => {
            if (settled || signal.aborted) return false;
            if (!writablePage(latest.current.session, request) || value.scene.characterDocumentId !== request.documentId) {
              finish({ reason: noCapture });
              return false;
            }
            result = value;
            return true;
          },
          onClose: () => finish(result ? { result } : { reason: noCapture }),
          onFailure: reason => finish({ reason: reason || noCapture }),
        });
      });
    }

    async function run() {
      const repository = getCharacterDocumentV3Repository();
      const document = await repository.load(request.documentId);
      if (signal.aborted) return;
      if (!writablePage(latest.current.session, request)) throw new Error(moved);
      if (!document) throw new Error(t("이 기기에서 캐릭터 원본을 찾지 못했습니다.", "The source character is unavailable on this device."));
      const plan = planStudioCharacterCutRefresh(request.page, request.documentId, document.revision);
      matching = plan.skipped + plan.targets.length;
      for (const [index, target] of plan.targets.entries()) {
        if (!writablePage(latest.current.session, request)) throw new Error(moved);
        const captured = await capture(target, plan.revision, index + 1, plan.targets.length);
        if (signal.aborted) return;
        if ("result" in captured) results.set(target.elementId, captured.result);
        else failures.push({ elementId: target.elementId, reason: captured.reason });
      }
      setJob(null);
      const currentCharacter = await repository.load(request.documentId);
      if (signal.aborted) return;
      const current = latest.current.session;
      const page = writablePage(current, request);
      if (!page) throw new Error(moved);
      if (!currentCharacter || currentCharacter.revision !== plan.revision) throw new Error(changed);
      const receipt = applyStudioCharacterCutRefresh(page, plan, results, current.commit, currentCharacter);
      setSummary({ updated: receipt.updated, skipped: Math.max(0, receipt.skipped - failures.length), failures });
    }
    void run().catch((error: unknown) => {
      if (signal.aborted) return;
      setJob(null);
      setSummary({ updated: 0, skipped: Math.max(0, matching - failures.length), failures,
        message: error instanceof Error ? error.message : noCapture });
    });
    return () => { controller.abort(); };
  }, [request]);

  const close = () => {
    cancel.current?.abort();
    onClose();
  };
  return <>
    {job && <StudioCharacterShaper key={job.target.elementId} open initialScene={job.target.scene}
      initialDataUrl={job.target.src} linkedCutCapture={{ documentId: request.documentId, revision: job.revision, onFailure: job.onFailure }}
      onInsert={job.onInsert} onClose={job.onClose} />}
    {createPortal(<dialog ref={dialog} aria-label={bt("캐릭터 컷 갱신", "Refresh character cuts")}
      onCancel={event => { event.preventDefault(); close(); }}
      className="m-auto max-h-[80dvh] max-w-[min(32rem,94vw)] overflow-auto rounded-xl border border-line bg-panel p-5 text-fg shadow-lg backdrop:bg-black/45">
      <h2 className="mb-3 text-base font-semibold">{bt("캐릭터 컷 갱신", "Refresh character cuts")}</h2>
      <div role="status" aria-live="polite" className="text-sm">
        {summary ? <>
          <p>{bt("갱신", "Updated")} {summary.updated} · {bt("건너뜀", "Skipped")} {summary.skipped} · {bt("실패", "Failed")} {summary.failures.length}</p>
          {summary.message && <p className="mt-2">{summary.message}</p>}
        </> : job ? <p>{bt("컷 렌더링 중", "Rendering cut")} {job.index} / {job.total}</p>
          : <p>{bt("캐릭터와 페이지 확인 중…", "Checking the character and page…")}</p>}
      </div>
      {summary && summary.failures.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs">
        {summary.failures.map(failure => <li key={failure.elementId}>{failure.elementId} · {failure.reason}</li>)}
      </ul>}
      <button type="button" onClick={close}
        className="mt-4 min-h-11 rounded-lg border border-line px-4 text-sm font-semibold hover:bg-raised">
        {summary ? bt("닫기", "Close") : bt("갱신 취소", "Cancel refresh")}
      </button>
    </dialog>, document.body)}
  </>;
}
