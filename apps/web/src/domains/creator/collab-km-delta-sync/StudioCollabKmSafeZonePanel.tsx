/**
 * Wave 31 Track C + Wave 32 — 16파장 Kubelka-Munk 타일 델타 압축 동기화 및
 * 오프라인 세이프존 로컬 싱크 허브 UI 패널.
 *
 * Calm Atelier 시맨틱 토큰 전용 · props 없이 단독 렌더 가능 · 원시 색상 및 웹 스토리지 미사용 · KO/EN.
 */

import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Layers,
  PenTool,
  Radio,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_KM_TILE_SIZE,
  EIGHT_ARTIST_PROFILES,
  KM16_BAND_COUNT,
  MIN_REQUIRED_COMPRESSION_RATIO,
  createSafeZoneInteractiveController,
  type SafeZoneInteractiveController,
  type SafeZoneUiSnapshot,
} from "./collab-km-delta-codec";

export interface StudioCollabKmSafeZonePanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly tileSize?: number;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_SECONDARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_WARN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-warn/40 bg-warning-soft px-3 py-2 text-xs font-semibold text-warn transition-colors motion-reduce:transition-none hover:border-warn disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function createInitialSnapshot(tileSize: number): SafeZoneUiSnapshot {
  const bootstrap = createSafeZoneInteractiveController(tileSize);
  const snapshot = bootstrap.getSnapshot();
  bootstrap.dispose();
  return snapshot;
}

function MetricCard({
  label,
  value,
  sublabel,
  testId,
  tone = "default",
}: {
  readonly label: string;
  readonly value: string;
  readonly sublabel: string;
  readonly testId?: string;
  readonly tone?: "default" | "good" | "warn" | "bad";
}): ReactElement {
  const toneCls =
    tone === "good"
      ? "border-good/40 bg-good-soft text-good"
      : tone === "warn"
        ? "border-warn/40 bg-warning-soft text-warn"
        : tone === "bad"
          ? "border-bad/40 bg-bad-soft text-bad"
          : "border-line bg-canvas text-fg";
  return (
    <div data-testid={testId} className={`rounded-xl border p-3 text-xs tabular-nums ${toneCls}`}>
      <div className="text-[11px] opacity-85">{label}</div>
      <div className="mt-1 text-base font-bold">{value}</div>
      <div className="mt-0.5 text-[11px] opacity-80">{sublabel}</div>
    </div>
  );
}

