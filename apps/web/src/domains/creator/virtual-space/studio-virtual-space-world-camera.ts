/**
 * 월드 카메라 배치: 내장 장소는 고정(fit) 프레임, 캠퍼스·사용자 월드는 추종(follow) 카메라.
 * Canvas의 resize 처리에서 옮겨 온 코드다(W4·W12). 줌 계산은 순수 함수로 테스트한다.
 */
import type * as Phaser from "phaser";

import { studioSceneCameraFrame } from "./studio-virtual-space-scene-art-runtime";
import { studioCameraLerp, studioCameraZoom, studioCoverRect } from "./studio-virtual-space-presentation";
import { studioCampusCameraZoom, studioVirtualWorldPresentation } from "./studio-virtual-space-world-presentation";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

export type StudioWorldCameraPlacement =
  | { readonly mode: "fit"; readonly zoom: number; readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } }
  | { readonly mode: "follow"; readonly zoom: number; readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } };

/** CSS 크기와 렌더 배율로 카메라 모드·줌·경계를 정한다. */
export function studioWorldCameraPlacement(
  manifest: StudioVirtualSpaceWorldManifest,
  cssWidth: number,
  cssHeight: number,
  ratio: number,
): StudioWorldCameraPlacement {
  const frame = studioSceneCameraFrame(manifest, cssWidth, cssHeight, ratio);
  if (frame) return { mode: "fit", zoom: frame.zoom, bounds: frame.bounds };
  // 캠퍼스는 세로 약 12타일(모바일 세로형은 가로 약 7타일)이 보이게 해 월드가 화면을 꽉 채운다.
  const zoom = studioVirtualWorldPresentation(manifest)?.kind === "campus"
    ? studioCampusCameraZoom(cssWidth, cssHeight, ratio, manifest)
    : studioCameraZoom(cssWidth, cssHeight, ratio);
  return { mode: "follow", zoom, bounds: { x: 0, y: 0, width: manifest.width, height: manifest.height } };
}

/** 카메라에 배치를 적용하고 모드("fit" | "follow")를 돌려준다. */
export function applyStudioWorldCamera(
  camera: Pick<Phaser.Cameras.Scene2D.Camera, "setZoom" | "setBounds" | "centerOn">,
  manifest: StudioVirtualSpaceWorldManifest,
  cssWidth: number,
  cssHeight: number,
  ratio: number,
): StudioWorldCameraPlacement["mode"] {
  const placement = studioWorldCameraPlacement(manifest, cssWidth, cssHeight, ratio);
  camera.setZoom(placement.zoom);
  camera.setBounds(placement.bounds.x, placement.bounds.y, placement.bounds.width, placement.bounds.height);
  if (placement.mode === "fit") camera.centerOn(manifest.width / 2, manifest.height / 2);
  return placement.mode;
}

/** 생성 원경을 월드 세 배로 확대하지 않고 화면에 맞춰 선명도와 종횡비를 유지한다. */
export function fitStudioHorizonArtwork(
  artwork: Phaser.GameObjects.Image,
  gameSize: { readonly width: number; readonly height: number },
  zoom: number,
): void {
  const source = artwork.texture.getSourceImage();
  const rect = studioCoverRect(gameSize.width / zoom, gameSize.height / zoom, source.width, source.height);
  artwork.setOrigin(.5).setScrollFactor(0).setPosition(gameSize.width / 2, gameSize.height / 2).setDisplaySize(rect.width, rect.height);
}

/** 카메라 중심이 월드 경계에 가까워지는 구간(월드 px). 이 안에서 추종을 부드럽게 늦춘다. */
export const STUDIO_CAMERA_EDGE_SOFT_ZONE_PX = 160;
/** 경계에 완전히 붙었을 때 남기는 최소 추종 비율. 0이면 경계에서 카메라가 얼어붙는다. */
export const STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR = 0.32;

function edgeSmoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 한 축의 카메라 추종 배율(0~1 곱셈 계수).
 *
 * Phaser의 하드 bounds 클램프는 캐릭터가 월드 가장자리에 닿는 순간 카메라만
 * 갑자기 멈춰 화면이 튀어 보인다. 중심이 경계 소프트 존 안에 들어오면
 * 추종 lerp를 미리 늦춰 감속하면서 경계에 닿게 한다. 월드가 화면보다
 * 작거나 같은 축에서는 클램프 자체가 없어 1을 돌려준다.
 */
