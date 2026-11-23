import { useId, useMemo, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { formatVectorClock } from "./hlc-vector-clock";
import { buildMultiDeviceOfflineConflictScenario } from "./offline-conflict-scenarios";
import {
  applyConflictResolution,
  type ConflictResolutionResult,
  type ConflictResolutionStrategy,
  type OfflineMergePlan,
  type TileConflictItem,
} from "./tile-layer-crdt-merger";
import "./offline-conflict-resolver.css";

export interface OfflineConflictResolverPanelProps {
  readonly connectivityMode?: string;
  readonly localOnly?: boolean;
  readonly initialPlan?: OfflineMergePlan;
  readonly onResolved?: (result: ConflictResolutionResult) => void;
}

function formatTileBadge(tileKey: string): string {
  const parts = tileKey.split(":");
  if (parts.length !== 3) return tileKey;
  const [layerId, tileX, tileY] = parts;
  return `${layerId} (${tileX}, ${tileY})`;
}

function shortHash(hash: string): string {
  return hash.length > 10 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}

export function OfflineConflictResolverPanel({
  connectivityMode,
  localOnly = false,
  initialPlan,
  onResolved,
}: OfflineConflictResolverPanelProps) {
  const bt = useBilingual("OfflineConflictResolverPanel");
  const headingId = useId();
  const [tamperCheckActive, setTamperCheckActive] = useState(false);
  const [strategyOverrides, setStrategyOverrides] = useState<Readonly<Record<string, ConflictResolutionStrategy>>>({});
  const [resolution, setResolution] = useState<ConflictResolutionResult | null>(null);

  const scenarioLabels = useMemo(
    () => ({
      desktopLabel: bt("데스크톱 Mac", "Desktop Mac"),
      tabletLabel: bt("아이패드 Pro", "iPad Pro"),
      inkLayerName: bt("선화", "Lineart"),
      colorLayerName: bt("채색", "Color"),
      bgLayerName: bt("배경", "Background"),
      bubbleBaseText: bt("잠시만 기다려.", "Hold on a second."),
      bubbleEditedText: bt("잠시만, 바로 합류할게.", "Hold on, joining right now."),
    }),
    [bt],
  );

  const plan = useMemo<OfflineMergePlan>(() => {
    if (initialPlan) return initialPlan;
    return buildMultiDeviceOfflineConflictScenario(scenarioLabels, {
      tamperRemoteTile: tamperCheckActive,
    });
  }, [initialPlan, scenarioLabels, tamperCheckActive]);

  const activeIntegrity = resolution
    ? resolution.manifestIntegrity
    : plan.integrityReport.allValid
      ? plan.integrityReport.local
      : !plan.integrityReport.remote.valid
        ? plan.integrityReport.remote
        : !plan.integrityReport.local.valid
          ? plan.integrityReport.local
          : plan.integrityReport.base;

  const displayedChecksum = resolution
    ? resolution.resolvedDocument.manifestChecksum
    : plan.draftMergedDocument.manifestChecksum;

  const isIntegrityValid = resolution
    ? resolution.manifestIntegrity.valid
    : plan.integrityReport.allValid;

  const unresolvedConflictCount = resolution ? 0 : plan.conflicts.length;

  const handleStrategyChange = (conflictId: string, strategy: ConflictResolutionStrategy): void => {
    setStrategyOverrides((prev) => ({ ...prev, [conflictId]: strategy }));
    setResolution(null);
  };

  const handleLosslessPreserveAll = (): void => {
    const losslessDecisions: Record<string, ConflictResolutionStrategy> = {};
    for (const conflict of plan.conflicts) {
      losslessDecisions[conflict.conflictId] = "stack-as-new-layer";
    }
    setStrategyOverrides(losslessDecisions);
    const result = applyConflictResolution(plan, losslessDecisions, {
      stackedLayerSuffix: bt("보존", "preserved"),
    });
    setResolution(result);
    onResolved?.(result);
  };

  const handleApplySelectedStrategies = (): void => {
    const result = applyConflictResolution(plan, strategyOverrides, {
      stackedLayerSuffix: bt("보존", "preserved"),
    });
    setResolution(result);
    onResolved?.(result);
  };

  const handleToggleTamperDiagnostic = (): void => {
    setTamperCheckActive((prev) => !prev);
    setResolution(null);
  };

  const handleResetSimulation = (): void => {
    setTamperCheckActive(false);
    setStrategyOverrides({});
    setResolution(null);
  };

  const statusPillClass = !isIntegrityValid
    ? "crdt-resolver__status-pill crdt-resolver__status-pill--bad"
    : unresolvedConflictCount === 0
      ? "crdt-resolver__status-pill crdt-resolver__status-pill--ok"
      : "crdt-resolver__status-pill crdt-resolver__status-pill--warn";

  const statusPillLabel = !isIntegrityValid
    ? bt("무결성 불일치 감지", "Integrity mismatch")
    : unresolvedConflictCount === 0
      ? bt("무손실 병합 완료", "Lossless merge ready")
      : bt(`동시 충돌 ${unresolvedConflictCount}건`, `${unresolvedConflictCount} tile conflicts`);

  const modeCaption = localOnly || connectivityMode === "offline"
    ? bt(
      "단절 중 기기별 변경을 HLC·Vector Clock으로 추적합니다. 재연결 시 겹치지 않는 타일은 자동 병합됩니다.",
      "Edits are tracked per device with HLC and Vector Clocks while disconnected. Non-overlapping tiles auto-merge on reconnect.",
    )
    : bt(
      "재연결 시 256×256 타일·레이어 단위 3-Way CRDT 병합 상태를 점검합니다.",
      "Inspect 256×256 tile and layer 3-way CRDT convergence on reconnect.",
    );

  const strategyLabel = (conflict: TileConflictItem, strategy: ConflictResolutionStrategy): string => {
    if (strategy === "stack-as-new-layer") {
      return bt("추천 · 원격 타일을 새 보조 레이어로 보존 (유실 0획)", "Recommended · Stack remote tile on new layer (0 loss)");
    }
    if (strategy === "keep-local") {
      return bt(`로컬 유지 (${conflict.localDeviceLabel})`, `Keep local (${conflict.localDeviceLabel})`);
    }
    if (strategy === "keep-remote") {
      return bt(`원격 유지 (${conflict.remoteDeviceLabel})`, `Keep remote (${conflict.remoteDeviceLabel})`);
    }
    return bt("최신 HLC 기준 결정론적 선택", "Pick newer HLC deterministically");
  };

  return (
    <section
      className="crdt-resolver"
      aria-labelledby={headingId}
      data-crdt-conflict-resolver="true"
    >
      <div className="crdt-resolver__header">
        <div>
          <h4 id={headingId} className="crdt-resolver__title">
            {bt("다중 기기 CRDT 충돌 해결", "Multi-device CRDT conflict merge")}
          </h4>
          <p className="crdt-resolver__subtitle">{modeCaption}</p>
        </div>
        <span className={statusPillClass} data-crdt-status-pill="true">
          {statusPillLabel}
        </span>
      </div>

      <div className="crdt-resolver__section" data-crdt-auto-merged="true">
        <span className="crdt-resolver__section-label">
          {bt(
            `자동 병합 완료 ${plan.autoMergedCount}건 (타일 ${plan.autoMergedTiles.length} · 레이어 ${plan.autoMergedLayers.length} · 말풍선 ${plan.autoMergedBubbles.length})`,
            `Auto-merged ${plan.autoMergedCount} items (${plan.autoMergedTiles.length} tiles · ${plan.autoMergedLayers.length} layers · ${plan.autoMergedBubbles.length} bubbles)`,
          )}
        </span>
        {plan.autoMergedTiles.length > 0 ? (
          <div className="crdt-resolver__badge-row">
            {plan.autoMergedTiles.map((tileKey) => (
              <span key={tileKey} className="crdt-resolver__tile-badge" data-crdt-auto-tile={tileKey}>
                {formatTileBadge(tileKey)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {plan.conflicts.length > 0 && !resolution ? (
        <>
          <ul className="crdt-resolver__conflict-list" data-crdt-conflict-list="true">
            {plan.conflicts.map((conflict) => {
              const selectedStrategy = strategyOverrides[conflict.conflictId] ?? conflict.recommendedStrategy;
              const overlapPercent = Math.round(conflict.overlapRatio * 100);
              return (
                <li
                  key={conflict.conflictId}
                  className="crdt-resolver__conflict-card"
                  data-crdt-conflict-tile={conflict.tileKey}
                >
                  <div className="crdt-resolver__conflict-head">
                    <h5 className="crdt-resolver__conflict-title">
                      {conflict.layerName} · {bt(`타일 (${conflict.tileX}, ${conflict.tileY})`, `Tile (${conflict.tileX}, ${conflict.tileY})`)}
                    </h5>
                    <span className="crdt-resolver__overlap-tag">
                      {bt(`겹침 ${overlapPercent}%`, `${overlapPercent}% overlap`)}
                    </span>
                  </div>

                  <dl className="crdt-resolver__meta-grid">
                    <div className="crdt-resolver__meta-item">
                      <dt>{conflict.localDeviceLabel}</dt>
                      <dd>
                        {bt(`+${conflict.localStrokeCount}획`, `+${conflict.localStrokeCount} strokes`)} · {shortHash(conflict.localTileHash)}
                      </dd>
                    </div>
                    <div className="crdt-resolver__meta-item">
                      <dt>{conflict.remoteDeviceLabel}</dt>
                      <dd>
                        {bt(`+${conflict.remoteStrokeCount}획`, `+${conflict.remoteStrokeCount} strokes`)} · {shortHash(conflict.remoteTileHash)}
                      </dd>
                    </div>
                  </dl>

                  <label className="crdt-resolver__strategy-label">
                    <span>{bt("타일 해결 전략", "Tile resolution strategy")}</span>
                    <select
                      className="crdt-resolver__select"
                      value={selectedStrategy}
                      onChange={(event) => {
                        handleStrategyChange(
                          conflict.conflictId,
                          event.currentTarget.value as ConflictResolutionStrategy,
                        );
                      }}
                    >
                      <option value="stack-as-new-layer">{strategyLabel(conflict, "stack-as-new-layer")}</option>
                      <option value="keep-local">{strategyLabel(conflict, "keep-local")}</option>
                      <option value="keep-remote">{strategyLabel(conflict, "keep-remote")}</option>
                      <option value="keep-newer-hlc">{strategyLabel(conflict, "keep-newer-hlc")}</option>
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="crdt-resolver__btn crdt-resolver__btn--primary"
            onClick={handleLosslessPreserveAll}
            disabled={!isIntegrityValid}
            data-crdt-lossless-all="true"
          >
            {bt("두 기기 작업 모두 무손실 레이어 보존", "Preserve both devices on lossless layers")}
          </button>

          {Object.keys(strategyOverrides).length > 0 ? (
            <button
              type="button"
              className="crdt-resolver__btn"
              onClick={handleApplySelectedStrategies}
              disabled={!isIntegrityValid}
            >
              {bt("선택한 전략대로 적용", "Apply selected strategies")}
            </button>
          ) : null}
        </>
      ) : null}

      {resolution ? (
        <div className="crdt-resolver__result-box" data-crdt-resolution-result="true">
          <p className="crdt-resolver__result-title">
            {bt(
              `병합 확정 · 전체 ${resolution.totalUniqueInputStrokes}획 중 ${resolution.preservedStrokeCount}획 보존 (유실 ${resolution.lostStrokeCount}획)`,
              `Merge confirmed · ${resolution.preservedStrokeCount}/${resolution.totalUniqueInputStrokes} strokes preserved (${resolution.lostStrokeCount} lost)`,
            )}
          </p>
          {resolution.createdLayers.length > 0 ? (
            <p className="crdt-resolver__result-detail">
              {bt("생성된 보존 레이어: ", "Created lossless layer: ")}
              {resolution.createdLayers.map((layer) => layer.name).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="crdt-resolver__hash-bar" data-crdt-manifest-integrity={isIntegrityValid ? "valid" : "tampered"}>
        <span>
          {isIntegrityValid
            ? bt("스냅샷 무결성 확인 완료 (FNV-1a 64-bit)", "Snapshot integrity verified (FNV-1a 64-bit)")
            : bt(
              `변조 감지: 타일 ${activeIntegrity.corruptedTileKeys.length}건 해시 불일치`,
              `Tampering detected: ${activeIntegrity.corruptedTileKeys.length} tile hash mismatch`,
            )}
        </span>
        <code className="crdt-resolver__hash-code" data-crdt-manifest-hash="true">
          {displayedChecksum}
        </code>
        <span>
          {bt("Vector Clock: ", "Vector Clock: ")}
          {formatVectorClock(
            resolution ? resolution.resolvedDocument.vectorClock : plan.mergedVectorClock,
          )}
        </span>
      </div>

      {!initialPlan ? (
        <div className="crdt-resolver__controls">
          <button
            type="button"
            className="crdt-resolver__btn crdt-resolver__btn--compact"
            onClick={handleToggleTamperDiagnostic}
            data-crdt-tamper-toggle="true"
          >
            {tamperCheckActive
              ? bt("정상 스냅샷 복원", "Restore valid snapshot")
              : bt("변조 감지 점검", "Test tamper check")}
          </button>
          <button
            type="button"
            className="crdt-resolver__btn crdt-resolver__btn--compact"
            onClick={handleResetSimulation}
          >
            {bt("재연결 시뮬레이션 초기화", "Reset reconnect check")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default OfflineConflictResolverPanel;
