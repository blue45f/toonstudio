// "3D 배경" 템플릿 탭의 원클릭 웹툰 배경 선택기 — 교실·복도·거리를 사람 키 기준 실제 크기로 한 번에 만든다.
//
// 기존 씬 템플릿은 장난감 비례라 사람을 세운 구도에 맞지 않았다. 여기 항목은 룸 빌더·거리 생성기로 짠 사람 크기 스펙이다
// (studio-bg3d-webtoon-background-templates.ts). 장면 변경은 부모가 가진 "도형 묶음 추가" 경로(addGeneratedParts)에
// 맡긴다: 이 컴포넌트는 (기존 도형 수, 카메라 뷰) → 도형 묶음을 돌려주는 함수만 만들어 넘긴다. 그래서 노드 한도 검사·한 번의
// 되돌리기 단계·첫 도형 선택은 방 만들기·복합 오브젝트와 같은 곳에서 처리된다.
//
// 자동 단면(카메라 쪽 벽 숨김)은 이 선택기에서 기본으로 켜져 있다. 켜진 채로 벽을 숨기면 그 사실을 안내하고, 숨긴 조각을
// 한 번에 되살리는 버튼을 함께 보여 준다(visible:false 도형은 뷰포트 클릭도 받지 않으므로 되살릴 길이 눈에 보여야 한다).
//
// 이 파일은 지연 청크(studio-bg3d-editor-runtime-bindings.ts 의 createLazyComponent)로만 불러온다.

import { Building2, DoorOpen, GraduationCap, Sparkles } from "lucide-react";
import { useState } from "react";

import { StudioBg3dBuildNotice } from "./StudioBg3dBuildNotice";
import {
  describeStudioBg3dBuildNotice,
  STUDIO_BG3D_AUTO_CUTAWAY_LABEL,
  STUDIO_BG3D_BUILD_FAILED_NOTICE,
  STUDIO_BG3D_PICKER_CUTAWAY_HELP,
  STUDIO_BG3D_PICKER_INTRO,
  summarizeStudioBg3dHiddenWalls,
  type StudioBg3dHiddenWallSummary,
} from "./studio-bg3d-build-notice";
import { TemplateToggleRow } from "./StudioBg3dTemplateControls";
import {
  buildStudioBg3dWebtoonBackground,
  STUDIO_BG3D_WEBTOON_BACKGROUNDS,
  type StudioBg3dWebtoonBackgroundBuild,
  type StudioBg3dWebtoonBackgroundEntry,
  type StudioBg3dWebtoonBackgroundId,
} from "./studio-bg3d-webtoon-background-templates";
import {
  STUDIO_BG3D_MOOD_IDS,
  STUDIO_BG3D_MOOD_PALETTES,
  STUDIO_BG3D_WEBTOON_UNIVERSES,
  blendStudioBg3dWorldShaperSliders,
  buildStudioBg3dWebtoonWorldSpec,
  getStudioBg3dWebtoonUniverse,
  instantiateStudioBg3dWebtoonWorld,
  type StudioBg3dMoodId,
  type StudioBg3dWebtoonUniverseId,
  type StudioBg3dWorldBuildResult,
} from "./studio-bg3d-webtoon-world-shaper";
import {
  STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES,
  STUDIO_VARCO3D_WEBTOON_PROP_ASSETS,
  evaluateVarco3dDioramaScenePlacement,
  type StudioVarco3dIsometricDioramaEntry,
} from "../scene-3d/studio-varco3d-character-lab-diorama-catalog";

import type { BgPrimitive } from "../studio-background-3d-metadata";

