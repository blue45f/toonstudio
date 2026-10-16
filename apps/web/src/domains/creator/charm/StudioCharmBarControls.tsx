/**
 * 다른 패널(요소·효과 메뉴)에서 참 바를 켜고 끄거나 항목을 고정하는 작은 컨트롤.
 * 참 바와 같은 스토어를 보므로 어느 쪽에서 바꿔도 즉시 맞는다. 스토어와 아이콘만 가져오는 가벼운 파일이다.
 *
 * 토글 행은 이웃 패널(`StudioInspectorNavigator`)과 같은 관례를 따른다: 행 전체가 `aria-pressed` 버튼이고,
 * 스위치 모양은 공용 `SwitchIndicator` 가 그린다(thumb·track 을 다시 그리지 않는다).
 */

import { Pin, Sparkles } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";

import { SwitchIndicator } from "@/shared/components/ui/switch";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { preloadStudioCharmBar } from "./studio-charm-bar-loader";
import { getStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import { preloadStudioCharmCatalogData } from "./studio-charm-catalog-data";
import { bi } from "./studio-charm-copy";
import { STUDIO_CHARM_BAR_MAX_CHARMS, isStudioCharmPinned, parseStudioCharmId } from "./studio-charm-model";

/** 켜려는 낌새(포인터 올림·포커스·터치)가 보이면 지연 로드하는 본체와 카탈로그 데이터를 미리 데운다. */
function warmUpCharmBar(): void {
  preloadStudioCharmBar();
  preloadStudioCharmCatalogData();
}

/**
 * 요소·효과 메뉴 머리에 두는 "참 바" 토글 행. 이름은 고정이고 켜짐 여부는 `aria-pressed` 가 전한다.
 * 처음 켜면 스토어가 기본 스타터 팩을 한 번 담는다.
 */
export function StudioCharmBarToggleButton({
  store = getStudioCharmBarStore(),
  className,
}: {
  readonly store?: StudioCharmBarStore;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const hintId = useId();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.hydrate();
  }, [store]);
  const open = snapshot.state.open;
  return (
    <button
      type="button"
      aria-pressed={open}
      aria-label={bi("참 바", "Charm bar")}
      aria-describedby={hintId}
      data-studio-charm-bar-toggle=""
      onPointerEnter={warmUpCharmBar}
      onPointerDown={warmUpCharmBar}
      onFocus={warmUpCharmBar}
      onClick={() => { store.dispatch({ type: "toggle-open" }); }}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-left",
        STUDIO_EASE,
        "motion-reduce:transition-none",
        open
          ? "border-accent/45 bg-accent-soft text-fg"
          : "border-line bg-card text-fg-2 hover:border-accent/40 hover:bg-raised",
        STUDIO_FOCUS_RING,
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Sparkles size={14} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0">
          <span aria-hidden="true" className="block truncate text-xs font-semibold">
            {bi("참 바", "Charm bar")}
          </span>
          <span id={hintId} className="block text-[0.68rem] leading-snug text-fg-3">
            {bi(
              "자주 쓰는 소재를 한 번에 붙이는 고정 바예요. 눌러서 켜고 끄세요.",
              "A pinned bar that stamps your frequent items in one tap. Press to show or hide it.",
            )}
          </span>
        </span>
      </span>
      <SwitchIndicator checked={open} />
    </button>
  );
}

/**
 * 소재 상세 미리보기 같은 넓은 자리에 두는 "참 바에 고정" 토글. 이름은 고정이고 고정 여부는 `aria-pressed` 가 전한다.
 * 가득 차 있으면 고정하지 않고 이유를 같은 자리에서 알린다. 고정하면 바를 함께 펼쳐 결과가 바로 보이게 한다.
 */
export function StudioCharmPinAction({
  kind,
  rawId,
  store = getStudioCharmBarStore(),
  className,
}: {
  readonly kind: "element";
  readonly rawId: string;
  readonly store?: StudioCharmBarStore;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [fullNotice, setFullNotice] = useState(false);
  useEffect(() => {
    void store.hydrate();
  }, [store]);
  const id = parseStudioCharmId(`${kind}:${rawId}`);
  if (!id) return null;
  const pinned = isStudioCharmPinned(snapshot.state, id);
  return (
    <>
      <button
        type="button"
        aria-pressed={pinned}
        data-studio-charm-pin=""
        onClick={() => {
          const result = store.dispatch({ type: "toggle", id });
          setFullNotice(!result.ok);
          if (result.ok && !pinned) store.dispatch({ type: "set-open", open: true });
        }}
        className={cn("inline-flex items-center justify-center gap-1.5", className)}
      >
        <Pin size={14} fill={pinned ? "currentColor" : "none"} aria-hidden="true" />
        {bi("참 바에 고정", "Pin to charm bar")}
      </button>
      {fullNotice ? (
        <p role="status" className="basis-full text-xs text-bad">
          {bi(
            `참 바가 가득 찼어요(최대 ${STUDIO_CHARM_BAR_MAX_CHARMS}개). 하나를 빼면 새로 고정할 수 있어요.`,
            `The charm bar is full (up to ${STUDIO_CHARM_BAR_MAX_CHARMS}). Remove one to pin another.`,
          )}
        </p>
      ) : null}
    </>
  );
}
