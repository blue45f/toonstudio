import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import {
  studioCharacterStaticAsset,
  studioCharacterTextureSheetMatches,
} from "./studio-virtual-space-character-assets";
import { measureStudioFrameBounds, type StudioFrameRegistry } from "./studio-virtual-space-frame-registration";
import { registerStudioSceneAtlas } from "./studio-virtual-space-scene-art-runtime";

/** Phaser.Textures.FilterMode.NEAREST. 이 모듈은 Phaser 값을 가져오지 않고(타입만 쓴다) 같은 상수를 둔다. */
const NEAREST_FILTER = 1;

/** 로드된 텍스처의 RGBA 픽셀(행 우선, 픽셀당 4바이트). */
export interface StudioTexturePixels {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
}

/**
 * 로드된 이미지의 픽셀을 읽는다. 캔버스를 쓸 수 없거나 교차 출처 이미지라 읽기가 막히면 null이다 —
 * 이때 호출 측은 기존 표시 좌표를 그대로 쓴다(측정은 보정일 뿐 필수가 아니다).
 */
export function readStudioTexturePixels(source: CanvasImageSource & { readonly width: number; readonly height: number }): StudioTexturePixels | null {
  if (typeof document === "undefined" || !(source.width > 0) || !(source.height > 0)) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return { data: image.data, width: image.width, height: image.height };
  } catch {
    return null;
  }
}

/** 캐릭터 텍스처 준비·큐잉. 시트 규격이 맞지 않으면 실패로 기록하고 텍스처를 제거한다. */
export function createStudioCharacterTexturePreparer(deps: {
  readonly scene: import("phaser").Scene;
  readonly failedTextures: Set<string>;
  /** 있으면 등록 대상(registration: "feet") 텍스처를 로드 직후 측정해 기록한다. */
  readonly frameRegistry?: StudioFrameRegistry;
  /** 테스트용 주입. 기본은 DOM 캔버스로 읽는다. */
  readonly readPixels?: (source: CanvasImageSource & { readonly width: number; readonly height: number }) => StudioTexturePixels | null;
}) {
  const { scene, failedTextures, frameRegistry } = deps;
  const readPixels = deps.readPixels ?? readStudioTexturePixels;

  /** 정지 그림은 이미지 전체를, 시트는 격자 프레임마다 단단한 알파 외곽을 재 레지스트리에 남긴다. */
  const recordRegistration = (asset: ReturnType<typeof studioCharacterStaticAsset>, texture: import("phaser").Textures.Texture) => {
    if (!frameRegistry || asset.registration !== "feet" || frameRegistry.has(asset.key)) return;
    const pixels = readPixels(texture.getSourceImage() as CanvasImageSource & { readonly width: number; readonly height: number });
    if (!pixels) return;
    const regions = asset.type === "spritesheet" && asset.atlas?.slicing
      ? studioCharacterAtlasGridFrames(asset.atlas).map((frame) => ({ x: frame.x, y: frame.y, width: frame.width, height: frame.height }))
      : [{ x: 0, y: 0, width: pixels.width, height: pixels.height }];
    frameRegistry.record(asset.key, regions.map((region) => measureStudioFrameBounds(pixels.data, pixels.width, region)));
  };

  const prepareCharacterTexture = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
    if (!scene.textures.exists(asset.key)) return false;
    const texture = scene.textures.get(asset.key);
    // 픽셀 아트 스킨(LPC)의 최근접 필터 힌트를 실제로 적용한다. 장면 기본 필터가 선형인 일러스트 화풍(5/6)에서는 힌트가 읽히지 않아
    // 도트가 번져 보였다. 픽셀 화풍(retro)은 장면 기본이 이미 최근접이라 달라지지 않는다.
    if (asset.textureFilter === "nearest") texture.setFilter(NEAREST_FILTER);
    if (asset.type !== "spritesheet") {
      recordRegistration(asset, texture);
      return true;
    }
    const source = texture.getSourceImage();
    const valid = studioCharacterTextureSheetMatches(asset, source.width, source.height)
      && (!asset.atlas?.slicing || registerStudioSceneAtlas(texture, asset.atlas));
    if (!valid) { failedTextures.add(asset.key); scene.textures.remove(asset.key); }
    else recordRegistration(asset, texture);
    return valid;
  };
  const queueCharacterTexture = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
    if (asset.type === "spritesheet" && !asset.atlas?.slicing) {
      scene.load.spritesheet(asset.key, asset.url, { frameWidth: asset.frameWidth!, frameHeight: asset.frameHeight! });
    } else scene.load.image(asset.key, asset.url);
  };
  return { prepareCharacterTexture, queueCharacterTexture };
}
