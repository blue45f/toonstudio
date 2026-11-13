import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./verify-studio-discovery-ux.mts", import.meta.url),
  "utf8",
);

describe("Studio discovery browser admission", () => {
  function previewOptions(dist: string | undefined) {
    const options = source.match(/const preview = spawnVitePreview\((\{[\s\S]*?\})\);/u)?.[1];
    if (!options) throw new Error("실제 discovery preview 옵션을 찾을 수 없습니다.");
    return runInNewContext(`(${options})`, {
      process: { env: { TOONSPECTRUM_VERIFY_DIST: dist } },
      previewPort: 4173, output: "/tmp/discovery-qa", join: (...parts: string[]) => parts.join("/"),
    }) as { outDir: string | undefined; port: number; runner: string; logPath: string };
  }

  it("고정 비공개 빌드 경로를 공백만 정리해 실제 preview 옵션으로 전달한다", () => {
    expect(previewOptions("  /tmp/toonstudio-private build  ")).toEqual({
      port: 4173, runner: "node-vite-bin", logPath: "/tmp/discovery-qa/preview.log", outDir: "/tmp/toonstudio-private build",
    });
  });

  it.each([undefined, "", " \n\t "])("비공개 경로 %s가 없으면 기본 preview 선택을 유지한다", (dist) => {
    expect(previewOptions(dist).outDir).toBeUndefined();
  });

  it("acknowledges the beta notice before the first editor tool interaction", () => {
    expect(source).toContain(
      'page.locator(\'[data-studio-beta-notice="true"]\')',
    );
    expect(source).toContain(
      '[data-studio-beta-notice-acknowledge="true"]',
    );
    expect(source).toContain(
      'acknowledge.click({ timeout: 30_000, noWaitAfter: true })',
    );
    expect(source).toContain(
      'notice.waitFor({ state: "hidden", timeout: 30_000 })',
    );

    const editorReady = source.indexOf(
      'page.locator(\'[data-studio-editor="true"]\').waitFor',
    );
    const acknowledgement = source.lastIndexOf(
      "await acknowledgeStudioBetaNoticeIfPresent(page);",
    );
    const penClick = source.indexOf("await selectStudioCollaborationPen(page, 15_000);");

    expect(editorReady).toBeGreaterThan(-1);
    expect(acknowledgement).toBeGreaterThan(editorReady);
    expect(penClick).toBeGreaterThan(acknowledgement);
  });
});
