/**
 * 온디바이스 차등 프라이버시(DP) 화풍 LoRA 연합학습 + 시맨틱 LOD 동적 리소스 스트리밍 2탭 패널 (Wave 41A).
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 0건) · Props 없이 단독 렌더링 지원 · 100% 온디바이스 결정론 연산.
 */

import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Cpu, Database,
  GitMerge, HardDrive, Layers, Lock, Pause, Play, RefreshCw, RotateCcw,
  ShieldCheck, Sparkles,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  aggregateFederatedLoraDeltas, computeFederatedLoraTelemetry,
  createDefaultOnDeviceStyleSamples, createFederatedLoraSession,
  createPeerDeviceLoraPackets, exportFederatedLoraDelta,
  LORA_VALID_RANKS, runOnDeviceLoraStep,
  type FedAvgAggregationResult, type FederatedLoraSession,
  type FederatedLoraTelemetry, type LoraRank, type StylePresetId,
} from "./federated-lora-engine";
import {
  buildPrefetchPriorityQueue, bumpAssetSemanticVersion,
  computeStreamCacheTelemetry, createDefaultEpisodeStreamCatalog,
  createOpfsLruCacheState, DEFAULT_VIEWPORT_SCROLL_STATE,
  fetchAndCacheChunk, formatSemanticVersion, LOD_TIER_SPECS,
  resizeOpfsLruBudget, selectLodTierForZoom, stepPrefetchStream,
  synthesizeDeterministicChunkPayload,
  type OpfsLruCacheState, type PrefetchReason, type ResourceLodTier,
  type SemanticResourceAsset, type SemVerBumpKind, type StreamCacheTelemetry,
  type ViewportScrollState,
} from "./semantic-resource-streamer";

import { useExampleNotification } from "./use-example-notification";

export type FederatedLoraStreamTabId = "federated-lora" | "semantic-stream";

export interface StudioFederatedLoraStreamPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: FederatedLoraStreamTabId;
  readonly initialRank?: LoraRank;
  readonly initialCacheBudgetKb?: number;
  readonly onLoraSessionChange?: (telemetry: FederatedLoraTelemetry) => void | Promise<void>;
  readonly onStreamCacheChange?: (telemetry: StreamCacheTelemetry) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTION_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const CHIP_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const PRIMARY_TONE = "border-accent bg-accent text-on-accent hover:bg-accent-2";

const NOISE_PRESETS = [
  { sigma: 1.8, ko: "노이즈 가정 σ=1.8", en: "Noise σ=1.8" },
  { sigma: 1.1, ko: "균형 σ=1.1", en: "Balanced σ=1.1" },
  { sigma: 0.7, ko: "노이즈 가정 σ=0.7", en: "Noise σ=0.7" },
] as const;
const CLIP_PRESETS: readonly number[] = [0.5, 1.0, 2.0];
const BUDGET_PRESETS_KB: readonly number[] = [256, 512, 1024];

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

function budgetTone(pct: number, exhausted: boolean): string {
  if (exhausted || pct >= 90) return "border-bad bg-bad-soft text-bad";
  return pct >= 65 ? "border-line bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function lodBadgeTone(tier: ResourceLodTier): string {
  if (tier === "print-4k") return "border-accent bg-accent-soft text-accent";
  return tier === "working" ? "border-line bg-info-soft text-cool" : "border-line bg-raised text-fg-2";
}

function reasonBadgeTone(reason: PrefetchReason): string {
  if (reason === "viewport-visible" || reason === "zoom-upgrade") return "border-good bg-good-soft text-good";
  return reason === "version-refresh" ? "border-line bg-warning-soft text-warn" : "border-line bg-info-soft text-cool";
}

