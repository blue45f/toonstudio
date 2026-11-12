/**
 * PackagePanel: 캐릭터 소스 고르기(모듈식 키트 · 제작 패키지 · 절차 소스) UI.
 *
 * - 모듈식 키트(기본 소스): 베이스(여성/남성) 선택, 키트 다시 불러오기, 출처·라이선스(provenance), 제공 파츠 표.
 * - 제작 패키지 레인: index.json → 목록 → 선택 → manifest·slot-mapping·GLB 검증 → reloadSource → source/set.
 *   엔진 reloadSource가 실패하면 applyLoop?.retrySource()로 기존 캐릭터 리그를 복구해 뷰포트 증발을 막는다.
 * - 미저장 변경 보호: 포즈·외형 편집이나 페인트 서브레이어가 미저장인 상태에서 다른 모델로 전환할 때 확인 안내를 표시한다.
 */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import {
  ALL_AVAILABLE_CAPABILITIES,
  CHARACTER_SLOT_KINDS,
  KIT_BASE_IDS,
  KIT_CURRENT_VERSION,
  KIT_DEFAULT_ID,
  KIT_PART_SLOTS,
  SLOT_LABELS_KO,
  failVisible,
  isLabFailure,
} from "../../../contracts";
import { deriveKitCapabilities } from "../../../domains/authored/kit-capability";
import { parseVrmFromGlb } from "../../../domains/authored/vrm-extension-parser";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { presetUnavailableReasonKo } from "../../../state/apply-plan";
import { useApplyLoop, useApplyPlan, useCatalog, useDispatch, useKitPlans, useLabContext, useLabState, useUiActions } from "../lab-store-context";
import { describeUnsavedWorkKo, evaluateUnsavedCharacterWork } from "../unsaved-work";

import { KIT_BASE_LABELS_KO, KitPartsTable, KitProvenance, PackageUnsavedGuard } from "./package-panel/KitProvenanceView";
import { PackageDetail, shortSha } from "./package-panel/PackageDetail";

import type { PackageReadyState } from "./package-panel/PackageDetail";
import type { KitBaseId, KitManifest, LabFailure, RecipeSource } from "../../../contracts";
import type { AuthoredIndexEntry } from "../../../domains/authored/package-index";
import type { AuthoredPackageLoadResult, PackageIndexLoadResult } from "../../../domains/authored/package-load-flow";
import type { PaintSession } from "../../../paint/paint-session";
import type { KitPlanRegistry, KitRecipeSource } from "../kit-plan-registry";

export interface PackagePanelLoader {
  loadIndex(): Promise<PackageIndexLoadResult>;
  loadPackage(entry: AuthoredIndexEntry, options: { readonly preferredLod?: number }): Promise<AuthoredPackageLoadResult>;
}

/** 브라우저 기본 로더: 두 *.browser 모듈을 지연 import한다(별도 청크). */
export const browserPackageLoader: PackagePanelLoader = {
  loadIndex: () => import("../../../domains/authored/package-index.browser").then((module) => module.loadCharacterPackageIndex()),
  loadPackage: (entry, options) => import("../../../domains/authored/package-loader.browser").then((module) => module.loadAuthoredPackage(entry, options)),
};

export interface PackagePanelProps {
  readonly loader?: PackagePanelLoader;
  readonly autoLoadIndex?: boolean;
  readonly autoLoadKit?: boolean;
  readonly preferredLod?: number;
  readonly now?: () => number;
  readonly session?: PaintSession;
}

type KitFetchState = { readonly phase: "idle" } | { readonly phase: "loading" } | { readonly phase: "failed"; readonly failure: LabFailure };
type KitFetchOutcome = { readonly ok: true; readonly manifest: KitManifest } | { readonly ok: false; readonly failure: LabFailure };

type PendingSourceSwitchTarget =
  | { readonly kind: "base"; readonly baseId: KitBaseId; readonly targetLabelKo: string }
  | { readonly kind: "procedural"; readonly targetLabelKo: string }
  | { readonly kind: "package"; readonly entry: AuthoredIndexEntry; readonly targetLabelKo: string };

