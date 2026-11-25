/**
 * 오프라인-퍼스트 CRDT 벡터시계 충돌 해결 · OPFS 16K 청크 무결성·XOR 패리티 복구 ·
 * 멀티탭 단일 쓰기 잠금·펜싱 토큰 검증 3탭 인터랙티브 내구성 랩 (Wave 42D).
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 0건) · Props 없이 단독 렌더링 지원 · 100% 결정론 연산.
 */

import {
  AlertTriangle, CheckCircle2, Clock, Database, GitMerge, HardDrive,
  HeartPulse, Lock, Plus, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Unlock, Zap,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement, type ReactNode } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  compactCrdtOpLog, compareVectorClocks, computeCrc32Hex, computeSha256Hex,
  corruptManuscriptChunk, createDefaultCrdtOpLog, createDefaultManuscriptParityStripe,
  createInitialTabWriterLeaseState, incrementVectorClock, stepTabWriterLease,
  verifyAndRepairManuscriptChunks,
  type CrdtCompactionResult, type CrdtOperation, type ManuscriptParityStripe,
  type ManuscriptRecoveryReport, type StripeRecoveryOverallStatus, type TabLeaseRole,
  type TabWriterLeaseAction, type TabWriterLeaseState, type VectorClock, type VectorClockRelation,
} from "./offline-resilience-engine";

import { ExampleNotificationStatus } from "./ExampleNotificationStatus";
import { useExampleNotification } from "./use-example-notification";

export type OfflineResilienceTabId = "crdt-vclock" | "opfs-parity" | "tab-lease";

export interface StudioOfflineResiliencePanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: OfflineResilienceTabId;
  readonly onCompactionChange?: (result: CrdtCompactionResult) => void | Promise<void>;
  readonly onRecoveryReportChange?: (report: ManuscriptRecoveryReport) => void | Promise<void>;
  readonly onLeaseStateChange?: (state: TabWriterLeaseState) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTION_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const PRIMARY_TONE = "border-accent bg-accent text-on-accent hover:bg-accent-2";
const ACTORS = ["ipad-main", "desktop-studio", "assist-pen"] as const;

function relationTone(relation: VectorClockRelation): string {
  if (relation === "equal") return "border-good bg-good-soft text-good";
  if (relation === "concurrent") return "border-line bg-warning-soft text-warn";
  return "border-line bg-info-soft text-cool";
}

function stripeTone(status: StripeRecoveryOverallStatus): string {
  return status === "degraded-unrecoverable"
    ? "border-bad bg-bad-soft text-bad"
    : "border-good bg-good-soft text-good";
}

function roleTone(role: TabLeaseRole): string {
  if (role === "writer") return "border-good bg-good-soft text-good";
  return role === "read-only" ? "border-line bg-info-soft text-cool" : "border-bad bg-bad-soft text-bad";
}

function formatClockInline(clock: VectorClock): string {
  const keys = Object.keys(clock).sort();
  return keys.length === 0 ? "{}" : `{ ${keys.map((k) => `${k}:${clock[k] ?? 0}`).join(", ")} }`;
}

function formatBytesKb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function MetricCard(cardProps: {
  readonly label: string;
  readonly value: ReactNode;
  readonly sub: ReactNode;
  readonly valueTestId?: string;
  readonly valueClassName?: string;
}): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="text-xs text-fg-3">{cardProps.label}</div>
      <div data-testid={cardProps.valueTestId} className={`mt-1 text-base font-bold tabular-nums ${cardProps.valueClassName ?? "text-fg"}`}>
        {cardProps.value}
      </div>
      <div className="mt-1 text-xs text-fg-2 tabular-nums">{cardProps.sub}</div>
    </div>
  );
}

