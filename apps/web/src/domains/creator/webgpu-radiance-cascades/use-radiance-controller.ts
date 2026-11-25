import { useState } from "react";
import { exportRadianceCascadesJson, getRadianceLightingScenario, LIGHT_TEMPERATURE_PRESETS, type RadianceSceneInput, type RadianceScenarioId,
  type RadianceShaderId, type LightTemperaturePresetId, type WebGpuRadianceSceneEvaluation } from "./radiance-cascades-engine";
import type { StudioWebGpuRadiancePanelProps } from "./StudioWebGpuRadiancePanel";
import { useExampleNotification } from "./use-radiance-notification";
import { useExampleCopy } from "./use-radiance-copy";

/** 같은 한 번의 CPU 계산을 화면·JSON·수신자에 사용하며, 수신자 변경은 로컬 예제를 수정하지 않는다. */
export function useRadianceController(props: StudioWebGpuRadiancePanelProps, sources: Readonly<Record<RadianceShaderId, string>>, pick: (ko: string, en: string) => string) {
  const [snapshot, setSnapshot] = useState(() => exportRadianceCascadesJson({ scenarioId: props.initialScenarioId, cascadeLevels: props.initialCascadeLevels }));
  const [activeShaderTab, setActiveShaderTab] = useState<RadianceShaderId>("jfa-sdf");
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const delivery = useExampleNotification<WebGpuRadianceSceneEvaluation>(props.onSceneChange ? value => props.onSceneChange?.(structuredClone(value)) : undefined);
  const copy = useExampleCopy<WebGpuRadianceSceneEvaluation, "json" | "wgsl">({ json: props.onExportJson ? (text, value) => props.onExportJson?.(text, structuredClone(value)) : undefined });
  const evaluation = snapshot.evaluation; const manifestJson = snapshot.json; const currentInput = evaluation.config;
  const busy = delivery.status === "pending" || copy.state === "pending";
  function commitScene(input: RadianceSceneInput, noticeKo: string, noticeEn: string): void {
    if (delivery.isPending() || copy.isPending()) return;
    const next = exportRadianceCascadesJson(input); setSnapshot(next); delivery.notify(next.evaluation);
    setStatusMessage(pick(`CPU 예제: ${noticeKo}`, `CPU example: ${noticeEn}`));
  }
  function handleSelectScenario(id: RadianceScenarioId): void {
    const scenario = getRadianceLightingScenario(id);
    commitScene({ ...currentInput, scenarioId: scenario.id, keyLightX: scenario.defaultKeyLightX, keyLightY: scenario.defaultKeyLightY, temperaturePresetId: "scenario-default" }, `${scenario.titleKo} 예제를 선택했습니다. 실제 원고에는 반영하지 않습니다.`, `${scenario.titleEn} example selected; no artwork mutation.`);
  }
  function handleChangeCascades(value: number): void {
    commitScene({ ...currentInput, cascadeLevels: value }, "계층 수와 휴리스틱 조명 계수를 변경했습니다.", "Changed the level count and heuristic lighting coefficient.");
  }
  function handleSelectTemp(id: LightTemperaturePresetId): void {
    const preset = LIGHT_TEMPERATURE_PRESETS.find(value => value.id === id) ?? LIGHT_TEMPERATURE_PRESETS[0];
    commitScene({ ...currentInput, temperaturePresetId: id }, `${preset.labelKo}(${preset.kelvinLabel} 라벨) 색 프리셋을 선택했습니다.`, `Selected ${preset.labelEn} (${preset.kelvinLabel} label) color preset.`);
  }
  function handleReset(): void {
    commitScene({ scenarioId: props.initialScenarioId, cascadeLevels: props.initialCascadeLevels }, "예제 설정을 정규화한 초기값으로 되돌렸습니다.", "Restored normalized initial example settings.");
  }
  function handleCopyWgsl(): void {
    if (delivery.isPending() || copy.isPending()) return;
    setStatusMessage(pick(`${activeShaderTab} WGSL 복사 요청 · 결과를 확인 중입니다.`, `${activeShaderTab} WGSL copy requested · awaiting confirmation.`));
    copy.copy("wgsl", sources[activeShaderTab], evaluation);
  }
  function handleExportJson(): void {
    if (delivery.isPending() || copy.isPending()) return;
    setStatusMessage(pick("JSON 복사·수신 확인 요청", "JSON copy/recipient confirmation requested"));
    setShowJsonPreview(true); copy.copy("json", manifestJson, evaluation);
  }
  return { evaluation, manifestJson, currentInput, ...currentInput, activeShaderTab, setActiveShaderTab, showJsonPreview, setShowJsonPreview,
    statusMessage, delivery, copy, busy, commitScene, handleSelectScenario, handleChangeCascades, handleSelectTemp, handleReset, handleCopyWgsl, handleExportJson };
}
