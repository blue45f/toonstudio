import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { createStudioMeshUvAtlasInteropRequest } from "../mesh-uv/studio-mesh-uv-atlas-interop";
import { assertStudioHybridDccUvAtlasSnapshot, prepareStudioHybridDccUvAtlas, workspaceApplyUvAtlas } from "./studio-hybrid-dcc-uv-atlas-workspace";

import type { StudioXAtlasUvWorkerClient } from "../xatlas-uv/studio-xatlas-uv-provider-worker-client";
import type { StudioXAtlasUvFailureReason } from "../xatlas-uv/studio-xatlas-uv-provider";
import type { StudioHybridDccUvAtlasRun } from "./studio-hybrid-dcc-uv-atlas-host";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

// 이미지를 동반하지 않는 새 숫자 UV를 앱 정본으로 해석한다. provider 이미지 원점의 실측값이 아니다.
const STUDIO_UV_ATLAS_CANONICAL_BASIS = "v-up";

export interface StudioHybridDccUvAtlasModel {
  readonly phase: "idle" | "computing" | "publishing";
  readonly busy: boolean;
  readonly canStart: boolean;
  readonly resolution: string;
  readonly padding: string;
  readonly rotateCharts: boolean;
  readonly progress: number | null;
  readonly stage: string;
  readonly unavailable: string | null;
  readonly error: string;
  readonly notice: string;
  readonly start: () => Promise<void>;
  readonly cancel: () => void;
  readonly setResolution: (value: string) => void;
  readonly setPadding: (value: string) => void;
  readonly setRotateCharts: (value: boolean) => void;
}

interface AtlasJob {
  readonly id: number;
  readonly abort: AbortController;
  readonly owner: string;
  readonly workspace: StudioHybridDccWorkspace;
  client: StudioXAtlasUvWorkerClient | null;
  publishing: boolean;
  committed: boolean;
}

function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function releaseAtlasJob(own: AtlasJob) { own.abort.abort(); own.client?.dispose(); own.client = null; }
function integerDraft(value: string, minimum: number): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