/** 오프라인 CRDT 벡터시계 · OPFS 16K 패리티 복구 · 멀티탭 단일 쓰기 잠금 3탭 검증 워크벤치. */
export function StudioOfflineResiliencePanel(props: StudioOfflineResiliencePanelProps): ReactElement {
  const {
    locale, className, initialTab = "crdt-vclock",
    onCompactionChange, onRecoveryReportChange, onLeaseStateChange,
  } = props;

  const compactionNotification = useExampleNotification(onCompactionChange);
  const recoveryNotification = useExampleNotification(onRecoveryReportChange);
  const leaseNotification = useExampleNotification(onLeaseStateChange);
  const notifications = [compactionNotification, recoveryNotification, leaseNotification];
  const pending = notifications.some((notification) => notification.status === "pending");
  function isPending(): boolean { return notifications.some((notification) => notification.isPending()); }
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<OfflineResilienceTabId>(initialTab);
  const [notice, setNotice] = useState<string | null>(null);

  const [clockA, setClockA] = useState<VectorClock>({ "ipad-main": 4, "desktop-studio": 0, "assist-pen": 0 });
  const [clockB, setClockB] = useState<VectorClock>({ "ipad-main": 2, "desktop-studio": 1, "assist-pen": 0 });
  const [opLog, setOpLog] = useState<readonly CrdtOperation[]>(() => createDefaultCrdtOpLog());
  const [opSeq, setOpSeq] = useState<number>(8);
  const [lastCompaction, setLastCompaction] = useState<CrdtCompactionResult | null>(null);

  const [stripe, setStripe] = useState<ManuscriptParityStripe>(() => createDefaultManuscriptParityStripe(256));
  const [corruptStep, setCorruptStep] = useState<number>(0);
  const [recoveryReport, setRecoveryReport] = useState<ManuscriptRecoveryReport | null>(null);

  const [leaseState, setLeaseState] = useState<TabWriterLeaseState>(() => createInitialTabWriterLeaseState(5000));

  const clockRelation = useMemo(() => compareVectorClocks(clockA, clockB), [clockA, clockB]);
  const liveCompaction = useMemo(() => compactCrdtOpLog(opLog), [opLog]);
  const effectiveCompaction = lastCompaction ?? liveCompaction;

  const liveChunkDiagnostics = useMemo(
    () =>
      stripe.chunks.map((chunk) => {
        const crc = computeCrc32Hex(chunk.data);
        const sha = computeSha256Hex(chunk.data);
        return { chunk, crc, sha, healthy: crc === chunk.expectedCrc32 && sha === chunk.expectedSha256 };
      }),
    [stripe],
  );

  const liveParityHealthy = useMemo(
    () =>
      computeCrc32Hex(stripe.parityData) === stripe.expectedParityCrc32 &&
      computeSha256Hex(stripe.parityData) === stripe.expectedParitySha256,
    [stripe],
  );

  const corruptedCount = useMemo(() => liveChunkDiagnostics.filter((item) => !item.healthy).length, [liveChunkDiagnostics]);
  const remainingTtlMs = Math.max(0, leaseState.leaseExpiresAtMs - leaseState.nowMs);
  const totalFencedWrites = useMemo(() => leaseState.tabs.reduce((s, t) => s + t.blockedWriteAttempts, 0), [leaseState.tabs]);
  const totalPreservedDrafts = useMemo(() => leaseState.tabs.reduce((s, t) => s + t.pendingReadOnlyDraftCount, 0), [leaseState.tabs]);

  const handleBumpClock = (side: "A" | "B", actor: string): void => {
    if (isPending()) return;
    if (side === "A") setClockA((prev) => incrementVectorClock(prev, actor));
    else setClockB((prev) => incrementVectorClock(prev, actor));
  };

  const handleAppendOverwrite = (): void => {
    if (isPending()) return;
    if (opLog.length >= 512) return;
    const latest = opLog[opLog.length - 1];
    const nextLamport = Math.max(...opLog.map((op) => op.lamport), 0) + 1;
    const baseClock = latest ? latest.clock : { "ipad-main": 0, "desktop-studio": 0, "assist-pen": 0 };
    const nextOp: CrdtOperation = {
      opId: `op-${String(opSeq).padStart(2, "0")}`,
      entityKey: "cut-01:layer-ink:stroke",
      cutId: "cut-01",
      kind: "stroke-commit",
      actorId: "ipad-main",
      lamport: nextLamport,
      clock: incrementVectorClock(baseClock, "ipad-main"),
      payloadSummary: pick(`컷 1 펜선 추가 보정 덮어쓰기 (L${nextLamport})`, `Cut 1 ink stroke overwrite revision (L${nextLamport})`),
      payloadBytes: 19600,
    };
    setOpLog([...opLog, nextOp]);
    setOpSeq((prev) => prev + 1);
    setLastCompaction(null);
    setNotice(pick(`중복 덮어쓰기 연산 ${nextOp.opId}를 오프라인 큐에 적재했습니다.`, `Queued overwrite op ${nextOp.opId}.`));
  };

  const handleInjectConcurrentConflict = (): void => {
    if (isPending() || opLog.length > 510) return;
    const nextLamport = Math.max(...opLog.map((op) => op.lamport), 4) + 1;
    const opDesktop: CrdtOperation = {
      opId: `op-${String(opSeq).padStart(2, "0")}`,
      entityKey: "cut-04:balloon-climax:text",
      cutId: "cut-04",
      kind: "balloon-text",
      actorId: "desktop-studio",
      lamport: nextLamport,
      clock: { "ipad-main": 3, "desktop-studio": nextLamport, "assist-pen": 0 },
      payloadSummary: pick("컷 4 대사(데스크톱): 지금 문을 열어.", "Cut 4 text (desktop): Open the door now."),
      payloadBytes: 2300,
    };
    const opIpad: CrdtOperation = {
      opId: `op-${String(opSeq + 1).padStart(2, "0")}`,
      entityKey: "cut-04:balloon-climax:text",
      cutId: "cut-04",
      kind: "balloon-text",
      actorId: "ipad-main",
      lamport: nextLamport,
      clock: { "ipad-main": nextLamport + 2, "desktop-studio": 0, "assist-pen": 0 },
      payloadSummary: pick("컷 4 대사(아이패드): 여기서 끝내자.", "Cut 4 text (iPad): Let us end it here."),
      payloadBytes: 2450,
    };
    setOpLog([...opLog, opDesktop, opIpad]);
    setOpSeq((prev) => prev + 2);
    setLastCompaction(null);
    setNotice(pick(`동일 Lamport ${nextLamport} 동시 편집 충돌 쌍을 오프라인 큐에 주입했습니다.`, `Injected concurrent edit pair at Lamport ${nextLamport}.`));
  };

  const handleRunCompaction = (): void => {
    if (isPending()) return;
    const result = compactCrdtOpLog(opLog);
    setLastCompaction(result);
    compactionNotification.notify(result);
    setNotice(
      pick(
        `메모리 예제 CRDT 큐 압축 후보: ${result.originalCount}건 → ${result.compactedCount}건 (${result.reductionPct}% 절감, 충돌 ${result.conflicts.length}건 결정론 해결)`,
        `In-memory CRDT compaction candidate: ${result.originalCount} → ${result.compactedCount} ops (${result.reductionPct}% saved, ${result.conflicts.length} conflict(s) resolved)`,
      ),
    );
  };

  const handleResetCrdt = (): void => {
    if (isPending()) return;
    setOpLog(createDefaultCrdtOpLog());
    setOpSeq(8);
    setLastCompaction(null);
    setClockA({ "ipad-main": 4, "desktop-studio": 0, "assist-pen": 0 });
    setClockB({ "ipad-main": 2, "desktop-studio": 1, "assist-pen": 0 });
    setNotice(pick("오프라인 CRDT 연산 큐를 초기 시나리오로 복원했습니다.", "Reset offline CRDT operation log."));
  };

  const handleInjectCorruption = (target: string | "parity"): void => {
    if (isPending()) return;
    const offset = 10 + corruptStep * 7;
    const mask = 0x5a + ((corruptStep * 29) & 0x7f);
    setStripe(corruptManuscriptChunk(stripe, target, offset, mask));
    setCorruptStep((prev) => prev + 1);
    setRecoveryReport(null);
    setNotice(
      pick(
        target === "parity" ? "XOR 패리티 블록에 비트 손상을 주입했습니다." : `${target} 청크에 OPFS 비트 손상을 주입했습니다.`,
        target === "parity" ? "Injected bit-rot into XOR parity block." : `Injected OPFS bit-rot into ${target}.`,
      ),
    );
  };

  const handleVerifyAndRepair = (): void => {
    if (isPending()) return;
    const report = verifyAndRepairManuscriptChunks(stripe);
    setStripe(report.repairedStripe);
    setRecoveryReport(report);
    recoveryNotification.notify(report);
    setNotice(isKo ? report.summaryKo : report.summaryEn);
  };

  const handleResetStripe = (): void => {
    if (isPending()) return;
    setStripe(createDefaultManuscriptParityStripe(256));
    setCorruptStep(0);
    setRecoveryReport(null);
    setNotice(pick("OPFS 16K 원고 청크와 XOR 패리티를 원본 정상 상태로 초기화했습니다.", "Reset OPFS 16K chunks & XOR parity."));
  };

  const dispatchLease = (action: TabWriterLeaseAction): void => {
    if (isPending()) return;
    const next = stepTabWriterLease(leaseState, action);
    setLeaseState(next);
    leaseNotification.notify(next);
    const latest = next.auditLog[0];
    if (latest) setNotice(isKo ? latest.detailKo : latest.detailEn);
  };

  const handleResetLease = (): void => {
    if (isPending()) return;
    const fresh = createInitialTabWriterLeaseState(5000);
    setLeaseState(fresh);
    leaseNotification.notify(fresh);
    setNotice(pick("멀티탭 단일 쓰기 잠금 시뮬레이터를 초기 상태(에폭 1)로 복원했습니다.", "Reset multi-tab writer lease state to Epoch 1."));
  };

  const tabs: readonly { readonly id: OfflineResilienceTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "crdt-vclock", label: pick("CRDT 벡터시계 · 큐 압축", "CRDT Vector Clock · Compaction"), icon: <GitMerge className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "opfs-parity", label: pick("OPFS 16K 무결성 · XOR 복구", "OPFS 16K Integrity · XOR Repair"), icon: <HardDrive className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "tab-lease", label: pick("멀티탭 쓰기 잠금 · 펜싱 토큰", "Multi-Tab Lease · Fencing Epoch"), icon: <Lock className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  const relationText = (rel: VectorClockRelation): string => {
    if (rel === "before") return pick("인과 선행 (before)", "Causal Before");
    if (rel === "after") return pick("인과 후행 (after)", "Causal After");
    if (rel === "equal") return pick("동일 시각 (equal)", "Equal");
    return pick("동시 편집 충돌 (concurrent)", "Concurrent Conflict");
  };

  return (
    <section
      data-testid="offline-resilience-panel"
      aria-label={pick("오프라인 CRDT · OPFS 청크 패리티 · 멀티탭 단일 쓰기 잠금 내구성 랩", "Offline CRDT · OPFS Chunk Parity · Multi-Tab Writer Lease Lab")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <p data-testid="offline-example-scope" className="rounded-lg border border-line bg-card p-3 text-xs text-fg-2">{pick("메모리 계산 예제입니다. 실제 원고·OPFS·CRDT 큐를 읽거나 저장하지 않으며 브라우저 탭 잠금도 적용하지 않습니다. 새로 열면 초기화됩니다.", "In-memory computation examples; actual documents, OPFS and CRDT queues are not read or saved, and browser tab locks are not applied. Reopening resets the example.")}</p>
      <ExampleNotificationStatus status={compactionNotification.status} retry={compactionNotification.retry} retryTestId="retry-compaction-notification" isEn={!isKo} />
      <ExampleNotificationStatus status={recoveryNotification.status} retry={recoveryNotification.retry} retryTestId="retry-recovery-notification" isEn={!isKo} />
      <ExampleNotificationStatus status={leaseNotification.status} retry={leaseNotification.retry} retryTestId="retry-lease-notification" isEn={!isKo} />
      <fieldset disabled={pending} className="min-w-0 space-y-4 border-0 p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("오프라인-퍼스트 CRDT · OPFS 16K 패리티 복구 · 멀티탭 쓰기 잠금 랩", "Offline-First CRDT · OPFS 16K Parity · Multi-Tab Writer Lease Lab")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "벡터시계·XOR 패리티·펜싱 토큰 계산을 메모리에서 비교합니다. 압축 후보와 원문 예제 큐를 분리해 보존합니다.",
              "Compare vector clocks, XOR parity and fencing tokens in memory. Compaction candidates remain separate from the original example queue.",
            )}
          </p>
        </div>
        <span
          data-testid="resilience-summary-badge"
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-good bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {pick(`에폭 ${leaseState.fencingEpoch} · 정상 청크 ${stripe.chunks.length - corruptedCount}/${stripe.chunks.length}`, `Epoch ${leaseState.fencingEpoch} · Healthy ${stripe.chunks.length - corruptedCount}/${stripe.chunks.length}`)}
        </span>
      </header>

      <div role="tablist" aria-label={pick("오프라인 내구성 검증 탭", "Offline resilience verification tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? ACTIVE_TONE : IDLE_TONE}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {notice ? (
        <div role="status" aria-live="polite" data-testid="resilience-notice-banner" className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {activeTab === "crdt-vclock" && (
        <div role="tabpanel" id={`${uid}-panel-crdt-vclock`} aria-labelledby={`${uid}-tab-crdt-vclock`} data-testid="panel-crdt-vclock" className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <MetricCard
              label={pick("오프라인 큐 연산 수", "Offline Queue Ops")}
              valueTestId="crdt-op-count"
              value={`${opLog.length} → ${effectiveCompaction.compactedCount} ${pick("건", "ops")}`}
              sub={pick(`제거 가능 중복 ${effectiveCompaction.droppedOpIds.length}건`, `${effectiveCompaction.droppedOpIds.length} redundant`)}
            />
            <MetricCard
              label={pick("델타 큐 용량 절감", "Queue Payload Savings")}
              valueTestId="crdt-reduction-pct"
              valueClassName="text-good"
              value={`${effectiveCompaction.reductionPct}% (${formatBytesKb(effectiveCompaction.savedBytes)})`}
              sub={`${formatBytesKb(effectiveCompaction.originalBytes)} → ${formatBytesKb(effectiveCompaction.compactedBytes)}`}
            />
            <MetricCard
              label={pick("동시 충돌 · LWW 해결", "Concurrent Conflicts")}
              valueTestId="crdt-conflict-count"
              value={pick(`${effectiveCompaction.conflicts.length}건`, `${effectiveCompaction.conflicts.length} item(s)`)}
              sub={pick("타이브레이커: (lamport, actorId)", "Tie-break: (lamport, actorId)")}
            />
            <MetricCard
              label={pick("결정론 병합 다이제스트", "Deterministic Digest")}
              valueTestId="crdt-digest"
              valueClassName="font-mono text-xs text-fg"
              value={effectiveCompaction.deterministicDigest.slice(0, 16)}
              sub={formatClockInline(effectiveCompaction.mergedClock)}
            />
          </div>

          <div className="rounded-lg border border-line bg-card p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg">
                {pick("벡터 시계 인과 관계 비교기 (Clock A vs Clock B)", "Vector Clock Causal Comparator (Clock A vs Clock B)")}
              </h3>
              <span data-testid="vclock-relation-badge" className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${relationTone(clockRelation)}`}>
                {relationText(clockRelation)}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {(["A", "B"] as const).map((side) => {
                const targetClock = side === "A" ? clockA : clockB;
                return (
                  <div key={side} className="rounded-lg border border-line bg-panel p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-fg">{pick(`벡터 시계 ${side}`, `Vector Clock ${side}`)}</span>
                      <span data-testid={`vclock-value-${side}`} className="font-mono text-fg-2 tabular-nums">{formatClockInline(targetClock)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ACTORS.map((actor) => (
                        <button
                          key={actor} type="button" data-testid={`btn-vclock-${side}-${actor}`}
                          onClick={() => handleBumpClock(side, actor)} className={`${ACTION_BTN} ${IDLE_TONE}`}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          <span className="tabular-nums">{actor} ({targetClock[actor] ?? 0})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="btn-compact-crdt" onClick={handleRunCompaction} className={`${ACTION_BTN} ${PRIMARY_TONE}`}>
              <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("CRDT 델타 큐 압축 실행", "Run CRDT Compaction")}</span>
            </button>
            <button type="button" data-testid="btn-append-overwrite" disabled={opLog.length >= 512} onClick={handleAppendOverwrite} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("중복 덮어쓰기 연산 추가", "Queue Overwrite Op")}</span>
            </button>
            <button type="button" data-testid="btn-inject-conflict" disabled={opLog.length > 510} onClick={handleInjectConcurrentConflict} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("동시 편집 충돌 쌍 주입", "Inject Concurrent Pair")}</span>
            </button>
            <button type="button" data-testid="btn-reset-crdt" onClick={handleResetCrdt} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("큐 초기화", "Reset Queue")}</span>
            </button>
          </div>

          {effectiveCompaction.conflicts.length > 0 ? (
            <div data-testid="crdt-conflicts-box" className="rounded-lg border border-line bg-warning-soft p-3 space-y-1.5">
              <div className="text-xs font-semibold text-warn">
                {pick("감지된 동시 편집 충돌 및 결정론 LWW 승자", "Detected Concurrent Conflicts & Deterministic LWW Winners")}
              </div>
              {effectiveCompaction.conflicts.map((conflict) => (
                <div key={`${conflict.entityKey}-${conflict.loserOpId}`} className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg tabular-nums">
                  <span className="font-mono">{conflict.entityKey}</span>
                  <span>
                    {pick(
                      `승자 ${conflict.winnerOpId} (${conflict.winnerActorId}, L${conflict.winnerLamport}) vs 패자 ${conflict.loserOpId} (${conflict.loserActorId}) · 기준: ${conflict.tieBreaker}`,
                      `Winner ${conflict.winnerOpId} (${conflict.winnerActorId}, L${conflict.winnerLamport}) over ${conflict.loserOpId} (${conflict.loserActorId}) via ${conflict.tieBreaker}`,
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border border-line bg-card p-3 space-y-2">
            <div className="text-xs font-semibold text-fg">
              {pick(`현재 오프라인 연산 큐 (${opLog.length}건)`, `Current Offline Operation Queue (${opLog.length})`)}
            </div>
            <ul className="space-y-1.5" data-testid="crdt-op-list">
              {opLog.map((op) => (
                <li key={op.opId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-panel px-2.5 py-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-semibold text-accent">{op.opId}</span>
                      <span className="font-mono text-fg-2">{op.entityKey}</span>
                      <span className="rounded border border-line bg-card px-1.5 py-0.5 text-fg-3 tabular-nums">{op.actorId} · L{op.lamport}</span>
                    </div>
                    <div className="text-fg-2">{op.payloadSummary}</div>
                  </div>
                  <div className="text-right font-mono text-fg-3 tabular-nums">
                    <div>{formatBytesKb(op.payloadBytes)}</div>
                    <div>{formatClockInline(op.clock)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === "opfs-parity" && (
        <div role="tabpanel" id={`${uid}-panel-opfs-parity`} aria-labelledby={`${uid}-tab-opfs-parity`} data-testid="panel-opfs-parity" className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <MetricCard
              label={pick("16K 원고 스트라이프 상태", "16K Stripe Status")}
              valueTestId="opfs-stripe-status"
              value={
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${stripeTone(recoveryReport?.overallStatus ?? (corruptedCount === 0 && liveParityHealthy ? "healthy" : "degraded-unrecoverable"))}`}>
                  {recoveryReport ? recoveryReport.overallStatus : corruptedCount === 0 && liveParityHealthy ? "healthy" : pick("손상 감지(복구 대기)", "corrupted-pending")}
                </span>
              }
              sub={pick(`손상 데이터 청크 ${corruptedCount}개`, `${corruptedCount} corrupted data chunk(s)`)}
            />
            <MetricCard
              label={pick("XOR 패리티 블록", "XOR Parity Block")}
              valueTestId="opfs-parity-health"
              valueClassName={liveParityHealthy ? "text-good" : "text-bad"}
              value={liveParityHealthy ? pick("정상 (일치)", "Healthy") : pick("손상됨", "Corrupted")}
              sub={<span className="font-mono">CRC32 {computeCrc32Hex(stripe.parityData)}</span>}
            />
            <MetricCard
              label={pick("무손실 해시 복구 검증", "Lossless Hash Verify")}
              valueTestId="opfs-lossless-badge"
              value={
                recoveryReport
                  ? recoveryReport.losslessVerified ? pick("통과 (비트 일치)", "Verified (Bit-Exact)") : pick("복구 한계 초과", "Unrecoverable")
                  : pick("검증 대기", "Awaiting Scan")
              }
              sub={pick("32-bit CRC32 + SHA-256", "Pure 32-bit CRC32 + SHA-256")}
            />
            <MetricCard
              label={pick("청크 스트라이프 폭", "Stripe Chunk Size")}
              value={`${stripe.chunks.length} × ${stripe.chunkByteSize} B + P`}
              sub={pick("단일 장애 무손실 XOR", "Single-fault lossless XOR")}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="btn-verify-repair-opfs" onClick={handleVerifyAndRepair} className={`${ACTION_BTN} ${PRIMARY_TONE}`}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("CRC32·SHA-256 검증 및 XOR 복구", "Verify Hashes & XOR Repair")}</span>
            </button>
            <button type="button" data-testid="btn-corrupt-parity" onClick={() => handleInjectCorruption("parity")} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("XOR 패리티 손상 주입", "Corrupt XOR Parity")}</span>
            </button>
            <button type="button" data-testid="btn-reset-stripe" onClick={handleResetStripe} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("원본 스트라이프 복원", "Restore Clean Stripe")}</span>
            </button>
          </div>

          {recoveryReport ? (
            <div data-testid="opfs-recovery-summary" className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${stripeTone(recoveryReport.overallStatus)}`}>
              {recoveryReport.losslessVerified ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>{isKo ? recoveryReport.summaryKo : recoveryReport.summaryEn}</span>
            </div>
          ) : null}

          <div className="grid gap-2.5 md:grid-cols-2">
            {liveChunkDiagnostics.map(({ chunk, crc, sha, healthy }) => {
              const reportItem = recoveryReport?.chunkResults.find((item) => item.chunkId === chunk.chunkId);
              const badgeTone = healthy ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad";
              return (
                <div key={chunk.chunkId} data-testid={`chunk-card-${chunk.chunkId}`} className="rounded-lg border border-line bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-fg">{isKo ? chunk.labelKo : chunk.labelEn}</div>
                      <div className="font-mono text-xs text-fg-3">{chunk.opfsPath} · {chunk.canvasBandPx}</div>
                    </div>
                    <span data-testid={`chunk-status-${chunk.chunkId}`} className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeTone}`}>
                      {reportItem?.status === "repaired"
                        ? pick(`복구됨 (${reportItem.repairedByteDiffCount}B)`, `Repaired (${reportItem.repairedByteDiffCount}B)`)
                        : healthy ? pick("정상", "Healthy") : pick("손상됨", "Corrupted")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 rounded-md border border-line bg-panel p-2 font-mono text-xs tabular-nums">
                    <div>
                      <div className="text-fg-3">CRC32</div>
                      <div className={crc === chunk.expectedCrc32 ? "text-good" : "text-bad"}>{crc}</div>
                    </div>
                    <div>
                      <div className="text-fg-3">SHA-256</div>
                      <div className={sha === chunk.expectedSha256 ? "text-fg" : "text-bad"}>{sha.slice(0, 12)}…</div>
                    </div>
                  </div>
                  <button type="button" data-testid={`btn-corrupt-${chunk.chunkId}`} onClick={() => handleInjectCorruption(chunk.chunkId)} className={`${ACTION_BTN} ${IDLE_TONE} w-full`}>
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{pick(`${chunk.chunkId} 비트 손상 주입`, `Inject Bit-Rot into ${chunk.chunkId}`)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "tab-lease" && (
        <div role="tabpanel" id={`${uid}-panel-tab-lease`} aria-labelledby={`${uid}-tab-tab-lease`} data-testid="panel-tab-lease" className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <MetricCard
              label={pick("활성 단일 쓰기 탭", "Active Single Writer")}
              valueTestId="lease-active-writer"
              valueClassName="font-mono text-fg"
              value={leaseState.activeWriterTabId ?? pick("없음 (만료·유휴)", "None (Vacant)")}
              sub={pick(`현재 시각 ${leaseState.nowMs} ms`, `Clock ${leaseState.nowMs} ms`)}
            />
            <MetricCard
              label={pick("단조 펜싱 토큰", "Monotonic Fencing Epoch")}
              valueTestId="lease-fencing-epoch"
              valueClassName="text-accent"
              value={`Epoch ${leaseState.fencingEpoch}`}
              sub={pick(`승인 쓰기 ${leaseState.committedWriteSequence}건`, `${leaseState.committedWriteSequence} committed`)}
            />
            <MetricCard
              label={pick("하트비트 잔여 TTL", "Heartbeat Remaining TTL")}
              valueTestId="lease-remaining-ttl"
              valueClassName={remainingTtlMs > 0 && leaseState.activeWriterTabId ? "text-good" : "text-warn"}
              value={leaseState.activeWriterTabId ? `${remainingTtlMs} ms` : pick("만료됨 (0 ms)", "Expired (0 ms)")}
              sub={pick(`만료 기준 ${leaseState.leaseTtlMs} ms`, `TTL window ${leaseState.leaseTtlMs} ms`)}
            />
            <MetricCard
              label={pick("차단 쓰기 · 미저장 시도", "Fenced · Unsaved Attempts")}
              valueTestId="lease-fenced-summary"
              value={pick(`차단 ${totalFencedWrites} · 미저장 ${totalPreservedDrafts}`, `${totalFencedWrites} fenced · ${totalPreservedDrafts} unsaved`)}
              sub={pick("초안 내용은 저장하지 않음", "Draft content is not stored")}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="btn-lease-tick-half" onClick={() => dispatchLease({ type: "tick", deltaMs: 2500 })} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("+2.5s 시계 진행", "Tick +2.5s")}</span>
            </button>
            <button type="button" data-testid="btn-lease-tick-expire" onClick={() => dispatchLease({ type: "tick", deltaMs: 6000 })} className={`${ACTION_BTN} ${PRIMARY_TONE}`}>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("+6s 하트비트 만료 유발", "Tick +6s (Expire Heartbeat)")}</span>
            </button>
            <button
              type="button" data-testid="btn-lease-heartbeat" disabled={leaseState.activeWriterTabId === null}
              onClick={() => { if (leaseState.activeWriterTabId) dispatchLease({ type: "heartbeat", tabId: leaseState.activeWriterTabId }); }}
              className={`${ACTION_BTN} ${IDLE_TONE}`}
            >
              <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("활성 탭 하트비트 갱신", "Send Writer Heartbeat")}</span>
            </button>
            <button type="button" data-testid="btn-lease-reset" onClick={handleResetLease} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("잠금 초기화", "Reset Lease")}</span>
            </button>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-3">
            {leaseState.tabs.map((tab) => {
              const isWriter = tab.role === "writer";
              return (
                <div key={tab.tabId} data-testid={`lease-tab-card-${tab.tabId}`} className="rounded-lg border border-line bg-card p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-fg">{isKo ? tab.labelKo : tab.labelEn}</div>
                      <div className="font-mono text-xs text-fg-3 tabular-nums">{tab.tabId} · known Epoch {tab.knownFencingEpoch}</div>
                    </div>
                    <span data-testid={`lease-role-${tab.tabId}`} className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${roleTone(tab.role)}`}>
                      {isWriter ? pick("단일 쓰기", "Writer") : pick("읽기 전용", "Read-Only")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-fg-2 tabular-nums">
                    <span>{pick(`승인 ${tab.acceptedWrites}`, `OK ${tab.acceptedWrites}`)}</span>
                    <span>{pick(`차단 ${tab.blockedWriteAttempts}`, `Fenced ${tab.blockedWriteAttempts}`)}</span>
                    <span data-testid={`lease-drafts-${tab.tabId}`}>{pick(`미저장 시도 ${tab.pendingReadOnlyDraftCount}`, `Unsaved attempts ${tab.pendingReadOnlyDraftCount}`)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" data-testid={`btn-acquire-${tab.tabId}`} onClick={() => dispatchLease({ type: "request-write-lease", tabId: tab.tabId })} className={`${ACTION_BTN} ${IDLE_TONE} flex-1`}>
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{pick("잠금 요청", "Request Lock")}</span>
                    </button>
                    <button type="button" data-testid={`btn-takeover-${tab.tabId}`} disabled={isWriter} onClick={() => dispatchLease({ type: "request-write-lease", tabId: tab.tabId, forceTakeover: true })} className={`${ACTION_BTN} ${IDLE_TONE} flex-1`}>
                      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{pick("강제 인계", "Takeover")}</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button" data-testid={`btn-write-${tab.tabId}`}
                      onClick={() => dispatchLease({ type: "attempt-write", tabId: tab.tabId, submittedEpoch: tab.knownFencingEpoch, payloadLabel: pick("OPFS 스트로크 커밋", "OPFS stroke commit") })}
                      className={`${ACTION_BTN} ${isWriter ? PRIMARY_TONE : IDLE_TONE} flex-1`}
                    >
                      <span>{pick(`쓰기 (Epoch ${tab.knownFencingEpoch})`, `Write (Epoch ${tab.knownFencingEpoch})`)}</span>
                    </button>
                    {isWriter ? (
                      <button type="button" data-testid={`btn-release-${tab.tabId}`} onClick={() => dispatchLease({ type: "release-lease", tabId: tab.tabId })} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                        <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{pick("반납", "Release")}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-line bg-card p-3 space-y-1.5">
            <div className="text-xs font-semibold text-fg">
              {pick(`잠금·펜싱 감사 로그 (${leaseState.auditLog.length}건)`, `Lease & Fencing Audit Log (${leaseState.auditLog.length})`)}
            </div>
            <ul data-testid="lease-audit-log" className="space-y-1">
              {leaseState.auditLog.slice(0, 6).map((evt) => (
                <li key={evt.eventId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs">
                  <span className="text-fg">{isKo ? evt.detailKo : evt.detailEn}</span>
                  <span className="font-mono text-fg-3 tabular-nums">{evt.atMs}ms · E{evt.fencingEpoch}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      </fieldset>
    </section>
  );
}
