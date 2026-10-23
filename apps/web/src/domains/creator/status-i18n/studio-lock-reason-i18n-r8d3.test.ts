import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  imageEditLockReason,
  lockReasonText,
  rasterRetouchAutoTargetUnavailableReason,
  reviewLockReason,
  shaperPreviewLockReason,
} from "./studio-lock-reason-i18n";

/**
 * 잠금 사유 모듈 상수 → 리졸버 전환 계약 (A4 설계 D3 구현, r7-design-first.md).
 *
 * 배경: StudioLeftToolRail의 모듈 상수 3종(REVIEW_LOCK_REASON·
 * IMAGE_EDIT_LOCK_REASON·RASTER_RETOUCH_AUTO_TARGET_UNAVAILABLE_REASON)과
 * useCharacterShaperBinding의 동종 상수 PREVIEW_LOCK_REASON은 모듈 평가
 * 시점에 문자열이 고정돼 렌더·반환 시점 로케일을 반영할 수 없었다. 형제
 * 모듈 studio-lock-reason-i18n.ts의 리졸버 함수로 교체했고, 표시 문구는
 * 바꾸지 않았다(ko 원문 동일). 이 테스트는 사전 패리티·원문·로케일 전환·
 * 소비 파일의 상수 잔존 0과 호출 횟수를 고정한다.
 */

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf-8");
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = entry[2] ?? "";
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

const MODULE_SOURCE = readSource("status-i18n/studio-lock-reason-i18n.ts");
const DICTS = parseRegisterModule(MODULE_SOURCE);

const KO_ORIGINALS: Record<string, string> = {
  "studio.lockReason.reviewSurface": "현재 작업면의 검토 잠금을 먼저 해제하세요.",
  "studio.lockReason.imageEdit": "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요.",
  "studio.lockReason.rasterRetouchAutoTargetUnavailable": "편집 가능한 이미지도, 편집용 이미지 복사본을 자동 준비할 벡터 선·도형도 없습니다.",
  "studio.lockReason.shaperPreview": "미리보기 후보를 확정하거나 닫은 뒤에 다른 편집을 할 수 있습니다.",
};

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

describe("studio-lock-reason-i18n 사전", () => {
  it("ko/en 키 집합이 일치하고 정확히 잠금 사유 4키만 등록한다", () => {
    expect(Object.keys(DICTS.ko).sort()).toEqual(Object.keys(KO_ORIGINALS).sort());
    expect(Object.keys(DICTS.en).sort()).toEqual(Object.keys(KO_ORIGINALS).sort());
  });

  it("ko 값은 모듈 상수 시절 원문과 글자 단위로 같다", () => {
    expect(DICTS.ko).toEqual(KO_ORIGINALS);
  });

  it("en 값은 전부 비어 있지 않고 ko와 다르다", () => {
    for (const [key, ko] of Object.entries(KO_ORIGINALS)) {
      expect(DICTS.en[key]?.length).toBeGreaterThan(0);
      expect(DICTS.en[key]).not.toBe(ko);
    }
  });
});

describe("studio-lock-reason-i18n 리졸버", () => {
  it("ko 로케일에서 원문을 그대로 반환한다", () => {
    expect(reviewLockReason()).toBe(KO_ORIGINALS["studio.lockReason.reviewSurface"]);
    expect(imageEditLockReason()).toBe(KO_ORIGINALS["studio.lockReason.imageEdit"]);
    expect(rasterRetouchAutoTargetUnavailableReason()).toBe(
      KO_ORIGINALS["studio.lockReason.rasterRetouchAutoTargetUnavailable"],
    );
    expect(shaperPreviewLockReason()).toBe(KO_ORIGINALS["studio.lockReason.shaperPreview"]);
  });

  it("en 로케일에서는 등록된 영어 문구로 전환된다 (호출 시점 해석)", () => {
    useI18n.setState({ lang: "en" });
    expect(reviewLockReason()).toBe(DICTS.en["studio.lockReason.reviewSurface"]);
    expect(imageEditLockReason()).toBe(DICTS.en["studio.lockReason.imageEdit"]);
    expect(rasterRetouchAutoTargetUnavailableReason()).toBe(
      DICTS.en["studio.lockReason.rasterRetouchAutoTargetUnavailable"],
    );
    expect(shaperPreviewLockReason()).toBe(DICTS.en["studio.lockReason.shaperPreview"]);
  });

  it("등록되지 않은 키는 ko 폴백을 그대로 반환한다", () => {
    expect(lockReasonText("studio.lockReason.missing", "폴백 문구")).toBe("폴백 문구");
  });
});

describe("소비 파일 계약", () => {
  const rail = readSource("StudioLeftToolRail.tsx");
  const shaper = readSource("character-shaper/useCharacterShaperBinding.ts");

  it("모듈 상수 식별자가 두 소비 파일에서 전부 사라졌다", () => {
    expect(rail).not.toContain("REVIEW_LOCK_REASON");
    expect(rail).not.toContain("IMAGE_EDIT_LOCK_REASON");
    expect(rail).not.toContain("RASTER_RETOUCH_AUTO_TARGET_UNAVAILABLE_REASON");
    expect(shaper).not.toContain("PREVIEW_LOCK_REASON");
  });

  it("이전된 원문 리터럴이 소비 파일에 남아 있지 않다", () => {
    for (const ko of Object.values(KO_ORIGINALS)) {
      expect(rail).not.toContain(ko);
      expect(shaper).not.toContain(ko);
    }
  });

  it("리졸버 호출 횟수가 이관 전 상수 사용 횟수와 같다", () => {
    const count = (source: string, name: string) =>
      source.split(`${name}()`).length - 1;
    // 정의 3건 포함 27회 등장하던 상수 중 사용 24회 = 검토 17·이미지 6·리터치 1.
    expect(count(rail, "reviewLockReason")).toBe(17);
    expect(count(rail, "imageEditLockReason")).toBe(6);
    expect(count(rail, "rasterRetouchAutoTargetUnavailableReason")).toBe(1);
    expect(count(shaper, "shaperPreviewLockReason")).toBe(4);
  });

  it("GUIDANCE 별칭은 설계 방침대로 StudioLeftToolRail에 유지된다", () => {
    expect(rail).toContain(
      "const RASTER_RETOUCH_AUTO_TARGET_GUIDANCE = STUDIO_RETOUCH_EDITABLE_COPY_NOTE;",
    );
  });

  it("소비 파일 줄 수가 래칫 기준선(1188·1146)을 넘지 않는다", () => {
    expect(rail.split("\n").length - 1).toBeLessThanOrEqual(1188);
    expect(shaper.split("\n").length - 1).toBeLessThanOrEqual(1146);
  });
});
