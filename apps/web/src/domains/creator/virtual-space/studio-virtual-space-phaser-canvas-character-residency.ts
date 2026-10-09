/**
 * 장면 캐릭터 텍스처 거주(residency) 백엔드 (캔버스에서 분리).
 *
 * StudioCharacterAssetResidency의 has·load·remove를 Phaser 장면의 로더·애니메이션·텍스처 관리자에 잇는다.
 * 로드 완료·실패 리스너는 load가 돌려주는 해제 함수로 떼고, 제거 시 프레임 정렬 측정값도 함께 잊는다.
 * Phaser는 캔버스가 늦게 불러오므로 여기서는 타입만 가져온다.
 */
import type * as Phaser from "phaser";

import { StudioCharacterAssetResidency } from "./studio-virtual-space-character-assets";
import type { createStudioCharacterTexturePreparer } from "./studio-virtual-space-character-texture-preparer";
import type { StudioFrameRegistry } from "./studio-virtual-space-frame-registration";

type StudioCharacterTexturePreparer = ReturnType<typeof createStudioCharacterTexturePreparer>;

export function createStudioSceneCharacterAssetResidency(deps: {
  readonly scene: Pick<Phaser.Scene, "load" | "anims" | "textures">;
  readonly prepareCharacterTexture: StudioCharacterTexturePreparer["prepareCharacterTexture"];
  readonly queueCharacterTexture: StudioCharacterTexturePreparer["queueCharacterTexture"];
  readonly frameRegistry: StudioFrameRegistry;
}): StudioCharacterAssetResidency {
  const { scene, prepareCharacterTexture, queueCharacterTexture, frameRegistry } = deps;
  return new StudioCharacterAssetResidency({
    has: prepareCharacterTexture,
    load: (asset, complete) => {
      const loaderType = asset.atlas?.slicing ? "image" : asset.type;
      const event = `filecomplete-${loaderType}-${asset.key}`;
      const loaded = () => complete(prepareCharacterTexture(asset));
      const failed = (file: Phaser.Loader.File) => {
        if (file.key === asset.key) complete(false);
      };
      scene.load.once(event, loaded);
      scene.load.on("loaderror", failed);
      queueCharacterTexture(asset);
      scene.load.start();
      return () => { scene.load.off(event, loaded); scene.load.off("loaderror", failed); };
    },
    remove: (asset) => {
      for (const key of asset.animationKeys ?? (asset.animationKey ? [asset.animationKey] : [])) {
        if (scene.anims.exists(key)) scene.anims.remove(key);
      }
      if (scene.textures.exists(asset.key)) scene.textures.remove(asset.key);
      frameRegistry.forget(asset.key);
    },
  });
}
