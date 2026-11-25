import { useMemo, useState } from "react";
import { DEFAULT_WORLD_OFFSET_PX, evaluateInfiniteZoomScene, exportInfiniteZoomManifestJson,
  type GpuBufferStrategy, type InfiniteZoomSceneInput, type InfiniteZoomSceneSnapshot } from "./infinite-zoom-spatial-engine";
import type { StudioInfiniteZoomSpatialPanelProps } from "./StudioInfiniteZoomSpatialPanel";
import { useExampleNotification } from "./use-infinite-zoom-notification";
import { useExampleCopy } from "./use-infinite-zoom-copy";

function inputForScene(scene: InfiniteZoomSceneSnapshot): InfiniteZoomSceneInput {
  return { zoomExp: scene.zoomExp, parallaxDepth: scene.parallaxDepth, worldOffsetPx: scene.worldOffsetPx,
    gpuStrategy: scene.gpuPlan.strategy, frameIndex: scene.gpuPlan.stagingRing.frameIndex };
}
/** CPU 예제 구성과 외부 수신 확인을 분리한다. 수신자는 원본 표·화면과 분리된 스냅샷을 받는다. */
export function useInfiniteZoomController(props: StudioInfiniteZoomSpatialPanelProps, pick: (ko: string, en: string) => string) {
  const [currentInput, setInput] = useState(() => inputForScene(evaluateInfiniteZoomScene({ zoomExp: props.initialZoomExp, parallaxDepth: props.initialParallaxDepth })));
  const [activePreview, setActivePreview] = useState<"none" | "wgsl" | "json">("none");
  const [statusMessage, setStatusMessage] = useState("");
  const { scene, json: manifestJson, wgsl: wgslSource } = useMemo(() => exportInfiniteZoomManifestJson(currentInput), [currentInput]);
  const delivery = useExampleNotification<InfiniteZoomSceneSnapshot>(props.onSceneChange ? value => props.onSceneChange?.(structuredClone(value)) : undefined);
  const copy = useExampleCopy<InfiniteZoomSceneSnapshot, "json" | "wgsl">({ json: props.onExportJson ? (text, value) => props.onExportJson?.(text, structuredClone(value)) : undefined });
  const busy = delivery.status === "pending" || copy.state === "pending";
  function commitChange(next: InfiniteZoomSceneInput, ko: string, en: string): void {
    if (delivery.isPending() || copy.isPending()) return;
    const nextScene = evaluateInfiniteZoomScene(next);
    setInput(inputForScene(nextScene));
    delivery.notify(nextScene);
    setStatusMessage(pick(`CPU 예제: ${ko}`, `CPU example: ${en}`));
  }
  function handleZoomExpChange(next: number, ko?: string, en?: string): void {
    commitChange({ ...currentInput, zoomExp: next }, ko ?? "줌 구성을 변경했습니다. 실제 원고에는 반영하지 않습니다.", en ?? "Zoom configuration changed; no artwork mutation.");
  }
  function handleParallaxChange(next: number): void {
    commitChange({ ...currentInput, parallaxDepth: next }, "시차 계산 구성을 변경했습니다.", "Parallax calculation changed.");
  }
  function handleWorldOffsetChange(next: number): void {
    commitChange({ ...currentInput, worldOffsetPx: next }, "같은 f64 좌표의 상대 오차를 다시 계산했습니다.", "Recomputed relative error for the same f64 coordinates.");
  }
  function handleStrategyChange(next: GpuBufferStrategy): void {
    commitChange({ ...currentInput, gpuStrategy: next }, "가정한 버퍼 전략 모형을 변경했습니다. GPU 실행은 하지 않습니다.", "Buffer strategy model changed; no GPU submission.");
  }
  function handleAdvanceFrame(): void {
    commitChange({ ...currentInput, frameIndex: scene.gpuPlan.stagingRing.frameIndex + 1 }, "계획 프레임의 슬롯을 순환했습니다. 실제 Fence 확인은 아닙니다.", "Advanced the planned slot, without a real fence observation.");
  }
  function handleReset(): void {
    if (delivery.isPending() || copy.isPending()) return;
    setActivePreview("none");
    commitChange({ zoomExp: props.initialZoomExp, parallaxDepth: props.initialParallaxDepth, worldOffsetPx: DEFAULT_WORLD_OFFSET_PX,
      gpuStrategy: "triple-ring-mega-atlas", frameIndex: 0 }, "예제 구성을 정규화한 초기값으로 복원했습니다.", "Restored normalized initial example configuration.");
  }
  function handleCopyJson(): void {
    if (delivery.isPending() || copy.isPending()) return;
    setActivePreview("json"); copy.copy("json", manifestJson, scene);
  }
  function handleCopyWgsl(): void {
    if (delivery.isPending() || copy.isPending()) return;
    setActivePreview("wgsl"); copy.copy("wgsl", wgslSource, scene);
  }
  return { scene, manifestJson, wgslSource, zoomExp: scene.zoomExp, parallaxDepth: scene.parallaxDepth,
    worldOffsetPx: scene.worldOffsetPx, gpuStrategy: scene.gpuPlan.strategy, activePreview, setActivePreview, statusMessage, delivery, copy, busy,
    handleZoomExpChange, handleParallaxChange, handleWorldOffsetChange, handleStrategyChange, handleAdvanceFrame, handleReset, handleCopyJson, handleCopyWgsl };
}
