import { useMemo, useState, type CSSProperties, type ReactElement } from "react";

import type { ShaperBodySliderValues } from "./studio-shaper-model";
import {
  STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS,
  STUDIO_ASSET3D_COMPLETED_TURNAROUND_SHEETS,
  STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES,
  STUDIO_ASSET3D_LOCAL_GLB_ASSETS,
  STUDIO_ASSET3D_RETARGETED_MOTION_TASKS,
  STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES,
  STUDIO_ASSET3D_WEBTOON_PROP_ASSETS,
  composeAsset3dCharacterLabLoadout,
  evaluateAsset3dDioramaScenePlacement,
  resolveAsset3dArchetypeMannequinApplication,
  resolveAsset3dLocalGlbAsset,
  resolveAsset3dTurnaroundViewUrl,
  type StudioAsset3dMannequinPosePresetId,
  type StudioAsset3dTurnaroundAngle,
} from "./studio-asset3d-character-lab-diorama-catalog";
import {
  STUDIO_ASSET3D_12VIEW_CAMERA_RING,
  STUDIO_ASSET3D_ANIMATION_LIBRARY_SUMMARY,
  STUDIO_ASSET3D_POINT_POLICIES,
  STUDIO_ASSET3D_ZERO_POINT_OPTIMIZATION_TASKS,
  buildAsset3dCanonicalPartDescriptor,
  evaluateAsset3dPointPolicyReservation,
  inspectAsset3d12ViewReconstructionBundle,
  type StudioAsset3d12ViewAngle,
  type StudioAsset3d12ViewMapFamily,
} from "./studio-asset3d-vibe-pipeline-canonical-bridge";
import { StudioAsset3dFullPlatformDeck } from "./StudioAsset3dFullPlatformDeck";

const TURNAROUND_ANGLES: readonly StudioAsset3dTurnaroundAngle[] = Object.freeze([
  "front",
  "back",
  "left",
  "right",
]);

const MV12_FAMILIES: readonly StudioAsset3d12ViewMapFamily[] = Object.freeze([
  "mvImages",
  "mvAlbedo",
  "mvOrm",
]);

const DEFERRED_CATALOG_CONTAINER_STYLE: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "auto none auto 280px",
};

export interface StudioAsset3dCatalogExecutionPanelProps {
  readonly accordionGroupName: string;
  readonly onApplyMannequinBodySliders?: (
    sliders: ShaperBodySliderValues,
    options?: {
      readonly posePresetId?: StudioAsset3dMannequinPosePresetId;
      readonly archetypeLabelKo?: string;
      readonly motionLabelKo?: string;
    },
  ) => void;
}

