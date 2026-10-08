import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "./studio-virtual-space-art-style";
import { studioCharacterActionSheetMatches, studioCharacterPoseSheetMatches } from "./studio-virtual-space-character-assets";
import {
  STUDIO_CHARACTER_SKINS,
  studioCharacterSkinForArtStyle,
  studioCharacterWalkClip,
  type StudioCharacterAction,
} from "./studio-virtual-space-character-skins";
import { STUDIO_NPC_CAST } from "./studio-virtual-space-npc-cast";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";

/**
 * 계약: 스킨이 선언한 걷기·행동·포즈 시트는 실제 파일 크기와 로더 검증(studioCharacterActionSheetMatches 등)을 통과해야 한다.
 * 선언한 격자가 실제 파일과 다르면 로더가 시트를 거부하고 정지 이미지로 대체해, 캐릭터가 다리를 움직이지 않고 미끄러진다.
 * (v5 스타일 팩은 640×160 스트립인데 격자를 선언하지 않아 기본 스타일의 걷기가 전부 죽어 있던 회귀를 막는다.)
 */

const PUBLIC_ROOT = resolve(process.cwd(), "apps/web/public");
const FACINGS: readonly StudioVirtualSpaceFacing[] = ["down", "right", "left", "up"];
const ACTIONS: readonly StudioCharacterAction[] = ["talk", "draw", "review"];

/** WebP 머리(VP8·VP8L·VP8X)에서 캔버스 크기를 읽는다. 디코더 없이 선언 크기와 실제 파일을 대조한다. */
export function webpSize(path: string): { readonly width: number; readonly height: number } {
  const fd = openSync(path, "r");
  const head = Buffer.alloc(32);
  try { readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); }
  if (head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WEBP") throw new Error(`WebP가 아닙니다: ${path}`);
  const kind = head.toString("ascii", 12, 16);
  if (kind === "VP8X") return { width: 1 + head.readUIntLE(24, 3), height: 1 + head.readUIntLE(27, 3) };
  if (kind === "VP8L") {
    const bits = head.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8 ") return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
  throw new Error(`알 수 없는 WebP 청크 ${kind}: ${path}`);
}

function sizeOf(url: string): { readonly width: number; readonly height: number } {
  const path = resolve(PUBLIC_ROOT, url.replace(/^\//u, ""));
  if (!existsSync(path)) throw new Error(`스킨이 선언한 파일이 없습니다: ${url}`);
  return webpSize(path);
}

/** v5 팩으로 다시 그려지는 원본인지. 자체 작화(네이티브·픽셀·imagegen25)는 원본 그대로 쓰므로 별도 계약을 따른다. */
const usesV5Pack = (skin: { readonly key: string; readonly nativeArtStyle?: unknown; readonly pixelArt?: unknown }) =>
  !skin.nativeArtStyle && !skin.pixelArt && skin.key !== "imagegen25";

/** v5 팩으로 다시 그려지는 원본: 드로잉 플레이어와 NPC 캐스트 중 자체 작화가 아닌 것. */
const V5_SOURCES = [...STUDIO_CHARACTER_SKINS, ...STUDIO_NPC_CAST].filter(usesV5Pack);

describe("webpSize", () => {
  it("v5 스트립은 640×160, 정지 그림은 160×160으로 읽는다", () => {
    expect(sizeOf("/assets/virtual-studio/style-packs-v5/sky-island/players/player-pink-walk-right.webp")).toEqual({ width: 640, height: 160 });
    expect(sizeOf("/assets/virtual-studio/style-packs-v5/sky-island/players/player-pink-direction-down.webp")).toEqual({ width: 160, height: 160 });
  });
});

describe.each(STUDIO_VIRTUAL_ART_STYLE_KEYS)("%s 스타일 v5 시트 계약", (style) => {
  it("플레이어·NPC의 걷기 클립은 실제 시트 크기와 일치하고 4프레임을 모두 쓴다", () => {
    for (const source of V5_SOURCES) {
      const skin = studioCharacterSkinForArtStyle(source, style);
      for (const facing of FACINGS) {
        const clip = studioCharacterWalkClip(skin, facing);
        expect(clip, `${source.key}/${facing} 걷기 클립`).toBeDefined();
        const { width, height } = sizeOf(clip!.textureUrl);
        expect(studioCharacterActionSheetMatches(clip!, width, height), `${source.key}/${facing} ${clip!.textureUrl} ${width}x${height}`).toBe(true);
        expect(clip!.end - clip!.start + 1).toBe(4);
        expect(clip!.frames).toHaveLength(4);
      }
    }
  });

  it("대화·그리기·검토 행동 클립도 실제 시트 크기와 일치한다", () => {
    for (const source of V5_SOURCES) {
      const skin = studioCharacterSkinForArtStyle(source, style);
      for (const action of ACTIONS) for (const facing of FACINGS) {
        const clip = skin.actions?.[action]?.[facing];
        expect(clip, `${source.key}/${action}/${facing} 행동 클립`).toBeDefined();
        const { width, height } = sizeOf(clip!.textureUrl);
        expect(studioCharacterActionSheetMatches(clip!, width, height), `${source.key}/${action}/${facing} ${clip!.textureUrl}`).toBe(true);
      }
    }
  });

  it("앉기·손인사 포즈 시트는 네 방향 프레임을 실제 시트에서 찾는다", () => {
    for (const source of V5_SOURCES) {
      const skin = studioCharacterSkinForArtStyle(source, style);
      for (const name of ["sit", "wave"] as const) {
        const pose = skin.poses?.[name];
        expect(pose, `${source.key}/${name} 포즈`).toBeDefined();
        const { width, height } = sizeOf(pose!.textureUrl);
        expect(studioCharacterPoseSheetMatches(pose!, width, height), `${source.key}/${name} ${pose!.textureUrl}`).toBe(true);
      }
    }
  });

  it("정지 방향 그림과 상태 그림은 160×160 단일 이미지다", () => {
    for (const source of V5_SOURCES) {
      const skin = studioCharacterSkinForArtStyle(source, style);
      for (const facing of FACINGS) expect(sizeOf(skin.directional[facing]), `${source.key}/${facing}`).toEqual({ width: 160, height: 160 });
      for (const url of Object.values(skin.state ?? {})) expect(sizeOf(url), `${source.key} ${url}`).toEqual({ width: 160, height: 160 });
    }
  });
});

describe("imagegen25(픽셀 메이커) 행동·포즈 시트 계약", () => {
  const skin = STUDIO_CHARACTER_SKINS.find((candidate) => candidate.key === "imagegen25")!;

  it("행동 클립과 포즈 시트가 실제 640×160 스트립과 일치한다", () => {
    for (const action of ACTIONS) for (const facing of FACINGS) {
      const clip = skin.actions?.[action]?.[facing];
      expect(clip, `${action}/${facing}`).toBeDefined();
      const { width, height } = sizeOf(clip!.textureUrl);
      expect(studioCharacterActionSheetMatches(clip!, width, height), `${action}/${facing} ${clip!.textureUrl}`).toBe(true);
    }
    for (const name of ["sit", "wave"] as const) {
      const pose = skin.poses?.[name];
      const { width, height } = sizeOf(pose!.textureUrl);
      expect(studioCharacterPoseSheetMatches(pose!, width, height), name).toBe(true);
    }
  });
});
