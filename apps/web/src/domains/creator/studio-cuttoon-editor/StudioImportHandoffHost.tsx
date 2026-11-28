import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";

import {
  STUDIO_IMPORT_HANDOFF_QUERY_KEY,
  consumeStudioImportHandoff,
  peekStudioImportHandoff,
  type StudioImportHandoff,
  type StudioImportHandoffTarget,
} from "../studio-import-handoff";
import { editorShellStatusText } from "../status-i18n/studio-editor-shell-status-i18n-r3c11";
import { createStudioFileChangeEvent } from "./studio-synthetic-file-change-event";

export interface StudioImportHandoffHostProps {
  readonly handoffToken?: string;
  readonly workspaceReady: boolean;
  readonly brushPackImporting: boolean;
  readonly collaborationDocumentLocked: boolean;
  readonly interchangeImportBusy: boolean;
  readonly projectArchiveBusy: boolean;
  readonly psdImportBusy: boolean;
  readonly onImage: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onBrushPack: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onInterchange: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onProjectArchive?: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onProjectJson: (event: ChangeEvent<HTMLInputElement>) => unknown;
  readonly onPsd: (event: ChangeEvent<HTMLInputElement>) => unknown;
}

type HandoffStatus =
  | Readonly<{ state: "idle" }>
  | Readonly<{ state: "waiting"; fileName: string; workspace: boolean }>
  | Readonly<{ state: "failed"; message: string }>;

function removeHandoffQuery(token: string): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get(STUDIO_IMPORT_HANDOFF_QUERY_KEY) !== token) return;
  url.searchParams.delete(STUDIO_IMPORT_HANDOFF_QUERY_KEY);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

function targetBusy(target: StudioImportHandoffTarget, props: StudioImportHandoffHostProps): boolean {
  if (props.collaborationDocumentLocked || props.projectArchiveBusy) return true;
  if (target === "brush-pack") return props.brushPackImporting;
  if (target === "psd" || target === "interchange") {
    return props.psdImportBusy || props.interchangeImportBusy;
  }
  return false;
}

function invokeHandoff(
  target: StudioImportHandoffTarget,
  event: ChangeEvent<HTMLInputElement>,
  props: StudioImportHandoffHostProps,
): unknown {
  if (target === "image") return props.onImage(event);
  if (target === "brush-pack") return props.onBrushPack(event);
  if (target === "interchange") return props.onInterchange(event);
  if (target === "project-archive") {
    return props.onProjectArchive ? props.onProjectArchive(event) : props.onProjectJson(event);
  }
  if (target === "project-json") return props.onProjectJson(event);
  return props.onPsd(event);
}

