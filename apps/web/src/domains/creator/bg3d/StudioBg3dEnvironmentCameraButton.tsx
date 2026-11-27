import type { Object3D } from "three";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getStudioBg3dEnvironmentAssetByHash } from "./studio-bg3d-environment-catalog";
import type { StudioBg3dEnvironmentCamera } from "./studio-bg3d-environment-definition";
import { frameStudioBg3dEnvironmentCamera } from "./studio-bg3d-environment-camera";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

interface Props {
  readonly assetHash?: string;
  readonly blockedReason?: string | null;
  readonly readView: () => StudioBg3dCameraSettings | undefined;
  readonly readInstance: () => Object3D | undefined;
  readonly readSource: () => Object3D | undefined;
  readonly isCaptureActive: () => boolean;
  readonly onCommit: (before: StudioBg3dCameraSettings, next: StudioBg3dCameraSettings) => boolean;
  readonly onError: (error: string) => void;
}

export function StudioBg3dEnvironmentCameraButton({
  assetHash, blockedReason, readView, readInstance, readSource, isCaptureActive, onCommit, onError,
}: Props) {
  const bt = useBilingual("StudioBg3dEnvironmentCameraButton");
  const asset = assetHash ? getStudioBg3dEnvironmentAssetByHash(assetHash) : undefined;
  if (!asset) return null;
  const label = bt("선택한 공간의 추천 구도 적용", "Apply the selected location’s suggested framing");
  const apply = (camera: StudioBg3dEnvironmentCamera) => {
    if (isCaptureActive() || blockedReason) return;
    const before = readView();
    const instance = readInstance();
    const root = readSource();
    const next = before && instance && root && frameStudioBg3dEnvironmentCamera(camera, before, instance, root);
    if (!before || !next) {
      onError(bt("공간 모델과 카메라가 준비된 뒤 다시 시도해 주세요.", "Try again when the location and camera are ready."));
      return;
    }
    onCommit(before, next);
  };
  const shotButton = (camera: StudioBg3dEnvironmentCamera, text: string, description: string, subject?: string) => (
    <button type="button" aria-label={description} title={blockedReason || description}
      data-bg3d-environment-camera-action="true"
      disabled={Boolean(blockedReason)} onClick={() => apply(camera)}
      className="inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg shadow-sm hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
      {text}
      {subject && <span className="max-w-24 text-balance text-[0.65rem] leading-tight text-fg-2">{subject}</span>}
    </button>
  );
  return <>
    {shotButton(asset.camera, bt("추천 구도", "Suggested shot"), label)}
    {asset.detailCamera && shotButton(asset.detailCamera, bt("세부 구도", "Detail shot"),
      bt(`세부 구도 적용 · ${asset.detailCamera.subject.ko}`, `Apply detail shot · ${asset.detailCamera.subject.en}`),
      bt(asset.detailCamera.subject.ko, asset.detailCamera.subject.en))}
  </>;
}
