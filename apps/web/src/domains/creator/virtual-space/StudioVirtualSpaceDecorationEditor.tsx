import { useEffect, useId, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { removeStudioVirtualDecoration, STUDIO_VIRTUAL_DECOR_FRAME, type StudioVirtualDecorationState, type StudioVirtualDecorPlacement, type StudioVirtualDecorType } from "./studio-virtual-space-customization";
import { addStudioVirtualDecorationSafely, editStudioVirtualDecoration, studioVirtualDecorBounds, studioVirtualDecorationStateForWorld, type StudioDecorationLayoutResult } from "./studio-virtual-space-decoration-layout";
import {
  alignStudioVirtualDecorationGroupToGrid,
  duplicateStudioVirtualDecorationGroup,
  moveStudioVirtualDecorationGroup,
  removeStudioVirtualDecorationGroup,
  rotateStudioVirtualDecorationGroup,
  scaleStudioVirtualDecorationGroup,
} from "./studio-virtual-space-decoration-tools";
import type { StudioTileEffectDefinition, StudioTileEffectKind } from "./studio-virtual-space-tile-effects";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioWorldCollisionRects, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldLayoutPointer } from "./studio-world-layout-edit";
import { DEFAULT_STUDIO_VIRTUAL_ART_STYLE, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioExperienceFrameGeometry } from "./studio-virtual-space-experience-art";
import { StudioVirtualExperienceArtPreview } from "./StudioVirtualExperienceArtPreview";
import { publishStudioSpaceSelectedObjectTarget } from "./studio-virtual-space-camera-recovery";

const LABELS: Readonly<Record<StudioVirtualDecorType, readonly [string, string]>> = {
  tree: ["나무", "Tree"], "flower-bed": ["화단", "Flower bed"], bench: ["벤치", "Bench"], lamp: ["조명", "Lamp"],
  banner: ["배너", "Banner"], "market-stall": ["마켓 부스", "Market stall"], fountain: ["분수", "Fountain"],
  portal: ["포털", "Portal"], rug: ["러그", "Rug"], sign: ["안내판", "Sign"], parasol: ["파라솔", "Parasol"], pet: ["고양이", "Cat"],
  "drawing-desk": ["드로잉 데스크", "Drawing desk"], bookshelf: ["책장", "Bookshelf"], "review-board": ["원고 리뷰 보드", "Review board"], sofa: ["소파", "Sofa"],
  custom: ["내 가구", "My furniture"],
};

const TILE_EFFECT_ICONS: Readonly<Record<StudioTileEffectKind, string>> = {
  spawn: "🟢", portal: "🌀", blocked: "🚧", zone: "🔒", spotlight: "🔦", youtube: "▶️", weblink: "🔗", app: "🧩", bgm: "🎵",
};

/** 빌드 모드에서 고를 수 있는 장식 종류 (내 가구는 별도 창에서). */
const BUILDABLE_DECOR_TYPES = (Object.keys(LABELS) as StudioVirtualDecorType[]).filter((type) => type !== "custom");

export type StudioDecorationManipMode = "select" | "move" | "rotate" | "scale";

const MANIP_MODE_ITEMS: readonly {
  readonly id: StudioDecorationManipMode;
  readonly keyHint: string;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "select", keyHint: "V", ko: "선택", en: "Select" },
  { id: "move", keyHint: "G", ko: "이동", en: "Move" },
  { id: "rotate", keyHint: "R", ko: "회전", en: "Rotate" },
  { id: "scale", keyHint: "S", ko: "크기", en: "Scale" },
];

