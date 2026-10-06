/**
 * 녹음부스 테이크의 프로젝트 에셋 저장 배선 (페이지 소유).
 *
 * 테이크 blob을 서버 에셋으로 실제 업로드하고 결과에 따라 정직하게
 * 알린다. assetId·operationId는 takeId+recordedAtMs에서 결정적으로
 * 만들어, 같은 테이크 재시도는 서버 멱등으로 같은 에셋에 수렴한다.
 * 게스트 안내는 저장 시점 로그인 유도 원칙을 따른다.
 */

import { useCallback } from "react";

import { spaceKoParticle } from "./hud/space-korean";
import type { SpaceToastTone } from "./hud/use-space-toasts";
import type { StudioProjectAudioAssetDescriptor } from "./studio-virtual-space-recording-booth";
import { uploadStudioRecordingBoothAsset } from "./studio-recording-booth-asset-client";

export interface StudioVirtualSpaceBoothAssetBinding {
  readonly requestSaveLogin: () => void;
  readonly handleBoothProjectAsset: (descriptor: StudioProjectAudioAssetDescriptor, blob: Blob | null) => Promise<boolean>;
}

export function useStudioVirtualSpaceBoothAsset(input: {
  readonly bt: (ko: string, en: string) => string;
  readonly notify: (message: string, tone?: SpaceToastTone) => void;
}): StudioVirtualSpaceBoothAssetBinding {
  const { bt, notify } = input;

  const requestSaveLogin = useCallback(() => {
    notify(bt("로그인하면 프로젝트에 저장할 수 있어요.", "Sign in to save this to your project."), "info");
  }, [bt, notify]);

  const handleBoothProjectAsset = useCallback(async (
    descriptor: StudioProjectAudioAssetDescriptor,
    blob: Blob | null,
  ): Promise<boolean> => {
    if (!blob) {
      notify(bt("녹음 데이터를 찾을 수 없어 저장하지 못했어요.", "The recording data is missing, so it couldn't be saved."), "error");
      return false;
    }
    try {
      await uploadStudioRecordingBoothAsset(descriptor.projectId, {
        operationId: `booth-save:${descriptor.takeId}:${descriptor.recordedAtMs}`,
        assetId: `${descriptor.takeId}-${descriptor.recordedAtMs}`,
        name: descriptor.name,
        boothId: descriptor.boothId,
        durationMs: descriptor.durationSec * 1000,
      }, blob);
      notify(bt(`${spaceKoParticle(descriptor.name, "을")} 프로젝트 에셋에 넣었어요.`, `Added "${descriptor.name}" to the project assets.`), "success");
      return true;
    } catch {
      notify(bt("프로젝트 에셋 저장에 실패했어요. 테이크는 남아 있으니 다시 시도해 주세요.", "Saving to the project assets failed. The take is still here — please try again."), "error");
      return false;
    }
  }, [bt, notify]);

  return { requestSaveLogin, handleBoothProjectAsset };
}
