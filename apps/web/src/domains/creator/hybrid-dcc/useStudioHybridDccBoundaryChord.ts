import { useEffect, useMemo, useRef, useState } from "react";

import {
  collectStudioHybridDccBoundaryEndpoint, type StudioBoundaryEndpointLease,
  type StudioBoundaryEndpointProjection,
} from "./studio-hybrid-dcc-boundary-endpoint";
import {
  commitStudioHybridDccBoundaryChord, prepareStudioHybridDccBoundaryChord,
  previewStudioHybridDccBoundaryChord, StudioBoundaryChordWorkspaceError,
  type StudioBoundaryChordCurrent, type StudioBoundaryChordPlan, type StudioBoundaryChordPreparation,
} from "./studio-hybrid-dcc-boundary-chord-workspace";
import { workspaceComponentSelectionSource } from "./studio-hybrid-dcc-workspace";
import {
  studioBoundaryChordCommandLabel, studioBoundaryChordMessage, studioBoundaryChordNotice,
} from "./studio-hybrid-dcc-boundary-chord-messages";

import type { StudioHybridDccRayHitMapping } from "./studio-hybrid-dcc-component-selection";
import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";

export interface StudioBoundaryChordHookInput extends StudioBoundaryChordCurrent {
  readonly enabled: boolean;
  readonly disabled: boolean;
  readonly run?: (label: string, edit: StudioHybridDccWorkspaceEdit, canCommit?: () => boolean) => void;
  readonly compute?: StudioBoundaryChordPreparation["compute"];
}
interface Draft {
  readonly context: string;
  readonly endpoints: readonly StudioBoundaryEndpointLease[];
  readonly status: "empty" | "first-endpoint" | "pending" | "ready" | "failed";
  readonly plan?: StudioBoundaryChordPlan;
  readonly error: string;
}
function blank(context: string): Draft { return { context, endpoints: [], status: "empty", error: "" }; }

