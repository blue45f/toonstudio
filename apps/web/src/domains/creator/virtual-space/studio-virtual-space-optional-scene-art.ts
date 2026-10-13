/**
 * 선택 장면 아트 지연 로더 (캔버스에서 분리).
 *
 * 가구·고양이·랜드마크·표정 아틀라스는 선택 PNG다 — 다운로드나 실패가 입장·
 * 이동 준비를 막지 않게 필수 장면 생성이 끝난 뒤에 요청하고, 도착할 때마다
 * 셋드레싱 런타임을 새로 만들고 꾸미기 텍스처를 갈아 끼운다.
 * 취소·엔진 실패 뒤에는 늦게 도착한 로드가 장면을 건드리지 않는다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  studioExperienceAssetUrl,
  studioExperienceFrameGeometry,
} from "./studio-virtual-space-experience-art";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import {
  STUDIO_EXPERIENCE_ATLAS,
  StudioVirtualSetDressingRuntime,
  registerStudioSceneAtlas,
} from "./studio-virtual-space-scene-art-runtime";

export interface StudioOptionalSceneArtIllustratedProp {
  readonly image: Phaser.GameObjects.Image;
  readonly frame: number;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
}

export interface StudioOptionalSceneArtOptions {
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly palette: { readonly room: number; readonly wall: number };
  /** dataset.sceneArt에 도착한 아트 키를 기록할 장면 컨테이너. */
  readonly parent: HTMLElement;
  readonly textureKeys: {
    readonly furniture: string;
    readonly cat: string;
    readonly landmarks: string;
    readonly actorExpression: string;
  };
  /** 셋드레싱 항목이 있을 때만 랜드마크 아트를 요청한다. */
  readonly hasSetDressing: boolean;
  readonly sceneArtAtlases: ReadonlyMap<string, typeof STUDIO_EXPERIENCE_ATLAS>;
  readonly failedTextures: Set<string>;
  readonly illustratedProps: readonly StudioOptionalSceneArtIllustratedProp[];
  /** 취소·엔진 실패 여부 — 늦게 도착한 로드가 장면을 건드리지 않게 한다. */
  readonly isCancelled: () => boolean;
  /** 이전 셋드레싱 런타임을 파괴하고 새 런타임으로 교체한다. */
  readonly swapSetDressingRuntime: (runtime: StudioVirtualSetDressingRuntime) => void;
  readonly refreshDecorationTextures: () => void;
  readonly onCleanup: (fn: () => void) => void;
}

/**
 * 선택 아트 로드를 시작하는 함수를 만든다. 캔버스는 타일맵이 없을 때 즉시,
 * 타일맵 월드는 타일이 준비된 뒤에 이 함수를 부른다.
 */
export function createStudioOptionalSceneArtLoader(
  scene: Phaser.Scene,
  manifest: StudioVirtualSpaceWorldManifest,
  options: StudioOptionalSceneArtOptions,
): () => void {
  return () => {
    // 선택 PNG의 다운로드나 실패가 입장·이동 준비를 막지 않게 필수 장면 생성 후 요청한다.
    const { textureKeys } = options;
    const optionalArt = [
      { key: textureKeys.furniture, url: studioExperienceAssetUrl("furniture", options.artStyle) },
      { key: textureKeys.cat, url: "/assets/virtual-studio/experience-v8/cat-emotions.png" },
      ...(options.hasSetDressing ? [{ key: textureKeys.landmarks, url: studioExperienceAssetUrl("landmarks", options.artStyle) }] : []),
      ...(options.artStyle === "sky-island" ? [{ key: textureKeys.actorExpression, url: "/assets/virtual-studio/experience-v8/actor-emotions.png" }] : []),
    ];
    const refreshSceneArt = () => {
      if (options.isCancelled()) return;
      options.swapSetDressingRuntime(new StudioVirtualSetDressingRuntime(scene, manifest, {
        landmarks: textureKeys.landmarks, furniture: textureKeys.furniture, cat: textureKeys.cat, artStyle: options.artStyle,
      }, options.palette));
      options.refreshDecorationTextures();
      if (scene.textures.exists(textureKeys.furniture)) for (const { image, frame, width, height, originX, originY } of options.illustratedProps) {
        const geometry = studioExperienceFrameGeometry("furniture", options.artStyle, frame, width, height, originX, originY);
        image.setTexture(textureKeys.furniture, frame).setDisplaySize(geometry.width, geometry.height)
          .setOrigin(geometry.originX, geometry.originY);
      }
      options.parent.dataset.sceneArt = optionalArt.filter((asset) => scene.textures.exists(asset.key)).map((asset) => asset.key).join(",");
    };
    for (const asset of optionalArt) {
      const event = `filecomplete-image-${asset.key}`;
      const loaded = () => {
        if (options.isCancelled()) return;
        if (!registerStudioSceneAtlas(scene.textures.get(asset.key), options.sceneArtAtlases.get(asset.key) ?? STUDIO_EXPERIENCE_ATLAS)) {
          options.failedTextures.add(asset.key); scene.textures.remove(asset.key);
        }
        refreshSceneArt();
      };
      scene.load.once(event, loaded);
      options.onCleanup(() => scene.load.off(event, loaded));
      scene.load.image(asset.key, asset.url);
    }
    scene.load.start();
  };
}
