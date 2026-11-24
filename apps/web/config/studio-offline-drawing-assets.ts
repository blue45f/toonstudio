import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { collectStudioOfflineDrawingUrls } from "../src/app/service-worker/studio-service-worker-drawing-plan";
import { isStudioOfflineShellFontPath, STUDIO_OFFLINE_TOOL_ICONS } from "../src/shared/lib/studio-offline-protocol";

import type { StudioViteManifest } from "../src/app/service-worker/studio-service-worker-precache-plan";

/** 배포한 셸 스타일시트가 실제 사용하는 글꼴만 버전별 편집 팩에 포함한다. */
export function collectStudioShellFontUrls(html: string, cssText: (path: string) => string): string[] {
  const origin = "https://studio.invalid";
  const urls = new Set<string>();
  for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/giu)) {
    const [, sheet] = match;
    if (!sheet || !sheet.endsWith(".css") || !isStudioOfflineShellFontPath(sheet) || urls.has(sheet)) continue;
    urls.add(sheet);
    const folder = sheet.slice(0, sheet.lastIndexOf("/") + 1);
    for (const source of cssText(sheet).matchAll(/url\(\s*["']?([^\s)'"]+)["']?\s*\)/giu)) {
      const [, reference] = source;
      if (!reference) continue;
      const font = new URL(reference, origin + sheet);
      if (font.origin !== origin || font.search || font.hash || !font.pathname.startsWith(folder)
        || !isStudioOfflineShellFontPath(font.pathname) || !font.pathname.endsWith(".woff2")) {
        throw new Error(`오프라인 편집용 글꼴의 배포 경로를 확인해 주세요: ${sheet}`);
      }
      urls.add(font.pathname);
    }
  }
  return [...urls];
}

export function collectBuiltStudioOfflineDrawingUrls(manifest: StudioViteManifest, outputDir: string): string[] {
  const readText = (path: string) => readFileSync(join(outputDir, path), "utf8");
  const resources = [...STUDIO_OFFLINE_TOOL_ICONS, ...collectStudioShellFontUrls(readText("index.html"), readText)];
  for (const path of resources) {
    if (!existsSync(join(outputDir, path))) throw new Error(`오프라인 편집 자원이 배포 파일에 없습니다: ${path}`);
  }
  return [...collectStudioOfflineDrawingUrls(manifest, readdirSync(join(outputDir, "assets"))), ...resources];
}