interface PendingSourceSwitch {
  readonly target: PendingSourceSwitchTarget;
  readonly reasonKo: string;
}

const DEFAULT_KIT_LOOKUP: KitRecipeSource = { kind: "kit", kitId: KIT_DEFAULT_ID, kitVersion: KIT_CURRENT_VERSION, baseId: "female" };
const noopSubscribe = (): (() => void) => () => undefined;

function useKitManifest(kitPlans: KitPlanRegistry | null, source: KitRecipeSource): KitManifest | undefined {
  const subscribe = useCallback((listener: () => void) => (kitPlans ? kitPlans.subscribe(listener) : noopSubscribe()), [kitPlans]);
  const getSnapshot = useCallback(() => kitPlans?.peek(source), [kitPlans, source]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function isKitFailure(failure: LabFailure): boolean {
  return failure.code.startsWith("kit-") || failure.code === "source-build-failed";
}

function describeSourceKo(source: RecipeSource): string {
  switch (source.kind) {
    case "kit":
      return `모듈식 키트 ${source.kitId} v${source.kitVersion} (${KIT_BASE_LABELS_KO[source.baseId]} 베이스)`;
    case "package":
      return `제작 패키지 ${source.characterId} (SHA ${shortSha(source.sha256)})`;
    case "procedural":
      return "절차적 휴머노이드(키트가 아닌 대체 소스)";
    default: {
      const exhaustive: never = source;
      return String((exhaustive as { kind?: unknown }).kind);
    }
  }
}

type IndexState =
  | { readonly phase: "idle" }
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly entries: readonly AuthoredIndexEntry[] }
  | { readonly phase: "failed"; readonly failure: LabFailure };

type PackageState =
  | { readonly phase: "loading"; readonly step: string }
  | PackageReadyState
  | { readonly phase: "failed"; readonly failure: LabFailure };

function describeFailure(failure: LabFailure): string {
  return `${failure.reasonKo} (${failure.code})`;
}

export function PackagePanel({
  loader = browserPackageLoader,
  autoLoadIndex = true,
  autoLoadKit = true,
  preferredLod = 0,
  now = () => Date.now(),
  session = getDefaultPaintSession(),
}: PackagePanelProps) {
  const state = useLabState();
  const dispatch = useDispatch();
  const { setInspectorTab } = useUiActions();
  const { store, packagePlans, engineSession } = useLabContext();
  const kitPlans = useKitPlans();
  const applyLoop = useApplyLoop();
  const catalog = useCatalog();
  useApplyPlan();
  evaluateUnsavedCharacterWork(store, state, session);

  const ids = useId();
  const [index, setIndex] = useState<IndexState>({ phase: "idle" });
  const [packages, setPackages] = useState<Readonly<Record<string, PackageState>>>({});
  const [kitFetch, setKitFetch] = useState<KitFetchState>({ phase: "idle" });
  const [kitNotice, setKitNotice] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSourceSwitch | null>(null);
  const [kitFailuresHiddenBefore, setKitFailuresHiddenBefore] = useState(0);
  const mounted = useRef(true);
  const indexRequested = useRef(false);
  const indexBusyRef = useRef(false);
  const inFlightPackageIdRef = useRef<string | null>(null);
  const inFlightBaseIdRef = useRef<KitBaseId | null>(null);
  const kitRequested = useRef<string | null>(null);
  const kitFetchSeq = useRef(0);
  const sourceOpSeq = useRef(0);
  const lastIndexFailureRef = useRef<LabFailure | null>(null);
  const lastPackageFailuresRef = useRef<Record<string, LabFailure>>({});

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sourceOpSeq.current += 1;
      indexBusyRef.current = false;
      inFlightPackageIdRef.current = null;
      inFlightBaseIdRef.current = null;
    };
  }, []);

  const fetchKit = useCallback(
    async (request: KitRecipeSource): Promise<KitFetchOutcome> => {
      if (kitPlans === null) {
        const failure = failVisible("kit-loader-unavailable", "모듈식 키트 등록소가 조립되지 않아 kit.json을 불러올 수 없습니다. 절차 소스로 대체하지 않습니다.", undefined, now());
        setKitFetch({ phase: "failed", failure });
        return { ok: false, failure };
      }
      kitFetchSeq.current += 1;
      const seq = kitFetchSeq.current;
      setKitFetch({ phase: "loading" });
      let outcome: KitFetchOutcome;
      try {
        outcome = { ok: true, manifest: await kitPlans.ensure(request) };
      } catch (error) {
        outcome = { ok: false, failure: isLabFailure(error) ? error : failVisible("kit-manifest-fetch-failed", "키트 manifest(kit.json)를 불러오는 중 예기치 않은 오류가 났습니다.", error, now()) };
      }
      if (mounted.current && seq === kitFetchSeq.current) setKitFetch(outcome.ok ? { phase: "idle" } : { phase: "failed", failure: outcome.failure });
      return outcome;
    },
    [kitPlans, now],
  );

  const kitSource = state.recipe.source.kind === "kit" ? state.recipe.source : null;
  const kitId = kitSource?.kitId ?? null;
  const kitVersion = kitSource?.kitVersion ?? null;
  const kitPin = kitSource?.manifestSha256;
  const manifest = useKitManifest(kitPlans, kitSource ?? DEFAULT_KIT_LOOKUP);

  useEffect(() => {
    if (!autoLoadKit || kitSource === null || kitId === null || kitVersion === null) return;
    const key = `${kitId}@${kitVersion}#${kitPin ?? "-"}`;
    if (kitRequested.current === key) return;
    kitRequested.current = key;
    void fetchKit(kitSource);
  }, [autoLoadKit, fetchKit, kitId, kitPin, kitSource, kitVersion]);

  const reportFailure = useCallback((failure: LabFailure): void => store.applyEvent({ type: "failure", failure }), [store]);
  const dismissFailure = useCallback(
    (failure: LabFailure | null | undefined): void => {
      if (failure) store.applyEvent({ type: "failure/dismiss", failure });
    },
    [store],
  );

  const clearLoadingPackages = useCallback((excludeId?: string): void => {
    if (!mounted.current) return;
    setPackages((previous) => {
      let changed = false;
      const next: Record<string, PackageState> = {};
      for (const [key, val] of Object.entries(previous)) {
        if (val.phase === "loading" && key !== excludeId) {
          changed = true;
          continue;
        }
        next[key] = val;
      }
      return changed ? next : previous;
    });
  }, []);

  const loadIndex = useCallback(async (): Promise<void> => {
    if (indexBusyRef.current) return;
    indexBusyRef.current = true;
    setIndex({ phase: "loading" });
    let result: PackageIndexLoadResult;
    try {
      result = await loader.loadIndex();
    } catch (error) {
      result = { ok: false, failure: isLabFailure(error) ? error : failVisible("package-index-fetch-failed", "index.json을 불러오지 못했습니다.", error, now()) };
    } finally {
      indexBusyRef.current = false;
    }
    if (!mounted.current) return;
    if (result.ok) {
      if (lastIndexFailureRef.current) {
        dismissFailure(lastIndexFailureRef.current);
        lastIndexFailureRef.current = null;
      }
      setIndex({ phase: "ready", entries: result.entries });
    } else {
      lastIndexFailureRef.current = result.failure;
      setIndex({ phase: "failed", failure: result.failure });
      reportFailure(result.failure);
    }
  }, [dismissFailure, loader, now, reportFailure]);

  useEffect(() => {
    if (!autoLoadIndex || indexRequested.current) return;
    indexRequested.current = true;
    void loadIndex();
  }, [autoLoadIndex, loadIndex]);

  const setPackage = useCallback((characterId: string, next: PackageState): void => {
    if (!mounted.current) return;
    setPackages((previous) => ({ ...previous, [characterId]: next }));
  }, []);

  const loadPackage = useCallback(
    async (entry: AuthoredIndexEntry): Promise<void> => {
      const id = entry.characterId;
      if (inFlightPackageIdRef.current === id) return;
      inFlightPackageIdRef.current = id;
      inFlightBaseIdRef.current = null;
      sourceOpSeq.current += 1;
      const op = sourceOpSeq.current;
      clearLoadingPackages(id);
      setPackage(id, { phase: "loading", step: "manifest·slot-mapping·GLB 받는 중" });
      try {
        let result: AuthoredPackageLoadResult;
        try {
          result = await loader.loadPackage(entry, { preferredLod });
        } catch (error) {
          result = { ok: false, failure: isLabFailure(error) ? error : failVisible("package-load-failed", `제작 패키지 '${id}' 로드에 실패했습니다.`, error, now()) };
        }
        if (!mounted.current || sourceOpSeq.current !== op) return;
        if (!result.ok) {
          lastPackageFailuresRef.current[id] = result.failure;
          setPackage(id, { phase: "failed", failure: result.failure });
          reportFailure(result.failure);
          return;
        }
        const parsedVrm = parseVrmFromGlb(result.detail.glbBytes);
        const vrm = parsedVrm.ok ? parsedVrm.info : null;
        const vrmNoteKo = parsedVrm.ok ? (parsedVrm.info ? "" : "GLB에 VRM 확장 없음(humanoid·표정 bind는 manifest.json이 담당)") : `GLB JSON 청크를 읽지 못함: ${parsedVrm.reasonKo}`;

        setPackage(id, { phase: "loading", step: "플랜 등록·엔진 적용" });
        let capabilities = result.plan.capabilities;
        let applied: "engine" | "registry" = "registry";
        if (engineSession.engine()) {
          try {
            const reloaded = await engineSession.reloadSource({ kind: "package", plan: result.plan });
            if (reloaded) {
              capabilities = reloaded.capabilities;
              applied = "engine";
            }
          } catch (error) {
            if (!mounted.current || sourceOpSeq.current !== op) return;
            applyLoop?.retrySource();
            const failure = isLabFailure(error) ? error : failVisible("package-engine-load-failed", `엔진이 제작 패키지 '${id}' GLB를 올리지 못했습니다.`, error, now());
            lastPackageFailuresRef.current[id] = failure;
            setPackage(id, { phase: "failed", failure });
            reportFailure(failure);
            return;
          }
        }
        if (!mounted.current || sourceOpSeq.current !== op) return;
        packagePlans.register(result.plan);
        if (lastPackageFailuresRef.current[id]) {
          dismissFailure(lastPackageFailuresRef.current[id]);
          delete lastPackageFailuresRef.current[id];
        }
        dispatch({ type: "source/set", source: { kind: "package", characterId: result.plan.manifest.characterId, sha256: result.plan.glbSha256 }, capabilities });
        setPackage(id, { phase: "ready", result, vrm, vrmNoteKo, applied });
      } finally {
        if (inFlightPackageIdRef.current === id) inFlightPackageIdRef.current = null;
      }
    },
    [applyLoop, clearLoadingPackages, dismissFailure, dispatch, engineSession, loader, now, packagePlans, preferredLod, reportFailure, setPackage],
  );

  const backToProcedural = useCallback((): void => {
    inFlightPackageIdRef.current = null;
    inFlightBaseIdRef.current = null;
    sourceOpSeq.current += 1;
    clearLoadingPackages();
    setKitNotice(null);
    setKitFailuresHiddenBefore(now());
    dispatch({ type: "source/set", source: { kind: "procedural" }, capabilities: ALL_AVAILABLE_CAPABILITIES });
  }, [clearLoadingPackages, dispatch, now]);

  const pickBase = useCallback(
    async (baseId: KitBaseId): Promise<void> => {
      if (inFlightBaseIdRef.current === baseId) return;
      inFlightBaseIdRef.current = baseId;
      inFlightPackageIdRef.current = null;
      sourceOpSeq.current += 1;
      const op = sourceOpSeq.current;
      clearLoadingPackages();
      setKitNotice(null);
      try {
        const initialRecipe = store.getState().recipe;
        const current = initialRecipe.source;
        const request: KitRecipeSource = current.kind === "kit" ? { ...current, baseId } : { ...DEFAULT_KIT_LOOKUP, baseId };
        let picked: KitManifest | undefined = kitPlans?.peek(request);
        if (picked === undefined) {
          const loaded = await fetchKit(request);
          if (!mounted.current || sourceOpSeq.current !== op) return;
          if (!loaded.ok) {
            reportFailure(loaded.failure);
            return;
          }
          picked = loaded.manifest;
        }
        if (!mounted.current || sourceOpSeq.current !== op) return;
        if (picked.bases[baseId] === undefined) {
          reportFailure(failVisible("kit-base-missing", `키트에 ${KIT_BASE_LABELS_KO[baseId]} 베이스가 없습니다.`, undefined, now()));
          return;
        }
        const recipe = store.getState().recipe;
        const capabilities = deriveKitCapabilities(picked, baseId);
        const blocked: string[] = [];
        for (const slot of KIT_PART_SLOTS) {
          const presetId = recipe.slots[slot];
          if (presetId === null) continue;
          const capability = capabilities[slot];
          const reason = capability.status === "unavailable" ? (capability.reasonKo ?? "이 베이스가 제공하지 않습니다.") : presetUnavailableReasonKo(capability, presetId);
          if (reason !== null) blocked.push(`${SLOT_LABELS_KO[slot]} ${catalog.get(presetId)?.labelKo ?? presetId}: ${reason}`);
        }
        if (blocked.length > 0) {
          if (mounted.current) {
            setKitNotice(`${KIT_BASE_LABELS_KO[baseId]} 베이스로 바꾸지 못했습니다. 현재 선택을 이 베이스가 제공하지 않습니다 — ${blocked.join(" / ")}. 다른 프리셋을 먼저 고르세요(자동으로 바꾸지 않습니다).`);
          }
          return;
        }
        setKitFailuresHiddenBefore(now());
        dispatch({
          type: "source/set",
          source: { kind: "kit", kitId: picked.kitId, baseId, kitVersion: picked.kitVersion, ...(current.kind === "kit" && current.manifestSha256 !== undefined ? { manifestSha256: current.manifestSha256 } : {}) },
          capabilities,
        });
      } finally {
        if (inFlightBaseIdRef.current === baseId) inFlightBaseIdRef.current = null;
      }
    },
    [catalog, clearLoadingPackages, dispatch, fetchKit, kitPlans, now, reportFailure, store],
  );

  const executeSourceSwitch = useCallback(
    (target: PendingSourceSwitchTarget): void => {
      if (target.kind === "base") void pickBase(target.baseId);
      else if (target.kind === "procedural") backToProcedural();
      else void loadPackage(target.entry);
    },
    [backToProcedural, loadPackage, pickBase],
  );

  const requestSourceSwitch = useCallback(
    (target: PendingSourceSwitchTarget): void => {
      const currentState = store.getState();
      const currentSource = currentState.recipe.source;
      const isReloadingSamePackage =
        target.kind === "package" &&
        currentSource.kind === "package" &&
        currentSource.characterId === target.entry.characterId &&
        currentSource.sha256 === target.entry.glbSha256;
      if (!isReloadingSamePackage) {
        const summary = evaluateUnsavedCharacterWork(store, currentState, session);
        if (summary.hasUnsaved) {
          setPendingSwitch({ target, reasonKo: describeUnsavedWorkKo(summary) });
          return;
        }
      }
      setPendingSwitch(null);
      executeSourceSwitch(target);
    },
    [executeSourceSwitch, session, store],
  );

  const reloadKit = useCallback((): void => {
    setKitNotice(null);
    setKitFailuresHiddenBefore(now());
    kitPlans?.clear();
    applyLoop?.retrySource();
    const current = store.getState().recipe.source;
    if (current.kind === "kit") void fetchKit(current);
  }, [applyLoop, fetchKit, kitPlans, now, store]);

  const source = state.recipe.source;
  const registeredPackagePlan = source.kind === "package" ? packagePlans.get(source.characterId) : undefined;
  const activePackageState = source.kind === "package" ? packages[source.characterId] : undefined;
  const showUnloadedPackageNotice =
    source.kind === "package" &&
    activePackageState?.phase !== "loading" &&
    activePackageState?.phase !== "ready" &&
    (!registeredPackagePlan || registeredPackagePlan.glbSha256 !== source.sha256);
  const availableSlotCount = CHARACTER_SLOT_KINDS.filter((slot) => state.capabilities[slot].status === "available").length;
  const partialSlotCount = CHARACTER_SLOT_KINDS.filter((slot) => state.capabilities[slot].status === "partial").length;
  const unavailableSlotCount = CHARACTER_SLOT_KINDS.filter((slot) => state.capabilities[slot].status === "unavailable").length;
  const kitFailures = kitSource === null ? [] : state.failures.filter((failure) => isKitFailure(failure) && failure.at > kitFailuresHiddenBefore);
  const latestKitFailure = kitFailures.length > 0 ? kitFailures[kitFailures.length - 1] : undefined;
  const engineReady = state.engine.phase === "ready";
  const kitSettled = applyLoop !== null && applyLoop.settled();
  const shownKitFailure = latestKitFailure !== undefined && !kitSettled ? latestKitFailure : undefined;
  const panelKitFailure =
    kitFetch.phase === "failed" && kitSource !== null && !(shownKitFailure?.code === kitFetch.failure.code && shownKitFailure.reasonKo === kitFetch.failure.reasonKo) ? kitFetch.failure : undefined;
  const kitLoading = kitSource !== null && engineReady && applyLoop !== null && !kitSettled && shownKitFailure === undefined;

  return (
    <section className="cl-package-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>제작 패키지</h2>
      <p className="cl-package-source" role="status">
        현재 소스: {describeSourceKo(source)}
        {source.kind === "package" ? (
          <button
            type="button"
            className="cl-package-back"
            onClick={() => requestSourceSwitch({ kind: "procedural", targetLabelKo: "절차적 휴머노이드" })}
          >
            절차 소스로 돌아가기
          </button>
        ) : null}
      </p>
      {pendingSwitch ? (
        <PackageUnsavedGuard
          reasonKo={pendingSwitch.reasonKo}
          targetLabelKo={pendingSwitch.target.targetLabelKo}
          onSaveFirst={() => {
            setPendingSwitch(null);
            setInspectorTab("export");
          }}
          onConfirmSwitch={() => {
            const target = pendingSwitch.target;
            setPendingSwitch(null);
            executeSourceSwitch(target);
          }}
          onCancel={() => setPendingSwitch(null)}
        />
      ) : null}
      {showUnloadedPackageNotice && source.kind === "package" ? (
        <p className="cl-package-kit-notice cl-package-reason" role="note" data-testid="package-unloaded-source-notice">
          {registeredPackagePlan
            ? `현재 레시피의 제작 패키지 '${source.characterId}' SHA(${shortSha(source.sha256)})가 등록된 패키지(${shortSha(registeredPackagePlan.glbSha256)})와 다릅니다. 아래 목록에서 다시 불러오기를 실행하세요.`
            : `현재 레시피의 제작 패키지 '${source.characterId}'가 아직 로드되지 않았습니다. 아래 목록에서 불러오기를 눌러 스켈레톤·슬롯 능력을 활성화하거나 절차 소스로 전환하세요.`}
        </p>
      ) : null}
      <div className="cl-package-nav-actions" role="group" aria-label="포즈 및 소스 빠른 이동">
        <button type="button" className="cl-package-to-pose" data-testid="package-switch-to-pose-tab" onClick={() => setInspectorTab("pose")}>
          포즈 탭으로 이동
        </button>
        <button type="button" className="cl-package-to-export" data-testid="package-switch-to-export-tab" onClick={() => setInspectorTab("export")}>
          내보내기 탭으로 이동
        </button>
      </div>
      <details className="cl-package-advanced-diagnostics" data-testid="package-advanced-diagnostics">
        <summary className="cl-package-diagnostics-summary" data-testid="package-diagnostics-summary">
          고급 리그·슬롯 지원 요약 ({availableSlotCount}/{CHARACTER_SLOT_KINDS.length}개 활성)
        </summary>
        <div className="cl-package-diagnostics-body" data-testid="package-diagnostics-body">
          <p className="cl-package-hint">
            활성 슬롯 {availableSlotCount}개 · 부분 제한 {partialSlotCount}개 · 비활성 {unavailableSlotCount}개 · 포즈 리그({state.capabilities.pose.status}) · 손 리그({state.capabilities["hand-pose"].status})
          </p>
        </div>
      </details>
      <section className="cl-package-kit" aria-labelledby={`${ids}-kit-title`}>
        <h3 id={`${ids}-kit-title`}>모듈식 키트(기본 소스)</h3>
        <div className="cl-package-kit-bases" role="group" aria-label="키트 베이스">
          {KIT_BASE_IDS.map((baseId) => {
            const selected = source.kind === "kit" && source.baseId === baseId;
            const missing = manifest !== undefined && manifest.bases[baseId] === undefined;
            return (
              <button
                key={baseId}
                type="button"
                className={`cl-package-kit-base${selected ? " cl-package-kit-base--selected" : ""}`}
                aria-pressed={selected}
                disabled={selected || missing || kitFetch.phase === "loading"}
                title={missing ? "이 키트에는 해당 베이스가 없습니다." : undefined}
                data-base={baseId}
                onClick={() => requestSourceSwitch({ kind: "base", baseId, targetLabelKo: `${KIT_BASE_LABELS_KO[baseId]} 베이스` })}
              >
                {KIT_BASE_LABELS_KO[baseId]} 베이스
              </button>
            );
          })}
          <button
            type="button"
            className="cl-package-kit-reload"
            disabled={source.kind !== "kit" || applyLoop === null}
            title={source.kind !== "kit" ? "현재 소스가 키트일 때만 다시 불러올 수 있습니다." : applyLoop === null ? "적용 루프가 연결되지 않아 다시 불러올 수 없습니다." : "실패 기억과 kit.json 캐시를 비우고 키트를 다시 받습니다."}
            onClick={reloadKit}
          >
            키트 다시 불러오기
          </button>
        </div>
        {kitPlans === null ? (
          <p className="cl-package-hint cl-package-kit-hint">키트 등록소가 조립되지 않아 출처·제공 파츠 정보를 불러올 수 없습니다.</p>
        ) : source.kind !== "kit" && manifest === undefined && kitFetch.phase === "idle" ? (
          <p className="cl-package-hint cl-package-kit-hint">키트 정보(출처·제공 파츠)는 베이스를 고르면 불러옵니다.</p>
        ) : null}
        {kitNotice ? (
          <p className="cl-package-kit-notice cl-package-reason" role="note">
            {kitNotice}
          </p>
        ) : null}
        {source.kind === "kit" && !engineReady && shownKitFailure === undefined ? (
          <p className="cl-package-hint cl-package-kit-hint">엔진을 고르면 베이스·선택 파츠(GLB)를 받아 올립니다. 엔진 선택 전에는 파츠 파일을 받지 않습니다.</p>
        ) : null}
        {kitLoading ? (
          <p className="cl-package-kit-loading" role="status">
            키트를 불러오는 중… (베이스·선택 파츠 GLB 받기, 크기·SHA-256 검증, 스켈레톤 결합)
          </p>
        ) : null}
        {source.kind === "kit" && engineReady && kitSettled && shownKitFailure === undefined ? <p className="cl-package-hint cl-package-kit-hint">키트를 엔진에 올렸습니다.</p> : null}
        {shownKitFailure ? (
          <p className="cl-package-failure cl-package-kit-failure" role="alert">
            {describeFailure(shownKitFailure)}
          </p>
        ) : null}
        {panelKitFailure ? (
          <p className="cl-package-failure cl-package-kit-failure" role="alert">
            {describeFailure(panelKitFailure)}
          </p>
        ) : null}
        {kitFetch.phase === "failed" && kitSource === null ? (
          <p className="cl-package-failure cl-package-kit-failure" role="alert">
            {describeFailure(kitFetch.failure)}
          </p>
        ) : null}
        {kitFetch.phase === "loading" ? <p className="cl-package-hint cl-package-kit-hint">kit.json을 받는 중…</p> : null}
        {manifest !== undefined ? (
          <>
            <KitProvenance manifest={manifest} />
            <KitPartsTable manifest={manifest} />
          </>
        ) : null}
        {source.kind === "kit" ? (
          <div className="cl-package-kit-procedural">
            <button
              type="button"
              className="cl-package-kit-to-procedural"
              onClick={() => requestSourceSwitch({ kind: "procedural", targetLabelKo: "절차적 휴머노이드" })}
            >
              절차 소스로 전환
            </button>
            <span className="cl-package-hint">절차 소스는 키트가 아닌 대체 휴머노이드입니다. 키트 로드가 실패해도 자동으로 바뀌지 않으며, 이 버튼으로만 전환합니다.</span>
          </div>
        ) : null}
      </section>
      <h3 className="cl-package-subtitle">제작(Blender) 패키지</h3>
      <div className="cl-package-toolbar">
        <button type="button" onClick={() => void loadIndex()} disabled={index.phase === "loading"}>
          {index.phase === "loading" ? "목록 불러오는 중…" : "목록 새로고침"}
        </button>
        <span className="cl-package-hint">public/assets/characters/index.json</span>
      </div>
      {index.phase === "failed" ? (
        <p className="cl-package-failure" role="alert">
          {describeFailure(index.failure)}
        </p>
      ) : null}
      {index.phase === "idle" ? <p className="cl-package-hint">목록을 아직 불러오지 않았습니다.</p> : null}
      {index.phase === "ready" && index.entries.length === 0 ? (
        <p className="cl-package-empty" role="note" data-testid="package-list-empty">
          등록된 제작 패키지가 없습니다. 목록 새로고침을 누르거나 모듈식 키트·절차 소스를 선택하세요.
        </p>
      ) : null}
      {index.phase === "ready" && index.entries.length > 0 ? (
        <ul className="cl-package-list" aria-label="제작 패키지 목록">
          {index.entries.map((entry) => {
            const packageState = packages[entry.characterId];
            const isSelectedPackage = source.kind === "package" && source.characterId === entry.characterId;
            return (
              <li
                key={entry.characterId}
                className={`cl-package-item${isSelectedPackage ? " cl-package-item--selected" : ""}`}
                data-character-id={entry.characterId}
                data-selected={isSelectedPackage ? "true" : "false"}
              >
                <div className="cl-package-item-head">
                  <strong>{entry.displayName}</strong>
                  {isSelectedPackage ? (
                    <span className="cl-package-badge cl-package-badge--available" data-testid={`package-selected-badge-${entry.characterId}`}>
                      현재 선택됨
                    </span>
                  ) : null}
                  {entry.primary ? <span className="cl-package-badge cl-package-badge--primary">주 캐릭터</span> : null}
                  {entry.role ? <span className="cl-package-role">{entry.role}</span> : null}
                  <span className="cl-package-id">{entry.characterId}</span>
                </div>
                <p className="cl-package-summary">
                  품질 {entry.summary.qualityScore ?? "-"} · 스켈레톤 {entry.summary.skeleton === null ? "-" : entry.summary.skeleton ? "있음" : "없음"} · 의미 기반 shape key {entry.summary.semanticShapeKeys ?? "-"}개 · 헤어 LOD 삼각형 {entry.summary.hairLodTriangles.join("/") || "-"} · GLB 삼각형 {entry.summary.glbTriangles ?? "-"} · 라이선스 {entry.licenseNote ?? "미기재"} · GLB SHA {shortSha(entry.glbSha256)}
                </p>
                <button
                  type="button"
                  onClick={() => requestSourceSwitch({ kind: "package", entry, targetLabelKo: `제작 패키지 '${entry.displayName}'` })}
                  disabled={packageState?.phase === "loading"}
                  aria-label={`${entry.displayName} 불러오기`}
                >
                  {packageState?.phase === "loading" ? `불러오는 중… (${packageState.step})` : packageState?.phase === "ready" ? "다시 불러오기" : "불러오기"}
                </button>
                {packageState?.phase === "failed" ? (
                  <p className="cl-package-failure" role="alert">
                    {describeFailure(packageState.failure)}
                  </p>
                ) : null}
                {packageState?.phase === "ready" ? <PackageDetail state={packageState} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
