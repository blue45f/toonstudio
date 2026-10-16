/**
 * 원클릭 참(Charm) 스탬프 바.
 *
 * 사용자가 고정한 소재/효과를 아이콘 칩으로 보여 주고, 한 번 누르거나 끌어다 놓아 캔버스에 붙인다.
 * 새 소재 포맷 없이 기존 카탈로그·삽입 명령·즐겨찾기 저장 경로를 그대로 쓴다.
 *
 * - 붙이기: 칩 하나 = 호스트 삽입 명령 한 번 = 되돌리기 한 단계. 위치는 선택한 컷/요소 중앙, 없으면 보이는 화면 중앙.
 * - 끌어다 놓기: 기존 캔버스 드롭 계약(json-asset / json-insert / object-insert)을 그대로 쓴다.
 * - 키보드: 화살표 이동, Enter/Space 붙이기, Alt+화살표 순서, 편집 중 Delete/Backspace 빼기, Esc 편집 끝(`studio-charm-keyboard.ts`).
 *   바 전체와 팝오버는 단축키 경계(`data-studio-shortcut-boundary`)라서 칩이 처리하지 않는 키가 캔버스 편집 명령으로 새지 않는다.
 * - 편집: 편집 모드에서 칩을 고른 뒤 앞으로·뒤로·빼기. 끌기는 캔버스 놓기 전용이라 순서 변경에 쓰지 않는다.
 * - 상태: 불러오는 중 · 빈 바(스타터 팩 제안) · 원본 없음 · 저장소 연결 실패(메모리 전용) · 잠금 · 오류와 다시 시도.
 */

