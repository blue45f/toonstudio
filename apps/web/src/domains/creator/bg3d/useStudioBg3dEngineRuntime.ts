/**
 * Owns the background editor's interactive engine decision for one session.
 *
 * The hook is the only place that combines the persisted artist preference, the WebGPU adapter
 * probe, the embedding host, and this selection's runtime state, and it is the only place that
 * hands R3F an asynchronous renderer factory. Everything it
 * decides with is pure and separately tested; the hook itself owns effects, persistence, and the
 * canvas remount key.
 *
 * Switching backend remounts the R3F `Canvas`. A runtime failure instead marks the selected engine
 * failed and unmounts the canvas; only another explicit choice (or re-selecting WebGPU to retry)
 * can make a renderer eligible again. A renderer swap invalidates
 * every GPU resource in the tree, and the scene is rebuilt from the canonical SceneDocument, so a
 * remount is both cheaper and safer than trying to migrate live engine objects.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudioBg3dWebGpuModule } from "./useStudioBg3dWebGpuModule";
import { observeStudioBg3dWebGl2FirstFrame, type StudioBg3dFrameRenderer } from "./studio-bg3d-canvas-renderer-admission";

import { createStudioScene3dGpuDiagnostics, type StudioScene3dGpuDiagnostics } from "../scene3d/studio-scene3d-gpu-diagnostics";

import {
  EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES,
  latchStudioBg3dWebglOnlyFeatures,
  normalizeStudioBg3dEnginePreference,
  resolveStudioBg3dEngineRuntime,
  type StudioBg3dEngineBackend,
  type StudioBg3dEnginePreference,
  type StudioBg3dEngineSelectionPlan,
  type StudioBg3dEngineWebglOnlyFeatures,
} from "./studio-bg3d-engine-selection";
import { classifyStudioBg3dInAppBrowser } from "./studio-bg3d-inapp-browser";
import { probeStudioBg3dWebGpuCapability } from "./studio-bg3d-webgpu-capability";
import {
  probeStudioBg3dWebGl2Capability,
  type StudioBg3dWebGl2ProbeResult,
} from "./studio-bg3d-webgl2-capability";

import type { StudioBg3dDeviceProfile } from "./studio-bg3d-device-quality";
import type { StudioBg3dInAppBrowserProfile } from "./studio-bg3d-inapp-browser";
import type { createStudioBg3dThreeWebGpuRenderer } from "./studio-bg3d-three-webgpu-renderer";
import type { StudioBg3dWebGpuProbeResult } from "./studio-bg3d-webgpu-capability";
// Type-only: erased at runtime, so the WebGPU renderer graph stays behind its dynamic import.

/** Renderer factory shape R3F accepts for its `gl` prop. */
export type StudioBg3dRendererFactory = (
  props: { readonly canvas: HTMLCanvasElement },
) => Promise<{ render: (scene: never, camera: never) => unknown }>;

export type StudioBg3dEngineRuntimePhase = "probing" | "ready";

/**
 * Preference storage must not hold the editor behind a blank probing viewport. OPFS/SQLite can be
 * temporarily busy in another tab or while the browser restores its storage process, so the
 * current session continues with the explicit WebGPU default after this deadline. A late storage
 * result is ignored to avoid remounting the renderer after the artist has started working.
 */
export const STUDIO_BG3D_ENGINE_PREFERENCE_LOAD_TIMEOUT_MS = 2_000;

function webGpuStartupFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return "WebGPU 엔진을 시작하지 못했습니다";
  const code = "code" in error ? error.code : null;
  if (code === "backend-unavailable") return "선택한 WebGPU 백엔드를 사용할 수 없습니다";
  if (code === "invalid-canvas") return "WebGPU를 시작할 캔버스를 찾지 못했습니다";
  if (code === "version-contract-unsupported") return "현재 렌더러 버전은 WebGPU 전용 실행을 지원하지 않습니다";
  const detail = error.cause instanceof Error ? error.cause.message : error.message;
  const timeout = /^WebGPU renderer initialization timed out after (\d+)ms\.$/u.exec(detail);
  if (timeout) return `WebGPU 장치 초기화가 ${Number(timeout[1]) / 1000}초 안에 끝나지 않았습니다`;
  return `WebGPU 엔진을 시작하지 못했습니다 (${detail.replace(/\s+/gu, " ").slice(0, 200)})`;
}

