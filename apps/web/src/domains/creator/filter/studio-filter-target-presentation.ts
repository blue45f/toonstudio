import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export type StudioFilterTargetKind = "image" | "layer-composite" | "page-composite";
export type StudioFilterTargetLabel = "선택 이미지" | "선택 레이어" | "현재 페이지 합성본";

/** 필터 하나와 효과 스택 모두 실제 편집 대상과 원본 보존 방식을 알린다. */
export function useStudioFilterTargetDescription(target: StudioFilterTargetKind, stack = false): string {
  const bt = useBilingual("studio.filter");
  if (target === "layer-composite") {
    return bt(
      "선택한 레이어에만 효과를 적용합니다. 원본 레이어는 숨겨 두고, 실행 취소하면 원본이 다시 보입니다.",
      "Effects apply only to the selected layer. The original layer is hidden. Undo shows it again.",
    );
  }
  if (target === "page-composite") {
    return stack
      ? bt("현재 보이는 페이지를 편집 가능한 합성 레이어로 만들고, 원본 레이어를 보존한 채 효과 스택을 적용합니다.", "Apply the effect stack to an editable composite of the visible page. The original layers are preserved.")
      : bt("현재 보이는 페이지를 편집 가능한 합성 레이어로 만들고, 원본 레이어를 보존한 채 필터를 적용합니다.", "Apply the filter to an editable composite of the visible page. The original layers are preserved.");
  }
  return stack
    ? bt("선택한 이미지 레이어에 효과 스택을 비파괴로 저장합니다. 다시 열면 겹마다 고칠 수 있어요.", "Save the effect stack non-destructively on the selected image. Reopen it to edit each effect.")
    : bt("선택한 이미지 레이어에 비파괴 필터로 적용합니다.", "Apply a non-destructive filter to the selected image.");
}