/** 기본 Worker에서 계산한 후 원본·소유자 lease를 다시 확인해 한 번만 확정한다. */
export function useStudioHybridDccUvAtlas({ workspace, workspaceDocumentId, enabled, editingDisabled, blocked, run }: {
  readonly workspace: StudioHybridDccWorkspace;
  readonly workspaceDocumentId?: string;
  readonly enabled: boolean;
  readonly editingDisabled: boolean;
  readonly blocked: boolean;
  readonly run?: StudioHybridDccUvAtlasRun;
}): StudioHybridDccUvAtlasModel {
  const bt = useBilingual("StudioHybridDccUvAtlas");
  const revision = useSyncExternalStore(subscribeAuth, getAuthSessionRevision, getAuthSessionRevision);
  const actor = getAuthUserId();
  const owner = JSON.stringify([actor, revision, workspaceDocumentId, workspace.session.state.documentId, workspace.activeAssetId, enabled, blocked]);
  const latest = useRef({ owner, workspace, editingDisabled, run });
  latest.current = { owner, workspace, editingDisabled, run };
  const live = useRef(false), epoch = useRef(0), job = useRef<AtlasJob | null>(null);
  const acknowledged = useRef<{ readonly owner: string; readonly stateHash: string } | null>(null);
  const cancelledTransition = useRef(false);
  const [phase, setPhase] = useState<StudioHybridDccUvAtlasModel["phase"]>("idle");
  const [resolution, setResolution] = useState("4096"), [padding, setPadding] = useState("4");
  const [rotateCharts, setRotateCharts] = useState(true);
  const [progress, setProgress] = useState<number | null>(null), [stage, setStage] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");

  const invalidate = useCallback(() => {
    epoch.current += 1;
    const own = job.current; job.current = null;
    if (own) releaseAtlasJob(own);
    return own;
  }, []);
  const changedScopeMessage = useEffectEvent(() => bt("문서·계정·선택이 바뀌어 자동 UV 작업을 취소했습니다.", "Automatic UVs were cancelled because the document, account or selection changed."));
  useLayoutEffect(() => {
    live.current = true;
    const own = invalidate();
    setPhase("idle"); setProgress(null); setStage(""); setError("");
    const applied = acknowledged.current?.owner === owner && acknowledged.current.stateHash === workspace.session.state.stateHash;
    if (!applied) {
      acknowledged.current = null;
      setNotice(own || cancelledTransition.current ? changedScopeMessage() : "");
    }
    cancelledTransition.current = false;
    return () => { live.current = false; const pending = invalidate(); cancelledTransition.current = Boolean(pending && !pending.committed); };
  }, [invalidate, owner, workspace]);
  useLayoutEffect(() => {
    const own = job.current;
    if (!editingDisabled || !own || own.publishing) return;
    invalidate(); setPhase("idle"); setProgress(null); setStage("");
    setNotice(bt("다른 편집이 시작되어 자동 UV 작업을 취소했습니다.", "Automatic UVs were cancelled because another edit started."));
  }, [editingDisabled, bt, invalidate]);
  useEffect(() => () => { live.current = false; invalidate(); }, [invalidate]);

  const unavailable = !run ? bt("이 화면에서는 자동 UV를 적용할 수 없습니다.", "Automatic UVs cannot be applied in this view.")
    : !workspace.activeAssetId || !workspace.session.state.geometry.records[workspace.activeAssetId]
      ? bt("UV를 펼칠 오브젝트를 선택하세요.", "Select an object to unwrap.")
      : blocked ? bt("다른 UV 또는 메시 미리보기를 적용하거나 취소한 뒤 사용하세요.", "Apply or cancel the other UV or mesh preview first.") : null;
  const busy = phase !== "idle" || editingDisabled;
  const canStart = enabled && !editingDisabled && !busy && !unavailable;
  const current = (own: AtlasJob) => live.current && job.current === own && epoch.current === own.id
    && !own.abort.signal.aborted && latest.current.owner === own.owner && latest.current.workspace === own.workspace
    && (!latest.current.editingDisabled || own.publishing)
    && getAuthSessionRevision() === revision && getAuthUserId() === actor;
  const providerFailure = (reason: StudioXAtlasUvFailureReason) => {
    if (reason === "budget-exceeded" || reason === "time-budget-exceeded" || reason === "progress-budget-exceeded") {
      return bt("선택한 모델의 자동 UV 계산이 현재 지원 범위를 넘어서 중단됐습니다. 원본은 변경하지 않았습니다.", "Automatic UV calculation exceeded the currently supported limits. The source is unchanged.");
    }
    if (reason === "worker-unavailable" || reason === "provider-unavailable") {
      return bt("이 브라우저 환경에서 자동 UV 계산을 시작할 수 없습니다. 브라우저와 연결 상태를 확인한 뒤 다시 시도하세요.", "Automatic UV calculation could not start in this browser environment. Check the browser and connection, then try again.");
    }
    if (reason === "invalid-provider-output" || reason === "cleanup-failure") {
      return bt("자동 UV 결과를 검증하지 못해 적용하지 않았습니다. 원본과 편집 이력은 그대로입니다.", "The automatic UV result could not be validated and was not applied. The source and edit history are unchanged.");
    }
    return bt("자동 UV 계산에 실패했습니다. 원본은 그대로이므로 다시 시도할 수 있습니다.", "Automatic UV calculation failed. The source is unchanged and you can try again.");
  };

  const start = async () => {
    if (!canStart || job.current || !run) return;
    const resolutionValue = integerDraft(resolution, 1), paddingValue = integerDraft(padding, 0);
    if (resolutionValue === null || paddingValue === null) {
      setError(bt("해상도에는 양의 정수, 여백에는 0 이상의 정수를 입력하세요.", "Enter a positive integer resolution and a non-negative integer margin.")); return;
    }
    invalidate(); acknowledged.current = null;
    const own: AtlasJob = { id: epoch.current, abort: new AbortController(), owner, workspace, client: null, publishing: false, committed: false };
    job.current = own; setPhase("computing"); setProgress(null); setStage(bt("자동 UV 준비 중", "Preparing automatic UVs")); setError(""); setNotice("");
    try {
      // 무거운 client와 provider는 사용자가 실행한 뒤에만 읽는다. runtime/factory 대역이나 fallback을 넣지 않는다.
      const [clientModule, providerModule] = await Promise.all([
        import("../xatlas-uv/studio-xatlas-uv-provider-worker-client"),
        import("../xatlas-uv/studio-xatlas-uv-provider"),
      ]);
      if (!current(own)) return;
      const limits = providerModule.STUDIO_XATLAS_UV_PROVIDER_LIMITS;
      if (resolutionValue > limits.maxAtlasResolution || paddingValue > limits.maxPadding) {
        throw new Error(formatI18nTemplate(bt("해상도는 {resolution} 이하, 여백은 {padding} 이하로 입력하세요.", "Enter a resolution up to {resolution} and a margin up to {padding}."), {
          resolution: limits.maxAtlasResolution, padding: limits.maxPadding,
        }));
      }
      const sourceRecord = workspace.activeAssetId ? workspace.session.state.geometry.records[workspace.activeAssetId] : undefined;
      if (sourceRecord && sourceRecord.mesh.vertices.length > limits.maxVerticesPerMesh) {
        throw new Error(formatI18nTemplate(bt("선택한 모델의 정점 수가 현재 자동 UV 지원 범위인 {count}개를 넘습니다. 원본은 변경하지 않았습니다.", "The selected model exceeds the current automatic UV limit of {count} vertices. The source is unchanged."), { count: limits.maxVerticesPerMesh }));
      }
      const snapshot = prepareStudioHybridDccUvAtlas(workspace);
      const client = clientModule.createStudioXAtlasUvWorkerClient({ requestEpoch: own.id, documentEpoch: own.id });
      own.client = client;
      const request = createStudioMeshUvAtlasInteropRequest(snapshot.assetId, snapshot.prepared, own.id, own.id, {
        resolution: resolutionValue, padding: paddingValue, rotateCharts,
      });
      const result = await client.execute(request, {
        signal: own.abort.signal,
        onProgress: (value) => {
          if (!current(own)) return;
          const mode = value.mode.toLowerCase();
          setProgress(value.progress);
          setStage(mode.includes("pack") ? bt("UV 아일랜드 정리 중", "Packing UV islands")
            : mode.includes("chart") ? bt("UV 아일랜드 분리 중", "Creating UV islands")
              : bt("UV 아일랜드 계산 중", "Calculating UV islands"));
        },
      });
      if (!current(own)) return;
      if (!result.ok) {
        if (result.reason === "cancelled") {
          setNotice(bt("자동 UV 작업이 취소됐습니다. 원본과 편집 이력은 그대로입니다.", "Automatic UVs were cancelled. The source and edit history are unchanged.")); return;
        }
        throw new Error(providerFailure(result.reason));
      }
      const next = workspaceApplyUvAtlas(workspace, snapshot, result.artifact, STUDIO_UV_ATLAS_CANONICAL_BASIS);
      client.dispose(); own.client = null;
      if (next === workspace) { setNotice(bt("UV에 바뀐 값이 없습니다.", "The UVs are unchanged.")); return; }
      own.publishing = true; setPhase("publishing"); setProgress(null); setStage(bt("자동 UV 적용 중", "Applying automatic UVs"));
      const publish = latest.current.run;
      if (!publish) throw new Error(bt("자동 UV 적용 화면이 닫혔습니다.", "The automatic UV editing view was closed."));
      await publish(bt("자동 UV 펼치기", "Automatic UV unwrap"), (currentWorkspace, selection) => {
        if (!current(own) || currentWorkspace !== workspace) throw new DOMException("자동 UV 원본이 바뀌었습니다.", "AbortError");
        assertStudioHybridDccUvAtlasSnapshot(currentWorkspace, snapshot);
        return { workspace: next, selection };
      }, () => current(own), () => {
        if (!current(own)) return;
        own.committed = true;
        acknowledged.current = { owner, stateHash: next.session.state.stateHash };
        setNotice(bt("자동 UV를 적용했습니다. 되돌리기 한 번으로 복원할 수 있습니다.", "Automatic UVs applied. One undo step restores them."));
      });
      if (current(own) && !own.committed) setError(bt("UV 적용을 확인하지 못했습니다. 작업 기록을 확인하세요.", "The UV edit could not be confirmed. Check the activity log."));
    } catch (cause) {
      if (current(own)) setError(cause instanceof Error ? cause.message : bt("자동 UV 작업에 실패했습니다.", "Automatic UV generation failed."));
    } finally {
      releaseAtlasJob(own);
      if (job.current === own && live.current) { job.current = null; setPhase("idle"); setProgress(null); setStage(""); }
    }
  };

  return {
    phase, busy, canStart, resolution, padding, rotateCharts, progress, stage, unavailable, error, notice, start,
    cancel: () => {
      if (!job.current) return;
      invalidate(); setPhase("idle"); setProgress(null); setStage(""); setError("");
      setNotice(bt("자동 UV 작업을 취소했습니다. 원본과 편집 이력은 그대로입니다.", "Automatic UVs cancelled. The source and edit history are unchanged."));
    },
    setResolution: (value) => { if (!job.current && !editingDisabled) { setResolution(value); setError(""); } },
    setPadding: (value) => { if (!job.current && !editingDisabled) { setPadding(value); setError(""); } },
    setRotateCharts: (value) => { if (!job.current && !editingDisabled) { setRotateCharts(value); setError(""); } },
  };
}