type CanvasStage = "waiting-for-canvas" | "starting-device" | "waiting-for-frame" | "rendered";

export interface StudioBg3dEngineRuntimeState {
  readonly diagnostics: StudioScene3dGpuDiagnostics;
  readonly phase: StudioBg3dEngineRuntimePhase;
  readonly plan: StudioBg3dEngineSelectionPlan;
  readonly preference: StudioBg3dEnginePreference;
  readonly inApp: StudioBg3dInAppBrowserProfile;
  readonly probe: StudioBg3dWebGpuProbeResult;
  readonly webgl2Probe: StudioBg3dWebGl2ProbeResult;
  /**
   * Put this in the R3F `Canvas` key. It changes when the backend changes and when the artist
   * explicitly retries a failed WebGPU selection.
   */
  readonly canvasKey: string;
  readonly canvasStage: CanvasStage;
  /** Present only while the selected WebGPU backend is available and the editor is open. */
  readonly glFactory: StudioBg3dRendererFactory | null;
  readonly deviceLostMessage: string | null;
  setPreference(next: StudioBg3dEnginePreference, retryPending?: boolean): void;
  observeWebGl2Renderer(renderer: StudioBg3dFrameRenderer): void;
  reportRendererFailure(backend: StudioBg3dEngineBackend, cause?: string): void;
}

export interface UseStudioBg3dEngineRuntimeOptions {
  /** False while the editor is closed; probing is skipped so a closed editor never touches the GPU. */
  readonly enabled: boolean;
  readonly deviceProfile: StudioBg3dDeviceProfile;
  readonly antialias: boolean;
  readonly saveData?: boolean;
  readonly deviceMemoryGb?: number;
  /**
   * Features observed in this session that only the WebGL2 renderer can serve. Observations latch,
   * so a scene that adds and removes a VRM character does not rebuild the viewport twice.
   */
  readonly observedWebglOnlyFeatures?: Partial<StudioBg3dEngineWebglOnlyFeatures>;
  /** Test seam; production reads the browser. */
  readonly probe?: typeof probeStudioBg3dWebGpuCapability;
  readonly probeWebgl2?: typeof probeStudioBg3dWebGl2Capability;
  readonly loadPreference?: () => Promise<StudioBg3dEnginePreference>;
  /** Test seam and host override for the preference-storage response deadline. */
  readonly preferenceLoadTimeoutMs?: number;
  readonly savePreference?: (preference: StudioBg3dEnginePreference) => Promise<void>;
  readonly createWebGpuRenderer?: typeof createStudioBg3dThreeWebGpuRenderer;
}

const PENDING_PROBE: StudioBg3dWebGpuProbeResult = Object.freeze({
  supported: false,
  reason: "api-unavailable",
  computeSupported: false,
  timestampQuerySupported: false,
  limits: Object.freeze({}),
});

const UNPROBED_WEBGL2: StudioBg3dWebGl2ProbeResult = Object.freeze({
  supported: true,
  reason: "unprobed",
});

let sessionExplicitEnginePreference: StudioBg3dEnginePreference | null = null;

/** Test isolation only; clears the synchronous in-session preference mirror. */
export function resetStudioBg3dSessionEnginePreferenceForTests(): void {
  sessionExplicitEnginePreference = null;
}

