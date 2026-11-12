import { Boxes, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES,
  buildBg3dObjectClusterPrimitives,
  type Bg3dObjectClusterArchetypeId,
  type Bg3dObjectClusterArrangement,
  type Bg3dObjectClutterDensity,
  type Bg3dObjectSurfaceTheme,
} from "./studio-bg3d-background-object-cluster";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";

export interface StudioBg3dBackgroundObjectClusterSectionProps {
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
  /** 원클릭 웹툰 배경 선택기 연동용 배치 콜백 (`addGeneratedParts` 경유). */
  readonly onBuildGenerated?: (
    buildParts: (existingCount: number) => BgPrimitive[],
    labelKo: string,
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
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [archetype, setArchetype] =
    useState<Bg3dObjectClusterArchetypeId>("alley-wall-utility-clutter");
  const [moduleCount, setModuleCount] = useState<number>(2);
  const [clutterDensity, setClutterDensity] = useState<Bg3dObjectClutterDensity>("lived-in");
  const [arrangement, setArrangement] = useState<Bg3dObjectClusterArrangement>("linear-wall");
  const [surfaceTheme, setSurfaceTheme] = useState<Bg3dObjectSurfaceTheme>("daylight-neutral");

  const activeMeta = useMemo(
    () =>
      STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.find((item) => item.id === archetype) ??
      STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES[0]!,
    [archetype],
  );

  const previewBuild = useMemo(
    () =>
      buildBg3dObjectClusterPrimitives({
        archetype,
        moduleCount,
        clutterDensity,
        arrangement,
        surfaceTheme,
      }),
    [archetype, arrangement, clutterDensity, moduleCount, surfaceTheme],
  );

  const handlePlaceCluster = () => {
    if (disabled) return;
    if (onBuildGenerated) {
      onBuildGenerated((existingCount) => {
        const anchorX = existingCount > 0 ? (existingCount % 5) * 2.4 : 0;
        const built = buildBg3dObjectClusterPrimitives({
          archetype,
          moduleCount,
          clutterDensity,
          arrangement,
          surfaceTheme,
          anchorOffsetXZ: [anchorX, 0],
        });
        return [...built.primitives];
      }, previewBuild.labelKo);
      onStatusChange?.(previewBuild.summaryKo);
      return;
    }
    if (onInsertScenePrimitives) {
      const inserted = onInsertScenePrimitives(previewBuild.primitives, previewBuild.summaryKo);
      onStatusChange?.(
        inserted
          ? `${previewBuild.summaryKo} · 장면 배치 완료`
          : "배경 오브젝트를 배치하지 못했어요. 편집 가능한 3D 장면을 먼저 열어 주세요.",
      );
    }
  };

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
          data-testid="bg3d-object-cluster-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          className="shrink-0 rounded-md border border-line bg-panel px-2 py-0.5 text-[0.6rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-45"
        >
          {expanded ? "소품 클러스터 접기" : "배경 소품 8종 열기"}
        </button>
      </div>

      {expanded ? (
        <div
          data-testid="bg3d-object-cluster-body"
          className="mt-2 space-y-2 border-t border-line/60 pt-2"
        >
          <p className="text-[0.62rem] leading-relaxed text-fg-3">
            {activeMeta.descriptionKo}
          </p>

          <div
            className="grid grid-cols-2 gap-1"
            role="group"
            aria-label="배경 오브젝트 클러스터 종류"
          >
            {STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.map((item) => {
              const selected = item.id === archetype;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  data-testid={`bg3d-object-cluster-arch-${item.id}`}
                  onClick={() => setArchetype(item.id)}
                  className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
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
                className="mt-1 w-full accent-accent"
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
                className="mt-1 w-full rounded border border-line bg-card px-1.5 py-0.5 text-[0.6rem] text-fg"
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
            <div className="flex flex-wrap gap-1" role="group" aria-label="소품 디테일 밀도">
              {DENSITY_LABELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={clutterDensity === item.id}
                  data-testid={`bg3d-object-cluster-density-${item.id}`}
                  onClick={() => setClutterDensity(item.id)}
                  className={`rounded border px-2 py-0.5 text-[0.58rem] font-semibold ${
                    clutterDensity === item.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-3"
                  }`}
                >
                  {item.labelKo}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1" role="group" aria-label="배치 대형">
              {ARRANGEMENT_LABELS.map((arr) => (
                <button
                  key={arr.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={arrangement === arr.id}
                  data-testid={`bg3d-object-cluster-arr-${arr.id}`}
                  onClick={() => setArrangement(arr.id)}
                  className={`rounded border px-2 py-0.5 text-[0.58rem] font-semibold ${
                    arrangement === arr.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-3"
                  }`}
                >
                  {arr.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
            <span
              data-testid="bg3d-object-cluster-readout"
              className="font-mono text-[0.58rem] text-fg-2"
            >
              {previewBuild.partCount}파츠 · 외곽 {previewBuild.footprintMeters[0]}×{previewBuild.footprintMeters[2]}m · 밀도 지수 {previewBuild.monotonyReliefScore}점
            </span>
            <button
              type="button"
              disabled={disabled || (!onBuildGenerated && !onInsertScenePrimitives)}
              data-testid="bg3d-object-cluster-insert-btn"
              onClick={handlePlaceCluster}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[0.62rem] font-bold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-45"
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
