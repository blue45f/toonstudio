/**
 * 파티클 스프라이트 테스트 (Track 4)
 */
import { describe, expect, it } from "vitest";

import type { ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";
import { STUDIO_DRAMATIC_VFX_CATALOG } from "./studio-virtual-space-dramatic-vfx-catalog";
import {
  STUDIO_DRAMATIC_PARTICLE_SPRITE_KINDS,
  STUDIO_PARTICLE_SPRITE_KINDS,
  buildStudioDramaticParticleSprite,
  buildStudioParticleSprite,
  studioDramaticParticleSpriteForVfx,
  studioDramaticParticleSpriteLabel,
  studioParticleSpriteLabel,
} from "./studio-virtual-space-particle-sprites";

function createMockDeps(): ProceduralSheetDeps {
  let counter = 0;
  return {
    createCanvas: (width: number, height: number) => {
      counter += 1;
      const dataUrl = `data:image/png;base64,PARTICLE-TEST-${counter}`;
      const ctx = new Proxy({}, {
        get: (_target, prop: string | symbol) => {
          if (prop === "canvas") return undefined;
          return () => {};
        },
        set: () => true,
      }) as unknown as CanvasRenderingContext2D;
      return { width, height, getContext: () => ctx, toDataURL: () => dataUrl } as unknown as HTMLCanvasElement;
    },
  };
}

describe("파티클 스프라이트 카탈로그", () => {
  it("9종이다", () => {
    expect(STUDIO_PARTICLE_SPRITE_KINDS).toEqual([
      "dust", "sparkle", "raindrop", "snowflake", "leaf", "smoke", "confetti", "splash", "petal",
    ]);
  });

  it("한글·영문 이름을 제공한다", () => {
    expect(studioParticleSpriteLabel("dust")).toEqual({ ko: "먼지", en: "Dust" });
    expect(studioParticleSpriteLabel("snowflake")).toEqual({ ko: "눈송이", en: "Snowflake" });
    expect(studioParticleSpriteLabel("unknown")).toEqual({ ko: "파티클", en: "Particle" });
  });
});

describe("buildStudioParticleSprite", () => {
  const deps = createMockDeps();

  it("9종 전부 스트립을 만든다", () => {
    for (const kind of STUDIO_PARTICLE_SPRITE_KINDS) {
      const sprite = buildStudioParticleSprite(kind, deps);
      expect(sprite.kind).toBe(kind);
      expect(sprite.dataUrl.startsWith("data:image/png")).toBe(true);
      expect(sprite.cell).toBeGreaterThan(0);
      expect(sprite.frames).toBeGreaterThanOrEqual(2);
      expect(sprite.width).toBe(sprite.cell * sprite.frames);
      expect(sprite.height).toBe(sprite.cell);
    }
  });

  it("알 수 없는 종류는 오류를 낸다", () => {
    expect(() => buildStudioParticleSprite("unknown" as never, deps)).toThrow("알 수 없는 파티클 스프라이트");
  });

  it("드라마틱 연출 VFX 전용 10종 스프라이트와 20종 VFX 매핑을 모두 생성한다", () => {
    expect(STUDIO_DRAMATIC_PARTICLE_SPRITE_KINDS).toHaveLength(10);
    for (const kind of STUDIO_DRAMATIC_PARTICLE_SPRITE_KINDS) {
      const label = studioDramaticParticleSpriteLabel(kind);
      expect(label.ko.length).toBeGreaterThan(0);
      expect(label.en.length).toBeGreaterThan(0);
      const sprite = buildStudioDramaticParticleSprite(kind, deps);
      expect(sprite.kind).toBe(kind);
      expect(sprite.dataUrl.startsWith("data:image/png")).toBe(true);
      expect(sprite.width).toBe(sprite.cell * sprite.frames);
    }
    for (const vfx of STUDIO_DRAMATIC_VFX_CATALOG) {
      const mapped = studioDramaticParticleSpriteForVfx(vfx.id);
      expect(STUDIO_DRAMATIC_PARTICLE_SPRITE_KINDS).toContain(mapped);
    }
    expect(() => buildStudioDramaticParticleSprite("unknown" as never, deps)).toThrow("알 수 없는 드라마틱 파티클 스프라이트");
  });
});