export function studioCameraEdgeLerpFactor(
  center: number,
  viewWorldSize: number,
  worldSize: number,
): number {
  if (!(viewWorldSize > 0) || !(worldSize > viewWorldSize)) return 1;
  const half = viewWorldSize / 2;
  const minCenter = half;
  const maxCenter = worldSize - half;
  const distanceToEdge = Math.min(center - minCenter, maxCenter - center);
  if (distanceToEdge >= STUDIO_CAMERA_EDGE_SOFT_ZONE_PX) return 1;
  const eased = edgeSmoothstep(distanceToEdge / STUDIO_CAMERA_EDGE_SOFT_ZONE_PX);
  return STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR + (1 - STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR) * eased;
}

export interface StudioCameraFollowLerpInput {
  readonly deltaSeconds: number;
  /** 방 전환이 아닐 때의 기본 추종 비율(카메라 모드·이동 느낌 배율이 반영된 값). */
  readonly followBase: number;
  readonly roomTransitioning: boolean;
  readonly immediate: boolean;
  readonly edgeSoftening: boolean;
  /** 지금 카메라 중심과 화면이 비추는 월드 크기, 월드 크기. */
  readonly center: { readonly x: number; readonly y: number };
  readonly view: { readonly width: number; readonly height: number };
  readonly world: { readonly width: number; readonly height: number };
}

/**
 * 이번 프레임 카메라가 목표를 따라가는 비율(Phaser setLerp에 넣는 x·y).
 * - immediate면 1이다: 순간 이동·모션 줄이기, 그리고 사용자가 시점을 끌거나 되돌리는 중에는 목표를 지체 없이 따라가야 손에 붙는다.
 * - 아니면 프레임 간격에 무관한 지수 추종이고, 방 전환 중에는 더 빠르다.
 * - 월드 경계 근처에서는 추종을 미리 늦춰 하드 클램프에서 화면이 튀지 않게 한다(edgeSoftening은 카메라가 아바타를 따라가는 장소일 때).
 */
export function studioCameraFollowLerp(input: StudioCameraFollowLerpInput): { readonly x: number; readonly y: number } {
  const amount = input.immediate ? 1
    : studioCameraLerp(input.deltaSeconds, input.roomTransitioning ? input.followBase * 2.2 : input.followBase);
  const soften = input.edgeSoftening && !input.immediate;
  return {
    x: amount * (soften ? studioCameraEdgeLerpFactor(input.center.x, input.view.width, input.world.width) : 1),
    y: amount * (soften ? studioCameraEdgeLerpFactor(input.center.y, input.view.height, input.world.height) : 1),
  };
}

/** 추종 설정에 필요한 Phaser 카메라의 부분. */
export interface StudioFollowCamera {
  readonly midPoint: { readonly x: number; readonly y: number };
  readonly worldView: { readonly width: number; readonly height: number };
  setLerp(x: number, y: number): unknown;
  centerOn(x: number, y: number): unknown;
}

/**
 * 이번 프레임의 추종 설정을 카메라에 적용한다: 추종 비율을 넣고, centerOn이 있으면 카메라를 그 점에 바로 맞춘다.
 * Phaser 카메라는 추종 목표가 데드존(불감대) 안이면 움직이지 않는다. 그래서 순간 이동은 물론 사용자가 시점을 끌거나 되돌리는 동안에도
 * lerp만으로는 불감대만큼 늦게 따르고, 끄는 방향을 바꾸면 불감대를 건널 때까지 반응하지 않는다. 이때만 목표에 바로 맞춘다.
 */
export function applyStudioCameraFollow(
  camera: StudioFollowCamera,
  input: Omit<StudioCameraFollowLerpInput, "center" | "view"> & { readonly centerOn: { readonly x: number; readonly y: number } | null },
): void {
  const { centerOn, ...lerpInput } = input;
  const lerp = studioCameraFollowLerp({ ...lerpInput, center: camera.midPoint, view: camera.worldView });
  camera.setLerp(lerp.x, lerp.y);
  if (centerOn) camera.centerOn(centerOn.x, centerOn.y);
}
