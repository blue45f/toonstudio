/**
 * 탭 3: P2P 분산 CRDT 델타 메시(WebRTC DataChannel · WebTransport) · 카나리 자동 롤백 오라클.
 */

import {
  AlertTriangle,
  CheckCircle2,
  Network,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useId, useMemo, useState, type ReactElement } from "react";

import {
  CANARY_TELEMETRY_PRESETS,
  evaluateCanaryReleaseHealth,
  runP2pMeshConvergenceScenario,
  type CanaryHealthEvaluation,
  type CanaryReleaseDecision,
  type CanaryTelemetrySnapshot,
  type P2pMeshConvergenceReport,
  type P2pTransportKind,
} from "./p2p-canary-guard";

export interface P2pCanaryOracleTabProps {
  readonly isKo: boolean;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const CHIP_BASE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const CHIP_ACTIVE = "border-accent bg-accent text-on-accent";
const CHIP_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const BTN_SECONDARY = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-card px-3.5 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-colors motion-reduce:transition-none hover:border-accent hover:bg-raised ${FOCUS_RING}`;

const TRANSPORTS: readonly { readonly id: P2pTransportKind; readonly ko: string; readonly en: string }[] = [
  { id: "webtransport-stream", ko: "WebTransport 스트림", en: "WebTransport Stream" },
  { id: "webrtc-datachannel", ko: "WebRTC DataChannel", en: "WebRTC DataChannel" },
];

function decisionBannerClass(decision: CanaryReleaseDecision): string {
  if (decision === "promote") return "border-good/40 bg-good/15 text-good";
  if (decision === "hold") return "border-warn/40 bg-warn/15 text-warn";
  return "border-bad/40 bg-bad/15 text-bad";
}

function decisionLabel(decision: CanaryReleaseDecision, isKo: boolean): string {
  if (decision === "promote") return isKo ? "승격 가능 (PROMOTE)" : "PROMOTE";
  if (decision === "hold") return isKo ? "승격 보류 (HOLD)" : "HOLD";
  return isKo ? "즉시 롤백 (ROLLBACK)" : "ROLLBACK";
}

function formatVectorClock(vc: Readonly<Record<string, number>>): string {
  return Object.entries(vc)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([peer, seq]) => `${peer}:${seq}`)
    .join(" · ");
}

export function P2pCanaryOracleTab({ isKo }: P2pCanaryOracleTabProps): ReactElement {
  const uid = useId();
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [transport, setTransport] = useState<P2pTransportKind>("webtransport-stream");
  const [meshRevision, setMeshRevision] = useState<number>(1);
  const [presetId, setPresetId] = useState<string>(CANARY_TELEMETRY_PRESETS[0]?.id ?? "healthy-promote");

  const defaultTelemetry: CanaryTelemetrySnapshot = CANARY_TELEMETRY_PRESETS[0]?.telemetry ?? {
    releaseVersion: "v36.4.0-rc1",
    canaryTrafficPct: 10,
    observationWindowSec: 900,
    sampleCount: 4200,
    frameDropRate: 0.004,
    p95FrameTimeMs: 11.8,
    webglShaderCompileAttempts: 1850,
    webglShaderCompileFailures: 0,
    wasmMemoryFaultCount: 0,
    httpRequestCount: 28000,
    http5xxCount: 8,
  };
  const [telemetry, setTelemetry] = useState<CanaryTelemetrySnapshot>(defaultTelemetry);

  const meshReport = useMemo<P2pMeshConvergenceReport>(() => {
    void meshRevision;
    return runP2pMeshConvergenceScenario(transport);
  }, [meshRevision, transport]);

  const canaryEval = useMemo<CanaryHealthEvaluation>(
    () => evaluateCanaryReleaseHealth(telemetry),
    [telemetry],
  );

  const handleSelectPreset = useCallback((id: string) => {
    const found = CANARY_TELEMETRY_PRESETS.find((item) => item.id === id);
    if (!found) return;
    setPresetId(found.id);
    setTelemetry(found.telemetry);
  }, []);

  const handleRerunMesh = useCallback(() => {
    setMeshRevision((prev) => prev + 1);
  }, []);

  return (
    <div className="flex flex-col gap-5 [word-break:keep-all]">
      {/* 섹션 A: P2P 분산 CRDT 델타 메시 */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-accent" aria-hidden="true" />
            <h4 className="text-sm font-bold text-fg">
              {pick(
                "P2P Vector-Clock CRDT 델타 메시 (비순차 인과 버퍼링 · 바이너리 압축)",
                "P2P Vector-Clock CRDT Delta Mesh (Out-of-Order Buffering & Binary Compaction)",
              )}
            </h4>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {TRANSPORTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={transport === item.id}
                onClick={() => setTransport(item.id)}
                className={`${CHIP_BASE} ${transport === item.id ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick(item.ko, item.en)}</span>
              </button>
            ))}
            <button type="button" onClick={handleRerunMesh} className={BTN_SECONDARY}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("수렴 재검증", "Re-verify")}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
          <div className="rounded-md border border-line bg-card p-2.5">
            <div className="text-fg-3">{pick("3피어 0-충돌 수렴", "3-Peer Convergence")}</div>
            <div
              className={`mt-0.5 font-bold tabular-nums ${meshReport.allPeersConverged ? "text-good" : "text-bad"}`}
            >
              {meshReport.allPeersConverged
                ? pick("100% 일치 (충돌 0건)", "100% Match (0 Conflicts)")
                : pick("불일치 감지", "Diverged")}
            </div>
            <div className="mt-0.5 font-mono text-fg-2">{meshReport.convergedDigestHex}</div>
          </div>

          <div className="rounded-md border border-line bg-card p-2.5">
            <div className="text-fg-3">{pick("바이너리 자동 압축", "Binary Compaction")}</div>
            <div className="mt-0.5 font-bold text-accent tabular-nums">
              -{meshReport.compactionSavingsPct.toFixed(1)}% ({meshReport.compactionSavedBytes} B)
            </div>
            <div className="mt-0.5 text-fg-2 tabular-nums">
              {meshReport.totalRawBytes} B → {meshReport.totalWireBytes} B
            </div>
          </div>

          <div className="rounded-md border border-line bg-card p-2.5">
            <div className="text-fg-3">{pick("비순차 인과 버퍼링 해소", "Out-of-Order Resolved")}</div>
            <div className="mt-0.5 font-bold text-fg tabular-nums">
              {meshReport.outOfOrderDeliveriesSimulated} {pick("건 보류 후 배출", "buffered & drained")}
            </div>
            <div className="mt-0.5 text-fg-2 tabular-nums">
              {pick("중복 패킷 무시", "Duplicates dropped")}: {meshReport.duplicatePacketsInjected}
            </div>
          </div>

          <div className="rounded-md border border-line bg-card p-2.5">
            <div className="text-fg-3">{pick("전송 채널 규격", "Wire Transport")}</div>
            <div className="mt-0.5 font-bold text-fg">
              {meshReport.transport === "webtransport-stream"
                ? "WebTransport"
                : "WebRTC DataChannel"}
            </div>
            <div className="mt-0.5 text-fg-2 tabular-nums">
              {pick("패킷", "Packets")}: {meshReport.emittedPacketCount} (CRC32 + FNV-1a)
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-line bg-card">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-raised text-fg-2">
                <th className="px-3 py-2 font-semibold">{pick("피어 노드", "Peer Node")}</th>
                <th className="px-3 py-2 font-semibold">{pick("벡터 시계", "Vector Clock")}</th>
                <th className="px-3 py-2 text-right font-semibold">{pick("획 / 3D 노드", "Strokes / 3D")}</th>
                <th className="px-3 py-2 text-right font-semibold">{pick("대기열", "Pending")}</th>
                <th className="px-3 py-2 font-semibold">{pick("상태 해시", "State Digest")}</th>
              </tr>
            </thead>
            <tbody>
              {meshReport.peerSnapshots.map((peer) => (
                <tr key={peer.peerId} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-1.5 font-semibold text-fg">{peer.peerId}</td>
                  <td className="px-3 py-1.5 font-mono text-fg-2 tabular-nums">
                    {formatVectorClock(peer.vectorClock)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-fg tabular-nums">
                    {peer.activeStrokeCount} / {peer.sceneNodeCount}
                  </td>
                  <td className="px-3 py-1.5 text-right text-good tabular-nums">
                    {peer.pendingBufferSize}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-fg tabular-nums">
                    {peer.stateDigestHex}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 섹션 B: 카나리 런타임 헬스 & 자동 롤백 오라클 */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {canaryEval.decision === "rollback" ? (
              <ShieldAlert className="h-4 w-4 text-bad" aria-hidden="true" />
            ) : canaryEval.decision === "hold" ? (
              <AlertTriangle className="h-4 w-4 text-warn" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-good" aria-hidden="true" />
            )}
            <h4 className="text-sm font-bold text-fg">
              {pick(
                "카나리 배포 헬스 · SLO 자동 롤백 오라클",
                "Canary Release Health & SLO Auto-Rollback Oracle",
              )}
            </h4>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold tabular-nums ${decisionBannerClass(canaryEval.decision)}`}
          >
            {decisionLabel(canaryEval.decision, isKo)} · {canaryEval.healthScore}/100
          </span>
        </div>

        {/* 5종 카나리 프리셋 선택 */}
        <div className="flex flex-wrap gap-1.5">
          {CANARY_TELEMETRY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={presetId === preset.id}
              onClick={() => handleSelectPreset(preset.id)}
              className={`${CHIP_BASE} ${presetId === preset.id ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {pick(preset.labelKo, preset.labelEn)}
            </button>
          ))}
        </div>

        {/* 주요 텔레메트리 실시간 조정 슬라이더 */}
        <div className="grid grid-cols-1 gap-3 rounded-md border border-line bg-raised p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${uid}-frame-drop`}
              className="flex justify-between text-xs font-semibold text-fg"
            >
              <span>{pick("프레임 드롭률", "Frame Drop Rate")}</span>
              <span className="text-accent tabular-nums">
                {(telemetry.frameDropRate * 100).toFixed(1)}%
              </span>
            </label>
            <input
              id={`${uid}-frame-drop`}
              type="range"
              min={0}
              max={10}
              step={0.2}
              value={Number((telemetry.frameDropRate * 100).toFixed(1))}
              onChange={(event) => {
                setPresetId("custom");
                setTelemetry((prev) => ({
                  ...prev,
                  frameDropRate: Number(event.target.value) / 100,
                }));
              }}
              className="min-h-11 w-full accent-accent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${uid}-shader-fail`}
              className="flex justify-between text-xs font-semibold text-fg"
            >
              <span>{pick("WebGL 셰이더 실패", "Shader Failures")}</span>
              <span className="text-accent tabular-nums">
                {telemetry.webglShaderCompileFailures} / {telemetry.webglShaderCompileAttempts}
              </span>
            </label>
            <input
              id={`${uid}-shader-fail`}
              type="range"
              min={0}
              max={40}
              step={1}
              value={telemetry.webglShaderCompileFailures}
              onChange={(event) => {
                setPresetId("custom");
                setTelemetry((prev) => ({
                  ...prev,
                  webglShaderCompileFailures: Number(event.target.value),
                }));
              }}
              className="min-h-11 w-full accent-accent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${uid}-wasm-fault`}
              className="flex justify-between text-xs font-semibold text-fg"
            >
              <span>{pick("WASM 메모리 폴트", "WASM Memory Faults")}</span>
              <span className="text-accent tabular-nums">{telemetry.wasmMemoryFaultCount}</span>
            </label>
            <input
              id={`${uid}-wasm-fault`}
              type="range"
              min={0}
              max={10}
              step={1}
              value={telemetry.wasmMemoryFaultCount}
              onChange={(event) => {
                setPresetId("custom");
                setTelemetry((prev) => ({
                  ...prev,
                  wasmMemoryFaultCount: Number(event.target.value),
                }));
              }}
              className="min-h-11 w-full accent-accent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${uid}-http-5xx`}
              className="flex justify-between text-xs font-semibold text-fg"
            >
              <span>{pick("HTTP 5xx 오류 수", "HTTP 5xx Errors")}</span>
              <span className="text-accent tabular-nums">
                {telemetry.http5xxCount} ({(canaryEval.derivedMetrics.http5xxRate * 100).toFixed(2)}%)
              </span>
            </label>
            <input
              id={`${uid}-http-5xx`}
              type="range"
              min={0}
              max={200}
              step={2}
              value={telemetry.http5xxCount}
              onChange={(event) => {
                setPresetId("custom");
                setTelemetry((prev) => ({
                  ...prev,
                  http5xxCount: Number(event.target.value),
                }));
              }}
              className="min-h-11 w-full accent-accent"
            />
          </div>
        </div>

        {/* 권고 조치 및 트리거 근거 목록 */}
        <div
          className={`flex flex-col gap-2 rounded-md border p-3 text-xs ${decisionBannerClass(canaryEval.decision)}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
            <span>{pick(canaryEval.recommendedActionKo, canaryEval.recommendedActionEn)}</span>
            <span className="tabular-nums">
              {pick("잔여 오류 예산", "Error Budget Left")}:{" "}
              {canaryEval.derivedMetrics.remainingErrorBudgetPct.toFixed(1)}% · Burn{" "}
              {canaryEval.derivedMetrics.errorBudgetBurnRate.toFixed(1)}x
            </span>
          </div>

          {canaryEval.triggers.length === 0 ? (
            <div className="flex items-center gap-1.5 text-good">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {pick(
                  "위반된 SLO 임계치가 없습니다. 전체 트래픽 승격 기준을 충족했습니다.",
                  "Zero SLO breaches detected. Ready for full traffic promotion.",
                )}
              </span>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {canaryEval.triggers.map((trigger) => (
                <li
                  key={trigger.code}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-card px-2.5 py-1.5 text-fg"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                        trigger.severity === "rollback"
                          ? "bg-bad/15 text-bad"
                          : "bg-warn/15 text-warn"
                      }`}
                    >
                      {trigger.code}
                    </span>
                    <span>{pick(trigger.summaryKo, trigger.summaryEn)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