/** 온디바이스 차등 프라이버시 연합학습 LoRA · 시맨틱 LOD 동적 리소스 스트리밍 2탭 워크벤치. */
export function StudioFederatedLoraStreamPanel(props: StudioFederatedLoraStreamPanelProps): ReactElement {
  const {
    locale, className, initialTab = "federated-lora", initialRank = 8,
    initialCacheBudgetKb = 512, onLoraSessionChange, onStreamCacheChange,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const notification = useExampleNotification();
  const recipients = useRef({ onLoraSessionChange, onStreamCacheChange });
  useEffect(() => { recipients.current = { onLoraSessionChange, onStreamCacheChange }; }, [onLoraSessionChange, onStreamCacheChange]);
  const [activeTab, setActiveTab] = useState<FederatedLoraStreamTabId>(initialTab);
  const styleSamples = useMemo(() => createDefaultOnDeviceStyleSamples(), []);
  const [selectedPreset, setSelectedPreset] = useState<StylePresetId>("ink-sharp-action");
  const [session, setSession] = useState<FederatedLoraSession>(() => createFederatedLoraSession({ rank: initialRank }));
  const [fedAvgResult, setFedAvgResult] = useState<FedAvgAggregationResult | null>(null);
  const [loraNotice, setLoraNotice] = useState<string | null>(null);
  const [loraNoticeError, setLoraNoticeError] = useState(false);

  const [assets, setAssets] = useState<readonly SemanticResourceAsset[]>(() => createDefaultEpisodeStreamCatalog());
  const [viewport, setViewport] = useState<ViewportScrollState>(DEFAULT_VIEWPORT_SCROLL_STATE);
  const [cacheState, setCacheState] = useState<OpfsLruCacheState>(() => createOpfsLruCacheState(initialCacheBudgetKb * 1024));
  const [streamNotice, setStreamNotice] = useState<string | null>(null);
  const [streamNoticeError, setStreamNoticeError] = useState(false);

  const activeSample = useMemo(() => styleSamples.find((s) => s.presetId === selectedPreset) ?? styleSamples[0], [selectedPreset, styleSamples]);
  const loraTelemetry = useMemo(() => computeFederatedLoraTelemetry(session), [session]);
  const streamTelemetry = useMemo(() => computeStreamCacheTelemetry(cacheState), [cacheState]);
  const prefetchQueue = useMemo(() => buildPrefetchPriorityQueue(assets, viewport, cacheState), [assets, cacheState, viewport]);
  const activeLodTier = useMemo(() => selectLodTierForZoom(viewport.zoomLevel, viewport.preferredLodOverride), [viewport.preferredLodOverride, viewport.zoomLevel]);

  const commitSession = (next: FederatedLoraSession, noticeText: string): void => {
    if (notification.isPending()) return;
    setSession(next);
    setLoraNoticeError(false);
    setLoraNotice(pick("CPU 예제: ", "CPU example: ") + noticeText);
    const result = computeFederatedLoraTelemetry(next);
    notification.notify(() => {
      const recipient = recipients.current.onLoraSessionChange;
      return recipient ? () => recipient(result) : undefined;
    });
  };

  const commitCache = (next: OpfsLruCacheState, noticeText: string, incomplete = false): void => {
    if (notification.isPending()) return;
    setCacheState(next);
    setStreamNoticeError(incomplete);
    setStreamNotice(pick("메타데이터 예제: ", "Metadata example: ") + noticeText);
    const result = computeStreamCacheTelemetry(next);
    notification.notify(() => {
      const recipient = recipients.current.onStreamCacheChange;
      return recipient ? () => recipient(result) : undefined;
    });
  };

  const handleSelectRank = (rank: LoraRank): void => {
    if (notification.isPending()) return;
    const next = createFederatedLoraSession({ rank, privacyConfig: session.privacyConfig });
    setFedAvgResult(null);
    commitSession(next, pick(`LoRA 랭크를 r=${rank} (${next.currentAdapter.parameterCount} 파라미터)로 전환했습니다.`, `Switched LoRA rank to r=${rank} (${next.currentAdapter.parameterCount} params).`));
  };

  const handleSelectNoise = (sigma: number): void =>
    commitSession({ ...session, privacyConfig: { ...session.privacyConfig, noiseMultiplier: sigma } }, pick(`가우시안 노이즈 배율을 σ=${sigma}로 조정했습니다.`, `Adjusted Gaussian noise multiplier to σ=${sigma}.`));

  const handleSelectClip = (clipNormC: number): void =>
    commitSession({ ...session, privacyConfig: { ...session.privacyConfig, clipNormC } }, pick(`L2 그래디언트 클리핑 한계를 C=${clipNormC}로 설정했습니다.`, `Set L2 gradient clipping norm to C=${clipNormC}.`));

  const handleRunTrainingSteps = (count: number): void => {
    if (notification.isPending()) return;
    if (!activeSample) return;
    let working = session;
    let blocked = false;
    for (let i = 0; i < count; i += 1) {
      const outcome = runOnDeviceLoraStep(working, activeSample);
      working = outcome.session;
      if (outcome.record.blockedByBudget) { blocked = true; break; }
    }
    commitSession(
      working,
      blocked
        ? pick("다음 스텝의 가정 예산(ε)이 한도를 넘으므로 가중치 변경 전에 중단했습니다.", "The next model step would exceed the assumed budget; weights are unchanged.")
        : pick(`합성 특징 MSE ${count}스텝 계산 · 가정 ε=${working.epsilonSpent.toFixed(2)} · 실제 DP 보증 아님`, `Calculated ${count} synthetic-feature MSE step(s) · assumed ε=${working.epsilonSpent.toFixed(2)} · no DP guarantee`),
    );
  };

  const handleRunFedAvg = (): void => {
    if (notification.isPending()) return;
    let working = session;
    if (working.stepCount === 0 && activeSample) working = runOnDeviceLoraStep(working, activeSample).session;
    const localPacket = exportFederatedLoraDelta(working, pick("현재 작업 기기(로컬)", "Current Device (Local)"));
    const merged = aggregateFederatedLoraDeltas(working.baseAdapter, [localPacket, ...createPeerDeviceLoraPackets(working, styleSamples)]);
    setFedAvgResult(merged);
    if (!merged.ok) { setLoraNoticeError(true); setLoraNotice(pick("예제 병합 미완료: 수락 가능한 패킷이 없습니다.", "Example merge incomplete: no acceptable packets.")); return; }
    if (merged.ok) {
      commitSession(
        { ...working, currentAdapter: merged.mergedAdapter },
        pick(`${merged.acceptedCount}개 합성 기기 패킷의 FedAvg 계산 · 다이제스트 ${merged.roundDigestSha256.slice(0, 12)}`, `Calculated FedAvg for ${merged.acceptedCount} synthetic device packets · digest ${merged.roundDigestSha256.slice(0, 12)}`),
      );
    }
  };

  const handleResetLora = (): void => {
    if (notification.isPending()) return;
    setFedAvgResult(null);
    commitSession(
      createFederatedLoraSession({ rank: session.currentAdapter.rank, privacyConfig: session.privacyConfig }),
      pick("메모리 예제 가중치와 가정 예산을 초기화했습니다.", "Reset in-memory example weights and assumed budget."),
    );
  };

  const handleScrollMove = (direction: "up" | "down" | "idle"): void => {
    if (notification.isPending()) return;
    const deltaY = direction === "down" ? 960 : direction === "up" ? -960 : 0;
    const maxY = Math.max(0, (assets[assets.length - 1]?.yOffsetPx ?? 6400) - 600);
    setViewport({ ...viewport, scrollY: Math.max(0, Math.min(maxY, viewport.scrollY + deltaY)), direction, scrollVelocityPxPerSec: direction === "idle" ? 0 : 720 });
  };

  const handleResizeBudget = (budgetKb: number): void => {
    if (notification.isPending()) return;
    const next = resizeOpfsLruBudget(cacheState, budgetKb * 1024);
    const evictedDelta = next.evictionLog.length - cacheState.evictionLog.length;
    commitCache(
      next,
      evictedDelta > 0
        ? pick(`메모리 모델 예산을 ${budgetKb} KB로 축소하며 LRU 청크 ${evictedDelta}건을 자동 축출했습니다.`, `Resized in-memory model budget to ${budgetKb} KB and evicted ${evictedDelta} LRU chunk(s).`)
        : pick(`메모리 모델 예산을 ${budgetKb} KB로 설정했습니다.`, `Set in-memory model budget to ${budgetKb} KB.`),
    );
  };

  const handlePrefetchStep = (): void => {
    if (notification.isPending()) return;
    const report = stepPrefetchStream(cacheState, assets, viewport, { maxChunksPerStep: 3 });
    commitCache(
      report.cache,
      report.fetchedKeys.length > 0
        ? pick(`우선순위 청크 ${report.fetchedKeys.length}건 합성 체크섬·메타데이터 기록 (LRU 축출 ${report.evictedCount}건)`, `Calculated checksum & metadata for ${report.fetchedKeys.length} priority chunk(s) (${report.evictedCount} LRU evicted)`)
        : report.remainingQueueLength > 0
          ? pick(`미완료: 예산·검증 조건으로 ${report.blockedKeys.length}건을 기록하지 못했습니다. 대기 ${report.remainingQueueLength}건.`, `Incomplete: ${report.blockedKeys.length} blocked by budget/validation; ${report.remainingQueueLength} pending.`)
          : pick("현재 조건의 예제 청크 메타데이터가 모두 기록되어 있습니다.", "All example chunk metadata for current conditions is recorded."),
      report.blockedKeys.length > 0,
    );
  };

  const handleTamperProbe = (): void => {
    if (notification.isPending()) return;
    const targetAsset = assets[0];
    if (!targetAsset) return;
    const tampered = new Uint8Array(synthesizeDeterministicChunkPayload(targetAsset.resourceId, activeLodTier, targetAsset.version, targetAsset.lodByteSizes[activeLodTier]));
    tampered[0] = ((tampered[0] ?? 0) ^ 0xff) & 0xff;
    const outcome = fetchAndCacheChunk(cacheState, targetAsset, activeLodTier, tampered);
    commitCache(outcome.cache, pick(`SHA-256 변조 청크 자동 차단됨 (기대 ${outcome.expectedHash.slice(0, 10)} ≠ 실측 ${outcome.computedHash.slice(0, 10)})`, `Blocked corrupted chunk via SHA-256 (${outcome.expectedHash.slice(0, 10)} ≠ ${outcome.computedHash.slice(0, 10)})`));
  };

  const handleBumpVersion = (resourceId: string, bumpKind: SemVerBumpKind): void => {
    if (notification.isPending()) return;
    const res = bumpAssetSemanticVersion(assets, cacheState, resourceId, bumpKind);
    setAssets(res.assets);
    const nextVerText = res.nextVersion ? formatSemanticVersion(res.nextVersion) : "";
    commitCache(res.cache, pick(`${resourceId} → ${nextVerText} (${bumpKind}) 갱신 · 축출 ${res.evictedKeys.length}건 · 스테일 표시 ${res.markedStaleKeys.length}건`, `Bumped ${resourceId} → ${nextVerText} (${bumpKind}) · evicted ${res.evictedKeys.length}, stale ${res.markedStaleKeys.length}`));
  };

  const handleResetCache = (): void => {
    if (notification.isPending()) return;
    setAssets(createDefaultEpisodeStreamCatalog());
    setViewport(DEFAULT_VIEWPORT_SCROLL_STATE);
    commitCache(createOpfsLruCacheState(cacheState.budgetBytes), pick("메모리 모델 LRU 캐시와 뷰포트를 초기화했습니다.", "Cleared in-memory LRU metadata and reset viewport."));
  };

  const reasonLabel = (reason: PrefetchReason): string => {
    if (reason === "viewport-visible") return pick("화면 표시", "Visible");
    if (reason === "scroll-lookahead") return pick("진행 전방", "Lookahead");
    if (reason === "zoom-upgrade") return pick("고배율 승격", "Zoom Upgrade");
    return reason === "version-refresh" ? pick("버전 갱신", "Version Refresh") : pick("백그라운드", "Warmup");
  };

  const latestStep = session.stepHistory[session.stepHistory.length - 1] ?? null;
  const tabs: readonly { readonly id: FederatedLoraStreamTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "federated-lora", label: pick("저랭크 MSE · 가정 예산", "Low-Rank MSE · Assumed Budget"), icon: <Lock className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "semantic-stream", label: pick("시맨틱 LOD 스트리밍 · 메모리 모델 LRU", "Semantic LOD · In-Memory LRU Metadata"), icon: <Layers className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  return (
    <section
      data-testid="federated-lora-stream-panel"
      aria-label={pick("저랭크 MSE·FedAvg·LOD 메타데이터 예제", "Low-Rank MSE, FedAvg & LOD Metadata Example")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">{pick("CPU 저랭크 MSE · 합성 FedAvg · LOD 메타데이터 예제", "CPU Low-Rank MSE · Synthetic FedAvg · LOD Metadata Example")}</h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick("CPU·메모리에서 16차원 합성 특징의 저랭크 MSE 업데이트·고정 시드 노이즈·가정 예산·합성 기기 FedAvg와 청크 체크섬·캐시 메타데이터를 계산합니다. 실제 모델 화풍 학습·차등 프라이버시 보증·네트워크 관찰/송신·원격 기기·GPU·OPFS 영구 저장·현재 원고 적용에 연결되지 않습니다. 청크 바이트도 캐시에 보관하지 않습니다.", "CPU/in-memory examples of synthetic 16-feature low-rank MSE, fixed-seed noise, assumed budgets, synthetic-device FedAvg, chunk checksums and cache metadata. No actual model style training, DP guarantee, network observation/send, remote devices, GPU, OPFS persistence or manuscript apply is connected. Chunk bytes are not retained in the cache.")}
          </p>
        </div>
        <span data-testid="zero-egress-pill" className="inline-flex items-center gap-1.5 rounded-full border border-good bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {pick("합성 예제 · 실제 DP 보증 없음", "Synthetic Example · No DP Guarantee")}
        </span>
      </header>

      {notification.status !== "idle" && <div role={notification.status === "failed" ? "alert" : "status"} data-testid="example-notification-status" className="text-xs text-fg-2">
        {notification.pending ? pick("예제 결과 알림 처리 중", "Example notification pending") : notification.status === "failed" ? pick(`예제 결과 알림 실패: ${notification.error}`, `Example notification failed: ${notification.error}`) : pick("핸들러 응답 확인. 실제 학습·송신·저장 완료를 뜻하지 않습니다.", "Handler responded. No training, send or persistence is confirmed.")}
        {notification.status === "failed" && <button type="button" className={ACTION_BTN} onClick={notification.retry}>{pick("결과 알림 다시 시도", "Retry notification")}</button>}
      </div>}
      <div role="tablist" aria-label={pick("엔진 탭", "Engine tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`${uid}-panel-${tab.id}`} data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`${TAB_BTN} ${selected ? ACTIVE_TONE : IDLE_TONE}`}>
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "federated-lora" ? (
        <fieldset disabled={notification.pending} id={`${uid}-panel-federated-lora`} role="tabpanel" aria-labelledby={`${uid}-tab-federated-lora`} data-testid="panel-federated-lora" className="min-w-0 space-y-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{pick("예제 패킷 원본 픽셀 필드", "Example Packet Raw Pixel Fields")}</span>
                <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
              </div>
              <div data-testid="lora-raw-egress" className="text-base font-bold text-good tabular-nums">0 B</div>
              <p className="text-xs text-fg-3 tabular-nums">{pick(`로컬 처리 ${formatKb(session.rawPixelBytesProcessedLocally)}`, `Local processed ${formatKb(session.rawPixelBytesProcessedLocally)}`)}</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{pick("누적 가정 예산 (보호 보증 아님)", "Assumed Budget (No Privacy Guarantee)")}</span>
                <span data-testid="lora-budget-status" className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${budgetTone(loraTelemetry.budgetUtilizationPct, loraTelemetry.budgetExhausted)}`}>
                  {loraTelemetry.budgetExhausted ? pick("한도 도달", "Cap Hit") : `${loraTelemetry.budgetUtilizationPct}%`}
                </span>
              </div>
              <div data-testid="lora-epsilon-value" className="text-base font-bold text-fg tabular-nums">ε {loraTelemetry.epsilonSpent.toFixed(2)} / {loraTelemetry.budgetLimitEpsilon.toFixed(1)}</div>
              <p className="text-xs text-fg-3 tabular-nums">δ = {session.privacyConfig.delta.toExponential(0)} · σ = {session.privacyConfig.noiseMultiplier}</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{pick("저랭크 어댑터 ΔW", "Low-Rank Adapter ΔW")}</span>
                <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              </div>
              <div data-testid="lora-rank-summary" className="text-base font-bold text-fg tabular-nums">r={loraTelemetry.rank} · ‖ΔW‖ {loraTelemetry.effectiveDeltaWNorm.toFixed(3)}</div>
              <p className="text-xs text-fg-3 tabular-nums">{pick(`${loraTelemetry.parameterCount}개 Float32 가중치`, `${loraTelemetry.parameterCount} Float32 params`)}</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{pick("CPU 예제 업데이트 스텝", "CPU Example Update Steps")}</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
              </div>
              <div data-testid="lora-step-count" className="text-base font-bold text-fg tabular-nums">{loraTelemetry.stepCount} {pick("스텝", "steps")}</div>
              <p className="text-xs text-fg-3 tabular-nums">
                {loraTelemetry.latestLoss !== null ? pick(`손실 ${loraTelemetry.latestLoss.toFixed(4)} · 클립 ${loraTelemetry.clippedStepRatioPct}%`, `Loss ${loraTelemetry.latestLoss.toFixed(4)} · Clip ${loraTelemetry.clippedStepRatioPct}%`) : pick("학습 대기 중", "Idle")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-card p-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-fg-2">{pick("어댑터 랭크 (r)", "Adapter Rank (r)")}</div>
              <div className="flex flex-wrap gap-1.5">
                {LORA_VALID_RANKS.map((rank) => (
                  <button key={rank} type="button" data-testid={`btn-rank-${rank}`} onClick={() => handleSelectRank(rank)} className={`${CHIP_BTN} tabular-nums ${session.currentAdapter.rank === rank ? ACTIVE_TONE : IDLE_TONE}`}>r={rank}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-fg-2">{pick("가우시안 노이즈 (σ)", "Gaussian Noise (σ)")}</div>
              <div className="flex flex-wrap gap-1.5">
                {NOISE_PRESETS.map((preset) => (
                  <button key={preset.sigma} type="button" data-testid={`btn-noise-${preset.sigma}`} onClick={() => handleSelectNoise(preset.sigma)} className={`${CHIP_BTN} tabular-nums ${session.privacyConfig.noiseMultiplier === preset.sigma ? ACTIVE_TONE : IDLE_TONE}`}>{pick(preset.ko, preset.en)}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-fg-2">{pick("L2 클리핑 노름 (C)", "L2 Clip Norm (C)")}</div>
              <div className="flex flex-wrap gap-1.5">
                {CLIP_PRESETS.map((clipVal) => (
                  <button key={clipVal} type="button" data-testid={`btn-clip-${clipVal}`} onClick={() => handleSelectClip(clipVal)} className={`${CHIP_BTN} tabular-nums ${session.privacyConfig.clipNormC === clipVal ? ACTIVE_TONE : IDLE_TONE}`}>C={clipVal.toFixed(1)}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg-2">{pick("합성 특징 배치 선택", "Synthetic Feature Batch")}</span>
              <div className="flex flex-wrap gap-1.5">
                {styleSamples.map((sample) => (
                  <button key={sample.presetId} type="button" data-testid={`btn-preset-${sample.presetId}`} onClick={() => setSelectedPreset(sample.presetId)} className={`${CHIP_BTN} ${selectedPreset === sample.presetId ? ACTIVE_TONE : IDLE_TONE}`}>{pick(sample.labelKo, sample.labelEn)}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="btn-lora-step-1" onClick={() => handleRunTrainingSteps(1)} className={`${ACTION_BTN} ${PRIMARY_TONE}`}>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("CPU MSE 예제 1스텝", "Run 1 CPU MSE Step")}</span>
              </button>
              <button type="button" data-testid="btn-lora-step-5" onClick={() => handleRunTrainingSteps(5)} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("CPU MSE 예제 5스텝", "Run 5 CPU MSE Steps")}</span>
              </button>
              <button type="button" data-testid="btn-lora-fedavg" onClick={handleRunFedAvg} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("합성 3기기 FedAvg 계산", "Calculate Synthetic 3-Device FedAvg")}</span>
              </button>
              <button type="button" data-testid="btn-lora-reset" onClick={handleResetLora} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("세션 초기화", "Reset Session")}</span>
              </button>
            </div>
          </div>

          {loraNotice ? (
            <div data-testid="lora-notice-banner" role={loraNoticeError ? "alert" : "status"} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${loraNoticeError ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"}`}>
              {loraNoticeError ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>{loraNotice}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-line bg-card p-3 space-y-2">
              <h3 className="text-xs font-semibold text-fg">{pick("최근 예제 클리핑 · 고정 시드 노이즈", "Example Clipping & Fixed-Seed Noise")}</h3>
              {latestStep ? (
                <div data-testid="latest-dp-step-card" className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-fg-3">{pick("클리핑 전/후 노름", "Pre / Post Clip Norm")}</div>
                    <div className="font-semibold text-fg">{latestStep.preClipGradNorm.toFixed(4)} → {latestStep.postClipGradNorm.toFixed(4)}</div>
                  </div>
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-fg-3">{pick("주입 노이즈 L2 노름", "Injected Noise L2")}</div>
                    <div className="font-semibold text-fg">{latestStep.noiseL2Norm.toFixed(4)}</div>
                  </div>
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-fg-3">{pick("MSE 손실 변화", "MSE Loss Delta")}</div>
                    <div className="font-semibold text-fg">{latestStep.lossBefore.toFixed(4)} → {latestStep.lossAfter.toFixed(4)}</div>
                  </div>
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-fg-3">{pick("원본 전송 바이트", "Raw Egress Bytes")}</div>
                    <div className="font-semibold text-good">0 B (DP-Delta Only)</div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-fg-3">{pick("학습 스텝을 실행하면 클리핑 전후 노름과 가우시안 노이즈 주입 내역이 기록됩니다.", "Run a training step to inspect gradient clipping norms and Gaussian noise stats.")}</p>
              )}
            </div>

            <div data-testid="fedavg-report" className="rounded-lg border border-line bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg">{pick("FedAvg 합성 기기 계산 결과", "FedAvg Synthetic-Device Result")}</h3>
                {fedAvgResult ? (
                  <span className="rounded border border-good bg-good-soft px-2 py-0.5 text-xs font-semibold text-good tabular-nums">
                    {pick(`수락 ${fedAvgResult.acceptedCount} · 격리 ${fedAvgResult.rejectedPackets.length}`, `Accepted ${fedAvgResult.acceptedCount} · Rejected ${fedAvgResult.rejectedPackets.length}`)}
                  </span>
                ) : null}
              </div>
              {fedAvgResult ? (
                <div className="space-y-1.5 text-xs tabular-nums">
                  {fedAvgResult.contributions.map((device) => (
                    <div key={device.deviceId} className="flex items-center justify-between rounded-md border border-line bg-raised px-2.5 py-1.5">
                      <span className="font-medium text-fg">{device.deviceLabel}</span>
                      <span className="text-fg-2">{Math.round(device.weightRatio * 100)}% ({device.sampleCount} · ε={device.epsilonSpent.toFixed(2)})</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-fg-3">
                    <span>{pick("라운드 SHA-256", "Round SHA-256")}: {fedAvgResult.roundDigestSha256.slice(0, 16)}</span>
                    <span>‖ΔW‖ = {fedAvgResult.effectiveDeltaWNorm.toFixed(4)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-fg-3">{pick("보조 기기 패킷도 이 CPU 예제에서 생성합니다. 실제 기기 연결·원격 학습·송신은 없습니다.", "Peer packets are generated in this CPU example. No real device connection, remote training or send occurs.")}</p>
              )}
            </div>
          </div>
        </fieldset>
      ) : (
        <fieldset disabled={notification.pending} id={`${uid}-panel-semantic-stream`} role="tabpanel" aria-labelledby={`${uid}-tab-semantic-stream`} data-testid="panel-semantic-stream" className="min-w-0 space-y-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{pick("메모리 메타데이터 예산", "In-Memory LRU Model")}</span>
                <HardDrive className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              </div>
              <div data-testid="stream-memory-usage" className="text-base font-bold text-fg tabular-nums">{formatKb(streamTelemetry.usedBytes)} / {formatKb(streamTelemetry.budgetBytes)}</div>
              <p className="text-xs text-fg-3 tabular-nums">{pick(`점유 ${streamTelemetry.utilizationPct}% · 자동 축출 ${streamTelemetry.totalEvictions}건`, `Used ${streamTelemetry.utilizationPct}% · Evicted ${streamTelemetry.totalEvictions}`)}</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{pick("뷰포트 · 활성 LOD", "Viewport · Active LOD")}</span>
                <span className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${lodBadgeTone(activeLodTier)}`}>{activeLodTier}</span>
              </div>
              <div data-testid="stream-viewport-summary" className="text-base font-bold text-fg tabular-nums">Y={viewport.scrollY}px · {viewport.zoomLevel.toFixed(1)}x</div>
              <p className="text-xs text-fg-3">{pick(`방향: ${viewport.direction === "down" ? "아래 ↓" : viewport.direction === "up" ? "위 ↑" : "정지"} · ${LOD_TIER_SPECS[activeLodTier].labelKo}`, `Dir: ${viewport.direction} · ${LOD_TIER_SPECS[activeLodTier].labelEn}`)}</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{pick("SHA-256 청크 무결성", "SHA-256 Integrity")}</span>
                <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
              </div>
              <div data-testid="stream-integrity-summary" className="text-base font-bold text-fg tabular-nums">{pick(`검증 ${streamTelemetry.verifiedWrites} · 차단 ${streamTelemetry.corruptionsBlocked}`, `Verified ${streamTelemetry.verifiedWrites} · Blocked ${streamTelemetry.corruptionsBlocked}`)}</div>
              <p className="text-xs text-fg-3 tabular-nums">{pick(`버전 무효화 ${streamTelemetry.versionInvalidations}건`, `SemVer invalidations ${streamTelemetry.versionInvalidations}`)}</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span>{pick("프리페치 큐 · 캐시", "Prefetch Queue · Cache")}</span>
                <Database className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
              </div>
              <div data-testid="stream-queue-summary" className="text-base font-bold text-fg tabular-nums">{pick(`대기 ${prefetchQueue.length} · 캐시 ${streamTelemetry.cachedChunkCount}`, `Queue ${prefetchQueue.length} · Cached ${streamTelemetry.cachedChunkCount}`)}</div>
              <p className="text-xs text-fg-3 tabular-nums">{pick(`적중률 ${streamTelemetry.hitRatePct}%`, `Hit Rate ${streamTelemetry.hitRatePct}%`)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-card p-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-fg-2">{pick("뷰포트 스크롤 방향", "Viewport Scroll Direction")}</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid="btn-scroll-up" onClick={() => handleScrollMove("up")} className={`${CHIP_BTN} ${viewport.direction === "up" ? ACTIVE_TONE : IDLE_TONE}`}><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("위", "Up")}</span></button>
                <button type="button" data-testid="btn-scroll-idle" onClick={() => handleScrollMove("idle")} className={`${CHIP_BTN} ${viewport.direction === "idle" ? ACTIVE_TONE : IDLE_TONE}`}><Pause className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("정지", "Idle")}</span></button>
                <button type="button" data-testid="btn-scroll-down" onClick={() => handleScrollMove("down")} className={`${CHIP_BTN} ${viewport.direction === "down" ? ACTIVE_TONE : IDLE_TONE}`}><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("아래", "Down")}</span></button>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-fg-2">{pick("줌 배율 · LOD 티어", "Zoom · LOD Tier")}</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid="btn-zoom-thumb" onClick={() => setViewport({ ...viewport, zoomLevel: 0.45, preferredLodOverride: undefined })} className={`${CHIP_BTN} tabular-nums ${activeLodTier === "thumb" ? ACTIVE_TONE : IDLE_TONE}`}>0.5x thumb</button>
                <button type="button" data-testid="btn-zoom-working" onClick={() => setViewport({ ...viewport, zoomLevel: 1.0, preferredLodOverride: undefined })} className={`${CHIP_BTN} tabular-nums ${activeLodTier === "working" ? ACTIVE_TONE : IDLE_TONE}`}>1.0x working</button>
                <button type="button" data-testid="btn-zoom-print" onClick={() => setViewport({ ...viewport, zoomLevel: 2.0, preferredLodOverride: undefined })} className={`${CHIP_BTN} tabular-nums ${activeLodTier === "print-4k" ? ACTIVE_TONE : IDLE_TONE}`}>2.0x print-4k</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-fg-2">{pick("메모리 모델 캐시 예산", "Metadata Cache Budget")}</div>
              <div className="flex flex-wrap gap-1.5">
                {BUDGET_PRESETS_KB.map((kb) => (
                  <button key={kb} type="button" data-testid={`btn-budget-${kb}`} onClick={() => handleResizeBudget(kb)} className={`${CHIP_BTN} tabular-nums ${Math.round(cacheState.budgetBytes / 1024) === kb ? ACTIVE_TONE : IDLE_TONE}`}>{kb} KB</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="btn-stream-prefetch" onClick={handlePrefetchStep} className={`${ACTION_BTN} ${PRIMARY_TONE}`}>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("우선순위 프리페치 실행", "Run Priority Prefetch")}</span>
            </button>
            <button type="button" data-testid="btn-stream-tamper-test" onClick={handleTamperProbe} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
              <span>{pick("손상 청크 SHA-256 차단 검증", "Probe SHA-256 Tamper Block")}</span>
            </button>
            <button type="button" data-testid="btn-stream-reset" onClick={handleResetCache} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("캐시 초기화", "Clear Cache")}</span>
            </button>
          </div>

          {streamNotice ? (
            <div data-testid="stream-notice-banner" role={streamNoticeError ? "alert" : "status"} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${streamNoticeError ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"}`}>
              {streamNoticeError ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>{streamNotice}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div data-testid="prefetch-queue-list" className="rounded-lg border border-line bg-card p-3 space-y-2">
              <h3 className="text-xs font-semibold text-fg">{pick("뷰포트 거리·방향 프리페치 우선순위 큐 (상위 5건)", "Viewport Distance & Direction Prefetch Queue (Top 5)")}</h3>
              <div className="space-y-1.5">
                {prefetchQueue.slice(0, 5).map((item) => (
                  <div key={item.chunkKey} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-2 text-xs tabular-nums">
                    <div>
                      <div className="font-semibold text-fg">{item.cutTitle}</div>
                      <div className="text-fg-3">{formatSemanticVersion(item.targetVersion)} · {formatKb(item.byteSize)} · {item.distancePx}px</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded border px-1.5 py-0.5 font-semibold ${lodBadgeTone(item.tier)}`}>{item.tier}</span>
                      <span className={`rounded border px-1.5 py-0.5 font-semibold ${reasonBadgeTone(item.reason)}`}>{reasonLabel(item.reason)}</span>
                      <span className="font-semibold text-fg">{item.priorityScore.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div data-testid="semver-catalog-list" className="rounded-lg border border-line bg-card p-3 space-y-2">
              <h3 className="text-xs font-semibold text-fg">{pick("컷 시맨틱 버전 관리 · 차등 캐시 무효화", "Cut Semantic Versions & Selective Cache Invalidation")}</h3>
              <div className="space-y-1.5">
                {assets.slice(0, 4).map((asset) => (
                  <div key={asset.resourceId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-2 text-xs tabular-nums">
                    <div>
                      <div className="font-semibold text-fg">{asset.cutTitle}</div>
                      <div className="text-fg-3">{formatSemanticVersion(asset.version)} · {asset.layerName}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {(["patch", "minor", "major"] as const).map((kind) => (
                        <button key={kind} type="button" data-testid={`btn-bump-${asset.resourceId}-${kind}`} onClick={() => handleBumpVersion(asset.resourceId, kind)} className={`${CHIP_BTN} ${IDLE_TONE}`}>{kind}+</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div data-testid="opfs-cache-list" className="rounded-lg border border-line bg-card p-3 space-y-2">
              <h3 className="text-xs font-semibold text-fg">{pick("체크섬 검증 메타데이터", "Checksum-Verified Metadata")}</h3>
              {cacheState.entries.length === 0 ? (
                <p className="text-xs text-fg-3">{pick("프리페치를 실행하면 SHA-256 검증을 통과한 청크 메타데이터만 메모리에 기록됩니다. 실제 파일은 생성되지 않습니다.", "Run prefetch to record checksum metadata in memory. No file is created.")}</p>
              ) : (
                <div className="space-y-1.5">
                  {cacheState.entries.slice(0, 6).map((entry) => (
                    <div key={entry.chunkKey} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs tabular-nums">
                      <span className="font-medium text-fg">{entry.resourceId} ({entry.tier} · {formatSemanticVersion(entry.version)})</span>
                      <span className="text-fg-3">{formatKb(entry.byteSize)} · {entry.sha256.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div data-testid="lru-eviction-log" className="rounded-lg border border-line bg-card p-3 space-y-2">
              <h3 className="text-xs font-semibold text-fg">{pick("최근 메모리 모델 LRU · 버전 축출 기록", "In-Memory LRU & Version Evictions")}</h3>
              {cacheState.evictionLog.length === 0 ? (
                <p className="text-xs text-fg-3">{pick("예산 초과 또는 major/minor 버전 갱신 시 자동 축출 내역이 표시됩니다.", "Automatic evictions from budget pressure or semver bumps appear here.")}</p>
              ) : (
                <div className="space-y-1.5">
                  {cacheState.evictionLog.slice(-5).reverse().map((ev) => (
                    <div key={`${ev.tick}-${ev.evictedKey}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs tabular-nums">
                      <span className="font-medium text-fg">{ev.evictedKey}</span>
                      <span className="text-fg-3">-{formatKb(ev.freedBytes)} · {ev.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </fieldset>
      )}
    </section>
  );
}
