import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { EngineeringMapSection } from "./EngineeringMapSection";
import type { EngineeringMap, EngineeringMapId, EngineeringMapRow } from "./engineering-map-types";

import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale("EngineeringAtlasPage", ko, en);
export interface AtlasMapResult {
  readonly map: EngineeringMap;
  readonly rows: readonly EngineeringMapRow[];
}

/** 지도 제목·목적을 먼저 고르고, 선택한 지도만 구성한다. 원문 지도 컴포넌트와 다른 소비자는 변경하지 않는다. */
export function EngineeringAtlasMaps({ maps, selected, printing, visibleAtlas, onSelect }: {
  readonly maps: readonly AtlasMapResult[];
  readonly selected: EngineeringMapId | "";
  readonly printing: boolean;
  readonly visibleAtlas: ReadonlyMap<string, string>;
  readonly onSelect: (id: EngineeringMapId | "") => void;
}) {
  useBilingualI18nRevision();
  const current = maps.find(({ map }) => map.id === selected);
  const restoreChoice = useRef<EngineeringMapId | "">("");
  const list = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  useEffect(() => {
    if (!moveFocus.current || printing) return;
    moveFocus.current = false;
    if (current) {
      const heading = detail.current?.querySelector<HTMLHeadingElement>("h3");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        detail.current?.querySelector<HTMLElement>("section")?.scrollIntoView({ block: "start", behavior: "instant" });
      }
    }
    else list.current?.querySelectorAll<HTMLButtonElement>("button[data-atlas-map-choice]").forEach((button) => {
      if (button.dataset.atlasMapChoice === restoreChoice.current) {
        button.focus({ preventScroll: true });
        button.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
    });
  }, [current, printing, selected]);

  if (printing) return <>{maps.map(({ map, rows }) => <EngineeringMapSection key={map.id} map={map} rows={rows} visibleAtlas={visibleAtlas} />)}</>;
  if (current) return (
    <div ref={detail} className="grid gap-4">
      <button type="button" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-bold text-fg focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() => { restoreChoice.current = current.map.id; moveFocus.current = true; onSelect(""); }}>
        <ArrowLeft size={16} aria-hidden="true" />{bi("지도 목록으로", "Back to maps")}
      </button>
      <EngineeringMapSection map={current.map} rows={current.rows} visibleAtlas={visibleAtlas} />
    </div>
  );
  return (
    <div ref={list} className="grid gap-4 md:grid-cols-2">
      {maps.map(({ map, rows }) => (
        <article key={map.id} className="grid content-start gap-3 rounded-3xl border border-line/70 bg-panel/55 p-5">
          <p className="text-xs font-bold text-accent-2">{bi("지도 항목", "Map rows")} · {rows.length === map.rows.length ? rows.length : `${rows.length}/${map.rows.length}`}</p>
          <h3 className="break-keep text-lg font-black text-fg">{bi(map.title.ko, map.title.en)}</h3>
          <p className="text-sm leading-7 text-fg-2">{bi(map.intro.ko, map.intro.en)}</p>
          <button type="button" data-atlas-map-choice={map.id} aria-label={`${bi(map.title.ko, map.title.en)} · ${bi("지도 열기", "Open map")}`}
            className="inline-flex min-h-11 scroll-mt-32 scroll-mb-24 items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 text-sm font-bold text-fg focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => { moveFocus.current = true; onSelect(map.id); }}>
            {bi("지도 열기", "Open map")}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </article>
      ))}
    </div>
  );
}