async function loadPersistedPreference(): Promise<StudioBg3dEnginePreference> {
  if (sessionExplicitEnginePreference !== null) {
    return sessionExplicitEnginePreference;
  }
  const { acquireProductStudioUiPreferencesRepository } = await import(
    "../studio-ui-preferences-sqlite"
  );
  const repository = await acquireProductStudioUiPreferencesRepository();
  const loaded = normalizeStudioBg3dEnginePreference(await repository.loadBg3dEnginePreference());
  if (sessionExplicitEnginePreference === null) {
    sessionExplicitEnginePreference = loaded;
  }
  return sessionExplicitEnginePreference;
}

async function persistPreference(preference: StudioBg3dEnginePreference): Promise<void> {
  sessionExplicitEnginePreference = normalizeStudioBg3dEnginePreference(preference);
  const { acquireProductStudioUiPreferencesRepository } = await import(
    "../studio-ui-preferences-sqlite"
  );
  const repository = await acquireProductStudioUiPreferencesRepository();
  await repository.saveBg3dEnginePreference(sessionExplicitEnginePreference);
}

function loadPreferenceBeforeDeadline(
  loadPreference: () => Promise<StudioBg3dEnginePreference>,
  timeoutMs: number,
  fallbackPreference: StudioBg3dEnginePreference = "webgpu",
): Promise<StudioBg3dEnginePreference> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (preference: StudioBg3dEnginePreference) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(preference);
    };
    const timer = globalThis.setTimeout(() => finish(fallbackPreference), timeoutMs);
    void loadPreference().then(
      (preference) => finish(preference),
      () => finish(fallbackPreference),
    );
  });
}

function readHostSignals(): { userAgent?: string } {
  if (typeof navigator === "undefined") return {};
  return { userAgent: navigator.userAgent };
}

