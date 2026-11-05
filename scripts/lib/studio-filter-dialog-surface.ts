import type { Locator, Page } from "playwright";

const GALLERY_LABEL = "필터 갤러리…";
const SLIDER_NUDGE_STEPS = 15;
export const STUDIO_FILTER_TARGET_DESCRIPTION = /비파괴 필터로 적용합니다|효과 스택을 비파괴로 저장합니다|합성 레이어로 만들고/u;

/** 메뉴의 실제 세션 종류와 같은 대화상자를 기다린다. */
export function studioFilterDialogSurface(label?: string) {
  const gallery = label === GALLERY_LABEL;
  const titleId = gallery ? "studio-filter-gallery-title" : "studio-filter-dialog-title";
  return { gallery, titleId, selector: `[aria-labelledby="${titleId}"]` };
}

/** 설명이 없거나 두 권위가 섞이면 페이지 합성으로 추측하지 않는다. */
export function studioFilterTargetFromDescription(description: string | null): "image" | "page-composite" {
  const image = description?.includes("비파괴") ?? false;
  const composite = description?.includes("합성 레이어") ?? false;
  if (image === composite) throw new Error("필터 대상 설명을 확인할 수 없습니다.");
  return image ? "image" : "page-composite";
}

/** 새 원고의 빈 스택은 픽셀을 바꾼 적용의 증거가 아니다. 기존 스택 비우기 기능은 건드리지 않는다. */
export function assertStudioFilterGalleryActiveEntries(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("필터 갤러리에서 실제 활성 효과를 고르지 못했습니다.");
}

export async function prepareStudioFilterGalleryForVerification(dialog: Locator): Promise<number> {
  await dialog.getByRole("searchbox", { name: "효과 검색", exact: true }).fill("명도 반전");
  await dialog.getByRole("list", { name: "효과 목록", exact: true })
    .getByRole("button", { name: /^명도 반전/u }).click({ timeout: 5_000 });
  const stack = dialog.getByRole("list", { name: "쌓인 효과", exact: true });
  await stack.waitFor({ state: "visible", timeout: 5_000 });
  await stack.getByRole("button", { name: "명도 반전 끄기", exact: true }).waitFor({ state: "visible", timeout: 5_000 });
  const count = await stack.getByRole("button", { name: / 끄기$/u }).count();
  assertStudioFilterGalleryActiveEntries(count);
  return count;
}

export async function nudgeFirstParameterSlider(
  page: Page,
  dialog: ReturnType<Page["locator"]>,
): Promise<boolean> {
  const slider = dialog.locator('input[type="range"]').locator("visible=true").first();
  if ((await slider.count()) > 0) {
    await slider.focus();
    for (let step = 0; step < SLIDER_NUDGE_STEPS; step += 1) {
      await slider.press("ArrowUp");
    }
    return true;
  }
  // 색상 커브처럼 range 슬라이더 대신 커브 에디터로 값을 바꾸는 필터도 있다.
  // 슬라이더 부재를 "값을 바꿀 수 없음"으로 보면 필터 렌더 결함으로 오판한다.
  const curvePoint = dialog.locator('[data-studio-curve-point-hit-target="true"]').locator("visible=true").first();
  if ((await curvePoint.count()) === 0) return false;
  // 포인터 클릭은 곡선을 선택만 하고 값은 키보드로 바꾼다.
  await curvePoint.click({ timeout: 5_000 });
  await curvePoint.focus();
  for (let step = 0; step < SLIDER_NUDGE_STEPS; step += 1) {
    await curvePoint.press("ArrowUp");
  }
  return true;
}

