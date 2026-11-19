import type { StudioCanvasInputStatus } from "./studio-canvas-input-status";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const messages = {
  loading: ["원고를 불러오는 중입니다. 준비되면 그릴 수 있어요.", "Opening the manuscript. You can draw when it is ready."],
  recovering: ["이 기기에 저장된 원고를 확인하고 있어요. 잠시 후 그릴 수 있습니다.", "Checking the manuscript saved on this device. Drawing will be available shortly."],
  "recovery-choice": ["저장된 원고를 복구하거나 건너뛴 뒤 그릴 수 있어요.", "Restore or skip the saved manuscript to start drawing."],
  "recovery-error": ["저장된 원고를 확인하지 못했어요. 새로고침해 다시 열어 주세요.", "The saved manuscript could not be checked. Reload to try again."],
  "source-error": ["원고를 열지 못했어요. 원고 불러오기를 다시 시도해 주세요.", "The manuscript could not be opened. Try loading it again."],
  unavailable: ["공동 원고에 접근할 수 없습니다. 계정과 멤버 권한을 확인해 주세요.", "This shared manuscript is unavailable. Check your account and membership."],
  reload: ["원고가 다른 곳에서 바뀌었습니다. 다시 연 뒤 편집해 주세요.", "The manuscript changed elsewhere. Reopen it to continue editing."],
  "read-only": ["읽기 전용 원고입니다. 편집하려면 작품의 편집 권한이 필요합니다.", "Read-only manuscript. Editing requires permission for this work."],
  review: ["검수로 잠긴 페이지입니다. 검수 잠금을 해제한 뒤 편집해 주세요.", "This page is locked for review. Unlock it to edit."],
  follower: ["읽기 전용입니다. 이 원고를 먼저 연 탭에서 편집해 주세요.", "Read-only in this tab. Edit in the tab that opened this manuscript first."],
  saving: ["원고를 저장하고 있어요. 저장이 끝나면 이어서 그릴 수 있습니다.", "Saving the manuscript. You can draw again once it is saved."],
} as const satisfies Record<Exclude<StudioCanvasInputStatus, "ready">, readonly [string, string]>;

export function StudioCanvasInputNotice({ status, id }: { status?: StudioCanvasInputStatus; id: string }) {
  const bt = useBilingual("studio.canvasInput");
  if (!status || status === "ready") return null;
  const [ko, en] = messages[status];
  return <div id={id} role="status" data-studio-canvas-input-notice={status}
    className="pointer-events-none absolute inset-x-0 top-3 z-20 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-lg border border-line bg-card px-3 py-2 text-center text-sm font-medium leading-relaxed text-fg shadow-sm">
    {bt(ko, en)}
  </div>;
}
