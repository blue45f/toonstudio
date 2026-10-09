import { useEffect, useRef } from "react";

import { studioSpaceEmoteForKey, type StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import type { StudioUserZoomAction } from "../studio-virtual-space-user-zoom";

export interface SpaceShortcutHandlers {
  /** 1~9·Z 이모트. */
  readonly onEmote: (id: StudioSpaceEmoteId) => void;
  /** M: 지도 열기/닫기. */
  readonly onToggleMap: () => void;
  /** P: 참가자 패널 열기/닫기. */
  readonly onTogglePeople: () => void;
  /** ?: 단축키 도움말. */
  readonly onHelp: () => void;
  /** Enter: 말풍선 채팅 입력 열기. 버튼·링크 포커스 시에는 그 요소의 기본 동작을 존중한다. */
  readonly onChat?: () => void;
  /** Esc: 가장 위에 열린 HUD 레이어를 닫는다. 닫은 레이어가 있으면 true. */
  readonly onEscape: () => boolean;
  /** +·=: 확대, -·_: 축소, 0: 원래 크기. 줌을 받을 수 없는 장소에서는 넘기지 않는다. */
  readonly onZoom?: (action: StudioUserZoomAction) => void;
  /** H: 내 자리로 걷기. */
  readonly onDesk?: () => void;
  /** L: 끌어서 옮겨 둔 시점을 내 위치로 되돌린다(게더타운의 Show My Location). */
  readonly onLocate?: () => void;
}

const TEXT_ENTRY_SELECTOR = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';

/** 입력 요소·IME 조합·보조키 조합은 HUD 단축키로 해석하지 않는다. */
export function spaceShortcutIgnored(event: Pick<KeyboardEvent, "isComposing" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented">): boolean {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target;
  return target instanceof Element && Boolean(target.closest(TEXT_ENTRY_SELECTOR));
}

/**
 * 알파벳 단축키를 글쇠 위치(code)로 읽는다. 한글 자판에서는 event.key가 자모("ㅡ")라 M·P·Z가 먹지 않았다.
 * code가 없거나 알파벳 글쇠가 아니면 event.key를 그대로 소문자로 쓴다.
 */
function shortcutKey(event: Pick<KeyboardEvent, "key" | "code">): string {
  return /^Key([A-Z])$/u.exec(event.code ?? "")?.[1]?.toLowerCase() ?? event.key.toLowerCase();
}

/**
 * HUD(window) 단축키: 1~9·Z 이모트, M 지도, P 참가자, H 내 자리, L 내 위치로 시점 되돌리기, +/-/0 화면 크기, ? 도움말, Esc 최상위 레이어 닫기.
 * 이동(WASD·방향키)과 상호작용(X)은 캔버스가 맡으므로 여기서 바인딩하지 않는다.
 */
export function useSpaceShortcuts(handlers: SpaceShortcutHandlers, enabled = true): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.isComposing || event.defaultPrevented) return;
        if (latest.current.onEscape()) event.preventDefault();
        return;
      }
      if (event.repeat || spaceShortcutIgnored(event)) return;
      if (event.key === "Enter" && latest.current.onChat) {
        const target = event.target;
        if (target instanceof Element && target.closest('button, a[href], [role="button"], [role="link"]')) return;
        event.preventDefault();
        latest.current.onChat();
        return;
      }
      const key = shortcutKey(event);
      const emote = studioSpaceEmoteForKey(key);
      if (emote) {
        event.preventDefault();
        latest.current.onEmote(emote.id);
        return;
      }
      const zoom = event.key === "+" || event.key === "=" ? "in" : event.key === "-" || event.key === "_" ? "out" : event.key === "0" ? "reset" : null;
      if (zoom && latest.current.onZoom) { event.preventDefault(); latest.current.onZoom(zoom); return; }
      if (key === "m") { event.preventDefault(); latest.current.onToggleMap(); }
      else if (key === "p") { event.preventDefault(); latest.current.onTogglePeople(); }
      else if (key === "h" && latest.current.onDesk) { event.preventDefault(); latest.current.onDesk(); }
      else if (key === "l" && latest.current.onLocate) { event.preventDefault(); latest.current.onLocate(); }
      else if (event.key === "?") { event.preventDefault(); latest.current.onHelp(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
