import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

interface FontFile { file: string; sha256: string; byteLength: number }
interface FontStylesheet extends FontFile {
  sourceFile: string; sourceSha256: string; localUrl: string; family: string;
}
interface FontManifest {
  schemaVersion: number; family: string; delivery: string;
  fontFiles: FontFile[]; stylesheets: FontStylesheet[]; licenses: FontFile[]; fontByteTotal: number;
}
const root = process.cwd();
const manifest: FontManifest = JSON.parse(readFileSync(
  join(root, "apps/web/public/fonts/route-serif-font-manifest.json"), "utf8",
));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fontUrls = /url\(\s*(["']?)([^)"']+)\1\s*\)/gu;

describe("경로에서 요청하는 동일 나눔명조의 로컬 전달", () => {
  it("기본 head에 추가하지 않고 기존 경로 진입점에서만 로컬 CSS를 요청한다", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.family).toBe("Nanum Myeongjo");
    expect(manifest.delivery).toBe("route-injected");
    expect(manifest.stylesheets).toHaveLength(1);
    const stylesheet = manifest.stylesheets[0]!;
    expect(stylesheet.family).toBe("Nanum Myeongjo");
    expect(stylesheet.localUrl).toBe("/fonts/nanum-myeongjo/v31/nanum-myeongjo.css");
    const html = readFileSync(join(root, "apps/web/index.html"), "utf8");
    const source = readFileSync(join(root, "apps/web/src/app/serif-webfont.ts"), "utf8");
    expect(html).not.toContain(stylesheet.localUrl);
    expect(source).toContain(`"${stylesheet.localUrl}"`);
  });

  it("원본 184개 분할 face의 글리프·400/700 굵기·swap을 URL 외 변경 없이 보존한다", () => {
    const stylesheet = manifest.stylesheets[0]!;
    const original = readFileSync(join(root, stylesheet.sourceFile));
    const local = readFileSync(join(root, stylesheet.file));
    expect(sha(original)).toBe(stylesheet.sourceSha256);
    expect(sha(local)).toBe(stylesheet.sha256);
    expect(local.byteLength).toBe(stylesheet.byteLength);
    expect(local.toString("utf8").replace(fontUrls, "url(__FONT_BYTES__)"))
      .toBe(original.toString("utf8").replace(fontUrls, "url(__FONT_BYTES__)"));
    const urls = [...local.toString("utf8").matchAll(fontUrls)].map((match) => match[2]!);
    expect(urls).toHaveLength(184);
    expect(new Set(urls).size).toBe(184);
    for (const url of urls) {
      expect(url.startsWith("/fonts/nanum-myeongjo/v31/") && !url.includes("..")).toBe(true);
      expect(manifest.fontFiles.some((entry) => entry.file === `apps/web/public${url}`)).toBe(true);
    }
  });

  it("실제 184개 WOFF2 및 원문 OFL의 magic·길이·hash를 확인한다", () => {
    expect(manifest.fontFiles).toHaveLength(184);
    expect(manifest.licenses).toHaveLength(1);
    let total = 0;
    for (const entry of [...manifest.fontFiles, ...manifest.licenses]) {
      expect(entry.file.startsWith("apps/web/public/fonts/nanum-myeongjo/v31/") && !entry.file.includes("..")).toBe(true);
      const bytes = readFileSync(join(root, entry.file));
      expect(bytes.byteLength).toBe(entry.byteLength);
      expect(sha(bytes)).toBe(entry.sha256);
      if (entry.file.endsWith(".woff2")) {
        expect(bytes.toString("ascii", 0, 4)).toBe("wOF2");
        expect(bytes.readUInt32BE(8)).toBe(bytes.byteLength);
        total += bytes.byteLength;
      } else {
        expect(bytes.toString("utf8")).toMatch(/SIL\s+OPEN\s+FONT\s+LICENSE\s+Version\s+1\.1/u);
      }
    }
    expect(total).toBe(manifest.fontByteTotal);
  });
});