export function StudioAsset3dCatalogExecutionPanel({
  accordionGroupName,
  onApplyMannequinBodySliders,
}: StudioAsset3dCatalogExecutionPanelProps): ReactElement {
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>(
    "char_rofan_villainess_empress",
  );
  const [selectedWigId, setSelectedWigId] = useState<string>("charlab_wig_rofan_hime_wave");
  const [selectedOutfitId, setSelectedOutfitId] = useState<string>(
    "charlab_outfit_rofan_crimson_gown",
  );
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>(
    "charlab_weapon_paladin_greatsword",
  );
  const [selectedAccessoryId, setSelectedAccessoryId] = useState<string>(
    "charlab_acc_rofan_ruby_tiara",
  );
  const [selectedWingId, setSelectedWingId] = useState<string>("charlab_wings_archangel_six");
  const [selectedTurnaroundAngle, setSelectedTurnaroundAngle] =
    useState<StudioAsset3dTurnaroundAngle>("front");
  const [selectedDioramaId, setSelectedDioramaId] = useState<string>(
    "diorama_rofan_imperial_ballroom",
  );
  const [selectedPropIds, setSelectedPropIds] = useState<readonly string[]>([
    "prop_school_desk_chair",
    "prop_cafe_table_set",
    "prop_pojangmacha_cart",
  ]);
  const [selected12ViewFamily, setSelected12ViewFamily] =
    useState<StudioAsset3d12ViewMapFamily>("mvAlbedo");
  const [selected12ViewAngle, setSelected12ViewAngle] =
    useState<StudioAsset3d12ViewAngle>("front");
  const [selectedMotionTaskId, setSelectedMotionTaskId] = useState<string>(
    "cf5cbba3-4987-49b7-a1d1-079ccfcb09b8",
  );
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<string>("task:AI_RIG");
  const [selectedZeroPointTaskId, setSelectedZeroPointTaskId] = useState<string>(
    STUDIO_ASSET3D_ZERO_POINT_OPTIMIZATION_TASKS[0]?.taskId ?? "",
  );
  const [selectedLocalGlbId, setSelectedLocalGlbId] = useState<string>(
    STUDIO_ASSET3D_LOCAL_GLB_ASSETS[5]?.id ?? "varco_char_student_council_rigged",
  );
  const selectedLocalGlb = useMemo(
    () => resolveAsset3dLocalGlbAsset(selectedLocalGlbId),
    [selectedLocalGlbId],
  );

  const wigOptions = useMemo(
    () => STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.filter((item) => item.slot === "head-hair"),
    [],
  );
  const outfitOptions = useMemo(
    () => STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.filter((item) => item.slot === "outfit-set"),
    [],
  );
  const weaponOptions = useMemo(
    () =>
      STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.filter(
        (item) => item.slot === "weapon-r" || item.slot === "weapon-l",
      ),
    [],
  );
  const accessoryOptions = useMemo(
    () =>
      STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.filter((item) => item.slot === "head-accessory"),
    [],
  );
  const wingOptions = useMemo(
    () => STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.filter((item) => item.slot === "back-wings"),
    [],
  );

  const characterLabLoadout = useMemo(
    () =>
      composeAsset3dCharacterLabLoadout({
        archetypeId: selectedArchetypeId,
        itemIds: [
          selectedWigId,
          selectedOutfitId,
          selectedWeaponId,
          selectedAccessoryId,
          selectedWingId,
        ].filter(Boolean),
      }),
    [
      selectedArchetypeId,
      selectedWigId,
      selectedOutfitId,
      selectedWeaponId,
      selectedAccessoryId,
      selectedWingId,
    ],
  );

  const turnaroundViewUrl = useMemo(
    () =>
      characterLabLoadout.primaryTurnaround
        ? resolveAsset3dTurnaroundViewUrl(
            characterLabLoadout.primaryTurnaround,
            selectedTurnaroundAngle,
          )
        : "",
    [characterLabLoadout.primaryTurnaround, selectedTurnaroundAngle],
  );

  const dioramaPlacementPlan = useMemo(
    () =>
      evaluateAsset3dDioramaScenePlacement({
        dioramaId: selectedDioramaId,
        propIds: selectedPropIds,
      }),
    [selectedDioramaId, selectedPropIds],
  );

  const canonicalWigDescriptor = useMemo(() => {
    const activeWig =
      STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.find((item) => item.id === selectedWigId) ??
      STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS[0]!;
    return buildAsset3dCanonicalPartDescriptor(activeWig);
  }, [selectedWigId]);

  const mv12Inspection = useMemo(
    () =>
      inspectAsset3d12ViewReconstructionBundle({
        angle: selected12ViewAngle,
        mapFamily: selected12ViewFamily,
      }),
    [selected12ViewAngle, selected12ViewFamily],
  );

  const selectedMotionTask = useMemo(
    () =>
      STUDIO_ASSET3D_RETARGETED_MOTION_TASKS.find(
        (entry) => entry.animTaskId === selectedMotionTaskId,
      ) ?? STUDIO_ASSET3D_RETARGETED_MOTION_TASKS[0]!,
    [selectedMotionTaskId],
  );

  const selectedZeroPointTask = useMemo(
    () =>
      STUDIO_ASSET3D_ZERO_POINT_OPTIMIZATION_TASKS.find(
        (entry) => entry.taskId === selectedZeroPointTaskId,
      ) ?? STUDIO_ASSET3D_ZERO_POINT_OPTIMIZATION_TASKS[0]!,
    [selectedZeroPointTaskId],
  );

  const pointReservationEval = useMemo(
    () =>
      evaluateAsset3dPointPolicyReservation({
        targetKey: selectedPolicyKey,
        quantity: 6,
        remainingPoints: 0,
        runningStudioTaskCount: 12,
      }),
    [selectedPolicyKey],
  );

  const archetypeMannequinApp = useMemo(
    () =>
      resolveAsset3dArchetypeMannequinApplication({
        archetypeId: selectedArchetypeId,
        animTaskId: selectedMotionTaskId,
      }),
    [selectedArchetypeId, selectedMotionTaskId],
  );

  const togglePropSelection = (propId: string): void => {
    setSelectedPropIds((prev) =>
      prev.includes(propId) ? prev.filter((id) => id !== propId) : [...prev, propId],
    );
  };

  return (
    <>
      <details
        name={accordionGroupName}
        data-testid="varco3d-details-character-lab-diorama"
        style={DEFERRED_CATALOG_CONTAINER_STYLE}
        className="rounded-xl border border-line/60 bg-card/90 px-3 py-2 shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.28)]"
      >
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-semibold text-fg">
          <span>
            VARCO 3D Character Labs 모듈러 파츠 ({STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.length}
            종 · 4-View 턴어라운드 {STUDIO_ASSET3D_COMPLETED_TURNAROUND_SHEETS.length}시트) & 3D 배경
            아이소메트릭 디오라마 ({STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES.length}종) · 한국 웹툰 소품
            ({STUDIO_ASSET3D_WEBTOON_PROP_ASSETS.length}종)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-full bg-[#163D2F] px-2 py-0.5 text-[10px] font-semibold text-[#41D18D]">
              66 AI-RIGGED
            </span>
            <span className="rounded-[4px] bg-[rgba(84,231,250,0.1)] px-[6px] py-[3px] text-[9px] font-semibold leading-none text-[#54e7fa]">
              4-VIEW · 40 SHEETS
            </span>
          </span>
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              Character Labs 베이스 아키타입 ({STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES.length}종)
              & 가발/의상/액세서리/날개 전체 슬롯
            </span>
            <select
              aria-label="Character Labs 베이스 아키타입"
              data-testid="varco3d-charlab-archetype-select"
              value={selectedArchetypeId}
              onChange={(e) => setSelectedArchetypeId(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES.map((arch) => (
                <option key={arch.id} value={arch.id}>
                  {arch.labelKo} ({arch.headTallRatio}등신)
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1" role="group" aria-label="가발 슬롯">
              {wigOptions.map((wig) => (
                <button
                  key={wig.id}
                  type="button"
                  data-testid={`varco3d-charlab-wig-${wig.id}`}
                  aria-pressed={selectedWigId === wig.id}
                  onClick={() => setSelectedWigId(wig.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selectedWigId === wig.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {wig.labelKo}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="의상 슬롯">
              {outfitOptions.map((outfit) => (
                <button
                  key={outfit.id}
                  type="button"
                  data-testid={`varco3d-charlab-outfit-${outfit.id}`}
                  aria-pressed={selectedOutfitId === outfit.id}
                  onClick={() => setSelectedOutfitId(outfit.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selectedOutfitId === outfit.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {outfit.labelKo}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="액세서리 및 날개 슬롯">
              {accessoryOptions.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  data-testid={`varco3d-charlab-acc-${acc.id}`}
                  aria-pressed={selectedAccessoryId === acc.id}
                  onClick={() =>
                    setSelectedAccessoryId((prev) => (prev === acc.id ? "" : acc.id))
                  }
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selectedAccessoryId === acc.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {acc.labelKo}
                </button>
              ))}
              {wingOptions.map((wing) => (
                <button
                  key={wing.id}
                  type="button"
                  data-testid={`varco3d-charlab-wing-${wing.id}`}
                  aria-pressed={selectedWingId === wing.id}
                  onClick={() => setSelectedWingId((prev) => (prev === wing.id ? "" : wing.id))}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selectedWingId === wing.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {wing.labelKo}
                </button>
              ))}
            </div>
            <span data-testid="varco3d-charlab-loadout-readout" className="text-[0.66rem] text-fg-3">
              장착 파츠: <strong>{characterLabLoadout.equippedItems.length}개</strong> · 폴리곤 예산:{" "}
              <strong>{characterLabLoadout.totalPolygonBudget.toLocaleString()} tris</strong> · 장르
              시너지: <strong>{characterLabLoadout.genreSynergyScore}%</strong> · 본 바인딩:{" "}
              <code>{characterLabLoadout.attachedBones.join(", ")}</code>
            </span>
            {onApplyMannequinBodySliders ? (
              <button
                type="button"
                data-testid="varco3d-apply-archetype-motion-to-mannequin"
                onClick={() =>
                  onApplyMannequinBodySliders(archetypeMannequinApp.mannequinSliders, {
                    posePresetId: archetypeMannequinApp.posePresetId,
                    archetypeLabelKo: archetypeMannequinApp.archetype.labelKo,
                    motionLabelKo: archetypeMannequinApp.motionTask?.labelKo,
                  })
                }
                className="mt-1 rounded-md border border-[#338FFF]/70 bg-gradient-to-l from-[#1f83ff] via-[#47c5ff] to-[#33ccff] px-2.5 py-1 text-[0.68rem] font-semibold text-white shadow-[0px_3.75px_7.5px_-1.25px_rgba(0,0,0,0.18),0px_3.75px_7.5px_0px_rgba(0,0,0,0.16)] transition-opacity hover:opacity-95"
              >
                데생 인형 포저에 선택 아키타입({archetypeMannequinApp.archetype.headTallRatio}등신)·모션(
                {archetypeMannequinApp.posePresetId}) 즉시 적용
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              실시간 4-View 직교 턴어라운드 시트 (FOUR_VIEW_GENERATION) & 무기 파츠 (
              {weaponOptions.length}종)
            </span>
            <div className="flex items-center gap-2">
              <div
                aria-hidden="true"
                data-testid="varco3d-turnaround-2x2-minigrid"
                className="grid h-[42px] w-[42px] shrink-0 grid-cols-2 grid-rows-2 gap-[1px] overflow-hidden rounded-[4px] border border-[#303030] bg-[#19191B]"
              >
                {TURNAROUND_ANGLES.map((ang) => (
                  <span
                    key={ang}
                    className={`flex items-center justify-center text-[8px] font-bold uppercase ${
                      selectedTurnaroundAngle === ang
                        ? "bg-[#338FFF]/35 text-[#54e7fa]"
                        : "bg-[#222226] text-fg-3"
                    }`}
                  >
                    {ang[0]}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {TURNAROUND_ANGLES.map((angle) => (
                  <button
                    key={angle}
                    type="button"
                    data-testid={`varco3d-turnaround-angle-${angle}`}
                    aria-pressed={selectedTurnaroundAngle === angle}
                    onClick={() => setSelectedTurnaroundAngle(angle)}
                    className={`rounded border px-2 py-0.5 text-[0.66rem] uppercase ${
                      selectedTurnaroundAngle === angle
                        ? "border-[#338FFF] bg-gradient-to-l from-[#1f83ff] via-[#47c5ff] to-[#33ccff] font-semibold text-white"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    {angle}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="varco3d-charlab-weapon-murim"
                  onClick={() => setSelectedWeaponId("charlab_weapon_murim_jade_sword")}
                  className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.65rem] text-fg-2"
                >
                  무림 장검 장착
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="무기 파츠 선택">
              {weaponOptions.map((weapon) => (
                <button
                  key={weapon.id}
                  type="button"
                  data-testid={`varco3d-charlab-weapon-${weapon.id}`}
                  aria-pressed={selectedWeaponId === weapon.id}
                  onClick={() => setSelectedWeaponId(weapon.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.64rem] ${
                    selectedWeaponId === weapon.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {weapon.labelKo}
                </button>
              ))}
            </div>
            <code
              data-testid="varco3d-turnaround-view-url"
              className="truncate text-[0.64rem] text-fg-3"
            >
              {turnaroundViewUrl}
            </code>
            <span className="text-[0.65rem] text-fg-3">
              턴어라운드 태스크 ID:{" "}
              <code>{characterLabLoadout.primaryTurnaround?.taskId ?? "none"}</code> · 전체 완료
              시트: <strong>{STUDIO_ASSET3D_COMPLETED_TURNAROUND_SHEETS.length}종</strong>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              3D 배경 아이소메트릭 디오라마 ({STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES.length}종) &
              한국 웹툰 소품 ({STUDIO_ASSET3D_WEBTOON_PROP_ASSETS.length}종) 배치
            </span>
            <select
              aria-label="3D 배경 아이소메트릭 디오라마 선택"
              data-testid="varco3d-diorama-select"
              value={selectedDioramaId}
              onChange={(e) => setSelectedDioramaId(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.labelKo} ({scene.ambientKelvin}K)
                </option>
              ))}
            </select>
            <div
              className="flex max-h-20 flex-wrap gap-1 overflow-y-auto rounded border border-line/50 bg-panel/60 p-1"
              role="group"
              aria-label="한국 웹툰 3D 소품 배치 토글"
            >
              {STUDIO_ASSET3D_WEBTOON_PROP_ASSETS.map((prop) => {
                const active = selectedPropIds.includes(prop.id);
                return (
                  <button
                    key={prop.id}
                    type="button"
                    data-testid={`varco3d-prop-toggle-${prop.id}`}
                    aria-pressed={active}
                    onClick={() => togglePropSelection(prop.id)}
                    className={`rounded border px-1.5 py-0.5 text-[0.62rem] ${
                      active
                        ? "border-accent bg-accent-soft font-semibold text-fg"
                        : "border-line bg-card text-fg-3"
                    }`}
                  >
                    {prop.labelKo}
                  </button>
                );
              })}
            </div>
            <span data-testid="varco3d-diorama-plan-readout" className="text-[0.66rem] text-fg-3">
              FOV: <strong>{dioramaPlacementPlan.diorama.cameraFovDeg}°</strong> · 고도각:{" "}
              <strong>{dioramaPlacementPlan.diorama.cameraElevationDeg}°</strong> · 방위각:{" "}
              <strong>{dioramaPlacementPlan.diorama.cameraAzimuthDeg}°</strong> · 소품 면적:{" "}
              <strong>{dioramaPlacementPlan.totalFootprintAreaSqMeters}㎡</strong> (매핑 배경:{" "}
              <code>{dioramaPlacementPlan.mappedBg3dTemplateId}</code>)
            </span>
            <code
              data-testid="varco3d-diorama-portal-url"
              className="truncate text-[0.64rem] text-fg-3"
            >
              {dioramaPlacementPlan.varcoAssetPortalUrl}
            </code>
          </div>
        </div>
      </details>

      <details
        name={accordionGroupName}
        data-testid="varco3d-details-vibe-pipeline-canonical"
        style={DEFERRED_CATALOG_CONTAINER_STYLE}
        className="rounded-xl border border-line/60 bg-card/90 px-3 py-2 shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.28)]"
      >
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-semibold text-fg">
          <span>
            CharacterCanonicalPart 브리지 & 12-View PBR 재구성 링 (mvImages/mvAlbedo/mvOrm) &{" "}
            {STUDIO_ASSET3D_ANIMATION_LIBRARY_SUMMARY.totalClips}-모션 리타겟팅 (mixamo52) & 0pt 최적화 (
            {STUDIO_ASSET3D_ZERO_POINT_OPTIMIZATION_TASKS.length}종) &{" "}
            {STUDIO_ASSET3D_POINT_POLICIES.length}종 포인트/큐 정책
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-[4px] bg-[rgba(84,231,250,0.1)] px-[6px] py-[3px] text-[9px] font-semibold leading-none text-[#54e7fa]">
              0pt FREE · 11 TASKS
            </span>
            <span className="rounded-full bg-[#163D2F] px-2 py-0.5 text-[10px] font-semibold text-[#41D18D]">
              12-VIEW PBR
            </span>
          </span>
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              CharacterCanonicalPartDescriptor 브리지 & 0pt 메쉬 최적화 (
              {STUDIO_ASSET3D_ZERO_POINT_OPTIMIZATION_TASKS.length}종)
            </span>
            <span
              data-testid="varco3d-canonical-part-readout"
              className="text-[0.66rem] text-fg-3"
            >
              슬롯: <strong>{canonicalWigDescriptor.slot}</strong> · 바인딩:{" "}
              <strong>{canonicalWigDescriptor.binding.kind}</strong> · 타겟본:{" "}
              <code>{canonicalWigDescriptor.binding.targetBone}</code> · LOD:{" "}
              <strong>{canonicalWigDescriptor.lods.length}단계</strong>
            </span>
            <code
              data-testid="varco3d-canonical-part-sha256"
              className="truncate text-[0.63rem] text-fg-3"
            >
              sha256:{canonicalWigDescriptor.source.sha256}
            </code>
            <select
              aria-label="0pt 메쉬 최적화 태스크 선택"
              data-testid="varco3d-zeropoint-task-select"
              value={selectedZeroPointTaskId}
              onChange={(e) => setSelectedZeroPointTaskId(e.target.value)}
              className="mt-0.5 rounded border border-line bg-panel px-2 py-0.5 text-[0.66rem] text-fg"
            >
              {STUDIO_ASSET3D_ZERO_POINT_OPTIMIZATION_TASKS.map((task) => (
                <option key={task.taskId} value={task.taskId}>
                  [{task.operation}] {task.labelKo} ({task.taskId.slice(0, 8)})
                </option>
              ))}
            </select>
            <span
              data-testid="varco3d-zeropoint-task-readout"
              className="text-[0.64rem] text-fg-3"
            >
              0pt 최적화: <strong>{selectedZeroPointTask.operation}</strong> · 소스 메쉬:{" "}
              <code>{selectedZeroPointTask.sourceTaskId.slice(0, 8)}</code> · 에셋:{" "}
              <strong>{selectedZeroPointTask.assetId}</strong> (0pt)
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              12-View PBR 재구성 링 ({STUDIO_ASSET3D_12VIEW_CAMERA_RING.length}방향 · cd1e75d3)
            </span>
            <div className="flex flex-wrap gap-1">
              {MV12_FAMILIES.map((family) => (
                <button
                  key={family}
                  type="button"
                  data-testid={`varco3d-12view-family-${family}`}
                  aria-pressed={selected12ViewFamily === family}
                  onClick={() => setSelected12ViewFamily(family)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selected12ViewFamily === family
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {family}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="12-View 카메라 각도 선택">
              {STUDIO_ASSET3D_12VIEW_CAMERA_RING.map((ang) => (
                <button
                  key={ang}
                  type="button"
                  data-testid={`varco3d-12view-angle-${ang}`}
                  aria-pressed={selected12ViewAngle === ang}
                  onClick={() => setSelected12ViewAngle(ang)}
                  className={`rounded border px-1.5 py-0.5 text-[0.63rem] ${
                    selected12ViewAngle === ang
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {ang}
                </button>
              ))}
            </div>
            <span data-testid="varco3d-12view-stage-readout" className="text-[0.65rem] text-fg-3">
              스테이지: <code>{mv12Inspection.pipelineStageKey}</code> · 링 인덱스:{" "}
              <strong>#{mv12Inspection.ringIndex}</strong>
            </span>
            <code
              data-testid="varco3d-12view-url-readout"
              className="truncate text-[0.63rem] text-fg-3"
            >
              {mv12Inspection.objectUrl}
            </code>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              실서버 ANIMATE 리타겟팅 ({STUDIO_ASSET3D_RETARGETED_MOTION_TASKS.length}종) & 포인트 정책
            </span>
            <select
              aria-label="실서버 ANIMATE 리타겟팅 태스크 선택"
              data-testid="varco3d-retargeted-motion-select"
              value={selectedMotionTaskId}
              onChange={(e) => setSelectedMotionTaskId(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_ASSET3D_RETARGETED_MOTION_TASKS.map((task) => (
                <option key={task.animTaskId} value={task.animTaskId}>
                  {task.labelKo} ({task.animTaskId.slice(0, 8)})
                </option>
              ))}
            </select>
            <select
              aria-label="VARCO 3D 포인트 정책 선택"
              data-testid="varco3d-point-policy-select"
              value={selectedPolicyKey}
              onChange={(e) => setSelectedPolicyKey(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_ASSET3D_POINT_POLICIES.map((pol) => (
                <option key={pol.targetKey} value={pol.targetKey}>
                  {pol.targetKey} ({pol.labelKo})
                </option>
              ))}
            </select>
            <span
              data-testid="varco3d-retargeted-policy-readout"
              className="text-[0.65rem] text-fg-3"
            >
              모션FBX: <code>{selectedMotionTask.animationFbx}</code> · 정책 상태:{" "}
              <strong>{pointReservationEval.errorCode}</strong> · 가용 워커:{" "}
              <strong>{pointReservationEval.availableParallelSlots}/30</strong>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              로컬 번들링 완료 VARCO 3D .glb 에셋 ({STUDIO_ASSET3D_LOCAL_GLB_ASSETS.length}종 · /models/varco3d/)
            </span>
            <select
              aria-label="로컬 번들링 VARCO 3D GLB 에셋 선택"
              data-testid="varco3d-local-glb-select"
              value={selectedLocalGlbId}
              onChange={(e) => setSelectedLocalGlbId(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_ASSET3D_LOCAL_GLB_ASSETS.map((item) => (
                <option key={item.id} value={item.id}>
                  [{item.category}/{item.stage}] {item.labelKo}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-2 text-[0.65rem] text-fg-3">
              <code data-testid="varco3d-local-glb-url-readout" className="truncate">
                {selectedLocalGlb.publicUrl}
              </code>
              <a
                href={selectedLocalGlb.publicUrl}
                download
                data-testid="varco3d-local-glb-download-link"
                className="shrink-0 rounded border border-accent bg-accent-soft px-1.5 py-0.5 font-semibold text-fg"
              >
                GLB 다운로드
              </a>
            </div>
          </div>
        </div>
      </details>

      <StudioAsset3dFullPlatformDeck accordionGroupName={accordionGroupName} />
    </>
  );
}
