import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

interface FontFile {
  file: string;
  sha256: string;
  byteLength: number;
}
interface FontStylesheet extends FontFile {
  sourceFile: string;
  sourceSha256: string;
  localUrl: string;
  family: string;
}
interface FontManifest {
  schemaVersion: number;
  fontFiles: FontFile[];
  stylesheets: FontStylesheet[];
  licenses: FontFile[];
  fontByteTotal: number;
}

const root = process.cwd();
const manifest: FontManifest = JSON.parse(readFileSync(
  join(root, "apps/web/public/fonts/font-manifest.json"), "utf8",
));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fontUrls = /url\(\s*(["']?)([^)"']+)\1\s*\)/gu;

describe("기본 UI 폰트의 로컬 전달 자산", () => {
  it("기본 head가 외부 폰트 연결 없이 두 로컬 stylesheet를 사용한다", () => {
    const html = readFileSync(join(root, "apps/web/index.html"), "utf8");
    const links = html.match(/<link\b[^>]*>/giu) ?? [];
    for (const link of links) {
      expect(link).not.toMatch(/https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)/u);
    }
    expect(manifest.stylesheets.map((entry) => entry.family).sort())
      .toEqual(["Pretendard Variable", "Space Grotesk"]);
    for (const entry of manifest.stylesheets) {
      expect(html).toContain(`href="${entry.localUrl}"`);
    }
  });

  it("원본 CSS의 글리프 범위·굵기·가변 범위·font-display를 URL 외 변경 없이 보존한다", () => {
    expect(manifest.schemaVersion).toBe(1);
    for (const entry of manifest.stylesheets) {
      const source = readFileSync(join(root, entry.sourceFile));
      const local = readFileSync(join(root, entry.file));
      expect(sha(source)).toBe(entry.sourceSha256);
      expect(sha(local)).toBe(entry.sha256);
      expect(local.byteLength).toBe(entry.byteLength);
      expect(local.toString("utf8").replace(fontUrls, "url(__FONT_BYTES__)"))
        .toBe(source.toString("utf8").replace(fontUrls, "url(__FONT_BYTES__)"));
      const localUrls = [...local.toString("utf8").matchAll(fontUrls)].map((match) => match[2]);
      expect(localUrls.length).toBeGreaterThan(0);
      expect(localUrls.every((url) => url?.startsWith("/fonts/") && !url.includes(".."))).toBe(true);
      for (const url of localUrls) {
        expect(manifest.fontFiles.some((file) => file.file === `apps/web/public${url}`)).toBe(true);
      }
    }
  });

  it("실제 WOFF2와 배포 라이선스의 보존 hash·크기를 검증한다", () => {
    let total = 0;
    for (const entry of [...manifest.fontFiles, ...manifest.licenses]) {
      expect(entry.file.startsWith("apps/web/public/fonts/") && !entry.file.includes("..")).toBe(true);
      const bytes = readFileSync(join(root, entry.file));
      expect(bytes.byteLength).toBe(entry.byteLength);
      expect(sha(bytes)).toBe(entry.sha256);
      if (entry.file.endsWith(".woff2")) {
        expect(bytes.toString("ascii", 0, 4)).toBe("wOF2");
        expect(bytes.readUInt32BE(8)).toBe(bytes.byteLength);
        total += bytes.byteLength;
      } else {
        expect(bytes.toString("utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
      }
    }
    expect(total).toBe(manifest.fontByteTotal);
  });
});
