// @vitest-environment node

import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it } from "vitest";

import { compactBootstrapAssets } from "./compact-bootstrap-assets";
import { compactI18nAssets, compactI18nJsonWhitespace } from "./compact-i18n-assets";

const LOCALE_SOURCE = "{\n  \"greeting\": \"  안녕 세계  \",\n  \"line\": \"첫째\\n둘째\\t끝\",\n  \"escape\": \"quote: \\\" and slash: \\\\\",\n  \"unicode\": \"\\ud55c글 😀\"\n}\n";
const LOCALE_COMPACT = "{\"greeting\":\"  안녕 세계  \",\"line\":\"첫째\\n둘째\\t끝\",\"escape\":\"quote: \\\" and slash: \\\\\",\"unicode\":\"\\ud55c글 😀\"}";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "toonstudio-i18n-compaction-"));
  temporaryDirectories.push(directory);
  return { directory, outDir: path.join(directory, "dist") };
}

async function writeFixture(root: string, relative: string, source: string): Promise<void> {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, source);
}

describe("번역 JSON 빌드 복사본의 공백 압축", () => {
  it("번역값 안의 공백·개행 escape·따옴표·역슬래시·다국어 문자를 그대로 보존한다", () => {
    const compact = compactI18nJsonWhitespace(LOCALE_SOURCE);
    expect(compact).toBe(LOCALE_COMPACT);
    expect(JSON.parse(compact)).toEqual(JSON.parse(LOCALE_SOURCE));
    expect(compactI18nJsonWhitespace(compact)).toBe(compact);
  });

  it("숫자 표기와 중복 키를 재직렬화하지 않고 원래 토큰 순서를 보존한다", () => {
    const source = '\r\n{ "n": 9007199254740993, "z": -0, "e": 1e+09, "same": "first", "same": "last" }\t';
    expect(compactI18nJsonWhitespace(source)).toBe(
      '{"n":9007199254740993,"z":-0,"e":1e+09,"same":"first","same":"last"}',
    );
  });

  it("유효하지 않은 JSON은 압축 결과를 만들지 않고 거부한다", () => {
    for (const source of ["", '{"key": "끝나지 않음}', '{"key": "value",}', '{/* 주석 */"key":"value"}']) {
      expect(() => compactI18nJsonWhitespace(source)).toThrow(SyntaxError);
    }
  });

  it("기존 빌드 진입점이 세 영역의 중첩 JSON만 바꾸고 원본·다른 자산·파일 목록을 보존한다", async () => {
    const { directory, outDir } = await fixture();
    const localePaths = [
      "i18n/app/en.json",
      "i18n/admin/dashboard/ko.json",
      "i18n/studio/canvas/deep/ja.json",
    ];
    const preservedPaths = [
      "catalog/items.json",
      "i18n/app.json",
      "i18n/other/en.json",
      "i18n/app/readme.txt",
      "assets/other.json",
    ];
    for (const relative of [...localePaths, ...preservedPaths]) {
      await writeFixture(outDir, relative, LOCALE_SOURCE);
    }
    await writeFixture(directory, "source/public/i18n/app/en.json", LOCALE_SOURCE);
    await writeFixture(outDir, "bootstrap-compat.js", "window.compat = { needed: true };\n");
    await writeFixture(outDir, "bootstrap-theme.js", "window.theme = 'light';\n");
    for (const relative of ["brand/production-os-hero.svg", "brand/production-os-workspace.svg"]) {
      await writeFixture(outDir, relative, '<svg xmlns="http://www.w3.org/2000/svg">\n  <path d="M0 0h1v1z"/>\n</svg>\n');
    }
    const pathsBefore = (await readdir(outDir, { recursive: true })).sort();

    await compactBootstrapAssets(outDir);

    for (const relative of localePaths) {
      const actual = await readFile(path.join(outDir, relative), "utf8");
      expect(actual).toBe(LOCALE_COMPACT);
      expect(JSON.parse(actual)).toEqual(JSON.parse(LOCALE_SOURCE));
    }
    for (const relative of preservedPaths) {
      expect(await readFile(path.join(outDir, relative), "utf8")).toBe(LOCALE_SOURCE);
    }
    expect(await readFile(path.join(directory, "source/public/i18n/app/en.json"), "utf8")).toBe(LOCALE_SOURCE);
    expect((await readdir(outDir, { recursive: true })).sort()).toEqual(pathsBefore);
    const browser = { window: {} };
    runInNewContext(await readFile(path.join(outDir, "bootstrap-compat.js"), "utf8"), browser);
    runInNewContext(await readFile(path.join(outDir, "bootstrap-theme.js"), "utf8"), browser);
    expect(browser.window).toEqual({ compat: { needed: true }, theme: "light" });

    expect(await compactI18nAssets(outDir)).toEqual({
      files: 3,
      beforeBytes: Buffer.byteLength(LOCALE_COMPACT, "utf8") * 3,
      afterBytes: Buffer.byteLength(LOCALE_COMPACT, "utf8") * 3,
    });
  });

  it("번역 영역이 없는 빌드에는 파일을 만들지 않는다", async () => {
    const { directory, outDir } = await fixture();
    expect(await compactI18nAssets(outDir)).toEqual({ files: 0, beforeBytes: 0, afterBytes: 0 });
    expect(await readdir(directory)).toEqual([]);
  });

  it("잘못된 번역 파일은 경로와 함께 빌드를 실패시키고 해당 원본을 보존한다", async () => {
    const { outDir } = await fixture();
    const source = '{"key":"value",}';
    await writeFixture(outDir, "i18n/app/en.json", source);
    await expect(compactI18nAssets(outDir)).rejects.toThrow("i18n/app/en.json");
    expect(await readFile(path.join(outDir, "i18n/app/en.json"), "utf8")).toBe(source);
  });

  it("잘못된 UTF-8을 대체 문자로 바꾸지 않고 원래 바이트를 남긴 채 실패한다", async () => {
    const { outDir } = await fixture();
    const filename = path.join(outDir, "i18n/app/en.json");
    const bytes = Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes);
    await expect(compactI18nAssets(outDir)).rejects.toThrow("유효한 UTF-8");
    expect(await readFile(filename)).toEqual(bytes);
  });

  it.each(["outDir", "i18n"])("상위 %s 링크를 통해 빌드 밖 번역 원본을 수정하지 않는다", async (linkedDirectory) => {
    const { directory, outDir } = await fixture();
    const originalRoot = path.join(directory, "public-original");
    const relative = linkedDirectory === "outDir" ? "i18n/app/en.json" : "app/en.json";
    await writeFixture(originalRoot, relative, LOCALE_SOURCE);
    if (linkedDirectory === "outDir") {
      await symlink(originalRoot, outDir, "dir");
    } else {
      await mkdir(outDir, { recursive: true });
      await symlink(originalRoot, path.join(outDir, "i18n"), "dir");
    }
    await expect(compactI18nAssets(outDir)).rejects.toThrow("심볼릭 링크");
    expect(await readFile(path.join(originalRoot, relative), "utf8")).toBe(LOCALE_SOURCE);
  });

  it("심볼릭 링크를 통해 빌드 밖 번역 원본을 수정하지 않는다", async () => {
    const { directory, outDir } = await fixture();
    const original = path.join(directory, "public-original.json");
    await writeFile(original, LOCALE_SOURCE);
    const localeDirectory = path.join(outDir, "i18n/app");
    await mkdir(localeDirectory, { recursive: true });
    await symlink(original, path.join(localeDirectory, "en.json"));
    await expect(compactI18nAssets(outDir)).rejects.toThrow("심볼릭 링크");
    expect(await readFile(original, "utf8")).toBe(LOCALE_SOURCE);
  });
});