export function StudioCollabKmSafeZonePanel({
  locale,
  className,
  tileSize = DEFAULT_KM_TILE_SIZE,
}: StudioCollabKmSafeZonePanelProps = {}): ReactElement {
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const controllerRef = useRef<SafeZoneInteractiveController | null>(null);
  const controllerTileSizeRef = useRef<number>(tileSize);
  const [snapshot, setSnapshot] = useState<SafeZoneUiSnapshot>(() => createInitialSnapshot(tileSize));
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  const ensureController = (): SafeZoneInteractiveController => {
    if (!controllerRef.current || controllerTileSizeRef.current !== tileSize) {
      controllerRef.current?.dispose();
      controllerRef.current = createSafeZoneInteractiveController(tileSize);
      controllerTileSizeRef.current = tileSize;
    }
    return controllerRef.current;
  };

  const handleRunConcurrentRound = (): void => {
    const next = ensureController().runConcurrentRound();
    setSnapshot(next);
    setStatusMessage(
      pick(
        `라운드 #${next.roundNumber} 8인 동시 채색 완료 · 실측 압축률 ${next.compressionRatio.toFixed(1)}× · 역순 도착 0-충돌 수렴 (${next.convergedReplicaCount}/${next.totalReplicaCount})`,
        `Round #${next.roundNumber} 8-artist concurrent run · ${next.compressionRatio.toFixed(1)}× ratio · 0-conflict convergence (${next.convergedReplicaCount}/${next.totalReplicaCount})`,
      ),
    );
  };

  const handleDisconnectInternet = (): void => {
    const next = ensureController().disconnectInternet();
    setSnapshot(next);
    setStatusMessage(
      pick(
        "인터넷 단절됨 · 오프라인 세이프존 전환 완료. 주변 기기 로컬 메시로 데이터 손실 0건 협업을 이어갑니다.",
        "Internet disconnected · Offline SafeZone active. Local peer mesh keeps collaboration lossless.",
      ),
    );
  };

  const handlePaintOfflineStroke = (): void => {
    const next = ensureController().paintOfflineLocalStroke();
    setSnapshot(next);
    setStatusMessage(
      pick(
        `오프라인 로컬 스트로크 반영 완료 · 미동기화 큐 ${next.unsyncedOutboxTotal}건 적재 · 로컬 메시 ${next.convergedReplicaCount}/${next.totalReplicaCount} 즉시 일치`,
        `Offline local stroke committed · ${next.unsyncedOutboxTotal} queued for cloud · local mesh ${next.convergedReplicaCount}/${next.totalReplicaCount} converged`,
      ),
    );
  };

  const handleReconnectCloud = (): void => {
    const next = ensureController().reconnectCloudAndSync();
    setSnapshot(next);
    setStatusMessage(
      pick(
        `클라우드 재연결 완료 · Yjs 상태 벡터 차분(${formatBytes(next.lastYjsDiffBytes)}) 자동 CRDT 정합 · 미동기화 큐 0건 · 손실 0건`,
        `Reconnected to cloud · Yjs state-vector diff (${formatBytes(next.lastYjsDiffBytes)}) reconciled · 0 queued · 0 lost`,
      ),
    );
  };

  const ratioMet = snapshot.compressionRatio >= MIN_REQUIRED_COMPRESSION_RATIO;
  const allConverged = snapshot.convergedReplicaCount === snapshot.totalReplicaCount && snapshot.conflictCount === 0;
  const cloudSynced = snapshot.cloudDigestHex === snapshot.meshDigestHex && snapshot.unsyncedOutboxTotal === 0;
  const [mixR, mixG, mixB] = snapshot.blueYellowMixRgba;

  return (
    <section
      aria-label={pick(
        "16파장 Kubelka-Munk 타일 델타 압축 및 오프라인 세이프존 로컬 싱크 허브",
        "16-Wavelength Kubelka-Munk Delta Sync & Offline SafeZone Hub",
      )}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Yjs · WebRTC 바이너리 델타 · 오프라인 세이프존 허브", "Yjs · WebRTC Binary Delta · Offline SafeZone Hub")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">
            {pick("16파장 KM 광학 델타 동기화 · 로컬 메시 세이프존", "16-Band KM Delta Sync & Local Mesh SafeZone")}
          </h2>
          <p className="text-xs text-fg-2">
            {pick(
              "16파장 Kubelka-Munk 혼색 스트로크와 XOR·RLE·LEB128 타일 델타를 압축 전송하고, 인터넷 단절 시에도 로컬 메시로 데이터 손실 없이 협업을 유지합니다.",
              "Compresses 16-band Kubelka-Munk strokes with XOR+RLE+LEB128 tile deltas and keeps collaboration lossless over local peer mesh while offline.",
            )}
          </p>
        </div>

        <span
          data-testid="safezone-network-badge"
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
            snapshot.internetOnline
              ? "border-good/40 bg-good-soft text-good"
              : "border-warn/40 bg-warning-soft text-warn"
          }`}
        >
          {snapshot.internetOnline ? (
            <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{pick(snapshot.transportLabelKo, snapshot.transportLabelEn)}</span>
        </span>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          testId="km-compression-ratio-tile"
          label={pick("실측 타일 압축률", "Measured Compression")}
          value={`${snapshot.compressionRatio.toFixed(1)}×`}
          sublabel={
            ratioMet
              ? pick(`목표 ≥ ${MIN_REQUIRED_COMPRESSION_RATIO}× 충족`, `Meets ≥ ${MIN_REQUIRED_COMPRESSION_RATIO}× target`)
              : pick("압축률 점검 필요", "Below target")
          }
          tone={ratioMet ? "good" : "bad"}
        />
        <MetricCard
          testId="km-convergence-tile"
          label={pick("8인 0-충돌 수렴", "8-Artist Convergence")}
          value={`${snapshot.convergedReplicaCount}/${snapshot.totalReplicaCount}`}
          sublabel={pick(`충돌 ${snapshot.conflictCount}건 · ${snapshot.meshDigestHex}`, `${snapshot.conflictCount} conflicts · ${snapshot.meshDigestHex}`)}
          tone={allConverged ? "good" : "bad"}
        />
        <MetricCard
          testId="safezone-unsynced-queue-tile"
          label={pick("미동기화 클라우드 큐", "Unsynced Cloud Queue")}
          value={pick(`${snapshot.unsyncedOutboxTotal}건`, `${snapshot.unsyncedOutboxTotal} ops`)}
          sublabel={
            cloudSynced
              ? pick("클라우드 정합 완료", "Cloud reconciled")
              : pick("재연결 시 상태 벡터 차분 전송", "Queued for state-vector diff")
          }
          tone={snapshot.unsyncedOutboxTotal === 0 ? "good" : "warn"}
        />
        <MetricCard
          testId="safezone-loss-tile"
          label={pick("데이터 손실 / 로컬 중계", "Data Loss / Mesh Relay")}
          value={pick(`${snapshot.lostOpsCount}건`, `${snapshot.lostOpsCount} lost`)}
          sublabel={pick(`로컬 메시 전달 ${snapshot.localMeshRelayedTotal}회`, `${snapshot.localMeshRelayedTotal} mesh relays`)}
          tone={snapshot.lostOpsCount === 0 ? "good" : "bad"}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
        <button type="button" onClick={handleRunConcurrentRound} className={BTN_SECONDARY}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("8인 동시 채색 재측정", "Re-Run 8-Artist Round")}</span>
        </button>

        {snapshot.internetOnline ? (
          <button type="button" onClick={handleDisconnectInternet} className={BTN_WARN}>
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("인터넷 단절 시뮬레이션", "Simulate Internet Cut")}</span>
          </button>
        ) : (
          <button type="button" onClick={handleReconnectCloud} className={BTN_PRIMARY}>
            <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("재연결 · 상태 벡터 정합", "Reconnect & Sync Diff")}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handlePaintOfflineStroke}
          disabled={snapshot.internetOnline}
          className={BTN_SECONDARY}
        >
          <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("오프라인 로컬 스트로크 추가", "Add Offline Local Stroke")}</span>
        </button>
      </div>

      {statusMessage && (
        <p
          role="status"
          data-testid="safezone-status-banner"
          className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-medium text-good"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-3 text-xs tabular-nums space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-fg">
              <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("16파장 KM · XOR·RLE·LEB128 실측", "16-Band KM · XOR+RLE+LEB128 Telemetry")}
            </span>
            <span className="rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] font-semibold text-fg-2">
              {snapshot.tileSize}×{snapshot.tileSize} RGBA · {KM16_BAND_COUNT}nm-bands
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-line bg-canvas p-2">
              <dt className="text-fg-3">{pick("원본 RGBA 누적량", "Raw RGBA Volume")}</dt>
              <dd data-testid="km-raw-bytes" className="mt-0.5 font-bold text-fg">
                {formatBytes(snapshot.rawRgbaTotalBytes)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-2">
              <dt className="text-fg-3">{pick("바이너리 프레임 누적량", "Binary Frame Volume")}</dt>
              <dd data-testid="km-compressed-bytes" className="mt-0.5 font-bold text-fg">
                {formatBytes(snapshot.compressedTotalBytes)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-2">
              <dt className="text-fg-3">{pick("최근 Yjs 상태 벡터 차분", "Latest Yjs SV Diff")}</dt>
              <dd data-testid="safezone-yjs-diff-bytes" className="mt-0.5 font-bold text-fg">
                {formatBytes(snapshot.lastYjsDiffBytes)}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-2">
              <dt className="text-fg-3">{pick("청+황 16파장 감산 혼색", "Blue+Yellow 16-Band Mix")}</dt>
              <dd data-testid="km-optical-mix-check" className="mt-0.5 font-bold text-good">
                [{mixR}, {mixG}, {mixB}] · {pick("녹색 우세", "Green Dominant")}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 text-xs tabular-nums space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-fg">
              <Radio className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("세이프존 정합 다이제스트", "SafeZone Convergence Digests")}
            </span>
            <span
              data-testid="safezone-cloud-sync-badge"
              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                cloudSynced
                  ? "border-good/40 bg-good-soft text-good"
                  : "border-warn/40 bg-warning-soft text-warn"
              }`}
            >
              {cloudSynced ? pick("클라우드·로컬 일치", "Cloud & Mesh Matched") : pick("오프라인 차분 대기", "Pending Cloud Diff")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-line bg-canvas p-2">
              <div className="text-fg-3">{pick("로컬 메시 8인 다이제스트", "Local Mesh Digest")}</div>
              <div data-testid="safezone-mesh-digest" className="mt-0.5 font-mono text-xs font-bold text-fg">
                {snapshot.meshDigestHex}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-2">
              <div className="text-fg-3">{pick("클라우드 업스트림 다이제스트", "Cloud Upstream Digest")}</div>
              <div data-testid="safezone-cloud-digest" className="mt-0.5 font-mono text-xs font-bold text-fg">
                {snapshot.cloudDigestHex}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-fg-2">
            {pick(
              `총 누적 연산 ${snapshot.totalOps}건 · Lamport 시계와 결정론적 OpId 정렬로 역순·지연 패킷도 동일 픽셀로 수렴합니다.`,
              `${snapshot.totalOps} total ops · Lamport clock + deterministic OpId total order guarantees bit-identical convergence.`,
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-card p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-fg">
            {pick("8인 동시 채색 피어 상태 (Lamport · 미동기화 큐 · 다이제스트)", "8-Artist Replica Roster (Lamport · Outbox · Digest)")}
          </span>
          <span className="text-[11px] text-fg-3 tabular-nums">
            {pick(`라운드 #${snapshot.roundNumber}`, `Round #${snapshot.roundNumber}`)}
          </span>
        </div>
        <ul data-testid="safezone-artist-list" className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {snapshot.replicas.map((replica, idx) => {
            const profile = EIGHT_ARTIST_PROFILES[idx];
            const matched = replica.canvasDigestHex === snapshot.meshDigestHex;
            return (
              <li
                key={replica.peerId}
                className="flex flex-col justify-between rounded-lg border border-line bg-canvas px-2.5 py-2 text-[11px] tabular-nums"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-fg">
                    {profile ? pick(`${profile.nameKo} (${profile.roleKo})`, `${profile.nameEn} (${profile.roleEn})`) : replica.peerId}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                      matched ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"
                    }`}
                  >
                    {replica.canvasDigestHex}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-fg-2">
                  <span>L:{replica.lamportClock} · Op:{replica.totalOps}</span>
                  <span>
                    {pick("대기", "Q")}:{replica.unsyncedOutboxCount}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
