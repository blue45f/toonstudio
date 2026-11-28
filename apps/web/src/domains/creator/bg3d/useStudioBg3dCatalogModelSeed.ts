import { useEffect, useEffectEvent } from "react";

import type { Dispatch, SetStateAction } from "react";

import type { StudioBg3dModelImportActions } from "./studio-bg3d-editor-model-import-actions";

interface CatalogModelSeedOptions {
  readonly sourceId?: string | null;
  readonly ready: boolean;
  readonly sessionKey: string;
  readonly importModelFiles: StudioBg3dModelImportActions["importModelFiles"];
  readonly placeBundledEnvironment: (id: string, recipe: "floor", options: { frameEmptyScene: boolean; indoorLighting: boolean }) => Promise<boolean>;
  readonly consume?: () => void;
  readonly setError: Dispatch<SetStateAction<string | null>>;
}

/** 같은 GLB 업로드 경로가 원본 저장·기기별 검증·장면 노드와 실행 취소를 함께 소유한다. */
export function useStudioBg3dCatalogModelSeed({ sourceId, ready, sessionKey, importModelFiles, placeBundledEnvironment, consume, setError }: CatalogModelSeedOptions) {
  const place = useEffectEvent(importModelFiles);
  const placeEnvironment = useEffectEvent(placeBundledEnvironment);
  const report = useEffectEvent(setError);
  const finish = useEffectEvent(() => consume?.());
  useEffect(() => {
    if (!ready || !sourceId) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const { findStudioBg3dModelInsertBySourceId } = await import("../studio-object-insert-catalog");
        if (signal.aborted) return;
        const item = findStudioBg3dModelInsertBySourceId(sourceId);
        if (!item?.assetUrl || !item.assetLicense) {
          throw new Error("선택한 배경 소품의 3D 원본을 카탈로그에서 찾을 수 없습니다.");
        }
        if (item.bundledEnvironmentId) {
          // 설치형 배경은 정본 모델 ID로 연결해야 다른 기기에서도 배포본과 해시로 복원된다.
          await placeEnvironment(item.bundledEnvironmentId, "floor", { frameEmptyScene: true, indoorLighting: item.family === "scene-interior" });
          return;
        }
        const response = await fetch(item.assetUrl, { signal });
        if (!response.ok) throw new Error(`${item.label} 모델을 불러오지 못했습니다 (HTTP ${response.status}).`);
        const blob = await response.blob();
        if (signal.aborted) return;
        const file = new File([blob], `${item.label}.glb`, { type: "model/gltf-binary" });
        const placed = await place([file], {
          status: "licensed", licenseName: item.assetLicense, commercialUse: true, attributionRequired: false,
        }, signal);
        if (!placed && !signal.aborted) report((previous) => previous ?? `${item.label} 모델을 배치하지 못했습니다.`);
      } catch (error) {
        if (!signal.aborted) report(error instanceof Error ? error.message : "배경 모델을 불러오지 못했습니다.");
      } finally {
        if (!signal.aborted) finish();
      }
    })();
    return () => controller.abort();
  }, [ready, sessionKey, sourceId]);
}