/** Owns the single-use transition from the Studio import front door into existing editor handlers. */
export function StudioImportHandoffHost(props: StudioImportHandoffHostProps): ReactElement | null {
  const startedTokenRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const latestPropsRef = useRef(props);
  latestPropsRef.current = props;
  const [status, setStatus] = useState<HandoffStatus>({ state: "idle" });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const currentProps = latestPropsRef.current;
    const token = new URLSearchParams(window.location.search).get(STUDIO_IMPORT_HANDOFF_QUERY_KEY);
    if (!token || startedTokenRef.current === token) return;
    const reportExpiredHandoff = () => {
      startedTokenRef.current = token;
      removeHandoffQuery(token);
      setStatus({
        state: "failed",
        message: editorShellStatusText("studio.editorShellStatus.importHandoff.handoffExpired", "가져올 파일 전달이 만료되었거나 새로고침으로 사라졌습니다. 파일을 다시 선택해 주세요."),
      });
    };
    const pending = peekStudioImportHandoff(token);
    if (!pending) {
      reportExpiredHandoff();
      return;
    }
    const hasCurrentUnstartedToken = () => mountedRef.current && startedTokenRef.current !== token
      && new URLSearchParams(window.location.search).get(STUDIO_IMPORT_HANDOFF_QUERY_KEY) === token;
    let timerId: number;
    const clearTimer = () => window.clearTimeout(timerId);
    const scheduleExpiryCheck = (expiresAt: number) => {
      timerId = window.setTimeout(() => {
        if (!hasCurrentUnstartedToken()) return;
        const stillPending = peekStudioImportHandoff(token);
        if (stillPending) scheduleExpiryCheck(stillPending.expiresAt);
        else reportExpiredHandoff();
      }, Math.max(0, expiresAt - Date.now()));
    };
    const waitForWorkspaceOrOperation = (handoff: StudioImportHandoff, workspace: boolean) => {
      const fileName = handoff.file.name;
      setStatus((prev) => (
        prev.state === "waiting" && prev.fileName === fileName && prev.workspace === workspace
          ? prev
          : { state: "waiting", fileName, workspace }
      ));
      scheduleExpiryCheck(handoff.expiresAt);
    };
    if (!currentProps.workspaceReady || targetBusy(pending.target, currentProps)) {
      waitForWorkspaceOrOperation(pending, !currentProps.workspaceReady);
      return clearTimer;
    }

    timerId = window.setTimeout(() => {
      const liveProps = latestPropsRef.current;
      if (!hasCurrentUnstartedToken()) return;
      const stillPending = peekStudioImportHandoff(token);
      if (!stillPending) {
        reportExpiredHandoff();
        return;
      }
      if (!liveProps.workspaceReady || targetBusy(stillPending.target, liveProps)) {
        waitForWorkspaceOrOperation(stillPending, !liveProps.workspaceReady);
        return;
      }
      const handoff = consumeStudioImportHandoff(token);
      if (!handoff) {
        reportExpiredHandoff();
        return;
      }
      startedTokenRef.current = token;
      setStatus({ state: "idle" });
      const isCurrentToken = () => mountedRef.current && startedTokenRef.current === token
        && (latestPropsRef.current.handoffToken ?? token) === token;
      // 처리 중에 새 문서로 이동하면 남은 주소가 사라진 파일의 재선택 안내를 연다.
      const finishFailure = (error: unknown) => {
        if (!isCurrentToken()) return;
        removeHandoffQuery(token);
        setStatus({
          state: "failed",
          message: error instanceof Error ? error.message : editorShellStatusText("studio.editorShellStatus.importHandoff.importStartFailed", "파일 가져오기를 시작하지 못했습니다."),
        });
      };
      try {
        const result = invokeHandoff(handoff.target, createStudioFileChangeEvent(handoff.file), liveProps);
        void Promise.resolve(result).then((outcome) => {
          if (!isCurrentToken()) return;
          removeHandoffQuery(token);
          if (outcome === "scope-changed") setStatus({
            state: "failed",
            message: editorShellStatusText("studio.editorShellStatus.importHandoff.scopeChanged", "작업공간이 바뀌어 파일을 열지 못했어요. 파일을 다시 선택해 주세요."),
          });
        }).catch(finishFailure);
      } catch (error) {
        finishFailure(error);
      }
    }, 0);

    return clearTimer;
  }, [
    props.handoffToken,
    props.workspaceReady,
    props.brushPackImporting,
    props.collaborationDocumentLocked,
    props.interchangeImportBusy,
    props.projectArchiveBusy,
    props.psdImportBusy,
  ]);

  if (status.state === "idle") return null;
  if (status.state === "waiting") {
    return (
      <div
        role="status"
        className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-xl border border-warning/35 bg-warning-soft/20 px-3 py-2 text-xs font-medium text-warning"
      >
        <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
        {status.fileName} · {status.workspace
          ? editorShellStatusText("studio.editorShellStatus.importHandoff.workspaceChecking", "작업공간을 확인한 뒤 파일을 열어요.")
          : editorShellStatusText("studio.editorShellStatus.importHandoff.operationWaiting", "기존 가져오기 작업이 끝나면 파일을 열어요.")}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="mx-3 mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-danger-soft/20 px-3 py-2 text-xs font-medium text-danger"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <AlertTriangle size={15} aria-hidden="true" />
        <span>{status.message}</span>
      </span>
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <a
          href="/studio/import"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-danger/35 bg-card px-2.5 py-1 text-xs font-semibold text-fg hover:bg-raised"
        >
          파일 다시 선택
        </a>
        <a
          href="/studio"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
        >
          내 작업 열기
        </a>
      </span>
    </div>
  );
}
