import { RotateCcw } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioSpaceEmoteById } from "../studio-virtual-space-emote-catalog";
import { STUDIO_EMOTE_KEY_SLOTS, studioEmoteKeymapStore, type StudioEmoteKeymapStore } from "../studio-virtual-space-emote-keymap";
import { SpacePopover } from "./SpacePopover";
import { useSpaceEmoteKeymap } from "./use-space-emote-keymap";

const SHORTCUTS = [
  { keys: ["W", "A", "S", "D"], ko: "걷기 (방향키도 가능)", en: "Walk (arrow keys too)" },
  { keys: ["Shift"], ko: "누른 채 걸으면 달리기", en: "Hold to run" },
  { keys: ["E", "X"], ko: "가까운 대상과 상호작용", en: "Interact with what is nearby" },
  { keys: ["Enter"], ko: "말풍선 채팅 열기 · 보내기", en: "Open · send bubble chat" },
  { keys: ["1~9", "Z"], ko: "리액션 (리액션 창에서 키를 바꿀 수 있어요)", en: "Reactions (change the keys in the reactions window)" },
  { keys: ["M"], ko: "지도 열기·닫기", en: "Open or close the map" },
  { keys: ["P"], ko: "참가자 패널 열기·닫기", en: "Open or close people" },
  { keys: ["H"], ko: "내 자리로 걷기", en: "Walk to my desk" },
  { keys: ["L"], ko: "끌어서 옮겨 둔 시점을 내 위치로 되돌리기", en: "Bring the view back to my avatar" },
  { keys: ["오른쪽 끌기", "Space+끌기"], ko: "시점을 끌어서 둘러보기 (터치는 두 손가락)", en: "Drag to look around (two fingers on touch)" },
  { keys: ["+", "-", "0"], ko: "화면 확대·축소·원래 크기 (마우스 휠도 가능)", en: "Zoom in · out · reset (mouse wheel works too)" },
  { keys: ["G"], ko: "고스트 모드 켜고 끄기 (벽·사람 통과)", en: "Toggle ghost mode (pass through walls and people)" },
  { keys: ["Ctrl", "K"], ko: "방·사람 찾기", en: "Find rooms and people" },
  { keys: ["Esc"], ko: "이동 멈추기 · 맨 위 창 닫기", en: "Stop walking · close the top window" },
  { keys: ["?"], ko: "이 도움말", en: "This help" },
] as const;

/** ? 단축키 도움말. 3단계 미니 투어를 다시 볼 수 있다. */
export function SpaceShortcutsHelp({ open, sheet, onClose, onReplayTour, emoteKeymap = studioEmoteKeymapStore }: {
  readonly open: boolean;
  readonly sheet: boolean;
  readonly onClose: () => void;
  readonly onReplayTour: () => void;
  /** 이모트 단축키 배정. 기본은 화면 공용 저장소(사용자가 바꾼 키가 그대로 보인다). */
  readonly emoteKeymap?: StudioEmoteKeymapStore;
}) {
  const bt = useBilingual("SpaceShortcutsHelp");
  const keys = useSpaceEmoteKeymap(emoteKeymap);
  const emoteKeys = STUDIO_EMOTE_KEY_SLOTS.flatMap((slot) => {
    const id = keys[slot];
    const emote = id ? studioSpaceEmoteById(id) : null;
    return emote ? [{ slot, emote }] : [];
  });
  return <SpacePopover open={open} sheet={sheet} onClose={onClose} title={bt("단축키와 조작법", "Shortcuts & controls")} className="space-popover--help">
    <dl className="space-help__list">
      {SHORTCUTS.map((item) => <div key={item.ko} className="space-help__row">
        <dt>{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</dt>
        <dd>{bt(item.ko, item.en)}</dd>
      </div>)}
    </dl>
    <div className="space-help__emotes" role="group" aria-label={bt("리액션 단축키", "Reaction shortcuts")}>
      {emoteKeys.map(({ slot, emote }) => <span key={slot}><kbd>{slot}</kbd><span aria-hidden>{emote.glyph}</span>{bt(emote.labelKo, emote.labelEn)}</span>)}
    </div>
    <button type="button" className="space-menu-row" onClick={() => { onClose(); onReplayTour(); }}>
      <RotateCcw size={16} aria-hidden /><span className="space-menu-row__label">{bt("미니 투어 다시 보기", "Replay the mini tour")}</span>
    </button>
  </SpacePopover>;
}
