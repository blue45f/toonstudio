import { Download, LoaderCircle, Upload, X } from "lucide-react";
import { useContext, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { StudioDocumentLayoutContext } from "../studio-router/studio-document-layout-context";
import { StudioDocumentRuntimeContext } from "../studio-router/studio-document-runtime-context";
import { StudioLocalToolImportAuthorityContext } from "../toolchain/studio-local-tool-import-authority";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioToonBridgeConnectionCard } from "../toolchain/StudioToonBridgeConnectionCard";
import { useStudioToonBridgeConnection } from "../toolchain/useStudioToonBridgeConnection";
import {
  isStudioBlenderLoopbackUrl, isStudioBlenderServiceRevision, runStudioBlenderJob,
  STUDIO_BLENDER_SERVICE_REVISION,
  type BlenderBridgeOperation,
} from "./studio-bg3d-blender-bridge";

interface StudioBg3dBlenderImportPanelProps {
  readonly disabled?: boolean;
  readonly importing?: boolean;
  readonly scopeKey: string;
  readonly rightsKey: string;
  readonly onFile: (file: File, signal: AbortSignal) => Promise<boolean>;
  /** 정규 가져오기에 넘긴 파일의 AI 답을 같은 소유 범위에서 한 번 소비한다. */
  readonly onImported?: () => void;
  readonly onBusyChange?: (busy: boolean) => void;
}

function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40";

