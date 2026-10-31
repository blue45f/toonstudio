import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  snapshotStudioHybridDccComponentSelection, validateStudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import {
  canCommitStudioHybridDccCoplanarEdgeDissolve, commitStudioHybridDccCoplanarEdgeDissolve,
  prepareStudioHybridDccCoplanarEdgeDissolve, previewStudioHybridDccCoplanarEdgeDissolve,
  StudioCoplanarEdgeDissolveWorkspaceError,
  type StudioHybridDccCoplanarEdgeDissolveCurrent as Current,
  type StudioHybridDccCoplanarEdgeDissolvePlan as Plan,
  type StudioHybridDccCoplanarEdgeDissolvePreparation as Preparation,
  type StudioHybridDccCoplanarEdgeDissolveWorkspaceResult as Result,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve-workspace";
import {
  studioCoplanarEdgeDissolveCommandLabel, studioCoplanarEdgeDissolveError, studioCoplanarEdgeDissolveNotice,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve-messages";
import { computeStudioHybridDccCoplanarEdgeDissolveInWorker } from "./studio-hybrid-dcc-coplanar-edge-dissolve-worker-client";
import { workspaceComponentSelectionSource } from "./studio-hybrid-dcc-workspace";

import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";

export interface StudioCoplanarEdgeDissolveHookInput extends Current {
  readonly enabled: boolean;
  readonly disabled: boolean;
  readonly run?: (label: string, edit: StudioHybridDccWorkspaceEdit, canCommit?: () => boolean) => void;
  readonly compute?: Preparation["compute"];
}
interface Draft {
  readonly context: Current;
  readonly status: "empty" | "pending" | "ready" | "failed";
  readonly plan?: Plan;
  readonly applying: boolean;
  readonly error: string;
  readonly notice: string;
}
interface Request {
  readonly context: Current;
  readonly generation: number;
  readonly controller: AbortController;
  computing: boolean;
  attempted: boolean;
  applying: boolean;
  expected: { readonly stateHash: string; readonly commandCount: number; readonly assetId: string; readonly meshHash: string } | null;
}
function blank(context: Current, notice = ""): Draft {
  return { context, status: "empty", applying: false, error: "", notice };
}

/** Worker 계산과 private plan의 수명을 실제 문서·선택·host 발행에 묶는다. 동기 계산 폴백은 없다. */
export function useStudioHybridDccCoplanarEdgeDissolve(input: StudioCoplanarEdgeDissolveHookInput) {
  const { workspace, selection, enabled } = input;
  const session = workspace.session, stateHash = session.state.stateHash, activeAssetId = workspace.activeAssetId;
  const source = workspaceComponentSelectionSource(workspace);
  const validSelection = Boolean(source && input.selection.mode === "edge" && input.selection.elementIds.length > 0
    && validateStudioHybridDccComponentSelection(input.selection, source).ok);
  const mesh = source?.mesh, sourceHash = source?.sourceHash, revision = source?.meshRevision;
  const selectionSnapshot = JSON.stringify(snapshotStudioHybridDccComponentSelection(selection));
  const hasHost = Boolean(input.run);
  // 같은 hash의 새 session/선택도 별개다. 카메라·host busy만의 변경은 이 context를 바꾸지 않는다.
  const context = useMemo(() => ({ workspace, session, stateHash, activeAssetId, selection, selectionSnapshot,
    mesh, sourceHash, revision, enabled, hasHost }),
  [workspace, session, stateHash, activeAssetId, selection, selectionSnapshot, mesh, sourceHash, revision, enabled, hasHost]);
  const [draft, setDraft] = useState<Draft>(() => blank(context));
  const mounted = useRef(true), epoch = useRef(0), active = useRef<Request | null>(null);
  const latest = useRef({ input, context }); latest.current = { input, context };
  const shown = draft.context === context ? draft : blank(context);
  const current = useCallback((request: Request) => mounted.current && active.current === request
    && epoch.current === request.generation && latest.current.context === request.context && !request.controller.signal.aborted, []);
  const invalidate = () => {
    epoch.current += 1;
    active.current?.controller.abort(); active.current = null;
  };
  const cancel = () => {
    invalidate();
    if (mounted.current) setDraft(blank(latest.current.context, studioCoplanarEdgeDissolveNotice("cancelled")));
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current += 1; active.current?.controller.abort(); active.current = null; };
  }, []);
  useEffect(() => {
    const request = active.current;
    if (draft.context === context && (!request || request.context === context)) return;
    // 실제 host가 기대한 정본 명령을 발행했을 때만 완료를 알린다. preview·noop host는 해당하지 않는다.
    const expected = request?.expected;
    const applied = expected !== undefined && expected !== null
      && input.workspace.session.state.stateHash === expected.stateHash
      && input.workspace.session.state.commandCount === expected.commandCount
      && input.workspace.session.state.geometry.records[expected.assetId]?.meshHash === expected.meshHash;
    if (request && request.context !== context) {
      epoch.current += 1; request.controller.abort(); active.current = null;
    }
    setDraft((previous) => previous.context === context ? previous : blank(context,
      applied ? studioCoplanarEdgeDissolveNotice("applied")
        : previous.status !== "empty" || previous.applying ? studioCoplanarEdgeDissolveNotice("contextChanged") : ""));
  }, [context, draft.context, input.workspace]);
  useEffect(() => {
    const request = active.current;
    if (!input.disabled || !request || request.context !== context || request.applying) return;
    epoch.current += 1; request.controller.abort(); active.current = null;
    setDraft(blank(context, studioCoplanarEdgeDissolveNotice("otherEdit")));
  }, [context, input.disabled]);
  useEffect(() => {
    const request = active.current;
    if (!shown.applying || input.disabled || !request || request.context !== context) return;
    // host가 busy를 마치거나 아예 실행하지 않고 돌아와도, 발행 확인 전에는 성공을 표시하지 않는다.
    const timer = setTimeout(() => {
      if (!current(request) || !request.applying || latest.current.input.disabled) return;
      request.applying = false; epoch.current += 1; request.controller.abort(); active.current = null;
      setDraft({ ...blank(context, studioCoplanarEdgeDissolveNotice("applyUnconfirmed")), status: "failed" });
    }, 0);
    return () => clearTimeout(timer);
  }, [context, current, input.disabled, shown.applying]);

  const planCurrent = Boolean(shown.plan && canCommitStudioHybridDccCoplanarEdgeDissolve(shown.plan));
  const preview = useMemo((): { readonly value: Result | null; readonly error: string } => {
    if (shown.status !== "ready" || !shown.plan || !planCurrent) return { value: null, error: "" };
    try { return { value: previewStudioHybridDccCoplanarEdgeDissolve(context, shown.plan), error: "" }; }
    catch (cause) { return { value: null, error: studioCoplanarEdgeDissolveError(cause) }; }
  }, [context, shown.plan, shown.status, planCurrent]);
  const available = input.enabled && !input.disabled && Boolean(input.run);
  const canPrepare = available && validSelection && shown.status !== "pending" && !shown.applying;
  const canApply = Boolean(available && preview.value && shown.plan && planCurrent && !shown.applying);

  const prepare = () => {
    const previous = active.current;
    if (!mounted.current || !available || shown.status === "pending" || shown.applying
      || (previous?.context === context && previous.computing)) return;
    if (!validSelection) {
      setDraft({ ...blank(context), status: "failed", error: studioCoplanarEdgeDissolveError(
        new StudioCoplanarEdgeDissolveWorkspaceError("invalid-selection", "현재 원본의 공유 모서리 선택이 필요합니다.")) });
      return;
    }
    invalidate();
    const request: Request = { context, generation: epoch.current, controller: new AbortController(),
      computing: true, attempted: false, applying: false, expected: null };
    active.current = request;
    setDraft({ ...blank(context), status: "pending" });
    void prepareStudioHybridDccCoplanarEdgeDissolve(context, {
      generation: request.generation, signal: request.controller.signal,
      readCurrent: () => latest.current.input, isCurrent: () => current(request),
      compute: input.compute ?? computeStudioHybridDccCoplanarEdgeDissolveInWorker,
    }).then((plan) => {
      if (!current(request) || latest.current.input.disabled) return;
      request.computing = false;
      setDraft({ ...blank(context), status: "ready", plan });
    }, (cause) => {
      if (!current(request)) return;
      request.computing = false;
      setDraft({ ...blank(context), status: "failed", error: studioCoplanarEdgeDissolveError(cause) });
    });
  };
  const apply = () => {
    const plan = shown.plan, run = input.run, request = active.current;
    if (!canApply || !plan || !run || !request || !current(request) || request.attempted) return;
    request.attempted = true; request.applying = true;
    // 표시용 plan을 내려 candidate-created/failed 상태의 private plan을 다시 preview·apply하지 않는다.
    setDraft({ ...blank(context), applying: true });
    const guard = () => current(request) && canCommitStudioHybridDccCoplanarEdgeDissolve(plan);
    const failed = (cause: unknown) => {
      if (!current(request)) return;
      request.applying = false;
      setDraft({ ...blank(context), status: "failed", error: studioCoplanarEdgeDissolveError(cause) });
    };
    try {
      run(studioCoplanarEdgeDissolveCommandLabel(), (workspace, selection) => {
        try {
          if (!guard()) throw new StudioCoplanarEdgeDissolveWorkspaceError("stale-context", "현재 문서·선택·요청 세대가 바뀌었습니다.");
          const result = commitStudioHybridDccCoplanarEdgeDissolve({ workspace, selection }, plan);
          request.expected = { stateHash: result.workspace.session.state.stateHash,
            commandCount: result.workspace.session.state.commandCount, assetId: plan.assetId, meshHash: plan.resultMeshHash };
          return result;
        } catch (cause) { failed(cause); throw cause; }
      }, guard);
    } catch (cause) { failed(cause); }
  };
  return { status: shown.status, engaged: shown.status !== "empty" || shown.applying, pending: shown.status === "pending",
    applying: shown.applying, canPrepare, canApply, preview: preview.value, prepare, cancel, apply,
    error: shown.error || preview.error, notice: shown.notice };
}

export type StudioHybridDccCoplanarEdgeDissolveModel = ReturnType<typeof useStudioHybridDccCoplanarEdgeDissolve>;
