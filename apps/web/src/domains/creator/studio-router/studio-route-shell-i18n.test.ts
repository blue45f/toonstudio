import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 에디터 셸(라우트 로딩·실패 표면) 문구의 i18n 키 이관 계약.
 *
 * 배경: 로딩 라벨과 라우트 실패 상세가 호출부에 한국어로 하드코딩돼 있어 en 사용자의
 * 동선이 로딩·실패 순간에 끊겼다. 표시 정본은 studio.canvas.shell.* 키이며,
 * 코드 안의 한국어 원문은 useT 폴백으로만 남아야 한다.
 */

const SHELL_KEYS = [
  "studio.canvas.shell.loadingStudio",
  "studio.canvas.shell.loadingPanel",
  "studio.canvas.shell.loadingEditor",
  "studio.canvas.shell.loadingProductionHub",
  "studio.canvas.shell.loadingPublishCenter",
  "studio.canvas.shell.loadingStoryworldLab",
  "studio.canvas.shell.loadingWorkAssets",
  "studio.canvas.shell.routeErrorTitle",
  "studio.canvas.shell.routeErrorDetail.identityConflict",
  "studio.canvas.shell.routeErrorDetail.invalidMode",
  "studio.canvas.shell.routeErrorDetail.invalidPath",
  "studio.canvas.shell.routeErrorDetail.invalidRemixId",
  "studio.canvas.shell.routeErrorDetail.invalidWorkId",
  "studio.canvas.shell.routeErrorDetail.workIdConflict",
  "studio.canvas.shell.routeErrorOpenNew",
  "studio.canvas.shell.routeErrorToShowcase",
  "studio.canvas.shell.placeholderStepsAriaLabel",
  "studio.canvas.shell.placeholderAssetsEyebrow",
  "studio.canvas.shell.placeholderAssetsTitle",
  "studio.canvas.shell.placeholderAssetsDescription",
  "studio.canvas.shell.placeholderAssetsStep1",
  "studio.canvas.shell.placeholderAssetsStep2",
  "studio.canvas.shell.placeholderAssetsStep3",
  "studio.canvas.shell.placeholderAssetsNote",
  "studio.canvas.shell.placeholderAssetsOpenLabel",
  "studio.canvas.shell.aiDirectorStepsAriaLabel",
] as const;

function readDictionary(locale: "ko" | "en"): Readonly<Record<string, string>> {
  const url = new URL(
    `../../../../public/i18n/studio/canvas/${locale}.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, "utf-8")) as Record<string, string>;
}

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf-8");
}

const HANGUL = /[가-힣]/;

describe("studio route shell i18n", () => {
  it("shell 키가 ko/en 사전에 모두 있고 en 값에 한글이 없다", () => {
    const ko = readDictionary("ko");
    const en = readDictionary("en");
    for (const key of SHELL_KEYS) {
      expect(ko[key], `ko missing ${key}`).toBeTruthy();
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("ko 사전 값이 기존 하드코딩 문구와 동일하다 (문구 변경 없는 이관)", () => {
    const ko = readDictionary("ko");
    expect(ko["studio.canvas.shell.loadingEditor"]).toBe("Studio 편집기를 여는 중...");
    expect(ko["studio.canvas.shell.loadingStudio"]).toBe("스튜디오를 여는 중...");
    expect(ko["studio.canvas.shell.loadingPanel"]).toBe("패널을 여는 중...");
    expect(ko["studio.canvas.shell.routeErrorTitle"]).toBe("Studio 작업 주소를 확인해 주세요");
  });

  it("라우트 파일이 label 속성에 한국어 리터럴을 직접 넣지 않는다", () => {
    const routeFiles = [
      "./routes/StudioEditorRoute.tsx",
      "./routes/StudioProductionRoute.tsx",
      "./routes/StudioPublishRoute.tsx",
      "./routes/StudioStoryworldRoute.tsx",
      "./routes/StudioWorkAssetsRoute.tsx",
    ];
    for (const file of routeFiles) {
      const source = readSource(file);
      expect(/label="[^"]*[가-힣]/.test(source), `${file} still hardcodes a label`).toBe(false);
      expect(source).toContain("studio.canvas.shell.loading");
    }
  });

  it("폴백 부품의 기본 라벨이 키를 경유한다", () => {
    const source = readSource("../StudioLazySurfaceFallback.tsx");
    expect(source).toContain('t("studio.canvas.shell.loadingPanel"');
    expect(source).toContain('t("studio.canvas.shell.loadingStudio"');
    expect(source).not.toContain('label = "');
  });

  it("실패 표면이 제목·상세·출구를 키로 표시한다", () => {
    const source = readSource("./StudioRouteFallbacks.tsx");
    expect(source).toContain('t("studio.canvas.shell.routeErrorTitle"');
    expect(source).toContain("ROUTE_ERROR_DETAIL_KEYS");
    expect(source).toContain('t("studio.canvas.shell.routeErrorToShowcase"');
    expect(source).toContain('t("studio.canvas.shell.placeholderStepsAriaLabel"');
    // JSX 텍스트로 직접 박힌 한국어 제목이 남아 있지 않다
    expect(source).not.toContain(">Studio 작업 주소를 확인해 주세요<");
    expect(source).not.toContain(">창작 게시판으로<");
  });

  it("AI 디렉터 라우트의 단계 내비 aria-label이 키를 경유한다", () => {
    const source = readSource("./routes/StudioAiComicDirectorRoute.tsx");
    expect(source).toContain('t("studio.canvas.shell.aiDirectorStepsAriaLabel"');
    expect(source).not.toContain('aria-label="AI 코믹 디렉터 제작 단계"');
  });
});
