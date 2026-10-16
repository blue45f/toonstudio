/**
 * 참 바의 키보드 규칙(순수 함수).
 *
 * 참 칩들은 하나의 도구 모음(toolbar)이며 한 번에 칩 하나만 Tab 정지점을 가진다(roving tabindex).
 * 세로 레일·가로 띠·떠 있는 창 어느 모양으로 놓여도 같은 키가 통하도록 네 방향 화살표를 모두 이동으로 쓴다.
 *
 * | 키 | 동작 |
 * | --- | --- |
 * | ← → ↑ ↓ | 이전/다음 칩으로 이동(끝에서 반대편으로 순환) |
 * | Home / End | 첫/마지막 칩으로 |
 * | Enter / Space | 선택한 참을 붙인다(키를 누르고 있어도 한 번만) |
 * | Alt + ← ↑ / → ↓ | 참의 순서를 한 칸 앞/뒤로 |
 * | Delete | 참 바에서 뺀다(요소 목록에서 다시 고정할 수 있다) |
 * | Esc | 순서 편집 모드 끝내기 |
 */

export interface StudioCharmKeyEvent {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
}

export interface StudioCharmKeyContext {
  /** 지금 포커스된 칩의 순서(0부터). */
  readonly index: number;
  readonly count: number;
  readonly editing: boolean;
}

export type StudioCharmKeyIntent =
  | { readonly type: "focus"; readonly index: number }
  | { readonly type: "activate" }
  | { readonly type: "reorder"; readonly delta: -1 | 1 }
  | { readonly type: "unpin" }
  | { readonly type: "exit-edit" }
  /** 기본 동작만 막는다(키 반복으로 같은 참이 여러 번 붙는 것을 방지). */
  | { readonly type: "swallow" }
  | { readonly type: "ignore" };

export type StudioCharmShortcutId = "move" | "edge" | "stamp" | "reorder" | "remove" | "exit";

/** 화면의 "단축키 안내"가 보여 줄 키 목록. 설명 문구는 화면이 이중언어로 붙인다. */
export const STUDIO_CHARM_SHORTCUTS: readonly { readonly id: StudioCharmShortcutId; readonly keys: string }[] = Object.freeze([
  { id: "move", keys: "← → ↑ ↓" },
  { id: "edge", keys: "Home / End" },
  { id: "stamp", keys: "Enter · Space" },
  { id: "reorder", keys: "Alt + ← → ↑ ↓" },
  { id: "remove", keys: "Delete" },
  { id: "exit", keys: "Esc" },
]);

const NEXT_KEYS: ReadonlySet<string> = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowUp"]);

export function resolveStudioCharmKeyIntent(
  event: StudioCharmKeyEvent,
  context: StudioCharmKeyContext,
): StudioCharmKeyIntent {
  if (event.isComposing || event.ctrlKey || event.metaKey) return { type: "ignore" };
  const { index, count, editing } = context;

  if (event.key === "Escape") return editing ? { type: "exit-edit" } : { type: "ignore" };
  if (count <= 0) return { type: "ignore" };

  if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
    return event.repeat ? { type: "swallow" } : { type: "activate" };
  }
  if (event.key === "Delete") return event.repeat ? { type: "swallow" } : { type: "unpin" };

  const forward = NEXT_KEYS.has(event.key);
  const backward = PREVIOUS_KEYS.has(event.key);
  if (forward || backward) {
    if (event.altKey) {
      const delta = forward ? 1 : -1;
      const target = index + delta;
      // 양 끝에서는 순서가 바뀌지 않는다. 기본 동작(스크롤)만 막는다.
      return target < 0 || target >= count ? { type: "swallow" } : { type: "reorder", delta };
    }
    if (event.shiftKey) return { type: "ignore" };
    return { type: "focus", index: (index + (forward ? 1 : -1) + count) % count };
  }

  if (event.altKey || event.shiftKey) return { type: "ignore" };
  if (event.key === "Home") return { type: "focus", index: 0 };
  if (event.key === "End") return { type: "focus", index: count - 1 };
  return { type: "ignore" };
}
