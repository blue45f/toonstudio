/**
 * StudioArtCraftSuiteWorkbench.tsx
 *
 * 나무위키 `ArtCraft Crafting Apps` 문서의 3절(3. ArtCraft Launcher, 3.1 PhotoCraft ~ 3.13 GridCraft) 및
 * 4.1절(미공개 소프트웨어 AniCraft) 총 15종 소프트웨어를 REA로 전수 역공학하여
 * 툰스튜디오(ToonStudio)에 내재화한 통합 프로덕션 워크벤치.
 */

import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  ARTCRAFT_SUITE_CATALOG,
  resolveArtCraftAppById,
  srgbTripletToHex,
  type ArtCraftAppId,
  type ArtCraftCategory,
} from "./artcraft-launcher-security-catalog";
import { StudioArtCraftAppLiveInspector } from "./StudioArtCraftSuiteInspectorPanels";

type CategoryFilter = "all" | ArtCraftCategory;

const CATEGORY_TABS: readonly {
  readonly id: CategoryFilter;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "all", labelKo: "전체 15종 스위트", labelEn: "All 15 Apps" },
  { id: "launcher", labelKo: "[3] 런처 · 보안 허브", labelEn: "[3] Launcher & Security" },
  { id: "creative-media", labelKo: "[3.1~3.6] 래스터·벡터·영상·모션", labelEn: "[3.1~3.6] Creative Media" },
  { id: "publishing-design", labelKo: "[3.5/3.7/3.8] PDF·출판·UI", labelEn: "[3.5/3.7/3.8] Publishing & UI" },
  { id: "office-audio-cad", labelKo: "[3.9~3.13] 대본·사운드·CAD·정산", labelEn: "[3.9~3.13] Office, DAW & CAD" },
  { id: "unreleased-animation", labelKo: "[4.1] 미공개 AniCraft (2D 애니)", labelEn: "[4.1] Unreleased AniCraft" },
];

export function StudioArtCraftSuiteWorkbench({
  projectId,
  initialAppId = "photocraft",
}: {
  readonly projectId?: string;
  readonly initialAppId?: ArtCraftAppId;
}) {
  const bt = useBilingual("StudioArtCraftSuiteWorkbench");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedAppId, setSelectedAppId] = useState<ArtCraftAppId>(initialAppId);
  const [legacyLookupQuery, setLegacyLookupQuery] = useState<string>("printcraft");

  const filteredApps = useMemo(() => {
    if (categoryFilter === "all") return ARTCRAFT_SUITE_CATALOG;
    return ARTCRAFT_SUITE_CATALOG.filter((app) => app.category === categoryFilter);
  }, [categoryFilter]);

  const activeApp = useMemo(() => {
    const found = ARTCRAFT_SUITE_CATALOG.find((app) => app.id === selectedAppId);
    return found ?? ARTCRAFT_SUITE_CATALOG[0]!;
  }, [selectedAppId]);

  const resolvedLegacyApp = useMemo(
    () => resolveArtCraftAppById(legacyLookupQuery),
    [legacyLookupQuery],
  );

  return (
    <section
      aria-label={bt(
        "ArtCraft Crafting Apps 15종 역공학 내재화 통합 워크벤치",
        "ArtCraft Crafting Apps 15-Suite Internalized Workbench",
      )}
      data-testid="studio-artcraft-suite-workbench"
      className="rounded-2xl border border-line bg-card/90 p-5 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
              REA Clean-Room Suite · 15 Apps
            </span>
            {projectId ? (
              <span className="text-xs font-mono text-fg-3">Project: {projectId}</span>
            ) : null}
          </div>
          <h2 className="mt-1 text-base font-bold text-fg">
            {bt(
              "ArtCraft Crafting Apps 15종 전수 내재화 스튜디오 (3. Launcher · 3.1 PhotoCraft ~ 3.13 GridCraft · 4.1 AniCraft)",
              "ArtCraft Crafting Apps 15-Suite Internalized Studio (Launcher, PhotoCraft..GridCraft & AniCraft)",
            )}
          </h2>
          <p className="text-xs text-fg-2">
            {bt(
              "24개 REA 정적 AST·Mach-O·Rust 심볼·런타임 증거(2026-10-26)를 기반으로 웹툰·단행본·영상·사운드·배경 CAD·원고료 정산·2D 셀 애니메이션 엔진을 단일 워크벤치에 통합했습니다.",
              "Integrates all 15 ArtCraft apps into ToonStudio backed by 24 REA static AST, Mach-O, Rust binary, and runtime evidence records.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-fg-2">
            <span>{bt("구 식별자 호환 조회", "Former ID Lookup")}:</span>
            <input
              type="text"
              aria-label={bt("구 식별자 호환 조회", "Former ID Lookup")}
              value={legacyLookupQuery}
              onChange={(e) => setLegacyLookupQuery(e.target.value)}
              className="w-28 rounded border border-line bg-panel px-2 py-0.5 font-mono text-xs text-fg"
            />
          </label>
          <span className="rounded bg-panel px-2 py-0.5 font-mono text-[11px] text-fg">
            → {resolvedLegacyApp ? `${resolvedLegacyApp.name} (${resolvedLegacyApp.id})` : "none"}
          </span>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={bt("ArtCraft 앱군 필터", "ArtCraft Suite Filter")}>
        {CATEGORY_TABS.map((tab) => {
          const active = categoryFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategoryFilter(tab.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-accent text-canvas"
                  : "border border-line bg-panel text-fg-2 hover:text-fg",
              )}
            >
              {bt(tab.labelKo, tab.labelEn)}
            </button>
          );
        })}
      </div>

      {/* 15종 앱 선택 그리드 */}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {filteredApps.map((app) => {
          const isSelected = app.id === activeApp.id;
          const badgeHex = srgbTripletToHex(app.color);
          return (
            <button
              key={app.id}
              type="button"
              data-testid={`artcraft-app-card-${app.id}`}
              onClick={() => setSelectedAppId(app.id)}
              className={cn(
                "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
                isSelected
                  ? "border-accent bg-accent-soft ring-1 ring-accent"
                  : "border-line bg-panel hover:bg-raised",
              )}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: badgeHex }}
                  />
                  [{app.namuSection}] {app.name}
                </span>
                <span className="font-mono text-[10px] text-fg-3">{app.nativeExtension}</span>
              </div>
              <div className="mt-1 text-[11px] text-fg-2 line-clamp-1">
                vs {app.industryCounterpart}
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 앱 실시간 엔진 인스펙터 */}
      <StudioArtCraftAppLiveInspector app={activeApp} />
    </section>
  );
}