export function StudioVirtualSpaceDecorationEditor({ world, decorations, selfPoint, onChange, artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE, tileEffects = [], tileSize = { width: 16, height: 16 } }: {
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly world: StudioVirtualSpaceWorldManifest;
  readonly decorations: StudioVirtualDecorationState;
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly onChange: (result: StudioDecorationLayoutResult) => void;
  /** 타일 이펙트 오버레이 (읽기 전용 표시). */
  readonly tileEffects?: readonly StudioTileEffectDefinition[];
  readonly tileSize?: { readonly width: number; readonly height: number };
}) {
  const bt = useBilingual("StudioVirtualSpaceDecorationEditor"), id = useId();
  const [selection, setSelection] = useState<{ worldId: string; ids: readonly string[] } | null>(null);
  const [manipMode, setManipMode] = useState<StudioDecorationManipMode>("move");
  const [buildType, setBuildType] = useState<StudioVirtualDecorType | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fieldsetRef = useRef<HTMLFieldSetElement | null>(null);
  const suppressNextMapClickRef = useRef(false);
  const suppressObjectClickRef = useRef(false);
  const [drag, setDrag] = useState<{ id: string; pointerId: number; x: number; y: number; originX: number; originY: number; start: StudioVirtualSpacePoint; clientStart: StudioVirtualSpacePoint; requireButtons: boolean } | null>(null);
  const state = studioVirtualDecorationStateForWorld(decorations, world);
  const selectedIds = selection?.worldId === world.id
    ? selection.ids.filter((itemId) => state.placements.some((item) => item.id === itemId))
    : [];
  const selectedItems = selectedIds
    .map((itemId) => state.placements.find((item) => item.id === itemId))
    .filter((item): item is StudioVirtualDecorPlacement => item !== undefined);
  const selectedIdSet = new Set(selectedIds);
  const selected = selectedItems[0];
  const choose = (itemId: string) => setSelection({ worldId: world.id, ids: [itemId] });
  const toggleChoose = (itemId: string) => {
    setSelection((current) => {
      const currentIds = current?.worldId === world.id
        ? current.ids.filter((existingId) => state.placements.some((item) => item.id === existingId))
        : [];
      if (currentIds.includes(itemId)) {
        const nextIds = currentIds.filter((existingId) => existingId !== itemId);
        return nextIds.length > 0 ? { worldId: world.id, ids: nextIds } : null;
      }
      return { worldId: world.id, ids: [...currentIds, itemId] };
    });
  };
  const clearSelectionAndBuild = () => {
    setSelection(null);
    setBuildType(null);
    setDrag(null);
    setManipMode("select");
  };
  useEffect(() => {
    if (!selected) {
      publishStudioSpaceSelectedObjectTarget(null);
      return undefined;
    }
    publishStudioSpaceSelectedObjectTarget({
      id: selected.id,
      labelKo: LABELS[selected.type][0],
      labelEn: LABELS[selected.type][1],
      x: selected.x,
      y: selected.y,
    });
    return () => {
      publishStudioSpaceSelectedObjectTarget(null);
    };
  }, [selected]);
  useEffect(() => {
    if (!selected && !buildType && !drag) return undefined;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      clearSelectionAndBuild();
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [buildType, drag, selected]);
  const move = (dx: number, dy: number) => {
    if (selectedIds.length === 1 && selected) {
      onChange(editStudioVirtualDecoration(state, selected.id, { x: selected.x + dx, y: selected.y + dy }, world, selfPoint));
    } else if (selectedIds.length > 1) {
      onChange(moveStudioVirtualDecorationGroup(state, selectedIds, dx, dy, world, selfPoint));
    }
  };
  const rotateBy = (deltaDeg: 90 | 270) => {
    if (!selected) return;
    if (selectedIds.length === 1) {
      onChange(editStudioVirtualDecoration(state, selected.id, { rotation: ((selected.rotation + deltaDeg) % 360) as 0 | 90 | 180 | 270 }, world, selfPoint));
    } else {
      onChange(rotateStudioVirtualDecorationGroup(state, selectedIds, deltaDeg, world, selfPoint));
    }
  };
  const adjustScale = (delta: number) => {
    if (!selected) return;
    if (selectedIds.length === 1) {
      const nextScale = Math.min(1.35, Math.max(0.65, Math.round((selected.scale + delta) * 100) / 100));
      onChange(editStudioVirtualDecoration(state, selected.id, { scale: nextScale }, world, selfPoint));
    } else {
      onChange(scaleStudioVirtualDecorationGroup(state, selectedIds, delta, world, selfPoint));
    }
  };
  const worldPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return studioWorldLayoutPointer({ x: clientX, y: clientY }, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, world);
  };
  const cancelDrag = (target?: EventTarget | null) => {
    suppressNextMapClickRef.current = true;
    suppressObjectClickRef.current = true;
    if (drag && target instanceof Element && target.hasPointerCapture?.(drag.pointerId)) {
      try { target.releasePointerCapture(drag.pointerId); } catch { /* 이미 해제됨 */ }
    }
    setDrag(null);
  };
  const beginDrag = (item: StudioVirtualDecorPlacement, event: React.PointerEvent<SVGRectElement>) => {
    suppressNextMapClickRef.current = false;
    suppressObjectClickRef.current = false;
    event.stopPropagation();
    if (event.button !== 0 || event.isPrimary === false || drag || event.shiftKey || buildType || manipMode !== "move") return;
    const start = worldPoint(event.clientX, event.clientY);
    if (!start) return;
    if (!selectedIdSet.has(item.id)) {
      choose(item.id);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: item.id,
      pointerId: event.pointerId,
      x: item.x,
      y: item.y,
      originX: item.x,
      originY: item.y,
      start, clientStart: { x: event.clientX, y: event.clientY },
      requireButtons: event.buttons > 0,
    });
  };
  const dragPosition = (event: React.PointerEvent<SVGRectElement>) => {
    if (!drag) return null;
    const point = worldPoint(event.clientX, event.clientY);
    if (!point) return null;
    if (Math.hypot(event.clientX - drag.clientStart.x, event.clientY - drag.clientStart.y) < 3) {
      return { x: drag.originX, y: drag.originY };
    }
    const snap = (origin: number, delta: number) => delta === 0 ? origin : Math.round((origin + delta) / 16) * 16;
    return { x: snap(drag.originX, point.x - drag.start.x), y: snap(drag.originY, point.y - drag.start.y) };
  };
  const trackDrag = (event: React.PointerEvent<SVGRectElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.requireButtons && (event.buttons & 1) === 0) {
      cancelDrag(event.currentTarget);
      return;
    }
    const position = dragPosition(event);
    if (!position || (drag.x === position.x && drag.y === position.y)) return;
    event.stopPropagation();
    setDrag({ ...drag, ...position });
  };
  const endDrag = (item: StudioVirtualDecorPlacement, event: React.PointerEvent<SVGRectElement>) => {
    if (!drag || drag.id !== item.id || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const position = dragPosition(event);
    if (!position) { cancelDrag(event.currentTarget); return; }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = position.x - drag.originX;
    const dy = position.y - drag.originY;
    setDrag(null);
    if (dx === 0 && dy === 0) return;
    suppressObjectClickRef.current = true;
    if (selectedIds.length > 1 && selectedIdSet.has(item.id)) {
      onChange(moveStudioVirtualDecorationGroup(state, selectedIds, dx, dy, world, selfPoint));
    } else {
      onChange(editStudioVirtualDecoration(state, item.id, position, world, selfPoint));
    }
  };
  useEffect(() => {
    if (!drag) return undefined;
    const activePointerId = drag.pointerId;
    const abortActiveDrag = () => {
      suppressNextMapClickRef.current = true;
      setDrag(null);
    };
    const abortOnVisibility = () => {
      if (document.visibilityState === "hidden") abortActiveDrag();
    };
    const abortOnPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === activePointerId) abortActiveDrag();
    };
    window.addEventListener("blur", abortActiveDrag);
    window.addEventListener("pointercancel", abortOnPointerCancel);
    document.addEventListener("visibilitychange", abortOnVisibility);
    return () => {
      window.removeEventListener("blur", abortActiveDrag);
      window.removeEventListener("pointercancel", abortOnPointerCancel);
      document.removeEventListener("visibilitychange", abortOnVisibility);
    };
  }, [drag]);
  useEffect(() => {
    const el = fieldsetRef.current;
    if (!el) return undefined;
    const onFieldsetKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("select, input, textarea, [contenteditable=true]")) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      const key = event.code.startsWith("Key") ? event.code.slice(3) : event.key.toUpperCase();
      const mode = MANIP_MODE_ITEMS.find((item) => item.keyHint === key);
      if (!mode) return;
      event.preventDefault();
      event.stopPropagation();
      setBuildType(null);
      setDrag(null);
      setManipMode(mode.id);
    };
    el.addEventListener("keydown", onFieldsetKeyDown);
    return () => el.removeEventListener("keydown", onFieldsetKeyDown);
  }, []);
  const activeModeMeta = MANIP_MODE_ITEMS.find((item) => item.id === manipMode) ?? MANIP_MODE_ITEMS[0];
  return <fieldset ref={fieldsetRef} className="studio-decoration-editor" data-decor-manip-mode={manipMode}>
    <legend>{bt("가구 배치 편집", "Edit furniture layout")}</legend>
    <p id={`${id}-help`}>{bt("이동 모드에서 가구를 끌거나 빈 바닥을 누르세요. 방향키로 16px, Shift와 함께 1px씩 옮깁니다.", "In Move mode, drag furniture or tap the floor. Use the arrow keys to move 16 pixels, or hold Shift for 1 pixel.")}</p>
    <div className="studio-decoration-editor__modes flex flex-wrap items-center justify-between gap-2" role="toolbar" aria-label={bt("오브젝트 조작 모드", "Object manipulation mode")}>
      <div className="flex flex-wrap gap-1">
        {MANIP_MODE_ITEMS.map((modeItem) => (
          <button
            key={modeItem.id}
            type="button"
            aria-pressed={manipMode === modeItem.id && !buildType}
            data-manip-mode-btn={modeItem.id}
            onClick={() => {
              setDrag(null);
              setBuildType(null);
              setManipMode(modeItem.id);
            }}
          >
            {bt(`${modeItem.ko} (${modeItem.keyHint})`, `${modeItem.en} (${modeItem.keyHint})`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs" role="status" data-decor-mode-status="true">
        <span>
          {buildType
            ? bt(`현재 모드: 배치 (${LABELS[buildType][0]})`, `Mode: Place (${LABELS[buildType][1]})`)
            : selectedItems.length > 1
              ? bt(
                  `현재 모드: ${activeModeMeta.ko} · ${selectedItems.length}개 선택됨 (Shift+클릭 추가 · Esc 해제)`,
                  `Mode: ${activeModeMeta.en} · ${selectedItems.length} selected (Shift+click · Esc to clear)`,
                )
              : selected
                ? bt(
                    `현재 모드: ${activeModeMeta.ko} · 선택됨: ${LABELS[selected.type][0]} (Shift+클릭 다중 선택 · Esc 해제)`,
                    `Mode: ${activeModeMeta.en} · Selected: ${LABELS[selected.type][1]} (Shift+click multi-select · Esc to clear)`,
                  )
                : bt(`현재 모드: ${activeModeMeta.ko} · 오브젝트를 선택하세요 (Shift+클릭 다중 선택)`, `Mode: ${activeModeMeta.en} · Select objects (Shift+click for multi-select)`)}
        </span>
        {selected || buildType ? (
          <button type="button" data-decor-clear-selection="true" onClick={clearSelectionAndBuild}>
            {bt("선택 해제 (Esc)", "Deselect (Esc)")}
          </button>
        ) : null}
      </div>
    </div>
    <div className="studio-decoration-editor__build" role="group" aria-label={bt("카탈로그에서 골라 배치", "Pick from catalog to place")}>
      <label htmlFor={`${id}-build-type`}>{bt("배치할 가구", "Furniture to place")}</label>
      <select id={`${id}-build-type`} value={buildType ?? ""}
        onChange={(event) => setBuildType(event.target.value ? event.target.value as StudioVirtualDecorType : null)}>
        <option value="">{bt("카탈로그에서 고르기", "Pick from catalog")}</option>
        {BUILDABLE_DECOR_TYPES.map((type) => <option key={type} value={type}>{bt(LABELS[type][0], LABELS[type][1])}</option>)}
      </select>
      {buildType && <>
        <p>{bt(`배치 중: ${LABELS[buildType][0]} — 지도의 빈 바닥을 눌러 계속 배치하세요.`, `Placing: ${LABELS[buildType][1]} — tap an empty floor to keep placing.`)}</p>
        <button type="button" onClick={() => setBuildType(null)}>{bt("배치 완료", "Done placing")}</button>
      </>}
    </div>
    <svg ref={svgRef} className="studio-decoration-editor__map" data-decor-selected-id={selected?.id ?? ""} data-decor-selected-ids={selectedIds.join(",")} viewBox={`0 0 ${world.width} ${world.height}`} role="group" tabIndex={0}
      aria-label={bt("가구 배치 지도", "Furniture layout map")} aria-describedby={`${id}-help`}
      onPointerDownCapture={() => {
        suppressNextMapClickRef.current = false;
      }}
      onClick={(event) => {
        if (suppressNextMapClickRef.current) {
          suppressNextMapClickRef.current = false;
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const point = studioWorldLayoutPointer({ x: event.clientX, y: event.clientY }, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, world);
        if (!point) return;
        const snapped = { x: Math.round(point.x / 16) * 16, y: Math.round(point.y / 16) * 16 };
        if (buildType) {
          onChange(addStudioVirtualDecorationSafely(state, buildType, snapped, world));
          return;
        }
        if (manipMode === "select") {
          setSelection(null);
          return;
        }
        if (!selected || manipMode !== "move") return;
        if (selectedIds.length > 1) {
          onChange(moveStudioVirtualDecorationGroup(state, selectedIds, snapped.x - selected.x, snapped.y - selected.y, world, selfPoint));
        } else {
          onChange(editStudioVirtualDecoration(state, selected.id, snapped, world, selfPoint));
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); clearSelectionAndBuild(); return; }
        if (!selected || buildType || event.altKey || event.metaKey || event.ctrlKey || event.nativeEvent.isComposing) return;
        if (manipMode === "rotate" && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
          event.preventDefault(); event.stopPropagation();
          rotateBy(event.key === "ArrowRight" ? 90 : 270);
          return;
        }
        if (manipMode === "scale" && (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault(); event.stopPropagation();
          adjustScale(event.key === "-" || event.key === "ArrowDown" ? -0.1 : 0.1);
          return;
        }
        if (manipMode !== "move") return;
        const movements: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const delta = movements[event.key];
        if (!delta) return;
        event.preventDefault(); event.stopPropagation(); move(delta[0] * (event.shiftKey ? 1 : 16), delta[1] * (event.shiftKey ? 1 : 16));
      }}>
      <defs><pattern id={`${id}-grid`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeOpacity=".13" /></pattern></defs>
      <rect width={world.width} height={world.height} fill="var(--vs2-panel-2, #182332)" />
      <rect width={world.width} height={world.height} fill={`url(#${id}-grid)`} />
      <g pointerEvents="none" fill="currentColor" opacity=".18">{studioWorldCollisionRects(world).map((rect, index) => <rect key={index} {...rect} />)}</g>
      <g pointerEvents="none" fill="none" stroke="#7fe0ce" strokeOpacity=".45">{world.portals.map((portal) => <circle key={portal.id} cx={portal.point.x} cy={portal.point.y} r={portal.radius} />)}</g>
      {tileEffects.length > 0 && <g pointerEvents="none">
        {tileEffects.map((effect) => {
          const x = effect.tileX * tileSize.width, y = effect.tileY * tileSize.height;
          const width = effect.width * tileSize.width, height = effect.height * tileSize.height;
          return <g key={effect.id}>
            <rect x={x} y={y} width={width} height={height} fill="#c9a0ff" fillOpacity=".14" stroke="#c9a0ff" strokeOpacity=".7" strokeDasharray="6 4" />
            <text x={x + 4} y={y + 18} fontSize="16">{TILE_EFFECT_ICONS[effect.kind]}</text>
          </g>;
        })}
      </g>}
      {state.placements.map((item, index) => {
        const frame = STUDIO_VIRTUAL_DECOR_FRAME[item.type];
        const geometry = studioExperienceFrameGeometry("furniture", artStyle, frame, 82 * item.scale, 82 * item.scale, .5, .9);
        const isItemSelected = selectedIdSet.has(item.id);
        const draggingGroup = Boolean(drag && (drag.id === item.id || (selectedIdSet.has(drag.id) && isItemSelected)));
        const shown = draggingGroup && drag
          ? { ...item, x: item.x + (drag.x - drag.originX), y: item.y + (drag.y - drag.originY) }
          : item;
        return <g key={item.id} pointerEvents="none">
        {/* 선택 영역은 rect만 소유한다. 원본 image의 큰 bbox가 버튼 중심이나 포인터 영역을 늘리지 않는다. */}
        <rect {...studioVirtualDecorBounds(item)} role="button" tabIndex={0} pointerEvents="all" aria-pressed={isItemSelected}
          data-decor-placement-id={item.id} data-decor-selected={isItemSelected ? "true" : "false"}
          aria-label={bt(`${index + 1}번 ${LABELS[item.type][0]} 선택`, `Select ${LABELS[item.type][1]} ${index + 1}`)}
          className="studio-decoration-editor__object" onClick={(event) => {
            event.stopPropagation();
            if (suppressObjectClickRef.current) {
              suppressObjectClickRef.current = false;
              return;
            }
            if (event.shiftKey) toggleChoose(item.id);
            else choose(item.id);
          }}
          onPointerDown={(event) => beginDrag(item, event)} onPointerMove={trackDrag} onPointerUp={(event) => endDrag(item, event)}
          onPointerCancel={(event) => { if (drag?.pointerId === event.pointerId) { event.stopPropagation(); cancelDrag(event.currentTarget); } }}
          onLostPointerCapture={(event) => { if (drag?.pointerId === event.pointerId) { suppressNextMapClickRef.current = true; suppressObjectClickRef.current = true; setDrag(null); } }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              if (event.shiftKey) toggleChoose(item.id);
              else choose(item.id);
            }
          }}
          rx="8" fill={isItemSelected ? "#ad89ff" : "#72b6ca"} fillOpacity=".35" stroke={isItemSelected ? "#f8e5ff" : "#83cfe2"} strokeWidth={isItemSelected ? 4 : 2} />
        <g transform={item.type === "rug"
          ? `translate(${shown.x} ${shown.y}) rotate(${item.rotation})`
          : `translate(${shown.x} ${shown.y}) scale(${item.rotation === 90 || item.rotation === 270 ? -1 : 1} 1)`} pointerEvents="none">
          <StudioVirtualExperienceArtPreview kind="furniture" artStyle={artStyle} frame={frame}
            x={-geometry.width * geometry.originX} y={-geometry.height * geometry.originY}
            width={geometry.width} height={geometry.height} preserveAspectRatio="none" />
        </g>
        <circle cx={shown.x} cy={shown.y} r="6" fill="#f8e5ff" pointerEvents="none" />
        <text x={shown.x} y={shown.y - 30} textAnchor="middle" fill="#fff" fontSize="22" pointerEvents="none">{index + 1}</text>
      </g>;
      })}
      <g pointerEvents="none"><circle cx={selfPoint.x} cy={selfPoint.y} r="12" fill="#ffce67" stroke="#152431" strokeWidth="4" /><text x={selfPoint.x} y={selfPoint.y + 30} fill="#ffdf90" fontSize="20" textAnchor="middle">{bt("나", "You")}</text></g>
    </svg>
    <label className="studio-decoration-editor__select" data-decor-selected-id={selected?.id ?? ""} data-decor-selected-ids={selectedIds.join(",")}>{bt("편집할 가구", "Furniture to edit")}
      <select value={selected?.id ?? ""} onChange={(event) => event.target.value ? choose(event.target.value) : setSelection(null)}>
        <option value="">{bt("가구를 선택하세요", "Select furniture")}</option>
        {state.placements.map((item, index) => <option value={item.id} key={item.id}>{index + 1}. {bt(...LABELS[item.type])}</option>)}
      </select>
    </label>
    {selected ? <>
      <p>
        {selectedItems.length > 1
          ? bt(
              `${selectedItems.length}개 가구 묶음 · 기준(${LABELS[selected.type][0]}) X ${selected.x} / Y ${selected.y} · ${selected.rotation}° · ${Math.round(selected.scale * 100)}%`,
              `${selectedItems.length} items selected · Anchor(${LABELS[selected.type][1]}) X ${selected.x} / Y ${selected.y} · ${selected.rotation}° · ${Math.round(selected.scale * 100)}%`,
            )
          : bt(`${LABELS[selected.type][0]} · X ${selected.x} / Y ${selected.y} · ${selected.rotation}° · ${Math.round(selected.scale * 100)}%`, `${LABELS[selected.type][1]} · X ${selected.x} / Y ${selected.y} · ${selected.rotation}° · ${Math.round(selected.scale * 100)}%`)}
      </p>
      <div className="studio-decoration-editor__controls" role="group" aria-label={bt("선택한 가구 이동", "Move selected furniture")}>
        {([[-16, 0, "왼쪽", "Left"], [0, -16, "위", "Up"], [0, 16, "아래", "Down"], [16, 0, "오른쪽", "Right"]] as const).map(([x, y, ko, en]) => <button key={en} type="button" onClick={() => move(x, y)}>{bt(`가구 ${ko}`, `Furniture ${en.toLowerCase()}`)}</button>)}
      </div>
      <div className="studio-decoration-editor__controls">
        <button type="button" onClick={() => rotateBy(90)}>{bt("가구 90도 회전", "Rotate furniture 90°")}</button>
        <button type="button" disabled={selectedItems.every((item) => item.scale <= .65)} onClick={() => adjustScale(-0.1)}>{bt("가구 작게", "Smaller furniture")}</button>
        <button type="button" disabled={selectedItems.every((item) => item.scale >= 1.35)} onClick={() => adjustScale(0.1)}>{bt("가구 크게", "Larger furniture")}</button>
        <button type="button" onClick={() => onChange(alignStudioVirtualDecorationGroupToGrid(state, selectedIds, world, selfPoint))}>{bt("격자에 맞추기", "Snap to grid")}</button>
        <button type="button" onClick={() => {
          const { result, clonedIds } = duplicateStudioVirtualDecorationGroup(state, selectedIds, world, selfPoint);
          onChange(result);
          if (result.ok && clonedIds.length > 0) {
            setSelection({ worldId: world.id, ids: clonedIds });
          }
        }}>{bt("가구 복제", "Duplicate furniture")}</button>
        <button type="button" onClick={() => {
          onChange(
            selectedIds.length === 1
              ? { ok: true, state: removeStudioVirtualDecoration(state, selected.id) }
              : removeStudioVirtualDecorationGroup(state, selectedIds),
          );
          setSelection(null);
        }}>{bt("선택 가구 삭제", "Remove selected furniture")}</button>
      </div>
    </> : null}
  </fieldset>;
}
