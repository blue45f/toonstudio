import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { office2dAtlasDrawFrame, office2dAtlasImageMatches } from "./office2d-atlas-frames";
import * as generated from "./office2d-generated-atlases";
import { OFFICE2D_CHARACTERS, office2dActorAssetPlan, office2dCharacterUrl, office2dWorkSheetUrl } from "./office2d-sprite-catalog";

afterEach(() => vi.restoreAllMocks());

describe("생성 atlas의 source 픽셀과 기존 논리셀 계약", () => {
  it("생성 metadata가 없는 기존 시트는 128×192와 착석 자르기를 그대로 쓴다", () => {
    vi.spyOn(generated, "office2dGeneratedAtlas").mockReturnValue(null);
    expect(office2dAtlasDrawFrame("editor", "walk", 3, 8, { width: 1152, height: 768 })).toEqual({
      source: { x: 1024, y: 576, width: 128, height: 192 },
      destination: { x: 0, y: 0, width: 128, height: 192 }, accessoryOffset: { x: 0, y: 0 },
    });
    const seated = office2dAtlasDrawFrame("editor", "work", 0, 2, { width: 512, height: 576 }, 0.8);
    expect(seated.source.x).toBe(256);
    expect(seated.source.height).toBeCloseTo(153.6);
    expect(seated.destination.height).toBeCloseTo(153.6);
    expect(office2dCharacterUrl("editor")).toBe("/assets/virtual-studio/toon-office-v1/characters/editor.webp");
    expect(office2dWorkSheetUrl("editor")).toBe("/assets/virtual-studio/toon-office-v1/characters/work/editor.webp");
  });

  it("균등 셀을 넘어간 신발까지 주성분을 온전히 그리고 머리 장식도 같은 변환으로 옮긴다", () => {
    const atlas: generated.Office2dGeneratedAtlas = { url: "/test.png", width: 1536, height: 1024,
      columns: 9, rows: 4, sha256: "fixture", originalUrl: "/test.png", originalSha256: "fixture", originalBytes: 1, runtimeBytes: 1,
      frames: [{ source: { x: 20, y: 17, width: 120, height: 260 },
        anchor: { x: 80, y: 277 }, head: { x: 80, y: 60 }, referenceHead: { x: 64, y: 45 }, pixels: 20000 }] };
    vi.spyOn(generated, "office2dGeneratedAtlas").mockReturnValue(atlas);
    const frame = office2dAtlasDrawFrame("artist", "walk", 0, 0, atlas);
    expect(frame.source).toEqual({ x: 20, y: 17, width: 120, height: 260 });
    expect(frame.destination.y + frame.destination.height).toBeCloseTo(188);
    expect(frame.destination.width).toBe(90);
    expect(45 + frame.accessoryOffset.y).toBeCloseTo(25.25);
    expect(frame.accessoryOffset.x).toBe(0);
    expect(office2dAtlasImageMatches("artist", "walk", 0, 0, { width: 128, height: 192 })).toBe(false);
    expect(office2dAtlasImageMatches("artist", "walk", 0, 1, atlas)).toBe(false);
    expect(office2dAtlasImageMatches("artist", "walk", 0, 0, atlas)).toBe(true);
    const seated = office2dAtlasDrawFrame("artist", "work", 0, 0, atlas, 0.8);
    expect(seated.destination.y + seated.destination.height).toBeCloseTo(153.6);
    expect(seated.source.height).toBeLessThan(frame.source.height);
    expect(seated.accessoryOffset).toEqual(frame.accessoryOffset);
    expect(office2dAtlasDrawFrame("artist", "walk", 0, 0, atlas, 1, false)).toMatchObject({
      source: { x: 0, y: 0, width: 128, height: 192 }, accessoryOffset: { x: 0, y: 0 },
    });
  });

  it("고해상도 시트는 첫 화면 대기를 늘리지 않고 자기 직군부터 후속 로드한다", () => {
    const plan = office2dActorAssetPlan("writer");
    expect(plan.critical).toHaveLength(8);
    expect(plan.critical.every((url) => url.includes("toon-office-v1/characters/") && !url.includes("/work/"))).toBe(true);
    expect(plan.deferred[0]).toBe(office2dCharacterUrl("writer"));
    expect(plan.deferred[1]).toBe(office2dWorkSheetUrl("writer"));
    expect(new Set(plan.deferred).size).toBe(plan.deferred.length);
    expect(plan.deferred.some((url) => plan.critical.includes(url))).toBe(false);
  });

  it("실제 생성 PNG의 크기·해시·모든 프레임이 metadata와 맞고 원본 WebP도 남아 있다", () => {
    const directory = fileURLToPath(new URL("../../../../../public/assets/virtual-studio/office-cast-v2/", import.meta.url));
    const present = readdirSync(directory).filter((name) => name.endsWith(".png")).sort();
    const registered: string[] = [];
    for (const character of OFFICE2D_CHARACTERS) for (const sheet of ["walk", "work"] as const) {
      const atlas = generated.office2dGeneratedAtlas(character, sheet);
      if (!atlas) continue;
      registered.push(`${character}-${sheet}.png`);
      const png = readFileSync(`${directory}/${character}-${sheet}.png`);
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([atlas.width, atlas.height]);
      expect(createHash("sha256").update(png).digest("hex")).toBe(atlas.originalSha256);
      expect(png.length).toBe(atlas.originalBytes);
      const webp = readFileSync(`${directory}/${character}-${sheet}.webp`);
      expect(webp.subarray(0, 4).toString()).toBe("RIFF");
      expect(createHash("sha256").update(webp).digest("hex")).toBe(atlas.sha256);
      expect(webp.length).toBe(atlas.runtimeBytes);
      expect(atlas.frames).toHaveLength(sheet === "walk" ? 36 : 12);
      expect(atlas.columns).toBe(sheet === "walk" ? 9 : 4);
      expect(atlas.rows).toBe(sheet === "walk" ? 4 : 3);
      expect(sheet === "walk" ? office2dCharacterUrl(character) : office2dWorkSheetUrl(character)).toBe(atlas.url);
      for (let index = 0; index < atlas.frames.length; index += 1) {
        const metadata = atlas.frames[index];
        if (!metadata) throw new Error("프레임 metadata 누락");
        expect(metadata.source.x).toBeGreaterThanOrEqual(0);
        expect(metadata.source.y).toBeGreaterThanOrEqual(0);
        expect(metadata.source.x + metadata.source.width).toBeLessThanOrEqual(atlas.width);
        expect(metadata.source.y + metadata.source.height).toBeLessThanOrEqual(atlas.height);
        const draw = office2dAtlasDrawFrame(character, sheet, Math.floor(index / atlas.columns), index % atlas.columns, atlas);
        const sourceScaleY = atlas.height / atlas.rows / 192;
        expect(draw.destination.y + (metadata.anchor.y - metadata.source.y) / sourceScaleY).toBeCloseTo(188);
        expect(draw.source.height).toBeCloseTo(metadata.source.height);
      }
      const legacy = `${directory}/../toon-office-v1/characters/${sheet === "work" ? "work/" : ""}${character}.webp`;
      expect(readFileSync(legacy).subarray(0, 4).toString()).toBe("RIFF");
    }
    expect(registered.sort()).toEqual(present);
    expect(registered.length).toBeGreaterThanOrEqual(4);
  });
});
