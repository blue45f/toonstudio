import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../apps/web/public/brand/illustrated-20260928/", import.meta.url));
const manifest = JSON.parse(readFileSync(`${root}manifest.json`, "utf8"));
const names = ["hero", "canvas-noir", "luna", "character-pink", "character-blue", "background-city", "project-romance", "project-crimson", "storyboard", "materials", "background-classroom", "blank-canvas"];
const portraitSources = new Map([
  ["character-pink", "toonstudio-hero-v1/romance-female.vrm"],
  ["character-blue", "toonstudio-hero-v1/rofan-empress.vrm"],
]);
const variantFiles = (name) => [
  `${name}.webp`, `${name}-320.webp`, `${name}-640.webp`,
  ...(portraitSources.has(name) ? [`${name}-960.webp`] : []),
];

describe("독립 일러스트의 출처와 전송 예산", () => {
  it("실제 생성 모델과 예시 아트임을 명시하고 12개 용도를 빠짐없이 갖춘다", () => {
    expect(manifest.model).toBe("gpt-image-2");
    expect(manifest.generatedArtwork).toBe(true);
    expect(manifest.purpose).toContain("사용자 작품이나 실제 편집 결과가 아님");
    expect(Object.keys(manifest.assets).sort()).toEqual([...names].sort());
    expect(Object.keys(manifest.sources).sort()).toEqual(["characters", "production"]);
  });
  it("모든 파생 이미지가 원장 해시와 일치하며 원본 PNG를 전송하지 않는다", () => {
    const expectedFiles = names.flatMap(variantFiles);
    expect(readdirSync(root).filter((file) => /\.(?:webp|png|jpe?g)$/u.test(file)).sort()).toEqual(expectedFiles.sort());
    let total = 0;
    for (const name of names) {
      const asset = manifest.assets[name];
      const portrait = portraitSources.has(name);
      expect(asset.variants.map((variant) => variant.file).sort()).toEqual(variantFiles(name).sort());
      if (portrait) {
        expect(asset.source).toBe(portraitSources.get(name));
        expect(asset.generator).toBe("tools/blender/character_kit/render_portrait_4x5_webp.py");
        expect(asset.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
        expect(asset.aspectRatio).toBe("4:5");
      } else {
        expect(manifest.sources[asset.source].generationId).toBeTruthy();
      }
      for (const variant of asset.variants) {
        const bytes = readFileSync(`${root}${variant.file}`);
        expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
        expect(bytes.length).toBe(variant.bytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(variant.sha256);
        expect(bytes.length).toBeLessThan(200_000);
        expect(variant.width).toBeGreaterThan(0);
        expect(variant.height).toBeGreaterThan(0);
        const maximum = variant.file.includes("-320.") ? 320 : variant.file.includes("-640.") ? 640 : portrait ? 960 : 700;
        if (portrait) {
          expect(variant.width).toBe(maximum);
          expect(variant.height).toBe(maximum * 5 / 4);
        } else {
          expect(Math.max(variant.width, variant.height)).toBeLessThanOrEqual(maximum);
        }
        total += bytes.length;
      }
    }
    expect(total).toBeLessThan(3_200_000);
  });
});
