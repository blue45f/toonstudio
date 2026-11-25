/**
 * 탭 1: Zero-Copy 선형 메모리 · SharedArrayBuffer 링버퍼 타일 버스 벤치마크 및 메모리 압박 회수 뷰.
 */

import { Activity, AlertTriangle, CheckCircle2, HardDrive, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useId, useMemo, useState, type ReactElement } from "react";

import {
  ZeroCopyTileRingBus,
  type MemoryPressureLevel,
  type MemoryPressureReclaimReport,
  type TileRingBackingPreference,
} from "./zero-copy-tile-ring";
import {
  runZeroCopyTileRingBenchmark,
  type ZeroCopyRingBenchmarkReport,
} from "./zero-copy-tile-ring-benchmark";

export interface RingBufferBenchmarkTabProps {
  readonly isKo: boolean;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const CHIP_BASE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const CHIP_ACTIVE = "border-accent bg-accent text-on-accent";
const CHIP_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const BTN_PRIMARY = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent [word-break:keep-all] transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_SECONDARY = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-card px-3.5 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-colors motion-reduce:transition-none hover:border-accent hover:bg-raised ${FOCUS_RING}`;

const TILE_SIZES: readonly (64 | 128 | 256)[] = [64, 128, 256];
const FRAME_COUNTS: readonly number[] = [32, 64, 128];
const BACKING_PREFS: readonly {
  readonly id: TileRingBackingPreference;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "auto", ko: "자동 (COOP/COEP)", en: "Auto (COOP/COEP)" },
  { id: "shared", ko: "SharedArrayBuffer", en: "SharedArrayBuffer" },
  { id: "arraybuffer", ko: "ArrayBuffer 폴백", en: "ArrayBuffer Fallback" },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function pressureBadgeClass(level: MemoryPressureLevel): string {
  if (level === "critical") return "border-bad/40 bg-bad/15 text-bad";
  if (level === "elevated") return "border-warn/40 bg-warn/15 text-warn";
  return "border-good/40 bg-good/15 text-good";
}

function runPressureDrillSimulation(
  tileSize: 64 | 128 | 256,
  backingPref: TileRingBackingPreference,
): MemoryPressureReclaimReport {
  const bus = new ZeroCopyTileRingBus({
    slotCount: 16,
    tileWidth: tileSize,
    tileHeight: tileSize,
    backingMode: backingPref,
    highWaterRatio: 0.75,
    targetWaterRatio: 0.5,
  });
  const payloadBytes = tileSize * tileSize * 4;
  // 16슬롯 중 14슬롯(87.5%)을 채워 고수위 메모리 압박 상태를 재현
  for (let i = 0; i < 14; i += 1) {
    bus.writeTileInPlace({ frameId: i + 1, tileX: i & 3, tileY: i >>> 2, layerId: 1 }, payloadBytes, (view) => {
      view[0] = (i * 19 + 7) & 0xff;
      view[view.byteLength - 1] = 255;
    });
  }
  return bus.reclaimUnderMemoryPressure({ zeroReclaimedPayload: true });
}

export function RingBufferBenchmarkTab({ isKo }: RingBufferBenchmarkTabProps): ReactElement {
  const uid = useId();
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [tileSize, setTileSize] = useState<64 | 128 | 256>(64);
  const [frameCount, setFrameCount] = useState<number>(64);
  const [backingPref, setBackingPref] = useState<TileRingBackingPreference>("auto");
  const [injectCorruption, setInjectCorruption] = useState<boolean>(false);
  const [runRevision, setRunRevision] = useState<number>(1);
  const [pressureReport, setPressureReport] = useState<MemoryPressureReclaimReport>(() =>
    runPressureDrillSimulation(64, "auto"),
  );

  const report = useMemo<ZeroCopyRingBenchmarkReport>(() => {
    void runRevision;
    return runZeroCopyTileRingBenchmark({
      tileSize,
      frameCount,
      slotCount: 16,
      backingMode: backingPref,
      injectCorruptionAtFrame: injectCorruption ? Math.floor(frameCount / 2) : null,
    });
  }, [backingPref, frameCount, injectCorruption, runRevision, tileSize]);

  const handleRerunBenchmark = useCallback(() => {
    setRunRevision((prev) => prev + 1);
  }, []);

  const handleRunPressureDrill = useCallback(() => {
    setPressureReport(runPressureDrillSimulation(tileSize, backingPref));
  }, [backingPref, tileSize]);

  const corruptionDetected = report.checksumMismatchCount > 0;

  return (
    <div className="flex flex-col gap-4 [word-break:keep-all]">
      {/* 설정 컨트롤 영역 */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-canvas p-3.5 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-fg-2">
            {pick("타일 해상도 (RGBA8)", "Tile Resolution (RGBA8)")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {TILE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={tileSize === size}
                onClick={() => setTileSize(size)}
                className={`${CHIP_BASE} tabular-nums ${tileSize === size ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {size}×{size}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-fg-2">
            {pick("전송 프레임 수", "Benchmark Frames")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {FRAME_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={frameCount === count}
                onClick={() => setFrameCount(count)}
                className={`${CHIP_BASE} tabular-nums ${frameCount === count ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {count} {pick("프레임", "frames")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-fg-2">
            {pick("선형 메모리 백킹", "Linear Memory Backing")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {BACKING_PREFS.map((pref) => (
              <button
                key={pref.id}
                type="button"
                aria-pressed={backingPref === pref.id}
                onClick={() => setBackingPref(pref.id)}
                className={`${CHIP_BASE} ${backingPref === pref.id ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {pick(pref.ko, pref.en)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 실행 및 변조·압박 테스트 액션 바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raised px-3.5 py-2.5">
        <label
          htmlFor={`${uid}-corrupt-toggle`}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-fg"
        >
          <input
            id={`${uid}-corrupt-toggle`}
            type="checkbox"
            checked={injectCorruption}
            onChange={(event) => setInjectCorruption(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span>
            {pick(
              "중간 프레임 1비트 변조 주입 (CRC32 · FNV-1a 차단 검증)",
              "Inject 1-bit corruption mid-stream (CRC32 + FNV-1a verify)",
            )}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleRerunBenchmark} className={BTN_PRIMARY}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("벤치마크 재측정", "Rerun Benchmark")}</span>
          </button>
          <button type="button" onClick={handleRunPressureDrill} className={BTN_SECONDARY}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("메모리 압박 풀 회수 실행", "Run Pressure Reclaim")}</span>
          </button>
        </div>
      </div>

      {/* 버퍼 구조 계산 · 시간 실측 · 무결성 결과 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-fg-3">
            <span>{pick("초기 링 버퍼 (계산)", "Initial Ring Buffer (calculated)")}</span>
            <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-good tabular-nums">
            {formatBytes(report.ringBackingBufferBytes)}
          </div>
          <p className="text-xs text-fg-2 tabular-nums">
            {pick("페이로드 용량", "Payload capacity")}: {formatBytes(report.ringPayloadCapacityBytes)}
          </p>
          <p className="text-xs text-fg-2 tabular-nums">
            {pick("비교 경로 할당 누적", "Copy path cumulative allocation")}: {formatBytes(report.copyAllocPayloadBytes)}{" "}
            ({report.copyAllocPayloadBufferCount} {pick("버퍼", "buffers")})
          </p>
          <p className="text-xs text-fg-2 tabular-nums">
            {pick("비교 경로 복사 누적", "Copy path cumulative copies")}: {formatBytes(report.copyAllocCopiedPayloadBytes)}
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-fg-3">
            <span>{pick("Zero-Copy 처리량 (시간 실측)", "Zero-Copy Throughput (timed)")}</span>
            <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-fg tabular-nums">
            {report.zeroCopyThroughputMiBPerSec.toFixed(1)} MiB/s
          </div>
          <p className="text-xs text-fg-2 tabular-nums">
            {Math.round(report.zeroCopyTilesPerSec).toLocaleString()} tiles/s ·{" "}
            {report.zeroCopyElapsedMs.toFixed(2)} ms
          </p>
          <p className="text-xs text-fg-2 tabular-nums">
            {pick("비교 복사 경로", "Copy path")}: {report.copyAllocThroughputMiBPerSec.toFixed(1)} MiB/s ·{" "}
            {report.copyAllocElapsedMs.toFixed(2)} ms
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-fg-3">
            <span>{pick("체크섬 무결성 검증", "CRC32 · FNV-1a Integrity")}</span>
            {corruptionDetected ? (
              <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
            )}
          </div>
          <div
            className={`text-lg font-bold tabular-nums ${corruptionDetected ? "text-warn" : "text-good"}`}
          >
            {report.verifiedFrames}/{report.frameCount}
          </div>
          <p className="text-xs text-fg-2 tabular-nums">
            {corruptionDetected
              ? pick(
                  `변조 탐지 차단 ${report.checksumMismatchCount}건 (정상 작동)`,
                  `Caught ${report.checksumMismatchCount} corrupted frame(s)`,
                )
              : pick("무결성 불일치 0건 · subarray 동일 버퍼 확인", "0 mismatches · subarray zero-copy")}
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-fg-3">
            <span>{pick("선형 버퍼 백킹 모드", "Active Backing Mode")}</span>
            <HardDrive className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
          </div>
          <div className="text-sm font-bold text-fg">
            {report.backingMode === "shared-array-buffer" ? "SharedArrayBuffer" : "ArrayBuffer"}
          </div>
          <p className="text-xs text-fg-2 tabular-nums">
            {pick("타일당", "Per tile")} {formatBytes(report.tilePayloadBytes)} ·{" "}
            {pick("총 전송", "Total")} {formatBytes(report.totalTransferredBytes)}
          </p>
        </div>
      </div>

      <p className="text-xs text-fg-2">
        {pick(
          "버퍼 수·바이트는 코드 경로 기준 계산값입니다. 초기 링 버퍼는 헤더·정렬 공간을 포함하고, 비교 경로는 프레임마다 페이로드 버퍼 2개를 할당하고 1회 복사한 누적량입니다. 시간·처리량은 현재 스레드의 CPU 루프 실측입니다. 객체·뷰·콜백 할당, 전체 힙·GC·GPU 전송은 측정하지 않습니다.",
          "Buffer counts and bytes are calculated from the code path. The initial ring buffer includes headers and alignment; the copy path totals two payload buffer allocations and one copy per frame. Timing and throughput come from CPU loops on the current thread. Object, view and callback allocations, total heap, GC and GPU transfers are not measured.",
        )}
      </p>

      {/* 메모리 압박 풀 회수 상세 리포트 */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-fg">
            {pick(
              "메모리 압박 풀 회수 리포트 (고수위 75% → 목표 50%)",
              "Memory Pressure Pool Reclamation Report (75% High → 50% Target)",
            )}
          </h4>
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${pressureBadgeClass(pressureReport.pressureLevelAfter)}`}
          >
            {pressureReport.pressureLevelBefore.toUpperCase()} →{" "}
            {pressureReport.pressureLevelAfter.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-md border border-line bg-card px-2.5 py-2">
            <div className="text-fg-3">{pick("회수 슬롯", "Reclaimed Slots")}</div>
            <div className="font-bold text-fg tabular-nums">{pressureReport.reclaimedSlots} / 16</div>
          </div>
          <div className="rounded-md border border-line bg-card px-2.5 py-2">
            <div className="text-fg-3">{pick("회수 선형 메모리", "Reclaimed Bytes")}</div>
            <div className="font-bold text-fg tabular-nums">
              {formatBytes(pressureReport.reclaimedBytes)}
            </div>
          </div>
          <div className="rounded-md border border-line bg-card px-2.5 py-2">
            <div className="text-fg-3">{pick("잔여 대기 슬롯", "Remaining Pending")}</div>
            <div className="font-bold text-fg tabular-nums">
              {pressureReport.remainingPendingSlots}
            </div>
          </div>
          <div className="rounded-md border border-line bg-card px-2.5 py-2">
            <div className="text-fg-3">{pick("풀 에포크 세대", "Pool Epoch")}</div>
            <div className="font-bold text-fg tabular-nums">#{pressureReport.epochGeneration}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
