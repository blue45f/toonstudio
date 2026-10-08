/**
 * 캔버스 장면 구축 중 전경 가림 레이어와 월드 소품 이미지 생성 (캔버스에서 분리).
 *
 * create 단계에서 한 번 그리는 생성 코드다. 캔버스는 결과 목록(가림 비주얼·삽화 소품)과 정리 함수,
 * 소품 클릭 콜백만 다룬다(Canvas 비대화 방지). Phaser는 캔버스가 늦게 불러오므로 여기서는 타입만 가져온다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyle, StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioExperienceFrameGeometry } from "./studio-virtual-space-experience-art";
import type { StudioOptionalSceneArtIllustratedProp } from "./studio-virtual-space-optional-scene-art";
import { propTextureKey, type InputEventLike, type OcclusionVisual } from "./studio-virtual-space-phaser-canvas-model";
import { studioIllustratedPropFrame } from "./studio-virtual-space-scene-direction";
import {
  studioWorldPropDepth,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldOcclusionLayer,
} from "./studio-virtual-space-world-manifest";

/**
 * 배우 앞을 가리는 전경 레이어. 타일맵 월드는 방 색 다각형을 그리고, 그 밖에는 배경 텍스처를
 * 다각형 마스크로 한 번 더 그린다. 만든 객체는 가림 비주얼 목록과 정리 함수로 넘긴다.
 */
export function drawStudioOcclusionLayers(
  scene: Pick<Phaser.Scene, "add">,
  manifest: Pick<StudioVirtualSpaceWorldManifest, "tilemap">,
  layers: readonly StudioWorldOcclusionLayer[],
  input: {
    readonly artProfile: Pick<StudioVirtualArtStyle, "palette">;
    readonly backgroundRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly backgroundTextureKey: string;
    readonly occlusionVisuals: OcclusionVisual[];
    readonly onCleanup: (dispose: () => void) => void;
  },
): void {
  const { artProfile, backgroundRect, backgroundTextureKey, occlusionVisuals, onCleanup } = input;
  for (const layer of layers) {
    if (manifest.tilemap) {
      const foreground = scene.add.graphics().setDepth(layer.depth);
      foreground.fillStyle(artProfile.palette.room, 1).fillPoints([...layer.polygon], true);
      foreground.lineStyle(4, artProfile.palette.wall, 0.86).strokePoints([...layer.polygon], true);
      const minX = Math.min(...layer.polygon.map((point) => point.x));
      const maxX = Math.max(...layer.polygon.map((point) => point.x));
      const minY = Math.min(...layer.polygon.map((point) => point.y));
      const maxY = Math.max(...layer.polygon.map((point) => point.y));
      foreground.lineStyle(2, artProfile.palette.line, 0.42)
        .lineBetween(minX + 18, (minY + maxY) / 2, maxX - 18, (minY + maxY) / 2);
      foreground.setAlpha(0.9);
      occlusionVisuals.push({ polygon: layer.polygon, object: foreground, outsideAlpha: 0.9 });
      onCleanup(() => foreground.destroy());
      continue;
    }
    const maskGraphics = scene.add.graphics().fillStyle(0xffffff).fillPoints([...layer.polygon], true).setVisible(false);
    const mask = maskGraphics.createGeometryMask();
    const foreground = scene.add.image(backgroundRect.x, backgroundRect.y, backgroundTextureKey)
      .setOrigin(0).setDisplaySize(backgroundRect.width, backgroundRect.height)
      .setDepth(layer.depth).setMask(mask);
    occlusionVisuals.push({ polygon: layer.polygon, object: foreground, outsideAlpha: 1 });
    onCleanup(() => { foreground.clearMask(true); foreground.destroy(); maskGraphics.destroy(); });
  }
}

/**
 * 매니페스트 소품 이미지를 세운다. 삽화 아틀라스로 바꿔 그릴 수 있는 소품은 illustratedProps에 남겨
 * 선택 장면 아트가 나중에 갈아 끼우게 하고, 상호작용이 걸린 소품은 누르면 onSelect(그 상호작용)를 부른다.
 */
export function placeStudioWorldPropImages(
  scene: Pick<Phaser.Scene, "add" | "textures">,
  manifest: Pick<StudioVirtualSpaceWorldManifest, "props">,
  input: {
    readonly worldAssetUrls: ReadonlyMap<string, string> | undefined;
    readonly artStyle: StudioVirtualArtStyleKey;
    readonly decorationTextureKeys: { readonly furniture: string };
    readonly illustratedProps: StudioOptionalSceneArtIllustratedProp[];
    readonly interactionById: ReadonlyMap<string, StudioWorldInteractionDefinition>;
    readonly onSelect: (interaction: StudioWorldInteractionDefinition) => void;
  },
): void {
  const { worldAssetUrls, artStyle, decorationTextureKeys, illustratedProps, interactionById, onSelect } = input;
  for (const prop of manifest.props) {
    if (!prop.assetUrl || !scene.textures.exists(propTextureKey(prop))) continue;
    const illustratedFrame = worldAssetUrls?.has(prop.assetUrl) || !scene.textures.exists(decorationTextureKeys.furniture)
      ? undefined : studioIllustratedPropFrame(prop.assetUrl, artStyle);
    const image = scene.add.image(prop.x, prop.y,
      illustratedFrame === undefined ? propTextureKey(prop) : decorationTextureKeys.furniture, illustratedFrame)
      .setOrigin(prop.originX ?? 0.5, prop.originY ?? 1)
      .setAngle(prop.rotation ?? 0)
      .setAlpha(Math.max(0, Math.min(1, prop.alpha ?? 1)))
      .setDepth(studioWorldPropDepth(prop));
    if (prop.width && prop.height) {
      image.setDisplaySize(prop.width, prop.height);
    } else {
      image.setScale(prop.scale ?? 1);
    }
    const replacementFrame = worldAssetUrls?.has(prop.assetUrl) ? undefined : studioIllustratedPropFrame(prop.assetUrl, artStyle);
    if (replacementFrame !== undefined) {
      const info = { image, frame: replacementFrame, width: image.displayWidth, height: image.displayHeight,
        originX: prop.originX ?? .5, originY: prop.originY ?? 1 };
      illustratedProps.push(info);
      if (illustratedFrame !== undefined) {
        const geometry = studioExperienceFrameGeometry("furniture", artStyle, replacementFrame, info.width, info.height, info.originX, info.originY);
        image.setDisplaySize(geometry.width, geometry.height).setOrigin(geometry.originX, geometry.originY);
      }
    }
    const interaction = interactionById.get(prop.id);
    if (interaction) {
      image.setInteractive({ useHandCursor: true });
      image.on(
        "pointerdown",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: InputEventLike,
        ) => {
          event.stopPropagation();
          onSelect(interaction);
        },
      );
    }
  }
}
