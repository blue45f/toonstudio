import { useMemo, useState } from "react";
import { DEFAULT_EXPORT_DURATION_SEC, DEFAULT_OPFS_FREE_MB, DEFAULT_PARALLEL_WAVE_SLOTS,
  buildShaderWebCodecsPlan, exportShaderWebCodecsManifestJson, getExportPreset, getCodecProfile,
  type ShaderWebCodecsCombinedInput, type ShaderWebCodecsCombinedPlan, type ExportPresetId, type WebCodecsCodecId } from "./shader-prewarm-webcodecs-engine";
import type { StudioShaderPrewarmWebCodecsPanelProps } from "./StudioShaderPrewarmWebCodecsPanel";
import { useExampleNotification } from "./use-shader-codecs-notification";
import { useExampleCopy } from "./use-shader-codecs-copy";

function defaults(props: StudioShaderPrewarmWebCodecsPanelProps): ShaderWebCodecsCombinedInput {
  return { prewarm: { parallelWaveSlots: DEFAULT_PARALLEL_WAVE_SLOTS, cacheHitEnabled: true }, exportConfig: {
    presetId: getExportPreset(props.initialExportPresetId).id, codecId: getCodecProfile(props.initialCodecId).id,
    durationSec: DEFAULT_EXPORT_DURATION_SEC, opfsFreeMb: DEFAULT_OPFS_FREE_MB, hardwareSupport: { av1: true, hevc: true, h264: true } } };
}
/** 실제 실행 없이 계획을 계산하며 plan 알림·JSON 알림·clipboard ACK를 독립적으로 확인한다. */
export function useShaderCodecsController(props: StudioShaderPrewarmWebCodecsPanelProps, pick: (ko: string, en: string) => string) {
  const [currentInput, setInput] = useState(() => defaults(props));
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const plan = useMemo(() => buildShaderWebCodecsPlan(currentInput), [currentInput]);
  const manifestJson = useMemo(() => exportShaderWebCodecsManifestJson(plan), [plan]);
  const delivery = useExampleNotification<ShaderWebCodecsCombinedPlan>(props.onPlanChange ? value => props.onPlanChange?.(structuredClone(value)) : undefined);
  const exportDelivery = useExampleNotification<{ json: string; plan: ShaderWebCodecsCombinedPlan }>(props.onExportJson ? value => props.onExportJson?.(value.json, structuredClone(value.plan)) : undefined);
  const copy = useExampleCopy<ShaderWebCodecsCombinedPlan, "json">({});
  const busy = delivery.status === "pending" || exportDelivery.status === "pending" || copy.state === "pending";
  const pending = () => delivery.isPending() || exportDelivery.isPending() || copy.isPending();
  const local = plan.webCodecsExport; const config = plan.prewarm.config;
  const av1HwSupported = currentInput.exportConfig?.hardwareSupport?.av1 ?? true;
  const hevcHwSupported = currentInput.exportConfig?.hardwareSupport?.hevc ?? true;
  function commit(nextInput: ShaderWebCodecsCombinedInput, ko: string, en: string): void {
    if (pending()) return;
    const next = buildShaderWebCodecsPlan(nextInput); setInput(nextInput); delivery.notify(next);
    setStatusMessage(pick(`CPU 계획 예제: ${ko}`, `CPU planning example: ${en}`));
  }
  function handleSelectPreset(id: ExportPresetId): void {
    const next = getExportPreset(id); commit({ ...currentInput, exportConfig: { ...currentInput.exportConfig, presetId: next.id } }, `${next.labelKo} 프리셋 가정을 선택했습니다.`, `Selected ${next.labelEn} preset assumption.`);
  }
  function handleSelectCodec(id: WebCodecsCodecId): void {
    const next = getCodecProfile(id); commit({ ...currentInput, exportConfig: { ...currentInput.exportConfig, codecId: next.id } }, `${next.labelKo} 후보를 선택했습니다(지원 미검증).`, `Selected ${next.labelEn} candidate (support unverified).`);
  }
  function handleParallelSlots(value: number): void {
    commit({ ...currentInput, prewarm: { ...currentInput.prewarm, parallelWaveSlots: value } }, "컴파일 슬롯 수 가정을 변경했습니다.", "Changed assumed compile lanes.");
  }
  function handleToggleCacheHit(): void {
    commit({ ...currentInput, prewarm: { ...currentInput.prewarm, cacheHitEnabled: !config.cacheHitEnabled } }, "캐시 적중 가정을 변경했습니다(캐시 저장 없음).", "Changed assumed cache hits (no persisted cache).");
  }
  function handleOpfsChange(value: number): void {
    commit({ ...currentInput, exportConfig: { ...currentInput.exportConfig, opfsFreeMb: value } }, `OPFS 여유 가정 ${value} MB로 계산합니다.`, `Assuming ${value} MB of free OPFS capacity.`);
  }
  function handleDurationChange(value: number): void {
    commit({ ...currentInput, exportConfig: { ...currentInput.exportConfig, durationSec: value } }, `길이 가정 ${value}초로 계산합니다.`, `Assuming ${value}s duration.`);
  }
  function handleToggleHwFallback(target: "av1" | "hevc"): void {
    commit({ ...currentInput, exportConfig: { ...currentInput.exportConfig, hardwareSupport: { av1: target === "av1" ? !av1HwSupported : av1HwSupported, hevc: target === "hevc" ? !hevcHwSupported : hevcHwSupported, h264: true } } }, `${target.toUpperCase()} 하드웨어 지원 가정을 변경했습니다.`, `Changed ${target.toUpperCase()} hardware-support assumption.`);
  }
  function handleCopyJson(): void {
    if (pending()) return;
    copy.copy("json", manifestJson, plan); setStatusMessage(pick("JSON 클립보드 복사 요청 · 확인 대기", "JSON clipboard copy requested · awaiting confirmation"));
  }
  function handleExportJson(): void {
    if (pending()) return;
    setShowJsonPreview(true); exportDelivery.notify({ json: manifestJson, plan });
    setStatusMessage(pick("JSON 예제를 준비했습니다. 외부 알림은 저장·인코딩 완료가 아닙니다.", "JSON example prepared. Notification does not confirm storage or encoding."));
  }
  function handleReset(): void { commit(defaults(props), "계획 가정을 초기값으로 복원했습니다.", "Restored initial planning assumptions."); }
  return { plan, manifestJson, presetId: local.preset.id, codecId: local.codecResolution.requestedCodecId,
    parallelWaveSlots: config.parallelWaveSlots, cacheHitEnabled: config.cacheHitEnabled, opfsFreeMb: local.opfsSafetyGate.opfsFreeMb,
    durationSec: local.durationSec, av1HwSupported, hevcHwSupported, showJsonPreview, setShowJsonPreview, statusMessage,
    delivery, exportDelivery, copy, busy, handleSelectPreset, handleSelectCodec, handleParallelSlots, handleToggleCacheHit,
    handleOpfsChange, handleDurationChange, handleToggleHwFallback, handleCopyJson, handleExportJson, handleReset };
}
