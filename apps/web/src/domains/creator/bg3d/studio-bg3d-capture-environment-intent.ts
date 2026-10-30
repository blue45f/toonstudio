import { getSkyPreset, normalizePanoramaRotationDegrees } from "../studio-background-3d-sky";
import { normalizeStudioBg3dEnvironmentSettings } from "./studio-bg3d-hdri-environment";
import { getStudioBg3dHdriEnvironmentAsset, isStudioBg3dHdriEnvironmentAssetId, resolveStudioBg3dHdriEnvironmentLocalUrl } from "./studio-bg3d-hdri-environment-assets";
import type { StudioBg3dEnvironmentSettings } from "./studio-bg3d-hdri-environment";
import type { StudioBg3dHdriFileTier } from "./studio-bg3d-hdri-environment-assets";
import type { StudioBg3dSkyPresetId } from "./studio-bg3d-scene-document-types";

export type StudioBg3dCaptureEnvironmentOwner = "hdri" | "panorama" | "none";
export interface StudioBg3dCaptureEnvironmentIntentInput {
  readonly settings: StudioBg3dEnvironmentSettings;
  readonly fileTier: StudioBg3dHdriFileTier;
  readonly skyPresetId: StudioBg3dSkyPresetId;
  readonly panoramaRotationDegrees: number;
  readonly immersiveAr: boolean;
}
export interface StudioBg3dCaptureEnvironmentIntent extends StudioBg3dCaptureEnvironmentIntentInput {
  readonly fingerprint: string;
  readonly environment: StudioBg3dCaptureEnvironmentOwner;
  readonly background: StudioBg3dCaptureEnvironmentOwner;
  readonly hdriUrl: string | null;
}

/** 문서/렌더 요청만 사용한다. 실제 Scene 포인터나 로딩 중 표시값을 기대값으로 역추론하지 않는다. */
export function createStudioBg3dCaptureEnvironmentIntent(input: StudioBg3dCaptureEnvironmentIntentInput): StudioBg3dCaptureEnvironmentIntent {
  const settings = input.settings;
  if ((input.fileTier !== "1k" && input.fileTier !== "2k") || typeof input.immersiveAr !== "boolean"
    || !Number.isFinite(input.panoramaRotationDegrees) || getSkyPreset(input.skyPresetId).id !== input.skyPresetId
    || !settings || (settings.source !== "hdri" && settings.source !== "procedural")
    || !Number.isFinite(settings.intensity) || settings.intensity < 0 || settings.intensity > 4
    || !Number.isFinite(settings.rotationDegrees) || typeof settings.useAsBackground !== "boolean"
    || (settings.source === "hdri" ? !isStudioBg3dHdriEnvironmentAssetId(settings.assetId) : settings.assetId !== null)) {
    throw new TypeError("캡처 환경의 정본 요청을 확인하지 못했습니다.");
  }
  const copied = Object.freeze(normalizeStudioBg3dEnvironmentSettings(settings));
  const environment = input.immersiveAr ? "none" : copied.source === "hdri" ? "hdri" : "panorama";
  const background = input.immersiveAr ? "none" : copied.source === "hdri" && copied.useAsBackground ? "hdri" : "panorama";
  const asset = copied.source === "hdri" ? getStudioBg3dHdriEnvironmentAsset(copied.assetId) : undefined;
  const hdriUrl = asset && !input.immersiveAr ? resolveStudioBg3dHdriEnvironmentLocalUrl(asset, input.fileTier) : null;
  const value: Omit<StudioBg3dCaptureEnvironmentIntent, "fingerprint"> = { settings: copied, fileTier: input.fileTier, skyPresetId: input.skyPresetId,
    panoramaRotationDegrees: normalizePanoramaRotationDegrees(input.panoramaRotationDegrees),
    immersiveAr: input.immersiveAr, environment, background, hdriUrl };
  // 키 순서를 고정한다. 0 intensity도 실제 HDRI 요청이며 임의 none/품질 저하로 바꾸지 않는다.
  const fingerprint = JSON.stringify({ version: 1, source: copied.source, assetId: copied.assetId,
    intensity: copied.intensity, rotationDegrees: copied.rotationDegrees, useAsBackground: copied.useAsBackground,
    fileTier: value.fileTier, skyPresetId: value.skyPresetId, panoramaRotationDegrees: value.panoramaRotationDegrees,
    immersiveAr: value.immersiveAr, environment, background, hdriUrl });
  return Object.freeze({ ...value, fingerprint });
}