/** 실제 viewport가 hit·카메라·world 행렬을 전달할 포트다. 임의 2D polygon 점을 endpoint로 승격하지 않는다. */
export function useStudioHybridDccBoundaryChord(input: StudioBoundaryChordHookInput) {
  const source = workspaceComponentSelectionSource(input.workspace);
  const context = JSON.stringify([input.workspace.session.state.documentId, input.workspace.session.state.stateHash,
    source?.assetId, source?.sourceHash, source?.meshRevision, input.selection, input.enabled]);
  const [draft, setDraft] = useState<Draft>(() => blank(context));
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState("");
  const live = useRef(true), epoch = useRef(0), controller = useRef<AbortController | null>(null);
  const latest = useRef({ input, context }); latest.current = { input, context };
  const applyingRef = useRef(false);
  const expectedCommitHash = useRef<string | null>(null);
  const shown = draft.context === context ? draft : blank(context);

  const reset = (message = "") => {
    epoch.current += 1;
    controller.current?.abort(); controller.current = null;
    applyingRef.current = false; expectedCommitHash.current = null;
    if (!live.current) return;
    setApplying(false); setDraft(blank(latest.current.context)); setNotice(message);
  };
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; epoch.current += 1; controller.current?.abort(); controller.current = null; };
  }, []);
  useEffect(() => {
    if (draft.context === context) return;
    const applied = expectedCommitHash.current !== null
      && expectedCommitHash.current === input.workspace.session.state.stateHash;
    epoch.current += 1; controller.current?.abort(); controller.current = null;
    applyingRef.current = false; expectedCommitHash.current = null;
    setApplying(false); setDraft(blank(context));
    setNotice(applied ? studioBoundaryChordNotice("applied")
      : draft.endpoints.length ? studioBoundaryChordNotice("contextChanged") : "");
  }, [context, draft.context, draft.endpoints.length, input.workspace.session.state.stateHash]);
  useEffect(() => {
    if (!input.disabled || applyingRef.current || shown.status === "empty") return;
    epoch.current += 1; controller.current?.abort(); controller.current = null;
    setDraft(blank(context)); setNotice(studioBoundaryChordNotice("otherEdit"));
  }, [context, input.disabled, shown.status]);
  useEffect(() => {
    if (!applying || input.disabled) return;
    // 실제 host가 결과를 발행하지 않으면 성공을 표시하지 않고 재시도 가능한 상태로 돌린다.
    const timer = setTimeout(() => {
      if (!live.current || !applyingRef.current || latest.current.context !== context) return;
      applyingRef.current = false; expectedCommitHash.current = null; setApplying(false);
      setNotice(studioBoundaryChordNotice("applyUnconfirmed"));
    }, 0);
    return () => clearTimeout(timer);
  }, [applying, context, input.disabled]);

  const preview = useMemo(() => {
    if (shown.status !== "ready" || !shown.plan) return { value: null, error: "" };
    try { return { value: previewStudioHybridDccBoundaryChord({ workspace: input.workspace, selection: input.selection }, shown.plan), error: "" }; }
    catch (cause) {
      // source가 바뀐 렌더에는 이전 표시 사본을 즉시 숨기고 실제 실패 이유를 전달한다.
      return { value: null, error: cause instanceof Error ? cause.message : studioBoundaryChordNotice("displayFailed") };
    }
  }, [input.workspace, input.selection, shown.plan, shown.status]);

  const pickEndpoint = (hit: StudioHybridDccRayHitMapping, mode: "vertex" | "edge", projection: StudioBoundaryEndpointProjection): boolean => {
    const current = latest.current;
    if (!live.current || !current.input.enabled || current.input.disabled || !current.input.run || applyingRef.current) return false;
    const currentSource = workspaceComponentSelectionSource(current.input.workspace);
    if (!currentSource) return false;
    const endpoint = collectStudioHybridDccBoundaryEndpoint(currentSource, current.input.selection, hit, mode, projection);
    if (!endpoint.ok) {
      setNotice(studioBoundaryChordMessage(endpoint.code)); return false;
    }
    controller.current?.abort(); controller.current = null;
    const generation = ++epoch.current;
    const first = shown.context === current.context && shown.endpoints.length === 1 ? shown.endpoints[0] : undefined;
    setNotice("");
    if (!first) {
      setDraft({ context: current.context, endpoints: [endpoint.value], status: "first-endpoint", error: "" });
      return true;
    }
    const endpoints: readonly [StudioBoundaryEndpointLease, StudioBoundaryEndpointLease] = [first, endpoint.value];
    const abort = new AbortController(); controller.current = abort;
    const isCurrent = () => live.current && epoch.current === generation && latest.current.context === current.context;
    setDraft({ context: current.context, endpoints, status: "pending", error: "" });
    void prepareStudioHybridDccBoundaryChord(current.input, { tool: "boundary-chord", endpoints }, {
      generation, signal: abort.signal, readCurrent: () => latest.current.input, isCurrent, compute: current.input.compute,
    }).then((plan) => {
      if (!isCurrent() || latest.current.input.disabled) return;
      setDraft({ context: current.context, endpoints, status: "ready", plan, error: "" });
    }, (cause) => {
      if (!isCurrent()) return;
      setDraft({ context: current.context, endpoints: [first], status: "failed",
        error: cause instanceof Error ? cause.message : studioBoundaryChordNotice("preparationFailed") });
    }).finally(() => { if (controller.current === abort) controller.current = null; });
    return true;
  };
  const canApply = Boolean(preview.value && shown.plan && input.run && input.enabled && !input.disabled && !applying);
  return {
    status: shown.status, error: shown.error || preview.error, notice, endpoints: shown.endpoints,
    engaged: shown.endpoints.length > 0, pending: shown.status === "pending", applying, canApply,
    preview: preview.value, plan: shown.plan, pickEndpoint,
    clear: () => reset(),
    cancel: () => reset(studioBoundaryChordNotice("cancelled")),
    apply: () => {
      const plan = shown.plan, run = input.run;
      if (!canApply || !plan || !run || applyingRef.current) return;
      const generation = epoch.current, capturedContext = context, sourceSession = input.workspace.session;
      // host 자체의 busy는 허용한다. 최신 문서/선택/세대 검사는 modifier await 뒤에도 그대로 유지한다.
      const current = () => live.current && epoch.current === generation && latest.current.context === capturedContext
        && latest.current.input.workspace.session === sourceSession;
      applyingRef.current = true; setApplying(true); setNotice("");
      try {
        run(studioBoundaryChordCommandLabel(), (workspace, selection) => {
          try {
            if (!current()) throw new StudioBoundaryChordWorkspaceError("stale-preview", "현재 문서·선택 또는 요청이 바뀌었습니다.");
            const result = commitStudioHybridDccBoundaryChord({ workspace, selection }, plan);
            expectedCommitHash.current = result.workspace.session.state.stateHash;
            return result;
          } catch (cause) {
            if (current()) { applyingRef.current = false; setApplying(false); setNotice(cause instanceof Error ? cause.message : studioBoundaryChordNotice("applyFailed")); }
            throw cause;
          }
        }, current);
      } catch (cause) {
        if (current()) { applyingRef.current = false; setApplying(false); setNotice(cause instanceof Error ? cause.message : studioBoundaryChordNotice("applyFailed")); }
      }
    },
  };
}
