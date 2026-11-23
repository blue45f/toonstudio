import {
  STUDIO_MENUBAR_STATUS_SLOT_REFS,
  type StudioMenubarStatusSlotId,
} from "./studio-menubar-status-slot";

const DEFAULT_SLOT_IDS: readonly StudioMenubarStatusSlotId[] = ["sync", "save", "endurance"];

/** 상태 칩이 메뉴바의 정상 흐름에 참여하도록 등록하는 자리. 내용이 없으면 공간도 비운다. */
export function StudioMenubarStatusSlots({
  ids = DEFAULT_SLOT_IDS,
}: {
  readonly ids?: readonly StudioMenubarStatusSlotId[];
}) {
  return <>{ids.map((id) => (
    <div
      key={id}
      ref={STUDIO_MENUBAR_STATUS_SLOT_REFS[id]}
      data-studio-menubar-status-slot={id}
      className="flex shrink-0 items-center empty:hidden"
    />
  ))}</>;
}