import { Check, Ellipsis, Keyboard, MoveLeft, MoveRight, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { STUDIO_CHARM_BAR_MAX_CHARMS, splitStudioCharmId, type StudioCharmId } from "./studio-charm-model";
import { bi, biFill, lockNoticeText } from "./studio-charm-copy";
import { writeStudioCharmDragPayload } from "./studio-charm-drag";
import { activateStudioCharm } from "./studio-charm-insert";
import { resolveStudioCharmKeyIntent, STUDIO_CHARM_SHORTCUTS, type StudioCharmShortcutId } from "./studio-charm-keyboard";
import { StudioCharmBarEmpty, StudioCharmBarNotices } from "./StudioCharmBarStatus";
import { StudioCharmChip } from "./StudioCharmChip";
import { StudioCharmPicker } from "./StudioCharmPicker";
import { StudioCharmPopover } from "./StudioCharmPopover";
import { useStudioCharmCatalog } from "./useStudioCharmCatalog";
import { useStudioCharmLibrary, type StudioCharmHostLibrary } from "./useStudioCharmLibrary";
import { useStudioCharmPopover } from "./useStudioCharmPopover";

import "./studio-charm-bar.css";

import type { DragEvent, KeyboardEvent } from "react";
import type { StudioCatalogPreferencesRepository } from "../catalog/studio-catalog-preferences";
import type { StudioCharmDescriptor, StudioCharmCatalogData, StudioCharmLibraryAsset } from "./studio-charm-descriptor";
import type { StudioCharmDragCanvas } from "./studio-charm-drag";
import type { StudioCharmLock } from "./studio-charm-host-bridge";
import type { StudioCharmActivationContext, StudioCharmHostCommands } from "./studio-charm-insert";
import type { StudioCharmBarStore } from "./studio-charm-bar-store";

export interface StudioCharmBarProps {
  readonly store: StudioCharmBarStore;
  readonly commands: StudioCharmHostCommands;
  /** 누르는 순간의 선택·보이는 화면·스냅 설정을 읽는다. 렌더 중에는 부르지 않는다. */
  readonly readContext: () => StudioCharmActivationContext;
  /** 3D 끌어다 놓기 계획에 쓰는 문서 크기. */
  readonly canvas: StudioCharmDragCanvas;
  /**
   * 호스트가 들고 있는 내 소재 목록과 읽기 상태. 호스트는 "내 에셋" 메뉴를 열어야 목록을 읽으므로,
   * 아직 읽지 않았다면 참 바가 필요한 때(내 소재 참이 고정돼 있거나 선택기가 열렸을 때) 읽기 전용으로 직접 읽는다.
   */
  readonly hostLibrary: StudioCharmHostLibrary;
  /** 자산 즐겨찾기 ID(`raster:…`·`local:…`). 선택기의 "즐겨찾기" 분류에 쓴다. */
  readonly assetFavoriteIds: readonly string[];
  readonly lock: StudioCharmLock | null;
  /** 시험용 주입점. */
  readonly loadCatalogData?: () => Promise<StudioCharmCatalogData>;
  readonly loadLibrary?: () => Promise<readonly StudioCharmLibraryAsset[]>;
  readonly acquireCatalogPreferences?: () => Promise<StudioCatalogPreferencesRepository>;
}

function shortcutAction(id: StudioCharmShortcutId): string {
  switch (id) {
    case "move": return bi("칩 사이 이동", "Move between charms");
    case "edge": return bi("처음·마지막 칩", "First / last charm");
    case "stamp": return bi("캔버스에 붙이기", "Stamp onto the canvas");
    case "reorder": return bi("순서 바꾸기", "Reorder");
    case "remove": return bi("순서 편집 중 참 바에서 빼기", "Remove from the bar (while editing order)");
    case "exit": return bi("순서 편집 끝내기", "Finish editing order");
  }
}

const TOOL_BUTTON = cn(
  "grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
  "pointer-coarse:size-11 max-lg:size-11 disabled:cursor-not-allowed disabled:opacity-40",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  "motion-reduce:transition-none",
);

export function StudioCharmBar({
  store,
  commands,
  readContext,
  canvas,
  hostLibrary,
  assetFavoriteIds,
  lock,
  loadCatalogData,
  loadLibrary,
  acquireCatalogPreferences,
}: StudioCharmBarProps) {
  useBilingualI18nRevision();
  const helpId = useId();
  const menuId = useId();
  const pickerId = useId();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const menu = useStudioCharmPopover(288);
  const picker = useStudioCharmPopover(360);
  const charms = snapshot.state.charms;
  const pinnedLibrary = useMemo(
    () => charms.some((id) => splitStudioCharmId(id).kind === "library"),
    [charms],
  );
  const library = useStudioCharmLibrary({
    host: hostLibrary,
    needed: pinnedLibrary || picker.plan !== null,
    loadLibrary,
  });
  const { catalog, status: catalogStatus, retry: retryCatalog } = useStudioCharmCatalog({
    library: library.library,
    libraryReady: library.ready,
    loadData: loadCatalogData,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<StudioCharmId | null>(null);
  // 같은 문구를 연달아 알려도(같은 참을 두 번 붙일 때) 스크린리더가 다시 읽도록 매번 새 노드로 갈아 끼운다.
  const [announcement, setAnnouncement] = useState<{ readonly text: string; readonly sequence: number }>({
    text: "",
    sequence: 0,
  });
  const [starterNoticeDismissed, setStarterNoticeDismissed] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const chipElements = useRef(new Map<StudioCharmId, HTMLButtonElement>());
  const focusRequest = useRef<StudioCharmId | null>(null);

  const currentLockText = lockNoticeText(lock);
  const entries = useMemo(
    () => charms.map((id) => ({ id, resolution: catalog.resolve(id) })),
    [charms, catalog],
  );
  // 키보드로 닿을 수 있는 칩의 위치. 자리표시(불러오는 중)는 버튼이 아니라서 건너뛴다.
  const reachablePositions = useMemo(
    () => entries.flatMap((entry, position) => (entry.resolution.status === "pending" ? [] : [position])),
    [entries],
  );
  const stopIndex = useMemo(() => {
    const start = Math.min(Math.max(activeIndex, 0), Math.max(charms.length - 1, 0));
    const found = entries.findIndex((entry, index) => index >= start && entry.resolution.status !== "pending");
    return found >= 0 ? found : entries.findIndex((entry) => entry.resolution.status !== "pending");
  }, [activeIndex, charms.length, entries]);

  // 순서를 바꾸거나 칩을 뺀 뒤 DOM 이 다시 배치돼도 포커스를 잃지 않게 한다.
  useEffect(() => {
    const id = focusRequest.current;
    if (!id) return;
    focusRequest.current = null;
    chipElements.current.get(id)?.focus();
  });

  const registerElement = useCallback((id: StudioCharmId, element: HTMLButtonElement | null) => {
    if (element) chipElements.current.set(id, element);
    else chipElements.current.delete(id);
  }, []);

  const announce = useCallback((message: string) => {
    setAnnouncement((current) => ({ text: message, sequence: current.sequence + 1 }));
  }, []);

  const descriptorOf = useCallback((id: StudioCharmId): StudioCharmDescriptor | null => {
    const resolution = catalog.resolve(id);
    return resolution.status === "ready" ? resolution.descriptor : null;
  }, [catalog]);

  const stamp = useCallback(async (descriptor: StudioCharmDescriptor) => {
    if (currentLockText) {
      announce(currentLockText);
      return;
    }
    try {
      // 문맥은 눌린 순간에 읽는다: 비동기 삽입 동안 선택이나 스크롤이 바뀌어도 누른 곳 기준이다.
      const result = await activateStudioCharm(descriptor, readContext(), commands);
      if (result.status === "inserted") announce(biFill("붙였어요: {label}", "Stamped: {label}", { label: descriptor.label }));
      else if (result.status === "opened") {
        announce(biFill("3D 도구에서 열었어요: {label}", "Opened in the 3D tool: {label}", { label: descriptor.label }));
      }
      else if (result.status === "rejected") {
        announce(bi("붙이지 못했어요. 편집 잠금이나 저장 중인지 확인해 주세요.", "Could not stamp it. Check for an edit lock or a save in progress."));
      } else announce(result.message);
    } catch {
      announce(bi("붙이지 못했어요. 잠시 뒤 다시 시도해 주세요.", "Could not stamp it. Please try again in a moment."));
    }
  }, [announce, commands, currentLockText, readContext]);

  const unpin = useCallback((id: StudioCharmId) => {
    const index = charms.indexOf(id);
    // 포커스를 넘길 이웃: 뒤쪽 → 앞쪽 순으로 가장 가까운, 키보드로 닿을 수 있는(자리표시가 아닌) 칩.
    const later = reachablePositions.find((position) => position > index);
    const earlier = [...reachablePositions].reverse().find((position) => position < index);
    const neighborPosition = later ?? earlier;
    const neighbor = neighborPosition === undefined ? null : charms[neighborPosition] ?? null;
    const label = descriptorOf(id)?.label ?? bi("사용할 수 없는 참", "Unavailable charm");
    store.dispatch({ type: "unpin", id });
    setEditTarget((current) => (current === id ? null : current));
    focusRequest.current = neighbor;
    announce(biFill("참 바에서 뺐어요: {label}", "Removed from the charm bar: {label}", { label }));
  }, [announce, charms, descriptorOf, reachablePositions, store]);

  const reorder = useCallback((id: StudioCharmId, delta: -1 | 1) => {
    const before = charms.indexOf(id);
    // 눈에 보이지 않는 자리표시 이웃은 건너뛰고, 보이는 이웃과 자리를 바꾼다.
    let target = before + delta;
    while (target >= 0 && target < charms.length && entries[target]?.resolution.status === "pending") target += delta;
    if (before < 0 || target < 0 || target >= charms.length) return;
    const label = descriptorOf(id)?.label ?? bi("사용할 수 없는 참", "Unavailable charm");
    store.dispatch({ type: "move", id, toIndex: target });
    focusRequest.current = id;
    announce(biFill(
      "{position}번째로 옮겼어요: {label} ({total}개 중)",
      "Moved to position {position} of {total}: {label}",
      { position: target + 1, total: charms.length, label },
    ));
  }, [announce, charms, descriptorOf, entries, store]);

  const onPress = useCallback((id: StudioCharmId) => {
    const resolution = catalog.resolve(id);
    if (editing) {
      setEditTarget(id);
      const label = resolution.status === "ready" ? resolution.descriptor.label : bi("사용할 수 없는 참", "Unavailable charm");
      announce(biFill(
        "편집할 참으로 골랐어요: {label} ({position}/{total})",
        "Selected for editing: {label} ({position} of {total})",
        { label, position: charms.indexOf(id) + 1, total: charms.length },
      ));
      return;
    }
    if (resolution.status === "missing") {
      announce(bi(
        "원본 소재를 찾을 수 없어요. ⋯ 메뉴의 순서·삭제 편집에서 참 바에서 뺄 수 있어요.",
        "The original item can no longer be found. Remove it from the bar with Edit order and removal in the ⋯ menu.",
      ));
      return;
    }
    if (resolution.status === "ready") void stamp(resolution.descriptor);
  }, [announce, catalog, charms, editing, stamp]);

  // 순서 편집을 시작·끝낼 때 눌렀던 버튼(메뉴 항목·끝내기 버튼)이 사라지므로 포커스를 Tab 정지점인 칩으로 옮긴다.
  const { close: closeMenu } = menu;
  const startEditing = useCallback(() => {
    setEditing(true);
    setEditTarget(null);
    closeMenu();
    focusRequest.current = entries[stopIndex]?.id ?? null;
    announce(bi("순서 편집을 시작했어요. 칩을 골라 앞으로·뒤로·빼기를 쓰세요.", "Editing order. Select a charm, then move it earlier, later or remove it."));
  }, [announce, closeMenu, entries, stopIndex]);
  const stopEditing = useCallback(() => {
    setEditing(false);
    setEditTarget(null);
    focusRequest.current = entries[stopIndex]?.id ?? null;
    announce(bi("순서 편집을 끝냈어요.", "Finished editing the order."));
  }, [announce, entries, stopIndex]);

  // 칩에서 누른 Esc 는 칩 쪽이 처리한다. 편집 도구 버튼에서 눌러도 같은 방식으로 순서 편집을 끝낼 수 있다.
  const onEditToolKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    stopEditing();
  }, [stopEditing]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, id: StudioCharmId, index: number) => {
    const intent = resolveStudioCharmKeyIntent(
      {
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        isComposing: event.nativeEvent.isComposing,
      },
      { index: Math.max(0, reachablePositions.indexOf(index)), count: reachablePositions.length, editing },
    );
    if (intent.type === "ignore") return;
    event.preventDefault();
    if (intent.type === "focus") {
      const position = reachablePositions[intent.index];
      const targetId = position === undefined ? undefined : charms[position];
      const target = targetId ? chipElements.current.get(targetId) : undefined;
      if (target && position !== undefined) {
        target.focus();
        setActiveIndex(position);
      }
    } else if (intent.type === "activate") onPress(id);
    else if (intent.type === "reorder") reorder(id, intent.delta);
    else if (intent.type === "unpin") unpin(id);
    else if (intent.type === "remove-hint") {
      announce(bi(
        "참은 Delete 로 지워지지 않아요. 빼려면 ⋯ 메뉴의 순서·삭제 편집을 쓰세요.",
        "Delete does not remove a charm here. Use Edit order and removal in the ⋯ menu.",
      ));
    } else if (intent.type === "exit-edit") stopEditing();
  }, [announce, charms, editing, onPress, reachablePositions, reorder, stopEditing, unpin]);

  const onDragStart = useCallback((event: DragEvent<HTMLButtonElement>, descriptor: StudioCharmDescriptor) => {
    if (currentLockText || editing || !writeStudioCharmDragPayload(event.dataTransfer, descriptor, canvas)) {
      event.preventDefault();
      if (!currentLockText && !editing) {
        announce(bi("이 참은 끌어다 놓기를 지원하지 않아요. 눌러서 붙이세요.", "This charm cannot be dragged. Press it to stamp instead."));
      }
    }
  }, [announce, canvas, currentLockText, editing]);

  const togglePicked = useCallback((descriptor: StudioCharmDescriptor) => {
    const wasPinned = charms.includes(descriptor.id);
    const result = store.dispatch({ type: "toggle", id: descriptor.id });
    if (!result.ok) {
      announce(biFill("참 바가 가득 찼어요(최대 {max}개).", "The charm bar is full (up to {max}).", { max: STUDIO_CHARM_BAR_MAX_CHARMS }));
      return;
    }
    announce(wasPinned
      ? biFill("참 바에서 뺐어요: {label}", "Removed from the charm bar: {label}", { label: descriptor.label })
      : biFill("참 바에 고정했어요: {label}", "Pinned to the charm bar: {label}", { label: descriptor.label }));
  }, [announce, charms, store]);

  const editIndex = editTarget ? charms.indexOf(editTarget) : -1;
  const editLabel = editTarget ? descriptorOf(editTarget)?.label ?? bi("사용할 수 없는 참", "Unavailable charm") : null;
  const persistence = snapshot.persistence === "saved" ? "sqlite-opfs" : snapshot.persistence;

  return (
    <section
      aria-label={bi("참 바", "Charm bar")}
      aria-busy={!snapshot.hydrated || undefined}
      data-studio-charm-bar=""
      data-studio-shortcut-boundary="true"
      data-studio-ui-preferences-authority={persistence}
      className="studio-charm-bar min-h-0 min-w-0 shrink-0 bg-panel p-1 text-fg"
    >
      <p id={helpId} className="sr-only">
        {bi(
          "Enter 또는 Space 로 캔버스에 붙이고, 방향키로 이동하고, Alt 와 방향키로 순서를 바꿔요. 참을 빼려면 ⋯ 메뉴의 순서·삭제 편집에서 Delete 나 Backspace 를 누르세요. 끌어서 원하는 위치에 놓을 수도 있어요.",
          "Press Enter or Space to stamp, arrow keys to move, Alt with arrows to reorder. To remove a charm, use Edit order and removal in the ⋯ menu, then press Delete or Backspace. You can also drag a charm to where you want it.",
        )}
      </p>

      {!snapshot.hydrated ? (
        <div role="status" aria-live="polite" className="studio-charm-bar__chips" data-studio-charm-loading="">
          <span className="sr-only">{bi("참 바를 여는 중…", "Opening the charm bar…")}</span>
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} aria-hidden="true" className="skeleton size-10 shrink-0 rounded-lg pointer-coarse:size-11 max-lg:size-11" />
          ))}
        </div>
      ) : charms.length === 0 ? (
        <StudioCharmBarEmpty
          onAddStarter={() => {
            store.dispatch({ type: "apply-starter" });
            announce(bi("기본 참을 담았어요.", "Added the starter charms."));
          }}
        />
      ) : (
        <div
          role="toolbar"
          aria-label={bi("고정한 참", "Pinned charms")}
          aria-describedby={helpId}
          data-studio-charm-count={charms.length}
          className="studio-charm-bar__chips"
        >
          {entries.map((entry, index) => (
            <StudioCharmChip
              key={entry.id}
              id={entry.id}
              resolution={entry.resolution}
              index={index}
              tabStop={index === stopIndex}
              editing={editing}
              selectedForEdit={editTarget === entry.id}
              lockText={currentLockText}
              registerElement={registerElement}
              onPress={onPress}
              onKeyDown={onKeyDown}
              onFocusChip={setActiveIndex}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}

      {editing ? (
        <div role="group" aria-label={bi("선택한 참 편집", "Edit the selected charm")} className="studio-charm-bar__tools" data-studio-charm-edit="">
          <p className="sr-only" role="status">
            {editLabel ? biFill("선택됨: {label}", "Selected: {label}", { label: editLabel }) : bi("편집할 참을 고르세요", "Select a charm to edit")}
          </p>
          <button type="button" className={TOOL_BUTTON} disabled={editIndex <= 0} aria-label={bi("앞으로 옮기기", "Move earlier")} title={bi("앞으로 옮기기", "Move earlier")} onKeyDown={onEditToolKeyDown} onClick={() => editTarget && reorder(editTarget, -1)}>
            <MoveLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" className={TOOL_BUTTON} disabled={editIndex < 0 || editIndex >= charms.length - 1} aria-label={bi("뒤로 옮기기", "Move later")} title={bi("뒤로 옮기기", "Move later")} onKeyDown={onEditToolKeyDown} onClick={() => editTarget && reorder(editTarget, 1)}>
            <MoveRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className={TOOL_BUTTON} disabled={!editTarget} aria-label={bi("참 바에서 빼기", "Remove from the bar")} title={bi("참 바에서 빼기", "Remove from the bar")} onKeyDown={onEditToolKeyDown} onClick={() => editTarget && unpin(editTarget)}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
          <button type="button" className={cn(TOOL_BUTTON, "border-accent/60 bg-accent-soft text-fg")} aria-label={bi("순서 편집 끝내기", "Finish editing")} title={bi("순서 편집 끝내기", "Finish editing")} onKeyDown={onEditToolKeyDown} onClick={stopEditing}>
            <Check size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="studio-charm-bar__tools" role="group" aria-label={bi("참 바 도구", "Charm bar tools")}>
          <div ref={picker.triggerRef} className="contents">
            <button
              type="button"
              className={TOOL_BUTTON}
              aria-haspopup="dialog"
              aria-expanded={picker.plan !== null}
              aria-controls={picker.plan ? pickerId : undefined}
              aria-label={bi("참 고르기", "Choose charms")}
              title={bi("참 고르기 — 소재를 검색해 참 바에 고정", "Choose charms — search and pin items")}
              onClick={() => { menu.close(); picker.toggle(); }}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <div ref={menu.triggerRef} className="contents">
            <button
              type="button"
              className={TOOL_BUTTON}
              aria-haspopup="dialog"
              aria-expanded={menu.plan !== null}
              aria-controls={menu.plan ? menuId : undefined}
              aria-label={bi("참 바 메뉴", "Charm bar menu")}
              title={bi("참 바 메뉴", "Charm bar menu")}
              onClick={() => { picker.close(); menu.toggle(); }}
            >
              <Ellipsis size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <StudioCharmBarNotices
        starterCount={!starterNoticeDismissed && snapshot.starterAutoAdded ? charms.length : 0}
        onDismissStarter={() => setStarterNoticeDismissed(true)}
        lock={lock}
        persistence={snapshot.persistence}
        onRetryPersistence={() => { void store.retry(); }}
        libraryFailed={pinnedLibrary && library.status === "error"}
        onRetryLibrary={library.retry}
      />

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-studio-charm-announcement="">
        <span key={announcement.sequence}>{announcement.text}</span>
      </p>

      <StudioCharmPopover plan={picker.plan} label={bi("참 고르기", "Choose charms")} id={pickerId}>
        <StudioCharmPicker
          catalog={catalog}
          catalogStatus={catalogStatus}
          onRetryCatalog={retryCatalog}
          libraryStatus={library.status}
          onRetryLibrary={library.retry}
          pinned={charms}
          capacity={STUDIO_CHARM_BAR_MAX_CHARMS}
          assetFavoriteIds={assetFavoriteIds}
          onToggle={togglePicked}
          onClose={picker.close}
          acquireCatalogPreferences={acquireCatalogPreferences}
        />
      </StudioCharmPopover>

      <StudioCharmPopover plan={menu.plan} label={bi("참 바 메뉴", "Charm bar menu")} id={menuId}>
        <div className="grid gap-1 p-2">
          <button
            type="button"
            disabled={charms.length === 0}
            onClick={startEditing}
            className={cn("flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm text-fg hover:bg-raised disabled:opacity-40", STUDIO_FOCUS_RING)}
          >
            <Pencil size={14} aria-hidden="true" />
            {bi("순서·삭제 편집", "Edit order and removal")}
          </button>
          <button
            type="button"
            onClick={() => {
              store.dispatch({ type: "apply-starter" });
              menu.close();
              announce(bi("기본 참을 담았어요.", "Added the starter charms."));
            }}
            className={cn("flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm text-fg hover:bg-raised", STUDIO_FOCUS_RING)}
          >
            <Sparkles size={14} aria-hidden="true" />
            {bi("기본 참 다시 담기", "Add the starter charms again")}
          </button>
          <button
            type="button"
            aria-expanded={showShortcuts}
            onClick={() => setShowShortcuts((value) => !value)}
            className={cn("flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm text-fg hover:bg-raised", STUDIO_FOCUS_RING)}
          >
            <Keyboard size={14} aria-hidden="true" />
            {bi("단축키 안내", "Keyboard shortcuts")}
          </button>
          {showShortcuts ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-card p-2 text-xs" data-studio-charm-shortcuts="">
              {STUDIO_CHARM_SHORTCUTS.map((shortcut) => (
                <div key={shortcut.id} className="contents">
                  <dt><kbd className="rounded border border-line bg-raised px-1 py-0.5 font-mono text-[0.68rem] text-fg">{shortcut.keys}</kbd></dt>
                  <dd className="text-fg-2">{shortcutAction(shortcut.id)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <button
            type="button"
            onClick={() => { menu.close(); store.dispatch({ type: "set-open", open: false }); }}
            className={cn("flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm text-fg hover:bg-raised", STUDIO_FOCUS_RING)}
          >
            <X size={14} aria-hidden="true" />
            {bi("참 바 닫기", "Close the charm bar")}
          </button>
        </div>
      </StudioCharmPopover>
    </section>
  );
}