export function useStudioBg3dEngineRuntime(
  options: UseStudioBg3dEngineRuntimeOptions,
): StudioBg3dEngineRuntimeState {
  const {
    enabled,
    deviceProfile,
    antialias,
    saveData,
    deviceMemoryGb,
    observedWebglOnlyFeatures,
    probe: probeCapability = probeStudioBg3dWebGpuCapability,
    probeWebgl2 = probeStudioBg3dWebGl2Capability,
    loadPreference = loadPersistedPreference,
    preferenceLoadTimeoutMs = STUDIO_BG3D_ENGINE_PREFERENCE_LOAD_TIMEOUT_MS,
    savePreference = persistPreference,
    createWebGpuRenderer,
  } = options;
  const boundedPreferenceLoadTimeoutMs = Number.isFinite(preferenceLoadTimeoutMs)
    ? Math.min(10_000, Math.max(50, Math.floor(preferenceLoadTimeoutMs)))
    : STUDIO_BG3D_ENGINE_PREFERENCE_LOAD_TIMEOUT_MS;

  const usesDefaultPreferenceStore = options.loadPreference === undefined;
  const [preference, setPreferenceState] = useState<StudioBg3dEnginePreference>(() =>
    usesDefaultPreferenceStore ? (sessionExplicitEnginePreference ?? "webgpu") : "webgpu",
  );
  const [probe, setProbe] = useState<StudioBg3dWebGpuProbeResult>(PENDING_PROBE);
  const [webgl2Probe, setWebgl2Probe] = useState<StudioBg3dWebGl2ProbeResult>(UNPROBED_WEBGL2);
  const [phase, setPhase] = useState<StudioBg3dEngineRuntimePhase>("probing");
  const [webgpuRuntimeFailed, setWebgpuRuntimeFailed] = useState(false);
  const [webgl2RuntimeFailed, setWebgl2RuntimeFailed] = useState(false);
  const [webgpuRetryCount, setWebgpuRetryCount] = useState(0);
  const [deviceLostMessage, setDeviceLostMessage] = useState<string | null>(null);
  const [recoveryGeneration, setRecoveryGeneration] = useState(0);
  const [canvasProgress, setCanvasProgress] = useState<{
    canvas: HTMLCanvasElement;
    stage: Exclude<CanvasStage, "waiting-for-canvas">;
  } | null>(null);
  const [webglOnlyFeatures, setWebglOnlyFeatures] = useState<StudioBg3dEngineWebglOnlyFeatures>(
    EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES,
  );

  // Bumped by every explicit choice. The bootstrap effect compares against it so a restored value
  // that was already in flight cannot overwrite a choice the artist made while it loaded.
  const preferenceRevisionRef = useRef(0);
  const preferenceRef = useRef<StudioBg3dEnginePreference>(preference);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => () => { activeCanvasRef.current = null; }, [enabled]);
  // Distinguishes a genuine closed→open transition from an effect re-run caused by unstable deps.
  const wasEnabledRef = useRef(false);

  const inApp = useMemo(() => classifyStudioBg3dInAppBrowser(readHostSignals()), []);

  // Read every field by name rather than forwarding the object. The caller rebuilds that object
  // each render, so passing it straight through would re-run this effect on every render; naming
  // the fields keeps the dependency on the values. The cost is that a field added to
  // `StudioBg3dEngineWebglOnlyFeatures` and not added here is silently never latched — which is
  // exactly what happened to `vrmCharacters`, so `studio-bg3d-engine-latch-wiring.test.ts` now
  // fails when the two lists drift apart.
  const observedWebxr = observedWebglOnlyFeatures?.webxr === true;
  const observedVrmCharacters = observedWebglOnlyFeatures?.vrmCharacters === true;
  useEffect(() => {
    setWebglOnlyFeatures((current) => latchStudioBg3dWebglOnlyFeatures(current, {
      webxr: observedWebxr,
      vrmCharacters: observedVrmCharacters,
    }));
  }, [observedWebxr, observedVrmCharacters]);
  // Apply the live observation immediately as well as persisting it in the latch effect. This
  // prevents one render of an otherwise-ready Canvas before a newly added VRM/WebXR requirement is
  // committed to state.
  const effectiveWebglOnlyFeatures = useMemo(
    () => latchStudioBg3dWebglOnlyFeatures(webglOnlyFeatures, {
      webxr: observedWebxr,
      vrmCharacters: observedVrmCharacters,
    }),
    [observedVrmCharacters, observedWebxr, webglOnlyFeatures],
  );

  useEffect(() => {
    if (!enabled) {
      wasEnabledRef.current = false;
      setPhase("probing");
      setCanvasProgress(null);
      return;
    }
    // Reopening a retained editor runs this again. Without resetting the phase the engine controls
    // stay live while the restored preference and a fresh probe are still in flight.
    //
    // Only an actual closed→open transition resets it. Callers may pass fresh callback identities
    // each render, which re-runs this effect; resetting on every run would flip the phase back to
    // probing right after it reached ready, then render, re-run and flip again without end.
    const reopened = !wasEnabledRef.current;
    wasEnabledRef.current = true;
    if (reopened) {
      setPhase("probing");
      setWebgpuRuntimeFailed(false);
      setWebgl2RuntimeFailed(false);
      setDeviceLostMessage(null);
      setWebgl2Probe(probeWebgl2());
    }

    let cancelled = false;
    let preferenceRestored = false;
    let latestProbe: StudioBg3dWebGpuProbeResult | undefined;
    const controller = new AbortController();
    const revisionAtStart = preferenceRevisionRef.current;
    void (async () => {
      const restoredPromise = loadPreferenceBeforeDeadline(
        loadPreference,
        boundedPreferenceLoadTimeoutMs,
        loadPreference === loadPersistedPreference
          ? (sessionExplicitEnginePreference ?? "webgpu")
          : "webgpu",
      );
      const probePromise = probeCapability({
        secureContext: typeof window !== "undefined" && window.isSecureContext === true,
        gpu: (navigator as Navigator & { gpu?: Parameters<typeof probeCapability>[0]["gpu"] }).gpu,
        signal: controller.signal,
        onLateResult: (result) => {
          if (cancelled) return;
          latestProbe = result;
          // A cold GPU request can outlive the UI deadline. Admit its real result without another
          // request, but never race ahead of the saved preference or revive a closed/old session.
          if (preferenceRestored) {
            setProbe(result);
            setPhase("ready");
          }
        },
      }).catch(() => PENDING_PROBE);
      const restored = await restoredPromise;
      if (cancelled) return;
      // A choice made while this was loading is newer than what storage returned. Applying the
      // restored value then would remount onto a backend the artist did not ask for and leave the
      // panel disagreeing with the preference it just saved.
      if (preferenceRevisionRef.current === revisionAtStart) {
        const normalized = normalizeStudioBg3dEnginePreference(restored);
        preferenceRef.current = normalized;
        setPreferenceState(normalized);
      }
      preferenceRestored = true;
      // WebGL2 is an independent explicit engine. It does not wait for a WebGPU adapter probe that
      // is irrelevant to its renderer; the probe may finish later for diagnostics and future choice.
      if (preferenceRef.current === "webgl2") {
        setWebgl2Probe(probeWebgl2());
        setPhase("ready");
      }

      const probed = await probePromise;
      if (cancelled) return;
      // Slow storage may resolve after the late adapter. Do not overwrite newer capability
      // evidence with the earlier timeout result when this bootstrap continuation resumes.
      setProbe(latestProbe ?? probed);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [boundedPreferenceLoadTimeoutMs, enabled, loadPreference, probeCapability, probeWebgl2, webgpuRetryCount]);

  const plan = useMemo(
    () => resolveStudioBg3dEngineRuntime({
      preference,
      probe,
      inApp,
      deviceProfile,
      // The renderer module is a dynamic import that is present in every build that ships this
      // hook; a host without WebGPU is already refused by the probe.
      webgpuRuntimeAvailable: true,
      saveData,
      deviceMemoryGb,
      webgpuRuntimeFailed,
      webgl2Supported: webgl2Probe.supported,
      webgl2RuntimeFailed,
      webglOnlyFeatures: effectiveWebglOnlyFeatures,
    }),
    [
      preference,
      probe,
      inApp,
      deviceProfile,
      saveData,
      deviceMemoryGb,
      webgpuRuntimeFailed,
      webgl2Probe.supported,
      webgl2RuntimeFailed,
      effectiveWebglOnlyFeatures,
    ],
  );

  const setPreference = useCallback((next: StudioBg3dEnginePreference, retryPending = false) => {
    preferenceRevisionRef.current += 1;
    const normalized = normalizeStudioBg3dEnginePreference(next);
    const retriesFailedWebGpu = normalized === "webgpu" && normalized === preference
      && (webgpuRuntimeFailed || !probe.supported);
    const retriesWebGl2 = normalized === "webgl2" && normalized === preference
      && (webgl2RuntimeFailed || !webgl2Probe.supported || (retryPending && canvasProgress?.stage !== "rendered"));
    setPreferenceState(normalized);
    preferenceRef.current = normalized;
    if (normalized !== preference || retriesFailedWebGpu || retriesWebGl2) {
      activeCanvasRef.current = null;
      setCanvasProgress(null);
    }
    if (enabled && normalized === "webgl2") {
      setWebgl2Probe(probeWebgl2());
      setPhase("ready");
    }
    if (enabled && normalized === "webgpu" && normalized === preference && !probe.supported) {
      setPhase("probing");
      setWebgpuRetryCount((count) => count + 1);
    }
    setDeviceLostMessage(null);
    setWebgpuRuntimeFailed(false);
    setWebgl2RuntimeFailed(false);
    if (retriesFailedWebGpu || retriesWebGl2) {
      setRecoveryGeneration((generation) => generation + 1);
    }
    void savePreference(normalized).catch(() => undefined);
  }, [
    enabled,
    canvasProgress?.stage,
    preference,
    probe.supported,
    probeWebgl2,
    savePreference,
    webgl2Probe.supported,
    webgl2RuntimeFailed,
    webgpuRuntimeFailed,
  ]);

  const handleWebGpuFailure = useCallback((cause: string) => {
    const detail = cause.trim().replace(/[.\s]+$/u, "");
    setWebgpuRuntimeFailed(true);
    setDeviceLostMessage((first) => first ?? (
      `${detail || "WebGPU 엔진 오류가 발생했습니다"}. `
      + "WebGPU 실행을 중단했습니다. 다시 선택하거나 WebGL2를 직접 선택해 주세요."
    ));
  }, []);

  const handleWebGl2Failure = useCallback((cause: string) => {
    const detail = cause.trim().replace(/[.\s]+$/u, "");
    setWebgl2RuntimeFailed(true);
    setDeviceLostMessage(
      `${detail || "WebGL2 렌더러를 시작하지 못했습니다"}. `
      + "WebGL2 실행을 중단했습니다. 다시 시도하거나 2D 원고로 복귀해 주세요.",
    );
  }, []);

  const reportRendererFailure = useCallback((backend: StudioBg3dEngineBackend, cause = "") => {
    if (backend === "webgpu") {
      handleWebGpuFailure(cause);
      return;
    }
    handleWebGl2Failure(cause);
  }, [handleWebGl2Failure, handleWebGpuFailure]);

  const diagnostics = useMemo(() => createStudioScene3dGpuDiagnostics(), []);

  const observeWebGl2Renderer = useCallback((renderer: StudioBg3dFrameRenderer) => {
    const canvas = renderer.domElement;
    if (activeCanvasRef.current === canvas || preferenceRef.current !== "webgl2") return;
    activeCanvasRef.current = canvas;
    setCanvasProgress({ canvas, stage: "waiting-for-frame" });
    observeStudioBg3dWebGl2FirstFrame(renderer, () => {
      if (activeCanvasRef.current === canvas && canvas.isConnected) setCanvasProgress({ canvas, stage: "rendered" });
    });
  }, []);

  const createRenderer = useStudioBg3dWebGpuModule(
    enabled && phase === "ready" && plan.backend === "webgpu" && plan.status === "available",
    createWebGpuRenderer,
    handleWebGpuFailure,
  );
  const glFactory = useMemo<StudioBg3dRendererFactory | null>(() => {
    if (!createRenderer) return null;
    return async ({ canvas }) => {
      activeCanvasRef.current = canvas;
      const startedInDocument = canvas.isConnected;
      const isCurrent = () => activeCanvasRef.current === canvas
        && preferenceRef.current === "webgpu" && (!startedInDocument || canvas.isConnected);
      const markFrame = () => {
        if (isCurrent()) setCanvasProgress({ canvas, stage: "rendered" });
      };
      if (isCurrent()) setCanvasProgress((current) => current?.canvas === canvas
        ? current : { canvas, stage: "starting-device" });
      try {
        const runtime = await createRenderer(canvas, {
          antialias,
          alpha: true,
          admission: probe,
          onDeviceLost: (loss) => { if (isCurrent()) handleWebGpuFailure(loss.message); },
          onRenderError: (message) => { if (isCurrent()) handleWebGpuFailure(message); },
          onFirstSceneFrame: markFrame,
        });
        if (isCurrent()) setCanvasProgress((current) =>
          current?.canvas === canvas && current.stage !== "starting-device"
            ? current : { canvas, stage: "waiting-for-frame" });
        return runtime.renderer as unknown as { render: (scene: never, camera: never) => unknown };
      } catch (error) {
        if (isCurrent()) handleWebGpuFailure(webGpuStartupFailureReason(error));
        throw error;
      }
    };
  }, [createRenderer, probe, antialias, handleWebGpuFailure]);

  return {
    diagnostics,
    phase,
    plan,
    preference,
    inApp,
    probe,
    webgl2Probe,
    canvasKey: `${plan.backend}#${recoveryGeneration}`,
    canvasStage: canvasProgress?.stage ?? "waiting-for-canvas",
    glFactory,
    deviceLostMessage,
    setPreference,
    observeWebGl2Renderer,
    reportRendererFailure,
  };
}
