import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertStudioFilterGalleryActiveEntries, STUDIO_FILTER_TARGET_DESCRIPTION,
  studioFilterDialogSurface, studioFilterTargetFromDescription,
} from "./studio-filter-dialog-surface";

const single = readFileSync(new URL("../../apps/web/src/domains/creator/filter/StudioFilterDialog.tsx", import.meta.url), "utf8");
const gallery = readFileSync(new URL("../../apps/web/src/domains/creator/filter/gallery/StudioFilterGalleryDialog.tsx", import.meta.url), "utf8");

describe("실제 필터 세션과 검증 표면의 계약", () => {
  it.each([["필터 갤러리…", gallery, true], ["가우시안 블러", single, false]] as const)(
    "%s는 실제 컴포넌트가 선언한 대화상자를 기다린다", (label, source, isGallery) => {
      const surface = studioFilterDialogSurface(label);
      expect(surface.gallery).toBe(isGallery);
      expect(source).toContain(`aria-labelledby="${surface.titleId}"`);
      expect(surface.selector).toBe(`[aria-labelledby="${surface.titleId}"]`);
    },
  );
  it.each([
    "선택한 이미지 레이어에 비파괴 필터로 적용합니다.",
    "선택한 이미지 레이어에 효과 스택을 비파괴로 저장합니다. 다시 열면 겹마다 고칠 수 있어요.",
  ])("실제 이미지 대상 설명을 페이지 합성으로 오인하지 않는다: %s", (description) => {
    expect(single + gallery).toContain(description);
    expect(STUDIO_FILTER_TARGET_DESCRIPTION.test(description)).toBe(true);
    expect(studioFilterTargetFromDescription(description)).toBe("image");
  });
  it("페이지 합성 설명은 별도로 판정하고 없는 설명을 추측하지 않는다", () => {
    const description = "현재 보이는 페이지를 편집 가능한 합성 레이어로 만들고, 원본 레이어를 보존한 채 효과 스택을 적용합니다.";
    expect(gallery).toContain(description);
    expect(STUDIO_FILTER_TARGET_DESCRIPTION.test(description)).toBe(true);
    expect(studioFilterTargetFromDescription(description)).toBe("page-composite");
    for (const missing of [null, "", "알 수 없는 대상", "비파괴 합성 레이어"]) expect(() => studioFilterTargetFromDescription(missing)).toThrow("필터 대상 설명");
  });
  it("새 이미지의 빈·잘못된 스택을 변경이 있는 적용으로 인정하지 않는다", () => {
    for (const count of [0, -1, NaN, 0.5]) expect(() => assertStudioFilterGalleryActiveEntries(count)).toThrow("실제 활성 효과");
    expect(() => assertStudioFilterGalleryActiveEntries(1)).not.toThrow();
  });
});
