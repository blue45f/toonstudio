import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createStudioThemeCharacterSkin } from "./studio-virtual-space-character-theme-art";
import { STUDIO_THEME_CHARACTER_PREVIEW_SCALE, STUDIO_THEME_CHARACTER_SOURCES } from "./studio-virtual-space-theme-character-sources";

/** WebP 헤더(VP8X·VP8L·VP8)에서 캔버스 크기와 alpha 여부를 읽는다. */
function webpHeader(bytes: Buffer): { width: number; height: number; alpha: boolean } {
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), alpha: ((bytes[20] ?? 0) & 0x10) !== 0 };
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), alpha: ((bits >> 28) & 1) === 1 };
  }
  if (kind === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, alpha: false };
  throw new Error(`알 수 없는 WebP 형식: ${kind}`);
}

const publicPath = (url: string) => resolve(process.cwd(), "apps/web/public", url.replace(/^\//u, ""));
const previewManifest = JSON.parse(readFileSync(publicPath("/assets/virtual-studio/experience-v8/previews/manifest.json"), "utf8")) as {
  readonly scale: number;
  readonly previews: readonly { readonly artStyle: string; readonly file: string; readonly sourceSha256: string; readonly width: number; readonly height: number; readonly bytes: number }[];
};

describe("테마 캐릭터 미리보기 사본", () => {
  it.each(STUDIO_THEME_CHARACTER_SOURCES)("$artStyle: 원본과 같은 비율의 알파 WebP이고 원본보다 훨씬 작다", (source) => {
    expect(source.previewUrl).toBe(`/assets/virtual-studio/experience-v8/previews/avatar-${source.artStyle}.webp`);
    const bytes = readFileSync(publicPath(source.previewUrl ?? ""));
    const header = webpHeader(bytes);
    expect(header.width).toBe(Math.round(source.width * STUDIO_THEME_CHARACTER_PREVIEW_SCALE));
    expect(header.height).toBe(Math.round(source.height * STUDIO_THEME_CHARACTER_PREVIEW_SCALE));
    expect(header.alpha).toBe(true);
    // 격자·칸 좌표를 원본 크기로 두고 늘려 그리므로 비율이 달라지면 안 된다(반올림 오차 0.2% 안).
    expect(Math.abs(header.width / header.height - source.width / source.height) / (source.width / source.height)).toBeLessThan(0.002);
    const original = statSync(publicPath(source.textureUrl)).size;
    expect(bytes.byteLength).toBeLessThan(400 * 1024);
    expect(bytes.byteLength).toBeLessThan(original / 3);
  });

  it.each(STUDIO_THEME_CHARACTER_SOURCES)("$artStyle: 사본은 지금 원본에서 만든 것이다(원본이 바뀌면 사본을 다시 만들어야 한다)", (source) => {
    const entry = previewManifest.previews.find((item) => item.artStyle === source.artStyle);
    if (!entry) throw new Error(`${source.artStyle} 사본 기록이 없다`);
    expect(previewManifest.scale).toBe(STUDIO_THEME_CHARACTER_PREVIEW_SCALE);
    const original = readFileSync(publicPath(source.textureUrl));
    expect(entry.sourceSha256).toBe(createHash("sha256").update(original).digest("hex"));
    const preview = readFileSync(publicPath(source.previewUrl ?? ""));
    expect(entry.file).toBe(source.previewUrl?.split("/").at(-1));
    expect(entry.bytes).toBe(preview.byteLength);
    expect([entry.width, entry.height]).toEqual([webpHeader(preview).width, webpHeader(preview).height]);
  });

  it("스킨은 미리보기 사본을 따로 들고 있고 월드가 쓰는 방향별 원본 URL은 그대로다", () => {
    for (const source of STUDIO_THEME_CHARACTER_SOURCES) {
      const skin = createStudioThemeCharacterSkin(source);
      expect(skin.previewTextureUrl).toBe(source.previewUrl);
      expect(Object.values(skin.directional)).toEqual([source.textureUrl, source.textureUrl, source.textureUrl, source.textureUrl]);
      expect(skin.directional.down).not.toBe(skin.previewTextureUrl);
    }
  });
});
