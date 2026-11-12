import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useEditorStatusSlot, useServiceStatusSlot } from "@/shared/lib/modal-status-slot";
import { creatorSub2StatusText } from "../status-i18n/studio-creator-sub2-status-i18n-r3c13b";

import {
  inspectStudioOfflineDevice,
  prepareLoadedStudioOfflineResources,
  requestStudioPersistentStorage,
  type StudioOfflineDeviceState,
} from "./studio-offline-client";
import {
  STUDIO_OFFLINE_AUTOMATION_EVENT,
  isStudioOfflineAutomationDetail,
} from "./studio-offline-automation";
import { useStudioConnectivity } from "./use-studio-connectivity";

function dataSaverEnabled(): boolean {
  try {
    return Boolean((navigator as Navigator & {
      connection?: { readonly saveData?: boolean };
    }).connection?.saveData);
  } catch {
    return false;
  }
}

/** 오프라인 도구 준비와 실제 원고 저장 완료는 서로 다른 상태로 유지한다. */
export function StudioOfflinePanel() {
  const bt = useBilingual("StudioOfflinePanel");
  const editor = useEditorStatusSlot();
  const activeStatus = useServiceStatusSlot();
  const modalStatusHost = activeStatus?.kind === "modal" ? activeStatus.element : null;
  const connectivity = useStudioConnectivity();
  const [device, setDevice] = useState<StudioOfflineDeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [preparationIssue, setPreparationIssue] = useState<"partial" | "error" | null>(null);
  const [technicalDetail, setTechnicalDetail] = useState<string | null>(null);
  const [manualResult, setManualResult] = useState("");
  const [message, setMessage] = useState(
    () => bt("스튜디오가 열린 뒤 현재 버전의 필수 편집 도구를 이 기기에 자동으로 준비합니다.", "After Studio opens, its current essential editing tools are prepared on this device automatically."),
  );
  const mounted = useRef(false);
  const operation = useRef(false);

  const refresh = useCallback(async (): Promise<StudioOfflineDeviceState | null> => {
    const value = await inspectStudioOfflineDevice();
    if (!mounted.current) return null;
    setDevice(value);
    if (value.offlineReady !== null) setPrepared(value.offlineReady);
    return value;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const invalidate = (): void => { void refresh(); };
    const automationChanged = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!isStudioOfflineAutomationDetail(detail)) return;
      setBusy(detail.phase === "preparing");
      if (detail.phase === "ready") setPrepared(true);
      if (detail.phase === "partial" || detail.phase === "error") setPrepared(false);
      if (detail.phase === "ready" || detail.phase === "preparing") setPreparationIssue(null);
      if (detail.phase === "partial" || detail.phase === "error") setPreparationIssue(detail.phase);
      setTechnicalDetail(null);
      setMessage(detail.message);
      void refresh();
    };
    window.addEventListener("online", invalidate);
    window.addEventListener("offline", invalidate);
    window.addEventListener(STUDIO_OFFLINE_AUTOMATION_EVENT, automationChanged);
    let workers: ServiceWorkerContainer | undefined;
    try {
      workers = navigator.serviceWorker;
      workers?.addEventListener("controllerchange", invalidate);
    } catch {
      // Restricted frames keep the editor usable without offline preparation.
    }
    return () => {
      mounted.current = false;
      window.removeEventListener("online", invalidate);
      window.removeEventListener("offline", invalidate);
      window.removeEventListener(STUDIO_OFFLINE_AUTOMATION_EVENT, automationChanged);
      workers?.removeEventListener("controllerchange", invalidate);
    };
  }, [refresh]);

  const prepare = useCallback(async (): Promise<void> => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setManualResult("");
    setPrepared(false);
    setPreparationIssue(null);
    setTechnicalDetail(null);
    setMessage(creatorSub2StatusText("studio.creatorSub2.status.offline.panel.rechecking", "현재 버전의 편집 도구를 다시 확인하고 있습니다. 원고를 서버로 보내거나 화면을 새로고침하지 않습니다."));
    try {
      const report = await prepareLoadedStudioOfflineResources();
      if (!mounted.current) return;
      setPrepared(report.complete);
      setPreparationIssue(report.complete ? null : "partial");
      setMessage(report.complete
        ? bt(`오프라인 전환 준비가 완료됐습니다. 편집 도구 ${report.cached}개를 이 기기에서 확인했습니다.`, `Ready to work offline. ${report.cached} editing resources were checked on this device.`)
        : bt(`${report.checked}개 중 ${report.cached}개를 준비했습니다. 일부 도구는 연결이 필요할 수 있어 연결 상태가 바뀌면 다시 확인합니다.`, `${report.cached} of ${report.checked} resources are ready. Some tools may need a connection; they will be checked again when the connection changes.`));
      await refresh();
      if (mounted.current && report.complete) setManualResult(bt("오프라인 도구 확인을 마쳤습니다. 원고 저장 완료와는 별개입니다.", "Offline tools were checked. This does not confirm manuscript saving."));
    } catch (cause) {
      if (mounted.current) {
        setPreparationIssue("error");
        setTechnicalDetail(cause instanceof Error ? cause.message : String(cause));
        setMessage(creatorSub2StatusText("studio.creatorSub2.status.offline.panel.prepareFailed", "오프라인 자동 준비에 실패했습니다. 연결이 복구되면 다시 시도합니다."));
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [bt, refresh]);

  const persist = async (): Promise<void> => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setManualResult("");
    setTechnicalDetail(null);
    try {
      const granted = await requestStudioPersistentStorage();
      if (!mounted.current) return;
      setMessage(granted === true
        ? bt("브라우저가 기기 보관 유지 요청을 허용했습니다. 원고 저장 완료와는 별개입니다. 사이트 데이터를 직접 지우면 원고도 사라지므로 작업 파일 백업도 유지해 주세요.", "The browser allowed the request to keep device storage. This does not confirm that a manuscript was saved. Deleting site data also removes manuscripts, so keep a work-file backup.")
        : creatorSub2StatusText("studio.creatorSub2.status.offline.panel.persistDenied", "브라우저가 지속 저장을 허용하지 않았거나 지원하지 않습니다. 로컬 자동 저장은 계속되지만 프로젝트 파일 백업을 권장합니다."));
      await refresh();
      if (mounted.current) setManualResult(granted === true
        ? bt("기기 보관 유지 요청이 허용됐습니다. 원고 저장 완료는 별도로 확인해 주세요.", "Device-storage retention was allowed. Check manuscript saving separately.")
        : bt("기기 보관 유지 요청이 허용되지 않았습니다. 작업 파일 백업을 유지해 주세요.", "Device-storage retention was not allowed. Keep a work-file backup."));
    } catch (cause) {
      if (mounted.current) {
        setMessage(bt("기기 보관 유지 요청을 완료하지 못했습니다. 작업 파일로 백업한 뒤 다시 시도해 주세요.", "The device-storage request could not be completed. Back up your work file and try again."));
        setManualResult(bt("기기 보관 유지 요청 실패. 작업 파일로 백업하고 다시 시도해 주세요.", "Device-storage retention failed. Back up your work file and try again."));
        setTechnicalDetail(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const storagePercent = device?.usage !== null && device?.quota
    && device.usage !== undefined
    ? Math.round(device.usage / device.quota * 100)
    : null;
  const ready = preparationIssue === null && (prepared || device?.offlineReady === true);
  const storageWarning = storagePercent !== null && storagePercent >= 90;
  const shouldShowPanel = connectivity.mode !== "online"
    || device?.navigationFallback === true
    || storageWarning || preparationIssue !== null;
  const importantSummary = storageWarning
    ? bt(`저장 공간 약 ${storagePercent}% 사용 · 백업 필요`, `Storage about ${storagePercent}% full · Back up your work`)
    : preparationIssue === "error"
      ? bt("오프라인 도구 준비 실패 · 다시 확인", "Offline tools could not be prepared · Check again")
      : preparationIssue === "partial"
        ? bt("일부 오프라인 도구 준비 필요", "Some offline tools still need preparation") : null;
  const summary = storageWarning ? "저장 공간 부족 · 백업 권장" : importantSummary ?? (connectivity.mode === "offline"
    ? ready ? "오프라인 모드 · 로컬 작업 중" : "오프라인 모드 · 준비된 기능만 사용"
    : connectivity.mode === "server-unavailable"
      ? "서버 장애 · 로컬 작업 중"
      : connectivity.mode === "reconnecting"
        ? creatorSub2StatusText("studio.creatorSub2.status.offline.panel.summaryReconnecting", "서버 연결 확인 중")
        : device?.navigationFallback
          ? "저장된 스튜디오 · 로컬 작업 중"
          : storageWarning
            ? "저장 공간 부족 · 백업 권장"
            : "스튜디오 연결 상태");

  if (!shouldShowPanel && !editor) return null;

  const content = (
    <div className={editor ? "mt-2 space-y-3 leading-relaxed" : "mt-2 max-h-[60dvh] space-y-3 overflow-y-auto overscroll-contain leading-relaxed"}>
      <p>
        {connectivity.localOnly
          ? bt("드로잉·레이어 편집·기기 자동 저장·파일 내보내기는 이 화면에서 계속 사용할 수 있습니다. 서버 원고 불러오기·클라우드 저장·협업·게시·온라인 AI는 연결 복구 전 일시 중지됩니다.", "Drawing, layers, device autosave and file export remain available here. Loading server manuscripts, cloud saves, collaboration, publishing and online AI pause until the connection returns.")
          : bt("연결이 끊기거나 서버가 응답하지 않아도 준비된 편집 도구와 이 기기 저장을 계속 사용할 수 있습니다.", "Prepared editing tools and device saving remain available if the connection drops or the server stops responding.")}
      </p>
      {device?.navigationFallback ? (
        <p>{bt("서버 응답 대신 이 기기에 저장된 스튜디오 화면으로 열었습니다. 원고의 기기 저장 완료 여부는 저장 상태에서 확인해 주세요.", "Studio opened from this device because the server did not respond. Check the save status to confirm manuscript saving.")}</p>
      ) : null}
      <p role={editor ? undefined : "status"} aria-live={editor ? undefined : "polite"} aria-atomic={editor ? undefined : true}>{message}</p>
      <p className="text-fg-2">
        {device?.persisted === true ? bt("기기 보관 유지 허용", "Device-storage retention allowed") : bt("작업 파일 백업 권장", "Keep a work-file backup")}
        {storagePercent !== null ? bt(` · 저장 공간 약 ${storagePercent}% 사용`, ` · Storage about ${storagePercent}% full`) : ""}
      </p>
      {storageWarning ? (
        <p role={editor ? undefined : "alert"}>{bt("저장 공간이 부족합니다. 원고를 파일로 백업하고 저장 상태를 확인해 주세요.", "Device storage is nearly full. Back up the manuscript as a file and check its save status.")}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { void prepare(); }}
          disabled={busy || !device?.controlled || !device.supported || !connectivity.browserOnline}
          className="min-h-11 rounded-lg border border-line px-3 font-semibold disabled:opacity-50" aria-busy={busy}>
          {busy ? creatorSub2StatusText("studio.creatorSub2.status.offline.panel.checking", "확인 중…") : ready ? creatorSub2StatusText("studio.creatorSub2.status.offline.panel.retryReady", "오프라인 준비 다시 확인") : creatorSub2StatusText("studio.creatorSub2.status.offline.panel.retry", "오프라인 준비 다시 시도")}
        </button>
        <button type="button" onClick={() => { void persist(); }} disabled={busy || !device?.supported}
          className="min-h-11 rounded-lg border border-line px-3 disabled:opacity-50">
          {bt("기기 보관 유지 요청", "Request device-storage retention")}
        </button>
      </div>
      {dataSaverEnabled() && !ready ? (
        <p>{bt("데이터 절약 모드가 켜져 있어 대용량 자동 준비를 건너뛰었습니다. 필요할 때 위 버튼으로 직접 준비할 수 있습니다.", "Data saver is on, so large automatic preparation was skipped. Use the button above when you need it.")}</p>
      ) : null}
      {device && !device.controlled ? (
        <p>{bt("온라인에서 스튜디오를 한 번 열고 오프라인 도구 준비가 시작될 때까지 연결을 유지해 주세요. 편집과 이 기기 저장은 지원되는 범위에서 계속 쓸 수 있습니다.", "Open Studio while online and stay connected until offline-tool preparation starts. Supported editing and device saving remain available.")}</p>
      ) : null}
      <p className="text-fg-2">
        {bt("오프라인 도구 준비는 원고 저장과 별개입니다. 이 기기에 원고가 저장됐는지와 서버에 반영됐는지는 저장 상태에서 각각 확인해 주세요.", "Offline-tool preparation is separate from manuscript saving. Check the save status separately for device saving and server updates.")}
      </p>
      {technicalDetail ? <details className="rounded-lg border border-line px-3">
        <summary className="min-h-11 cursor-pointer content-center font-medium">{bt("문제 세부 정보", "Problem details")}</summary>
        <pre className="mb-3 whitespace-pre-wrap break-words font-sans text-xs text-fg-2">{technicalDetail}</pre>
      </details> : null}
    </div>
  );

  const manualNotice = <span role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-studio-offline-manual-result="true">{manualResult}</span>;
  if (editor) return <>
    {/* 네이티브 대화상자가 열리면 배경은 inert이므로, 같은 알림을 활성 대화상자 안으로 옮긴다. */}
    {modalStatusHost ? createPortal(manualNotice, modalStatusHost) : manualNotice}
    {createPortal(<section aria-label={bt("연결 없이 작업할 준비", "Prepare to work without a connection")}
      className="mt-3 border-t border-line pt-3 text-xs text-fg" data-studio-offline-panel="true"
      data-studio-offline-presentation="status-center" data-studio-local-only={connectivity.localOnly ? "true" : "false"}>
      <h3 className="font-semibold">{bt("연결 없이 작업할 준비", "Prepare to work without a connection")}</h3>{content}
    </section>, editor.element)}
    {importantSummary ? createPortal(<span data-studio-offline-important="true" className="text-warn"
      role={preparationIssue === "partial" && !storageWarning ? "status" : "alert"}>{importantSummary}</span>, modalStatusHost ?? editor.summary) : null}
  </>;

  return (
    <aside
      className="fixed bottom-[max(calc(var(--studio-canvas-bottom-inset,7rem)+7.5rem),calc(var(--studio-mobile-dock-measured-height,0px)+0.75rem))] right-3 z-40 max-w-[min(25rem,calc(100vw-1.5rem))]"
      aria-label="스튜디오 연결 및 오프라인 작업 안내"
      data-studio-shell-floating-target="offline-readiness"
      data-studio-shell-force-visible="true"
    >
      <details
        className="rounded-xl border border-line bg-panel p-3 text-xs text-fg shadow-lg"
        data-studio-offline-panel="true"
        data-studio-local-only={connectivity.localOnly ? "true" : "false"}
      >
        <summary className="min-h-11 cursor-pointer content-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {summary}
        </summary>
        {content}
      </details>
    </aside>
  );
}