/** 호스트가 현재 카메라(월드 좌표)를 넘겨 주는 모양. 자동 단면 판정에만 쓴다. */
export interface StudioBg3dWebtoonCameraView {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export type StudioBg3dWebtoonBuildParts = (
  existingCount: number,
  view: StudioBg3dWebtoonCameraView,
) => BgPrimitive[];

export interface StudioBg3dWebtoonBackgroundPickerProps {
  readonly disabled?: boolean;
  readonly autoCutaway: boolean;
  readonly onAutoCutawayChange: (next: boolean) => void;
  /** 호스트의 도형 묶음 추가: 장면에 반영했으면 true(또는 더한 도형 목록), 한도·준비 상태 때문에 못 했으면 false. */
  readonly onBuild: (buildParts: StudioBg3dWebtoonBuildParts) => boolean | readonly BgPrimitive[] | undefined;
  /** "숨긴 벽 되돌리기": 이 id 의 도형을 다시 보이게 한다. 주지 않으면 버튼을 그리지 않는다. */
  readonly onShowParts?: ((ids: readonly string[]) => void) | undefined;
  /** "새로 만든 곳 보기": 방금 선택된 새 배경으로 화면을 맞춘다. 주지 않으면 버튼을 그리지 않는다. */
  readonly onFocusBuilt?: (() => void) | undefined;
}

const ENTRY_ICON: Record<StudioBg3dWebtoonBackgroundId, typeof Building2> = {
  classroom: GraduationCap,
  corridor: DoorOpen,
  street: Building2,
};

const STREET_SWATCH = "#4a4a50";

const COMPACT_WORLD_SLIDERS = Object.freeze({
  widthScale: 0.85,
  depthScale: 0.85,
  ceilingScale: 0.95,
  windowDensity: 0.5,
  furnitureDensity: 0.5,
  aisleRatio: 0.4,
  propScale: 0.85,
});

const EXPANDED_WORLD_SLIDERS = Object.freeze({
  widthScale: 1.35,
  depthScale: 1.35,
  ceilingScale: 1.25,
  windowDensity: 1,
  furnitureDensity: 1,
  aisleRatio: 0.25,
  propScale: 1.25,
});

function swatchColor(entry: StudioBg3dWebtoonBackgroundEntry): string {
  return entry.kind === "room" ? entry.spec.floorColor : STREET_SWATCH;
}

type PickerNotice =
  | { readonly kind: "failed" }
  | {
      readonly kind: "built";
      readonly label: string;
      readonly objectCount: number;
      readonly hiddenWalls: StudioBg3dHiddenWallSummary;
      readonly wallsRestored: boolean;
      readonly anchorX: number;
    };

function mapVarcoDioramaToWorldUniverseAndMood(
  diorama: StudioVarco3dIsometricDioramaEntry,
): { readonly universeId: StudioBg3dWebtoonUniverseId; readonly moodId: StudioBg3dMoodId } {
  if (diorama.id === "diorama_hospital_room") {
    return { universeId: "medical-drama-ward", moodId: "hospital-clean" };
  }
  if (
    diorama.id === "diorama_open_office" ||
    diorama.id === "diorama_chaebol_penthouse" ||
    diorama.id === "diorama_subway_car"
  ) {
    return { universeId: "modern-office-noir", moodId: "noir-night" };
  }
  if (
    diorama.id === "diorama_modern_cafe" ||
    diorama.id === "diorama_studio_oneroom" ||
    diorama.id === "diorama_convenience_store_patio" ||
    diorama.id === "diorama_traditional_market" ||
    diorama.id === "diorama_residential_alley" ||
    diorama.id === "diorama_webtoon_creator_studio"
  ) {
    return { universeId: "daily-cafe-street", moodId: "sunset-romance" };
  }
  switch (diorama.genre) {
    case "romance-fantasy":
      return { universeId: "romance-fantasy-palace", moodId: "arcane-fantasy" };
    case "murim":
    case "joseon-historical":
      return { universeId: "murim-martial-courtyard", moodId: "murim-ink" };
    case "hunter-action":
      return { universeId: "hunter-dungeon-altar", moodId: "noir-night" };
    case "cyberpunk":
      return { universeId: "cyberpunk-neon-alley", moodId: "noir-night" };
    case "daily-school":
    default:
      return { universeId: "school-romance", moodId: "daylight" };
  }
}

export function StudioBg3dWebtoonBackgroundPicker({
  disabled = false,
  autoCutaway,
  onAutoCutawayChange,
  onBuild,
  onShowParts,
  onFocusBuilt,
}: StudioBg3dWebtoonBackgroundPickerProps) {
  const [notice, setNotice] = useState<PickerNotice | null>(null);
  const [shaperOpen, setShaperOpen] = useState(false);
  const [universeId, setUniverseId] = useState<StudioBg3dWebtoonUniverseId>("school-romance");
  const [moodId, setMoodId] = useState<StudioBg3dMoodId>("daylight");
  const [blendPercent, setBlendPercent] = useState(50);
  const [selectedDioramaId, setSelectedDioramaId] = useState<string>(
    STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES[0]!.id,
  );
  const [selectedVarcoPropIds, setSelectedVarcoPropIds] = useState<readonly string[]>([
    "prop_school_desk_chair",
    "prop_school_steel_lockers",
  ]);

  const selectedDioramaPlan = evaluateVarco3dDioramaScenePlacement({
    dioramaId: selectedDioramaId,
    propIds: selectedVarcoPropIds,
  });

  const selectedUniverse = getStudioBg3dWebtoonUniverse(universeId);
  const blendedSliders =
    blendPercent === 50
      ? selectedUniverse.defaultSliders
      : blendPercent < 50
        ? blendStudioBg3dWorldShaperSliders(
            COMPACT_WORLD_SLIDERS,
            selectedUniverse.defaultSliders,
            blendPercent / 50,
          )
        : blendStudioBg3dWorldShaperSliders(
            selectedUniverse.defaultSliders,
            EXPANDED_WORLD_SLIDERS,
            (blendPercent - 50) / 50,
          );
  const previewWorldSpec = buildStudioBg3dWebtoonWorldSpec(universeId, blendedSliders, moodId);

  const build = (id: StudioBg3dWebtoonBackgroundId) => {
    const built: { current: StudioBg3dWebtoonBackgroundBuild | null } = { current: null };
    const accepted = onBuild((existingCount, view) => {
      built.current = buildStudioBg3dWebtoonBackground(id, existingCount, {
        autoCutawayCamera: autoCutaway ? view : null,
      });
      return built.current?.primitives ?? [];
    });
    const result = built.current;
    setNotice(
      accepted && result
        ? {
            kind: "built",
            label: result.entry.label,
            objectCount: result.primitives.length,
            hiddenWalls: summarizeStudioBg3dHiddenWalls(result.primitives),
            wallsRestored: false,
            anchorX: result.anchorX,
          }
        : { kind: "failed" },
    );
  };

  const buildWorldUniverse = () => {
    const built: { current: StudioBg3dWorldBuildResult | null; anchorX: number } = {
      current: null,
      anchorX: 0,
    };
    const accepted = onBuild((existingCount) => {
      const world = instantiateStudioBg3dWebtoonWorld({
        universeId,
        sliders: blendedSliders,
        moodId,
        existingCount,
      });
      built.current = world;
      built.anchorX = existingCount > 0 ? existingCount * (world.roomSpec.width / 6) : 0;
      return world.primitives;
    });
    const result = built.current;
    setNotice(
      accepted && result
        ? {
            kind: "built",
            label: selectedUniverse.labelKo,
            objectCount: result.primitives.length,
            hiddenWalls: summarizeStudioBg3dHiddenWalls(result.primitives),
            wallsRestored: false,
            anchorX: built.anchorX,
          }
        : { kind: "failed" },
    );
  };

  const buildVarcoDioramaAndProps = () => {
    const mapped = mapVarcoDioramaToWorldUniverseAndMood(selectedDioramaPlan.diorama);
    const built: { primitives: BgPrimitive[]; anchorX: number } = {
      primitives: [],
      anchorX: 0,
    };
    const accepted = onBuild((existingCount) => {
      const world = instantiateStudioBg3dWebtoonWorld({
        universeId: mapped.universeId,
        sliders: blendedSliders,
        moodId: mapped.moodId,
        existingCount,
      });
      const anchorX = existingCount > 0 ? existingCount * (world.roomSpec.width / 6) : 0;
      const propPrimitives: BgPrimitive[] = selectedDioramaPlan.props.map((prop, index) => {
        const [w, d, h] = prop.footprintMeters;
        const offsetX = (index - (selectedDioramaPlan.props.length - 1) / 2) * 1.6;
        return {
          id: `varco3d_prop_${prop.id}_${existingCount + index}`,
          name: `${prop.labelKo} (VARCO 3D)`,
          kind: "box",
          position: [anchorX + offsetX, Number((h / 2).toFixed(2)), 0.6],
          rotation: [0, 0, 0],
          scale: [w, h, d],
          color: STUDIO_BG3D_MOOD_PALETTES[mapped.moodId].propAccentColor,
          componentRef: { id: prop.id, name: prop.labelKo },
          tags: ["varco3d-prop", prop.category, prop.meshTaskId],
        };
      });
      built.primitives = [...world.primitives, ...propPrimitives];
      built.anchorX = anchorX;
      return built.primitives;
    });
    setNotice(
      accepted && built.primitives.length > 0
        ? {
            kind: "built",
            label: `${selectedDioramaPlan.diorama.labelKo} (+소품 ${selectedDioramaPlan.props.length}종)`,
            objectCount: built.primitives.length,
            hiddenWalls: summarizeStudioBg3dHiddenWalls(built.primitives),
            wallsRestored: false,
            anchorX: built.anchorX,
          }
        : { kind: "failed" },
    );
  };

  const toggleVarcoProp = (propId: string) => {
    setSelectedVarcoPropIds((prev) =>
      prev.includes(propId) ? prev.filter((id) => id !== propId) : [...prev, propId],
    );
  };

  const restoreWalls = () => {
    if (notice?.kind !== "built") return;
    onShowParts?.(notice.hiddenWalls.ids);
    setNotice({ ...notice, wallsRestored: true });
  };

  const built = notice?.kind === "built" ? notice : null;
  const message = built
    ? describeStudioBg3dBuildNotice(built)
    : notice?.kind === "failed"
      ? STUDIO_BG3D_BUILD_FAILED_NOTICE
      : null;

  return (
    <section aria-labelledby="bg3d-webtoon-background-title">
      <h3
        id="bg3d-webtoon-background-title"
        className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg"
      >
        <Sparkles size={15} className="text-accent" aria-hidden />
        원클릭 웹툰 배경
      </h3>
      <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">{STUDIO_BG3D_PICKER_INTRO}</p>

      <div className="space-y-2">
        {STUDIO_BG3D_WEBTOON_BACKGROUNDS.map((entry) => {
          const Icon = ENTRY_ICON[entry.id];
          return (
            <button
              key={entry.id}
              type="button"
              disabled={disabled}
              className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => build(entry.id)}
            >
              <span
                className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-line/70"
                style={{ backgroundColor: swatchColor(entry) }}
                aria-hidden
              >
                <Icon size={15} className="text-white/85 mix-blend-luminosity" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-fg">{entry.label} 만들기</span>
                <span className="mt-0.5 block text-[0.66rem] leading-snug text-fg-3">{entry.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 3D Shaper 8-Universe Customizer */}
      <div
        data-testid="bg3d-world-shaper-box"
        className="mt-2.5 rounded-xl border border-line bg-card/70 p-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.66rem] font-bold text-fg">
            3D 세이퍼 웹툰 세계관 ({STUDIO_BG3D_WEBTOON_UNIVERSES.length}종 · VARCO 히어로 소품)
          </span>
          <button
            type="button"
            disabled={disabled}
            aria-expanded={shaperOpen}
            data-testid="bg3d-world-shaper-toggle"
            onClick={() => setShaperOpen((prev) => !prev)}
            className="rounded-md border border-line bg-panel px-2 py-0.5 text-[0.6rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-45"
          >
            {shaperOpen ? "세계관 접기" : "세계관 8종 열기"}
          </button>
        </div>

        {shaperOpen ? (
          <div
            data-testid="bg3d-world-shaper-section"
            className="mt-2 space-y-2 border-t border-line/60 pt-2"
          >
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[0.6rem] font-semibold text-fg-3">
                웹툰 세계관 (8종)
                <select
                  aria-label="웹툰 세계관 선택"
                  data-testid="bg3d-world-shaper-universe-select"
                  disabled={disabled}
                  value={universeId}
                  onChange={(event) => {
                    const nextId = event.target.value as StudioBg3dWebtoonUniverseId;
                    const nextUni = getStudioBg3dWebtoonUniverse(nextId);
                    setUniverseId(nextId);
                    setMoodId(nextUni.defaultMood);
                  }}
                  className="mt-0.5 w-full rounded border border-line bg-panel px-1.5 py-1 text-[0.62rem] text-fg"
                >
                  {STUDIO_BG3D_WEBTOON_UNIVERSES.map((uni) => (
                    <option key={uni.id} value={uni.id}>
                      [{uni.genreTagKo}] {uni.labelKo}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[0.6rem] font-semibold text-fg-3">
                시간대·무드 팔레트 (6종)
                <select
                  aria-label="무드 팔레트 선택"
                  data-testid="bg3d-world-shaper-mood-select"
                  disabled={disabled}
                  value={moodId}
                  onChange={(event) => setMoodId(event.target.value as StudioBg3dMoodId)}
                  className="mt-0.5 w-full rounded border border-line bg-panel px-1.5 py-1 text-[0.62rem] text-fg"
                >
                  {STUDIO_BG3D_MOOD_IDS.map((mId) => (
                    <option key={mId} value={mId}>
                      {STUDIO_BG3D_MOOD_PALETTES[mId].labelKo}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-[0.6rem] font-semibold text-fg-3">
              공간 규모·밀도 보간 ({blendPercent}%) · {previewWorldSpec.width}m × {previewWorldSpec.depth}m × 층고 {previewWorldSpec.wallHeight}m
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={disabled}
                aria-label="공간 규모 및 밀도 보간"
                data-testid="bg3d-world-shaper-blend-range"
                value={blendPercent}
                onChange={(event) => setBlendPercent(Number(event.target.value))}
                className="mt-1 w-full accent-accent"
              />
            </label>

            <div className="flex items-center justify-between gap-2 text-[0.58rem] text-fg-3">
              <span className="truncate">
                히어로 슬롯: <strong className="text-fg">{selectedUniverse.varcoPropSlot.labelKo}</strong>
              </span>
              <button
                type="button"
                disabled={disabled}
                data-testid="bg3d-world-shaper-build-btn"
                onClick={buildWorldUniverse}
                className="shrink-0 rounded border border-accent/60 bg-accent-soft px-2.5 py-1 text-[0.6rem] font-bold text-accent hover:bg-accent/20 disabled:opacity-45"
              >
                선택 세계관 장면에 배치
              </button>
            </div>

            <div
              data-testid="bg3d-varco3d-diorama-catalog-section"
              className="mt-2 space-y-1.5 rounded-lg border border-line/60 bg-card/90 p-2 shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.22)] backdrop-blur-[15px]"
            >
              <label className="block text-[0.6rem] font-semibold text-fg-3">
                <span className="flex items-center justify-between gap-1.5">
                  <span>
                    VARCO 3D 아이소메트릭 디오라마 ({STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES.length}종)
                  </span>
                  <span className="rounded-[4px] bg-[rgba(84,231,250,0.1)] px-[5px] py-[2px] text-[9px] font-semibold leading-none text-[#54e7fa]">
                    FOV {selectedDioramaPlan.diorama.cameraFovDeg}° · {selectedDioramaPlan.diorama.ambientKelvin}K
                  </span>
                </span>
                <select
                  aria-label="VARCO 3D 아이소메트릭 디오라마 선택"
                  data-testid="bg3d-varco3d-diorama-select"
                  disabled={disabled}
                  value={selectedDioramaId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setSelectedDioramaId(nextId);
                    const diorama = STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES.find(
                      (item) => item.id === nextId,
                    );
                    if (diorama) {
                      const mapped = mapVarcoDioramaToWorldUniverseAndMood(diorama);
                      setUniverseId(mapped.universeId);
                      setMoodId(mapped.moodId);
                    }
                  }}
                  className="mt-1 w-full rounded border border-line bg-panel px-1.5 py-1 text-[0.62rem] text-fg"
                >
                  {STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.labelKo} (FOV {scene.cameraFovDeg}° · {scene.ambientKelvin}K)
                    </option>
                  ))}
                </select>
              </label>

              <div
                className="flex max-h-20 flex-wrap gap-1 overflow-y-auto rounded border border-line/50 bg-panel/60 p-1"
                role="group"
                aria-label="VARCO 3D 한국 웹툰 소품 선택"
              >
                {STUDIO_VARCO3D_WEBTOON_PROP_ASSETS.map((prop) => {
                  const active = selectedVarcoPropIds.includes(prop.id);
                  return (
                    <button
                      key={prop.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      data-testid={`bg3d-varco3d-prop-${prop.id}`}
                      onClick={() => toggleVarcoProp(prop.id)}
                      className={`rounded border px-1.5 py-0.5 text-[0.58rem] transition-colors ${
                        active
                          ? "border-[#338FFF] bg-[#338FFF]/20 font-semibold text-fg"
                          : "border-line bg-card text-fg-3"
                      }`}
                    >
                      {prop.labelKo}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 text-[0.58rem] text-fg-3">
                <span data-testid="bg3d-varco3d-diorama-summary" className="truncate">
                  선택 소품 <strong className="text-fg">{selectedDioramaPlan.props.length}종</strong> ({selectedDioramaPlan.totalFootprintAreaSqMeters}㎡)
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  data-testid="bg3d-varco3d-diorama-build-btn"
                  onClick={buildVarcoDioramaAndProps}
                  className="shrink-0 rounded-md border border-[#338FFF]/70 bg-gradient-to-l from-[#1f83ff] via-[#47c5ff] to-[#33ccff] px-2.5 py-1 text-[0.6rem] font-bold text-white shadow-[0px_3.75px_7.5px_-1.25px_rgba(0,0,0,0.18)] transition-opacity hover:opacity-95 disabled:opacity-45"
                >
                  선택 VARCO 디오라마·소품 장면에 배치
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 rounded-xl border border-line bg-card/70 px-3">
        <TemplateToggleRow
          checked={autoCutaway}
          label={STUDIO_BG3D_AUTO_CUTAWAY_LABEL}
          disabled={disabled}
          onChange={onAutoCutawayChange}
        />
        <p className="pb-2 text-[0.64rem] leading-relaxed text-fg-3">{STUDIO_BG3D_PICKER_CUTAWAY_HELP}</p>
      </div>

      <StudioBg3dBuildNotice
        message={message}
        disabled={disabled}
        onRestoreWalls={built && built.hiddenWalls.ids.length > 0 && !built.wallsRestored && onShowParts ? restoreWalls : undefined}
        onFocusBuilt={built && built.anchorX > 0 ? onFocusBuilt : undefined}
      />
    </section>
  );
}
