import { Boxes, Search, Sparkles, X } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES,
  buildBg3dObjectClusterPrimitives,
  computeBg3dClusterNonOverlappingOffsetXZ,
  createBg3dClusterUniqueInstanceKey,
  resolveBg3dClusterPlacementOrdinal,
  searchStudioBg3dObjectClusterArchetypes,
  type Bg3dObjectClusterArchetypeId,
  type Bg3dObjectClusterArrangement,
  type Bg3dObjectClutterDensity,
  type Bg3dObjectSurfaceTheme,
} from "./studio-bg3d-background-object-cluster";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";

export interface StudioBg3dClusterGeneratedMeta {
  readonly labelKo: string;
  readonly summaryKo: string;
}

export interface StudioBg3dBackgroundObjectClusterSectionProps {
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
  /** 원클릭 웹툰 배경 선택기 연동용 배치 콜백 (`addGeneratedParts` 경유). */
  readonly onBuildGenerated?: (
    buildParts: (existingCount: number) => {
      readonly primitives: BgPrimitive[];
      readonly anchorX: number;
    },
    meta: StudioBg3dClusterGeneratedMeta,
  ) => void;
  /** 공간 모델러·워크벤치 연동용 직접 배치 콜백. */
  readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
  readonly onStatusChange?: (summaryKo: string) => void;
}

const DENSITY_LABELS: readonly { readonly id: Bg3dObjectClutterDensity; readonly labelKo: string }[] = [
  { id: "essential", labelKo: "핵심 구조" },
  { id: "detailed", labelKo: "표준 소품" },
  { id: "lived-in", labelKo: "고밀도 생활감" },
];

const ARRANGEMENT_LABELS: readonly {
  readonly id: Bg3dObjectClusterArrangement;
  readonly labelKo: string;
}[] = [
  { id: "linear-wall", labelKo: "벽면 일렬" },
  { id: "l-corner", labelKo: "코너 ㄱ자" },
  { id: "staggered-street", labelKo: "거리 교차" },
];

const THEME_LABELS: readonly { readonly id: Bg3dObjectSurfaceTheme; readonly labelKo: string }[] = [
  { id: "daylight-neutral", labelKo: "주간 뉴트럴" },
  { id: "weathered-urban", labelKo: "도심 생활감" },
  { id: "night-glow", labelKo: "야간 발광" },
  { id: "warm-wood", labelKo: "원목·전통" },
];

function nextRovingIndex(key: string, currentIndex: number, total: number): number | null {
  if (total <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (currentIndex + 1) % total;
    case "ArrowLeft":
    case "ArrowUp":
      return (currentIndex - 1 + total) % total;
    case "Home":
      return 0;
    case "End":
      return total - 1;
    default:
      return null;
  }
}

/**
 * 단조로운 방·복도·거리 배경에 고밀도 배경 오브젝트 클러스터(8종)를 조합해 즉시 배치하는 전용 섹션.
 * 말투 가드(`studio-bg3d-webtoon-copy.guard.test.tsx`) 호환을 위해 모든 설명 문단은 해요체로 작성한다.
 */
