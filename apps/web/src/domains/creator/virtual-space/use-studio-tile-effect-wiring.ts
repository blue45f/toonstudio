import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  STUDIO_TILE_EFFECT_TILE_SIZE,
  type StudioTileEffectDefinition,
  type StudioTileEffectTrigger,
} from "./studio-virtual-space-tile-effects";
import { readStudioTileEffects, writeStudioTileEffects } from "./studio-virtual-space-tile-effects-storage";
import { createSilentZone, type StudioSilentZone } from "./studio-virtual-space-silent-zone";

/**
 * 타일 이펙트 배치·실행 배선. 저작은 꾸미기 패널의 타일 이펙트 편집기,
 * 저장은 스코프별 로컬 저장소가 맡는다. 스코프가 바뀌면 저장된 배치를 다시 읽는다.
 * zone(silent)은 silent 구역 파생으로, portal·youtube·weblink 트리거는
 * 캔버스 실행기가 여기로 올려 보낸다. bgm은 기존 BGM 시스템과 충돌해 다루지 않는다.
 */
export function useStudioTileEffectWiring(input: {
  readonly decorationScope: string;
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
  readonly owner: string | null;
  readonly notify: (message: string, severity: "warn") => void;
}) {
  const { decorationScope, engineBridge, owner, notify } = input;
  const bt = useBilingual("useStudioTileEffectWiring");
  const view = JSON.stringify([owner, decorationScope]);
  const version = useRef({ request: 0 }).current;
  const [stored, setStored] = useState<{ view: string; effects: readonly StudioTileEffectDefinition[] } | null>(null);
  const tileEffects = useMemo(() => stored?.view === view ? stored.effects : [], [stored, view]);
  const loadTileEffects = useCallback((effects: readonly StudioTileEffectDefinition[]) => {
    ++version.request;
    setStored({ view, effects });
  }, [view, version]);
  const reloadTileEffects = useCallback(async () => {
    const request = ++version.request;
    try {
      const effects = await readStudioTileEffects(decorationScope);
      if (request === version.request) setStored({ view, effects });
    } catch {
      if (request === version.request) notify(bt("저장한 타일을 불러오지 못했습니다.", "Could not load saved tiles."), "warn");
    }
  }, [decorationScope, view, bt, notify, version]);
  useEffect(() => { void reloadTileEffects(); return () => { ++version.request; }; }, [reloadTileEffects, version]);
  const cloneBinding = (search: URLSearchParams, hash: string) => ({
    scope: decorationScope, effects: tileEffects, onLoad: loadTileEffects,
    expanded: search.get("clone") === "1", incoming: hash.startsWith("#clone=") ? hash : "",
  });
  const changeTileEffects = useCallback(async (next: readonly StudioTileEffectDefinition[]) => {
    loadTileEffects(next);
    const request = version.request;
    if (!await writeStudioTileEffects(next, decorationScope) && request === version.request)
      notify(bt("타일 변경을 이 기기에 저장하지 못했습니다.", "Could not save the tile changes on this device."), "warn");
  }, [decorationScope, loadTileEffects, notify, bt, version]);
  // 타일 편집기로 배치한 silent 구역도 같은 음소 파이프라인에 태운다.
  const tileSilentZones = useMemo<readonly StudioSilentZone[]>(() => tileEffects.flatMap((effect) => {
    if (effect.kind !== "zone" || effect.zoneTag !== "silent") return [];
    const zone = createSilentZone({
      id: `tile:${effect.id}`,
      name: effect.name,
      rect: {
        x: effect.tileX * STUDIO_TILE_EFFECT_TILE_SIZE.width,
        y: effect.tileY * STUDIO_TILE_EFFECT_TILE_SIZE.height,
        width: effect.width * STUDIO_TILE_EFFECT_TILE_SIZE.width,
        height: effect.height * STUDIO_TILE_EFFECT_TILE_SIZE.height,
      },
    });
    return zone ? [zone] : [];
  }), [tileEffects]);
  const [tileMedia, setTileMedia] = useState<{ readonly title: string; readonly embedUrl: string } | null>(null);
  const handleTileEffectTrigger = useCallback((trigger: StudioTileEffectTrigger) => {
    if (trigger.kind === "portal") {
      if (trigger.tileX === undefined || trigger.tileY === undefined) return;
      const { width, height } = STUDIO_TILE_EFFECT_TILE_SIZE;
      engineBridge.requestTeleport({ x: trigger.tileX * width + width / 2, y: trigger.tileY * height + height / 2 });
      return;
    }
    if (trigger.kind === "youtube") {
      if (trigger.embedUrl) setTileMedia({ title: trigger.effect.name, embedUrl: trigger.embedUrl });
      return;
    }
    if (trigger.kind === "weblink") {
      window.open(trigger.url, "_blank", "noopener,noreferrer");
    }
  }, [engineBridge, setTileMedia]);

  return { tileEffects, cloneBinding, reloadTileEffects, changeTileEffects, tileSilentZones, tileMedia, setTileMedia, handleTileEffectTrigger };
}
