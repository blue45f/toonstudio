import { Keyboard, RotateCcw } from "lucide-react";
import { memo, useState, type Ref } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_SPACE_EMOTES, type StudioSpaceEmoteDefinition, type StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import {
  STUDIO_EMOTE_KEY_SLOTS,
  isDefaultStudioEmoteKeymap,
  studioEmoteKeymapStore,
  studioEmoteSlotOf,
  type StudioEmoteKeymapStore,
} from "../studio-virtual-space-emote-keymap";
import { useSpaceEmoteKeymap } from "./use-space-emote-keymap";

/**
 * 16종 이모트 격자. 배열 순서가 곧 표시 순서이며 단축키가 있으면 배지로 보여 준다.
 * 선택은 onEmote(id)로만 알리고, 실제 전송·월드 재생은 호출 측이 맡는다.
 * strip은 모바일 도크 위에 펼치는 가로 한 줄(가로 스크롤·스냅)이다.
 *
 * 격자(데스크톱)에는 '단축키 바꾸기'가 있다. 켜면 이모트 칸이 단추 대신 키 고르기(select)가 되어, 이모트마다 1~9·Z 중
 * 하나를 고르거나 없앨 수 있다. 이미 다른 이모트가 쓰는 키를 고르면 두 이모트가 키를 맞바꾼다.
 */
export const SpaceEmotePicker = memo(function SpaceEmotePicker({ onEmote, firstButtonRef, variant = "grid", keymap = studioEmoteKeymapStore }: {
  readonly onEmote: (id: StudioSpaceEmoteId) => void;
  readonly firstButtonRef?: Ref<HTMLButtonElement>;
  readonly variant?: "grid" | "strip";
  /** 단축키 배정 저장소. 기본은 화면 공용 저장소다. */
  readonly keymap?: StudioEmoteKeymapStore;
}) {
  const bt = useBilingual("SpaceEmotePicker");
  const keys = useSpaceEmoteKeymap(keymap);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const editable = variant === "grid";
  const labelOf = (emote: StudioSpaceEmoteDefinition) => bt(emote.labelKo, emote.labelEn);

  /** 키를 바꾸고, 바뀐 결과(맞바꾼 이모트 포함)를 한 줄로 알린다. */
  const assign = (emote: StudioSpaceEmoteDefinition, value: string) => {
    const slot = STUDIO_EMOTE_KEY_SLOTS.find((candidate) => candidate === value) ?? null;
    const before = keymap.getSnapshot();
    const displacedId = slot ? before[slot] : undefined;
    const displaced = displacedId && displacedId !== emote.id ? STUDIO_SPACE_EMOTES.find((candidate) => candidate.id === displacedId) : undefined;
    keymap.assign(emote.id, slot);
    const after = keymap.getSnapshot();
    const none = bt("없음", "none");
    const parts = [bt(`${emote.labelKo} 단축키: ${slot ?? none}`, `${emote.labelEn} shortcut: ${slot ?? none}`)];
    if (displaced) {
      const moved = studioEmoteSlotOf(after, displaced.id) ?? none;
      parts.push(bt(`${displaced.labelKo} 단축키: ${moved}`, `${displaced.labelEn} shortcut: ${moved}`));
    }
    setNotice(parts.join(" · "));
  };

  const reset = () => {
    keymap.reset();
    setNotice(bt("단축키를 기본값으로 되돌렸어요", "Shortcuts are back to the defaults"));
  };

  return <div className="space-emote-picker" data-variant={variant} data-editing={editing || undefined} role="group"
    aria-label={variant === "strip" ? bt("리액션 보내기", "Send a reaction") : bt("리액션 16종", "16 reactions")}>
    {STUDIO_SPACE_EMOTES.map((emote, index) => {
      const label = labelOf(emote);
      const shortcut = studioEmoteSlotOf(keys, emote.id);
      if (editing && editable) {
        return <div key={emote.id} className="space-emote-picker__item" data-emote-id={emote.id} data-editing role="group" aria-label={label}>
          <span className="space-emote-picker__glyph" aria-hidden>{emote.glyph}</span>
          <span className="space-emote-picker__label" aria-hidden>{label}</span>
          <span className="space-emote-picker__select-wrap">
            <select className="space-emote-picker__select" value={shortcut ?? ""} aria-label={bt(`${emote.labelKo} 단축키`, `${emote.labelEn} shortcut`)}
              onChange={(event) => assign(emote, event.target.value)}>
              <option value="">{bt("없음", "None")}</option>
              {STUDIO_EMOTE_KEY_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
            </select>
          </span>
        </div>;
      }
      return <button key={emote.id} ref={index === 0 ? firstButtonRef : undefined} type="button" className="space-emote-picker__item"
        data-emote-id={emote.id}
        aria-label={shortcut ? bt(`${emote.labelKo} (단축키 ${shortcut})`, `${emote.labelEn} (shortcut ${shortcut})`) : label}
        aria-keyshortcuts={shortcut ?? undefined}
        onClick={() => onEmote(emote.id)}>
        <span className="space-emote-picker__glyph" aria-hidden>{emote.glyph}</span>
        <span className="space-emote-picker__label" aria-hidden>{label}</span>
        {shortcut ? <kbd className="space-emote-picker__key" aria-hidden>{shortcut}</kbd> : null}
      </button>;
    })}
    {editable ? <div className="space-emote-picker__tools">
      <button type="button" className="space-emote-picker__tool" aria-pressed={editing} onClick={() => { setEditing(!editing); setNotice(""); }}>
        <Keyboard size={14} aria-hidden /><span>{bt("단축키 바꾸기", "Edit shortcuts")}</span>
      </button>
      {editing ? <button type="button" className="space-emote-picker__tool" disabled={isDefaultStudioEmoteKeymap(keys)} onClick={reset}>
        <RotateCcw size={14} aria-hidden /><span>{bt("기본값으로", "Reset")}</span>
      </button> : null}
    </div> : null}
    {editable && editing ? <p className="space-emote-picker__notice" role="status">{notice}</p> : null}
  </div>;
});