export function StudioBg3dBackgroundObjectClusterSection({
  disabled = false,
  defaultExpanded = false,
  onBuildGenerated,
  onInsertScenePrimitives,
  onStatusChange,
}: StudioBg3dBackgroundObjectClusterSectionProps) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [archetype, setArchetype] =
    useState<Bg3dObjectClusterArchetypeId>("alley-wall-utility-clutter");
  const [moduleCount, setModuleCount] = useState<number>(2);
  const [clutterDensity, setClutterDensity] = useState<Bg3dObjectClutterDensity>("lived-in");
  const [arrangement, setArrangement] = useState<Bg3dObjectClusterArrangement>("linear-wall");
  const [surfaceTheme, setSurfaceTheme] = useState<Bg3dObjectSurfaceTheme>("daylight-neutral");

  const usedOrdinalsRef = useRef<Set<number>>(new Set());
  const workbenchOrdinalRef = useRef<number>(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const archRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const densityRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const arrangementRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const filteredArchetypes = useMemo(
    () => searchStudioBg3dObjectClusterArchetypes(searchQuery),
    [searchQuery],
  );

  const effectiveArchetype: Bg3dObjectClusterArchetypeId = useMemo(() => {
    if (filteredArchetypes.some((item) => item.id === archetype)) return archetype;
    return filteredArchetypes[0]?.id ?? archetype;
  }, [archetype, filteredArchetypes]);

  const activeMeta = useMemo(
    () =>
      STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.find((item) => item.id === effectiveArchetype) ??
      STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES[0]!,
    [effectiveArchetype],
  );

  const previewBuild = useMemo(
    () =>
      buildBg3dObjectClusterPrimitives({
        archetype: effectiveArchetype,
        moduleCount,
        clutterDensity,
        arrangement,
        surfaceTheme,
      }),
    [arrangement, clutterDensity, effectiveArchetype, moduleCount, surfaceTheme],
  );

  const handleArchetypeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const nextIdx = nextRovingIndex(event.key, index, filteredArchetypes.length);
    if (nextIdx === null) return;
    event.preventDefault();
    const target = filteredArchetypes[nextIdx];
    if (!target) return;
    setArchetype(target.id);
    archRadioRefs.current[nextIdx]?.focus();
  };

  const handleDensityKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const nextIdx = nextRovingIndex(event.key, index, DENSITY_LABELS.length);
    if (nextIdx === null) return;
    event.preventDefault();
    const target = DENSITY_LABELS[nextIdx];
    if (!target) return;
    setClutterDensity(target.id);
    densityRadioRefs.current[nextIdx]?.focus();
  };

  const handleArrangementKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const nextIdx = nextRovingIndex(event.key, index, ARRANGEMENT_LABELS.length);
    if (nextIdx === null) return;
    event.preventDefault();
    const target = ARRANGEMENT_LABELS[nextIdx];
    if (!target) return;
    setArrangement(target.id);
    arrangementRadioRefs.current[nextIdx]?.focus();
  };

  const handlePlaceCluster = () => {
    if (disabled || filteredArchetypes.length === 0) return;

    if (onBuildGenerated) {
      const instanceKey = createBg3dClusterUniqueInstanceKey("p");
      onBuildGenerated(
        (existingCount) => {
          const placementOrd = resolveBg3dClusterPlacementOrdinal(
            existingCount,
            previewBuild.partCount,
            usedOrdinalsRef.current,
          );
          const offsetXZ = computeBg3dClusterNonOverlappingOffsetXZ(
            placementOrd,
            previewBuild.footprintMeters,
          );
          const built = buildBg3dObjectClusterPrimitives({
            archetype: effectiveArchetype,
            moduleCount,
            clutterDensity,
            arrangement,
            surfaceTheme,
            anchorOffsetXZ: offsetXZ,
            instanceKey,
          });
          return { primitives: [...built.primitives], anchorX: offsetXZ[0] };
        },
        { labelKo: previewBuild.labelKo, summaryKo: previewBuild.summaryKo },
      );
      onStatusChange?.(previewBuild.summaryKo);
      return;
    }

    if (onInsertScenePrimitives) {
      const ord = workbenchOrdinalRef.current;
      const offsetXZ = computeBg3dClusterNonOverlappingOffsetXZ(
        ord,
        previewBuild.footprintMeters,
      );
      const built = buildBg3dObjectClusterPrimitives({
        archetype: effectiveArchetype,
        moduleCount,
        clutterDensity,
        arrangement,
        surfaceTheme,
        anchorOffsetXZ: offsetXZ,
        instanceKey: createBg3dClusterUniqueInstanceKey("w"),
      });
      const inserted = onInsertScenePrimitives(built.primitives, built.summaryKo);
      if (inserted) {
        workbenchOrdinalRef.current = ord + 1;
      }
      onStatusChange?.(
        inserted
          ? `${built.summaryKo} · 장면 배치 완료`
          : "배경 오브젝트를 배치하지 못했어요. 편집 가능한 3D 장면을 먼저 열어 주세요.",
      );
    }
  };

  const canPlace =
    !disabled &&
    filteredArchetypes.length > 0 &&
    Boolean(onBuildGenerated || onInsertScenePrimitives);

  return (
    <div
      data-testid="bg3d-object-cluster-section"
      className="mt-2.5 rounded-xl border border-line bg-card/70 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[0.68rem] font-bold text-fg">
          <Boxes className="size-3.5 text-accent" aria-hidden />
          <span>고밀도 배경 오브젝트·생활감 소품 클러스터 ({STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.length}종)</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={expanded}
          aria-controls={expanded ? bodyId : undefined}
          data-testid="bg3d-object-cluster-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          className="shrink-0 rounded-md border border-line bg-panel px-2 py-0.5 text-[0.6rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
        >
          {expanded ? "소품 클러스터 접기" : "배경 소품 8종 열기"}
        </button>
      </div>

      {expanded ? (
        <div
          id={bodyId}
          data-testid="bg3d-object-cluster-body"
          className="mt-2 space-y-2 border-t border-line/60 pt-2"
        >
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-3"
                aria-hidden
              />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                disabled={disabled}
                aria-label="배경 오브젝트 클러스터 검색"
                data-testid="bg3d-object-cluster-search-input"
                placeholder="골목, 실외기, 교실, 장독대, 포션 검색..."
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && searchQuery.length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSearchQuery("");
                  }
                }}
                className="w-full rounded-md border border-line bg-panel py-1 pl-6 pr-2 text-[0.6rem] text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-45"
              />
            </div>
            {searchQuery.trim().length > 0 ? (
              <button
                type="button"
                disabled={disabled}
                data-testid="bg3d-object-cluster-search-clear"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-panel px-1.5 py-1 text-[0.58rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                <X className="size-2.5" aria-hidden />
                <span>검색 지우기</span>
              </button>
            ) : null}
            <span
              aria-live="polite"
              data-testid="bg3d-object-cluster-match-count"
              className="shrink-0 font-mono text-[0.56rem] text-fg-3"
            >
              {filteredArchetypes.length}/{STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.length}종
            </span>
          </div>

          {filteredArchetypes.length === 0 ? (
            <p
              data-testid="bg3d-object-cluster-empty"
              className="rounded-lg border border-line/70 bg-panel px-2.5 py-2 text-[0.6rem] leading-relaxed text-fg-3"
            >
              일치하는 배경 오브젝트를 찾지 못했어요. 다른 검색어를 다시 입력하거나 검색 지우기 버튼을 눌러 주세요.
            </p>
          ) : (
            <>
              <p className="text-[0.62rem] leading-relaxed text-fg-3">
                {activeMeta.descriptionKo}
              </p>

              <div
                className="grid grid-cols-2 gap-1"
                role="radiogroup"
                aria-label="배경 오브젝트 클러스터 종류"
              >
                {filteredArchetypes.map((item, index) => {
                  const selected = item.id === effectiveArchetype;
                  return (
                    <button
                      key={item.id}
                      ref={(el) => {
                        archRadioRefs.current[index] = el;
                      }}
                      type="button"
                      role="radio"
                      disabled={disabled}
                      aria-checked={selected}
                      tabIndex={selected ? 0 : -1}
                      data-testid={`bg3d-object-cluster-arch-${item.id}`}
                      onClick={() => setArchetype(item.id)}
                      onKeyDown={(event) => handleArchetypeKeyDown(event, index)}
                      className={`rounded-lg border px-2 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                        selected
                          ? "border-accent bg-accent/15 font-bold text-accent"
                          : "border-line bg-panel text-fg-2 hover:bg-raised"
                      }`}
                    >
                      <span className="block truncate text-[0.62rem]">{item.labelKo}</span>
                      <span className="block text-[0.55rem] font-normal text-fg-3">{item.genreTagKo}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <label className="rounded border border-line bg-panel px-2 py-1.5 text-[0.6rem] font-semibold text-fg-2">
              <span className="flex items-center justify-between">
                <span>연속 모듈 수</span>
                <span className="font-mono text-accent">{moduleCount}모듈</span>
              </span>
              <input
                type="range"
                min={1}
                max={4}
                step={1}
                disabled={disabled}
                aria-label="배경 오브젝트 연속 모듈 수"
                data-testid="bg3d-object-cluster-module-slider"
                value={moduleCount}
                onChange={(event) => setModuleCount(Number(event.target.value))}
                className="mt-1 w-full accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              />
            </label>

            <label className="rounded border border-line bg-panel px-2 py-1.5 text-[0.6rem] font-semibold text-fg-2">
              <span>표면·조명 테마</span>
              <select
                aria-label="배경 오브젝트 배색 테마"
                data-testid="bg3d-object-cluster-theme-select"
                disabled={disabled}
                value={surfaceTheme}
                onChange={(event) => setSurfaceTheme(event.target.value as Bg3dObjectSurfaceTheme)}
                className="mt-1 w-full rounded border border-line bg-card px-1.5 py-0.5 text-[0.6rem] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                {THEME_LABELS.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.labelKo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="소품 디테일 밀도">
              {DENSITY_LABELS.map((item, index) => {
                const selected = clutterDensity === item.id;
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      densityRadioRefs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    disabled={disabled}
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    data-testid={`bg3d-object-cluster-density-${item.id}`}
                    onClick={() => setClutterDensity(item.id)}
                    onKeyDown={(event) => handleDensityKeyDown(event, index)}
                    className={`rounded border px-2 py-0.5 text-[0.58rem] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-3"
                    }`}
                  >
                    {item.labelKo}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="배치 대형">
              {ARRANGEMENT_LABELS.map((arr, index) => {
                const selected = arrangement === arr.id;
                return (
                  <button
                    key={arr.id}
                    ref={(el) => {
                      arrangementRadioRefs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    disabled={disabled}
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    data-testid={`bg3d-object-cluster-arr-${arr.id}`}
                    onClick={() => setArrangement(arr.id)}
                    onKeyDown={(event) => handleArrangementKeyDown(event, index)}
                    className={`rounded border px-2 py-0.5 text-[0.58rem] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-3"
                    }`}
                  >
                    {arr.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
            <span
              role="status"
              aria-live="polite"
              data-testid="bg3d-object-cluster-readout"
              className="font-mono text-[0.58rem] text-fg-2"
            >
              {previewBuild.partCount}파츠 · 외곽 {previewBuild.footprintMeters[0]}×{previewBuild.footprintMeters[2]}m · 밀도 지수 {previewBuild.monotonyReliefScore}점
            </span>
            <button
              type="button"
              disabled={!canPlace}
              data-testid="bg3d-object-cluster-insert-btn"
              onClick={handlePlaceCluster}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[0.62rem] font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
            >
              <Sparkles className="size-3" aria-hidden />
              <span>현재 3D 배경에 오브젝트 배치</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
