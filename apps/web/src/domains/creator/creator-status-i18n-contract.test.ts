// 로딩·실패·에러 문자열의 키 기반 강제 계약 테스트.
// creator-a11y-contract 패턴 확장: 등록된 표면 파일들이 로딩·실패·에러 문구를
// 호출부에 하드코딩으로 다시 들여오지 않도록 정적 검사한다.
// 근거: inclusion 발견 1(a) — 신규 표면부터 키 기반(useT 키 / useBilingual 쌍 /
// defineBilingualText 등록)으로 강제하고, 한국어 원문은 키 폴백·*_KEYS 짝 맵으로만 허용.
//
// 신규 표면을 만들면 그 파일을 GUARDED_FILES에 등록하는 것이 이 계약의 일부다.
// 등록된 파일에 하드코딩 상태 문자열이 들어오면 이 테스트가 실패한다.
// 정당한 예외는 해당 줄에 "i18n-exempt: <사유>" 주석을 단다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "../../shared/language/status-i18n";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 이 계약이 지키는 표면들 — 1차 등록: 스튜디오 셸(라우트 로딩·실패 표면).
 * 표시 정본은 studio.canvas.shell.* 키 (studio-route-shell-i18n 계약과 짝).
 */
const GUARDED_FILES = [
  "StudioLazySurfaceFallback.tsx",
  "studio-router/StudioRouteFallbacks.tsx",
  "studio-router/routes/StudioEditorRoute.tsx",
  "studio-router/routes/StudioProductionRoute.tsx",
  "studio-router/routes/StudioPublishRoute.tsx",
  "studio-router/routes/StudioStoryworldRoute.tsx",
  "studio-router/routes/StudioWorkAssetsRoute.tsx",
  "studio-router/routes/StudioAiComicDirectorRoute.tsx",
] as const;

function readGuarded(file: (typeof GUARDED_FILES)[number]): string {
  return readFileSync(join(HERE, file), "utf-8");
}

describe("로딩·실패·에러 문자열 키 기반 계약", () => {
  it("등록 표면에 하드코딩된 로딩·실패·에러 문자열이 없다", () => {
    const violations: string[] = [];
    for (const file of GUARDED_FILES) {
      for (const violation of scanHardcodedStatusStrings(readGuarded(file))) {
        violations.push(
          `${file}:${violation.line} → [${violation.kind}/${violation.rule}] ${violation.snippet}`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("탐지기가 신규 하드코딩을 실제로 잡는다 (게이트 무력화 방지)", () => {
    const planted = [
      `const NEW_FETCH_ERROR = "새 데이터를 불러오지 못했습니다.";`,
      `export function NewLoading({ label = "새 화면을 여는 중..." }: Props) {}`,
      `<StudioRouteLoading label="새 편집기를 여는 중..." />`,
    ].join("\n");
    const violations = scanHardcodedStatusStrings(planted);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations.some((v) => v.kind === "failure")).toBe(true);
    expect(violations.some((v) => v.kind === "loading")).toBe(true);
  });

  it("키 기반 표시(폴백 포함)는 위반이 아니다", () => {
    const compliant = [
      `<StudioRouteLoading label={t("studio.canvas.shell.loadingEditor", "Studio 편집기를 여는 중...")} />`,
      `const label = t("새 데이터를 불러오지 못했습니다.", "Failed to load new data.");`,
    ].join("\n");
    expect(scanHardcodedStatusStrings(compliant)).toEqual([]);
  });
});