/** 실제 로컬 Blender 결과만 기존 모델 검증·권리 기록 경로로 전달한다. */
export function StudioBg3dBlenderImportPanel({
  disabled = false, importing = false,
  scopeKey, rightsKey, onFile, onImported,
  onBusyChange,
}: StudioBg3dBlenderImportPanelProps) {
  const bt = useBilingual("StudioBg3dBlenderImportPanel");
  const connection = useStudioToonBridgeConnection();
  const authority = useContext(StudioLocalToolImportAuthorityContext);
  const layout = useContext(StudioDocumentLayoutContext);
  const runtime = useContext(StudioDocumentRuntimeContext);
  const authRevision = useSyncExternalStore(subscribeAuth, getAuthSessionRevision, getAuthSessionRevision);
  const actor = getAuthUserId();
  const ticket = authority?.capture();
  const ownerKey = JSON.stringify([actor, authRevision, layout?.documentKey, layout?.projectId,
    layout?.documentId, layout?.draftId, runtime?.instanceId, scopeKey, ticket]);
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [operation, setOperation] = useState<BlenderBridgeOperation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  const activeRef = useRef<{ controller: AbortController; invalidated: boolean; publishing: boolean; finishBusy: () => void } | null>(null);
  const liveRef = useRef(false);
  const serviceRevision = connection.status?.serviceVersion;
  const serviceSupported = isStudioBlenderServiceRevision(serviceRevision);
  const scopeChangedMessage = bt("작업 대상이나 연결이 바뀌어 이전 Blender 작업의 중단을 요청했습니다. 늦은 결과는 적용하지 않습니다.", "The target or connection changed. Cancellation was requested; late results will not be applied.");
  const latest = useRef({ ownerKey, rightsKey, disabled, importing, authority, serviceRevision, serviceSupported, scopeChangedMessage, client: connection.client, connected: connection.connected });
  latest.current = { ownerKey, rightsKey, disabled, importing, authority, serviceRevision, serviceSupported, scopeChangedMessage, client: connection.client, connected: connection.connected };
  const previousOwner = useRef(ownerKey);

  useLayoutEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      const active = activeRef.current;
      if (active) { active.invalidated = true; active.controller.abort(); active.finishBusy(); }
    };
  }, []);
  useLayoutEffect(() => {
    const active = activeRef.current;
    // 소유 범위의 교체는 정규 모델 가져오기가 진행 중이어도 취소한다.
    if (active) {
      active.invalidated = true;
      active.controller.abort(new DOMException("가져오기 소유 범위가 바뀌었습니다.", "AbortError"));
      setFailure(false);
      setNotice(latest.current.scopeChangedMessage);
    }
    if (previousOwner.current !== ownerKey) setFile(null);
    previousOwner.current = ownerKey;
  }, [ownerKey, rightsKey, disabled, connection.client, connection.connected, authority?.locked, serviceRevision]);
  useLayoutEffect(() => {
    const active = activeRef.current;
    // 자신이 시작한 모델 검증의 busy는 유지하고, 다른 파일 가져오기는 변환을 취소한다.
    if (importing && active && !active.publishing) { active.invalidated = true; active.controller.abort(); }
  }, [importing]);

  const blender = connection.probes.find((probe) => probe.toolId === "blender");
  const localRunner = connection.client !== null && isStudioBlenderLoopbackUrl(connection.client.settings.baseUrl);
  const ready = serviceSupported && localRunner && authority !== null && ticket !== undefined && !authority.locked && authority.isCurrent(ticket)
    && connection.connected && blender?.state === "available" && blender.executable;
  const busy = operation !== null;

  const cancel = () => {
    const active = activeRef.current;
    if (!active) return;
    active.controller.abort(new DOMException("user-cancelled", "AbortError"));
    setFailure(false);
    setNotice(active.publishing
      ? bt("모델 가져오기 취소를 요청하고 있습니다. 이미 완료된 반영은 유지하며 처리 결과를 확인합니다.", "Requesting cancellation of model import. Checking the result while keeping changes already committed.")
      : bt("Blender 작업 취소를 요청하고 있습니다. 실행기의 응답을 기다려 주세요.", "Requesting cancellation of the Blender job. Waiting for the runner to respond."));
  };

  const run = async (nextOperation: BlenderBridgeOperation) => {
    if (disabled || importing || activeRef.current || !ready || !file || !connection.client) return;
    const controller = new AbortController();
    const client = connection.client;
    let busyFinished = false;
    const active = { controller, invalidated: false, publishing: false, finishBusy: () => {
      if (!busyFinished) { busyFinished = true; onBusyChange?.(false); }
    } };
    activeRef.current = active;
    const ownsDisplay = () => liveRef.current && activeRef.current === active;
    const ownsScope = () => ownsDisplay() && !active.invalidated
      && latest.current.ownerKey === ownerKey && latest.current.rightsKey === rightsKey
      && latest.current.client === client && latest.current.connected
      && latest.current.serviceSupported && latest.current.serviceRevision === serviceRevision
      && !latest.current.disabled && (!latest.current.importing || active.publishing) && !latest.current.authority?.locked
      && ticket !== undefined && latest.current.authority?.isCurrent(ticket) === true
      && getAuthUserId() === actor && getAuthSessionRevision() === authRevision;
    const current = () => !controller.signal.aborted && ownsScope();
    setOperation(nextOperation);
    setFailure(false);
    setNotice(bt("로컬 Blender 작업을 준비하고 있습니다.", "Preparing the local Blender job."));
    onBusyChange?.(true);
    try {
      const result = await runStudioBlenderJob({
        client,
        projectId: layout?.projectId ?? null,
        isCurrent: current,
        file,
        operation: nextOperation,
        signal: controller.signal,
        onProgress(job) {
          if (!current()) return;
          setNotice(bt(
            `Blender 처리 중 · ${Math.round(job.progress.value * 100)}% · ${job.progress.phase}`,
            `Blender processing · ${Math.round(job.progress.value * 100)}% · ${job.progress.phase}`,
          ));
        },
      });
      if (!current()) return;
      if (nextOperation === "export-glb") {
        active.publishing = true;
        const accepted = await onFile(result, controller.signal);
        if (!ownsScope()) return;
        if (controller.signal.aborted) {
          // 취소 전에 끝난 장면 반영은 보존하고, 다른 범위의 늦은 완료와 구별한다.
          setFailure(false);
          setNotice(accepted
            ? bt("모델이 이미 장면에 반영되어 취소 요청으로 되돌리지 않았습니다. 3D 모델 목록에서 결과와 AI 사용 표기를 확인하세요.", "The model was already added to the scene and was kept after cancellation was requested. Check the result and AI-use labels in the 3D model list.")
            : bt("모델 가져오기를 취소해 장면에 배치하지 않았습니다. 보관함의 저장 상태와 AI 사용 표기는 3D 모델 목록에서 확인하세요.", "Model import was cancelled before scene placement. Check saved models and AI-use labels in the 3D model list."));
          return;
        }
        if (!accepted) throw new Error(bt("모델 검증 또는 이용 권리 확인을 완료하지 못했습니다.", "Model validation or rights verification could not be completed."));
        setNotice(bt("검증한 GLB를 모델 가져오기로 전달했습니다. 최종 결과는 3D 모델 목록에서 확인하세요.", "Sent the verified GLB to model import. Check the 3D model list for the final result."));
      } else {
        const url = URL.createObjectURL(result);
        try {
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = result.name;
          anchor.click();
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
        setNotice(bt("검증한 PNG 저장을 시작했습니다.", "Started saving the verified PNG."));
      }
    } catch (cause) {
      if (!ownsScope()) return;
      if ((cause instanceof Error || cause instanceof DOMException) && cause.name === "AbortError") {
        setFailure(false);
        setNotice(active.publishing
          ? bt("모델 가져오기 처리를 중단했습니다. 이미 저장·반영된 결과와 AI 사용 표기는 3D 모델 목록에서 확인하세요.", "Model import was interrupted. Check any saved or committed results and AI-use labels in the 3D model list.")
          : bt("Blender 작업을 취소했습니다. 취소한 결과는 가져오거나 저장하지 않습니다.", "Blender job cancelled. Its result will not be imported or saved."));
      } else {
        setFailure(true);
        setNotice(cause instanceof Error || cause instanceof DOMException ? cause.message : bt("Blender 작업을 완료하지 못했습니다.", "The Blender job could not be completed."));
      }
    } finally {
      // 기존 파일 선택과 같이 정규 가져오기에 넘긴 파일의 AI 답은 결과와 무관하게 한 번만 소비한다.
      const consumeFileAnswers = active.publishing && ownsScope();
      if (activeRef.current === active) {
        activeRef.current = null;
        if (liveRef.current) setOperation(null);
      }
      active.finishBusy();
      // active를 먼저 해제해 자기 폼 초기화가 아직 진행 중인 요청을 취소하지 않게 한다.
      if (consumeFileAnswers) onImported?.();
    }
  };

  return (
    <section aria-labelledby={titleId} className="mt-3 rounded-xl border border-line bg-card/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id={titleId} className="text-sm font-bold text-fg">{bt("로컬 Blender · 장면 가져오기", "Local Blender scene import")}</h4>
          <p className="mt-1 text-xs leading-5 text-fg-3">{bt("이 컴퓨터의 Blender로 .blend를 GLB 장면 또는 PNG로 만듭니다.", "Use Blender on this computer to turn a .blend into a GLB scene or PNG.")}</p>
        </div>
        <button type="button" className={BUTTON} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? bt("접기", "Collapse") : bt("Blender 열기", "Open Blender")}
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-line pt-3" aria-busy={busy}>
          <fieldset disabled={busy || disabled || importing} className="m-0 min-w-0 space-y-3 border-0 p-0">
            <StudioToonBridgeConnectionCard connection={connection} compact />
            {connection.connected ? (
              <p className="text-xs leading-5 text-fg-2" role="status">
                {!serviceSupported
                  ? bt(`로컬 실행기를 ToonBridge ${STUDIO_BLENDER_SERVICE_REVISION}으로 업데이트한 뒤 다시 연결하세요. 현재 프레임 보존을 확인하지 못해 작업을 시작하지 않습니다.`, `Update the local runner to ToonBridge ${STUDIO_BLENDER_SERVICE_REVISION} and reconnect. Jobs remain blocked until saved-frame support is verified.`)
                  : ready
                  ? bt(`Blender 사용 가능 · ${blender?.version ?? "버전 확인됨"}`, `Blender available · ${blender?.version ?? "version verified"}`)
                  : bt("Blender를 실행할 수 없습니다. 설치 경로와 실행기 연결을 확인하세요.", "Blender is unavailable. Check its installation path and runner connection.")}
              </p>
            ) : null}
            <p className="text-xs leading-5 text-fg-3">
              {bt("Blender에서 File → External Data → Pack Resources로 텍스처를 포함하고 저장한 .blend를 선택하세요. 원본에 저장된 카메라·현재 프레임을 사용하며, 외부 연결 파일은 자동으로 전송하지 않습니다.", "In Blender, use File → External Data → Pack Resources and save the .blend before choosing it. Rendering uses the saved camera and current frame. External linked files are not transferred automatically.")}
            </p>
            <label className="grid gap-2 text-xs font-semibold text-fg-2">
              {bt("Blender 장면 파일 (.blend)", "Blender scene file (.blend)")}
              <input type="file" accept=".blend" className="min-h-11 min-w-0 w-full rounded-xl border border-line bg-panel p-2 text-xs text-fg" onChange={(event) => {
                const selected = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                setFailure(false);
                if (selected && !selected.name.toLowerCase().endsWith(".blend")) {
                  setFile(null);
                  setFailure(true);
                  setNotice(bt(".blend 파일을 선택하세요.", "Choose a .blend file."));
                  return;
                }
                setFile(selected);
                setNotice(null);
              }} />
            </label>
            {file ? <p className="break-all text-xs text-fg-2">{file.name}</p> : null}
            <div className="grid gap-2">
              <button type="button" className={BUTTON} disabled={!ready || !file} onClick={() => void run("export-glb")}>
                <Upload size={15} aria-hidden="true" />{bt("GLB로 변환해 가져오기", "Convert to GLB and import")}
              </button>
              <button type="button" className={BUTTON} disabled={!ready || !file} onClick={() => void run("render-scene")}>
                <Download size={15} aria-hidden="true" />{bt("현재 프레임 PNG 저장", "Save current frame as PNG")}
              </button>
              <button type="button" className={BUTTON} disabled={!ready || !file} onClick={() => void run("line-art")}>
                <Download size={15} aria-hidden="true" />{bt("Freestyle 선화 PNG 저장", "Save Freestyle line art as PNG")}
              </button>
            </div>
          </fieldset>
          {busy ? (
            <button type="button" className={BUTTON} onClick={cancel} disabled={activeRef.current?.controller.signal.aborted}>
              <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <X size={14} aria-hidden="true" />{bt("Blender 작업 취소", "Cancel Blender job")}
            </button>
          ) : null}
          {notice ? <p role={failure ? "alert" : "status"} className="break-words text-xs leading-5 text-fg-2">{notice}</p> : null}
          <p className="text-xs leading-5 text-fg-3">{bt("이 컴퓨터의 로컬 실행기로만 원본을 보냅니다. GLB는 위 이용 권리·AI 사용 표기와 기존 모델 검증을 거치며, PNG는 파일로 저장합니다.", "The source is sent only to the local runner on this computer. GLB uses the rights and AI-use choices above and existing model validation; PNG is downloaded.")}</p>
        </div>
      ) : null}
    </section>
  );
}
