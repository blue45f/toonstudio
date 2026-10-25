import { Flame, Shield, Sparkles, Swords, Users } from "lucide-react";
import { useMemo, useState } from "react";

import {
  BLENDER_FANTASY_LIGHTING_RIG_PRESETS,
  evaluateBlenderFantasyLightingRig,
  kelvinToLinearRgb,
  rgbNormalizedToHex,
  type BlenderFantasyLightingRigPreset,
} from "../scene-3d/studio-3d-blender-eevee-lighting-rig";
import {
  BLENDER_FANTASY_CROWD_PRESETS,
  BLENDER_FANTASY_MONSTER_PRESETS,
  BLENDER_FANTASY_WEAPON_PRESETS,
  simulateBlenderGeometryNodesBoidCrowd,
  solveBlenderItascMultiLimbMonsterIk,
  solveBlenderWeaponConstraintRig,
  type BlenderFantasyCrowdPreset,
  type BlenderFantasyMonsterPreset,
  type BlenderFantasyWeaponPreset,
  type BlenderMonsterPoseMode,
  type BlenderWeaponSocketSlot,
} from "../scene-3d/studio-3d-blender-fantasy-weapon-monster-crowd";
import {
  BLENDER_FREESTYLE_INK_PRESETS,
  BLENDER_NPR_SHADER_PRESETS,
  DEFAULT_FREESTYLE_SAMPLE_EDGES,
  evaluateBlenderNprShaderTree,
  evaluateFreestyleViewMapStrokes,
  type BlenderFreestyleInkPreset,
  type BlenderNprShaderPreset,
} from "../scene-3d/studio-3d-blender-npr-shader-freestyle";

export interface StudioBg3dBlenderFantasyWebtoonPanelProps {
  readonly disabled?: boolean;
  readonly onApplyLightingRig?: (rig: BlenderFantasyLightingRigPreset, grade: string) => void;
  readonly onApplyNprShader?: (preset: BlenderNprShaderPreset, hex: string) => void;
  readonly onApplyFreestyleInk?: (preset: BlenderFreestyleInkPreset, strokeCount: number) => void;
  readonly onApplyWeaponRig?: (preset: BlenderFantasyWeaponPreset, bladeCount: number) => void;
  readonly onApplyMonsterIk?: (preset: BlenderFantasyMonsterPreset, poseMode: BlenderMonsterPoseMode) => void;
  readonly onSimulateCrowd?: (preset: BlenderFantasyCrowdPreset, totalAgents: number) => void;
}

const MONSTER_POSE_MODES: readonly {
  readonly id: BlenderMonsterPoseMode;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "roar-intimidation", labelKo: "포효·위협" },
  { id: "pounce-strike", labelKo: "돌진·내려찍기" },
  { id: "wing-buffet-breath", labelKo: "용익 전개·브레스" },
  { id: "idle-menace", labelKo: "경계 대기" },
]);

const WEAPON_SOCKET_OPTIONS: readonly {
  readonly id: BlenderWeaponSocketSlot;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "right-hand", labelKo: "오른손 그립" },
  { id: "left-hand", labelKo: "왼손 그립" },
  { id: "back-sheath", labelKo: "등집 납도" },
  { id: "floating-halo-orbit", labelKo: "배후 부유 어검진" },
]);

/**
 * Blender 5.2 REA 역공학 기반 판타지 웹툰 특화 스튜디오 패널.
 * - EEVEE 광원·IES 배광·흑체 색온도·볼륨 라이트 프로브
 * - NPR ShaderNodeTree (`ShaderToRGB` + `ValToRGB` + `BsdfToon`) & `Freestyle`/`LineArt`
 * - 화려한 판타지 무기 (`ChildOf` / `FollowPath` / `TrackTo` / `ActionConstraint`)
 * - 몬스터 다관절 `iTaSC` 야코비안 IK & 폴벡터 리깅
 * - `GeometryNodes` (`InstanceReference`) & `BoidBrain` 대규모 군중/군단 시뮬레이션
 */
export function StudioBg3dBlenderFantasyWebtoonPanel({
  disabled = false,
  onApplyLightingRig,
  onApplyNprShader,
  onApplyFreestyleInk,
  onApplyWeaponRig,
  onApplyMonsterIk,
  onSimulateCrowd,
}: StudioBg3dBlenderFantasyWebtoonPanelProps) {
  const [selectedLightingId, setSelectedLightingId] = useState<string>(
    BLENDER_FANTASY_LIGHTING_RIG_PRESETS[0]!.id,
  );
  const [customKelvin, setCustomKelvin] = useState<number>(5600);
  const [selectedShaderId, setSelectedShaderId] = useState<string>(
    BLENDER_NPR_SHADER_PRESETS[0]!.id,
  );
  const [selectedFreestyleId, setSelectedFreestyleId] = useState<string>(
    BLENDER_FREESTYLE_INK_PRESETS[0]!.id,
  );
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>(
    BLENDER_FANTASY_WEAPON_PRESETS[1]!.id,
  );
  const [weaponSocket, setWeaponSocket] =
    useState<BlenderWeaponSocketSlot>("floating-halo-orbit");
  const [weaponAwakening, setWeaponAwakening] = useState<number>(0.85);
  const [selectedMonsterId, setSelectedMonsterId] = useState<string>(
    BLENDER_FANTASY_MONSTER_PRESETS[0]!.id,
  );
  const [monsterPose, setMonsterPose] =
    useState<BlenderMonsterPoseMode>("roar-intimidation");
  const [selectedCrowdId, setSelectedCrowdId] = useState<string>(
    BLENDER_FANTASY_CROWD_PRESETS[2]!.id,
  );
  const [crowdAgentCount, setCrowdAgentCount] = useState<number>(180);

  const activeLightingRig = useMemo(
    () =>
      BLENDER_FANTASY_LIGHTING_RIG_PRESETS.find(
        (r) => r.id === selectedLightingId,
      ) ?? BLENDER_FANTASY_LIGHTING_RIG_PRESETS[0]!,
    [selectedLightingId],
  );

  const lightingEvaluation = useMemo(
    () => evaluateBlenderFantasyLightingRig(activeLightingRig),
    [activeLightingRig],
  );

  const kelvinPreviewHex = useMemo(
    () => rgbNormalizedToHex(kelvinToLinearRgb(customKelvin, 0)),
    [customKelvin],
  );

  const activeShaderPreset = useMemo(
    () =>
      BLENDER_NPR_SHADER_PRESETS.find((s) => s.id === selectedShaderId) ??
      BLENDER_NPR_SHADER_PRESETS[0]!,
    [selectedShaderId],
  );

  const shaderEvaluation = useMemo(
    () =>
      evaluateBlenderNprShaderTree(activeShaderPreset, {
        normal: [0.65, 0.35, 0.67],
        lightDir: [0.3, 0.6, 0.74],
        viewDir: [0, 0.1, 0.99],
        edgeCurvature: 0.75,
        cavityOcclusion: 0.2,
      }),
    [activeShaderPreset],
  );

  const activeFreestylePreset = useMemo(
    () =>
      BLENDER_FREESTYLE_INK_PRESETS.find((f) => f.id === selectedFreestyleId) ??
      BLENDER_FREESTYLE_INK_PRESETS[0]!,
    [selectedFreestyleId],
  );

  const freestyleEvaluation = useMemo(
    () =>
      evaluateFreestyleViewMapStrokes(
        activeFreestylePreset,
        DEFAULT_FREESTYLE_SAMPLE_EDGES,
      ),
    [activeFreestylePreset],
  );

  const activeWeaponPreset = useMemo(
    () =>
      BLENDER_FANTASY_WEAPON_PRESETS.find((w) => w.id === selectedWeaponId) ??
      BLENDER_FANTASY_WEAPON_PRESETS[0]!,
    [selectedWeaponId],
  );

  const weaponSolveResult = useMemo(
    () =>
      solveBlenderWeaponConstraintRig({
        preset: activeWeaponPreset,
        socketSlot: weaponSocket,
        childOfInfluence: weaponSocket === "floating-halo-orbit" ? 0.25 : 0.95,
        awakeningFactor: weaponAwakening,
        orbitPhase: 0.15,
      }),
    [activeWeaponPreset, weaponSocket, weaponAwakening],
  );

  const activeMonsterPreset = useMemo(
    () =>
      BLENDER_FANTASY_MONSTER_PRESETS.find((m) => m.id === selectedMonsterId) ??
      BLENDER_FANTASY_MONSTER_PRESETS[0]!,
    [selectedMonsterId],
  );

  const monsterSolveResult = useMemo(
    () => solveBlenderItascMultiLimbMonsterIk(activeMonsterPreset, monsterPose, 0),
    [activeMonsterPreset, monsterPose],
  );

  const activeCrowdPreset = useMemo(
    () =>
      BLENDER_FANTASY_CROWD_PRESETS.find((c) => c.id === selectedCrowdId) ??
      BLENDER_FANTASY_CROWD_PRESETS[0]!,
    [selectedCrowdId],
  );

  const crowdResult = useMemo(
    () =>
      simulateBlenderGeometryNodesBoidCrowd(
        activeCrowdPreset,
        crowdAgentCount,
        1.0,
      ),
    [activeCrowdPreset, crowdAgentCount],
  );

  return (
    <div
      data-testid="bg3d-blender-fantasy-webtoon-panel"
      className="flex flex-col gap-3 p-3 text-xs text-fg"
    >
      {/* 상단 요약 배너 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raised/60 px-3 py-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Sparkles className="size-4 text-accent" aria-hidden />
          <span>
            Blender 5.2 EEVEE·ShaderToRGB·Freestyle·무기/몬스터/군단 스튜디오
          </span>
        </div>
        <span
          data-testid="bg3d-blender-summary-badge"
          className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[0.62rem] font-semibold text-accent"
        >
          EEVEE 시인성 {lightingEvaluation.webtoonReadabilityGrade} · 어검{" "}
          {weaponSolveResult.blades.length}자루 · 몬스터 체인{" "}
          {monsterSolveResult.solvedLimbs.length}개 · 군단{" "}
          {crowdResult.totalAgents}기 (VRAM -{crowdResult.vramReductionPercent}%)
        </span>
      </div>

      {/* 1. EEVEE 광원·IES 배광·흑체 색온도·볼륨 라이트 프로브 */}
      <section
        data-testid="bg3d-blender-eevee-lighting-section"
        className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <Flame className="size-3.5 text-accent" aria-hidden />
            1. EEVEE 광원·IES 배광·색온도·볼륨 라이트 프로브
          </span>
          <span
            data-testid="bg3d-blender-lighting-readout"
            className="font-mono text-[0.62rem] text-fg-2"
          >
            합성 조도 {lightingEvaluation.combinedDiffuseHex} · 림{" "}
            {lightingEvaluation.combinedRimIntensity} · 볼륨{" "}
            {lightingEvaluation.combinedVolumetricGlow} · 대비율{" "}
            {lightingEvaluation.contrastRatio}:1 (
            {lightingEvaluation.webtoonReadabilityGrade}등급)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {BLENDER_FANTASY_LIGHTING_RIG_PRESETS.map((rig) => {
            const active = rig.id === activeLightingRig.id;
            return (
              <button
                key={rig.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-light-rig-${rig.id}`}
                onClick={() => {
                  setSelectedLightingId(rig.id);
                  const evalNext = evaluateBlenderFantasyLightingRig(rig);
                  onApplyLightingRig?.(rig, evalNext.webtoonReadabilityGrade);
                }}
                className={`flex flex-col items-start rounded border px-2 py-1.5 text-left transition-colors ${
                  active
                    ? "border-accent bg-accent/15 font-bold text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                }`}
              >
                <span className="text-[0.6rem] text-fg-3">{rig.categoryKo}</span>
                <span className="text-[0.68rem]">{rig.nameKo}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-card px-2.5 py-1.5 text-[0.64rem]">
          <span>
            흑체 색온도(Kelvin): <strong>{customKelvin}K</strong> ({kelvinPreviewHex})
          </span>
          <input
            type="range"
            min={1500}
            max={10000}
            step={100}
            disabled={disabled}
            aria-label="흑체 복사 색온도 Kelvin"
            data-testid="bg3d-blender-kelvin-slider"
            value={customKelvin}
            onChange={(e) => setCustomKelvin(Number(e.target.value))}
            className="w-40 accent-accent"
          />
          <span className="font-mono text-fg-3">
            프로브 서펠 {lightingEvaluation.probeSample.totalSurfelCountEstimate}개 · FastGI ×
            {lightingEvaluation.probeSample.fastGiBounceFactor}
          </span>
        </div>
      </section>

      {/* 2. NPR ShaderNodeTree & Freestyle / LineArt */}
      <section
        data-testid="bg3d-blender-npr-freestyle-section"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              2A. ShaderToRGB · ValToRGB 만화 채색 셰이더
            </span>
            <span
              data-testid="bg3d-blender-shader-readout"
              className="font-mono text-[0.62rem] text-fg-2"
            >
              표면 {shaderEvaluation.finalSurfaceHex} · Bevel{" "}
              {shaderEvaluation.bevelHighlight}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {BLENDER_NPR_SHADER_PRESETS.map((preset) => {
              const active = preset.id === activeShaderPreset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-npr-shader-${preset.id}`}
                  onClick={() => {
                    setSelectedShaderId(preset.id);
                    const nextEval = evaluateBlenderNprShaderTree(preset, {
                      normal: [0.65, 0.35, 0.67],
                      lightDir: [0.3, 0.6, 0.74],
                      viewDir: [0, 0.1, 0.99],
                      edgeCurvature: 0.75,
                      cavityOcclusion: 0.2,
                    });
                    onApplyNprShader?.(preset, nextEval.finalSurfaceHex);
                  }}
                  className={`flex items-center justify-between rounded border px-2 py-1 text-left ${
                    active
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  <span className="text-[0.66rem]">{preset.nameKo}</span>
                  <span className="font-mono text-[0.58rem] text-fg-3">
                    {preset.toonComponent} · {preset.rampInterpolation} (
                    {preset.colorRampStops.length}단)
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-fg">
              2B. Freestyle ViewMap · LineArt 스트로크
            </span>
            <span
              data-testid="bg3d-blender-freestyle-readout"
              className="font-mono text-[0.62rem] text-fg-2"
            >
              추출 {freestyleEvaluation.selectedStrokeCount}선분 · 평균{" "}
              {freestyleEvaluation.averageThicknessPx}px
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {BLENDER_FREESTYLE_INK_PRESETS.map((preset) => {
              const active = preset.id === activeFreestylePreset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-freestyle-${preset.id}`}
                  onClick={() => {
                    setSelectedFreestyleId(preset.id);
                    const evalNext = evaluateFreestyleViewMapStrokes(
                      preset,
                      DEFAULT_FREESTYLE_SAMPLE_EDGES,
                    );
                    onApplyFreestyleInk?.(preset, evalNext.selectedStrokeCount);
                  }}
                  className={`flex items-center justify-between rounded border px-2 py-1 text-left ${
                    active
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  <span className="text-[0.66rem]">{preset.nameKo}</span>
                  <span className="font-mono text-[0.58rem] text-fg-3">
                    Crease {preset.creaseAngleDeg}° · Occl {preset.lineArtMaxOcclusion}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. 판타지 무기 포지 & ChildOf/FollowPath/TrackTo 어검진 */}
      <section
        data-testid="bg3d-blender-weapon-forge-section"
        className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <Swords className="size-3.5 text-accent" aria-hidden />
            3. 판타지 무기 포지 & ChildOf·FollowPath·TrackTo 어검진 리깅
          </span>
          <span
            data-testid="bg3d-blender-weapon-readout"
            className="font-mono text-[0.62rem] text-fg-2"
          >
            전개 {weaponSolveResult.blades.length}자루 · 룬 출력{" "}
            {weaponSolveResult.totalRunePowerWatts}W · 반경{" "}
            {weaponSolveResult.boundingRadiusMeters}m
          </span>
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {BLENDER_FANTASY_WEAPON_PRESETS.map((weapon) => {
            const active = weapon.id === activeWeaponPreset.id;
            return (
              <button
                key={weapon.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-weapon-${weapon.id}`}
                onClick={() => {
                  setSelectedWeaponId(weapon.id);
                  setWeaponSocket(weapon.defaultSocket);
                  onApplyWeaponRig?.(weapon, weapon.bladeCount);
                }}
                className={`flex flex-col items-start rounded border px-2 py-1.5 text-left ${
                  active
                    ? "border-accent bg-accent/15 font-bold text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                }`}
              >
                <span className="text-[0.58rem] text-fg-3">{weapon.categoryKo}</span>
                <span className="text-[0.66rem]">{weapon.nameKo}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-card px-2.5 py-1.5 text-[0.64rem]">
          <div className="flex flex-wrap items-center gap-1">
            <span>소켓(ChildOf):</span>
            {WEAPON_SOCKET_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-weapon-socket-${opt.id}`}
                onClick={() => setWeaponSocket(opt.id)}
                className={`rounded border px-1.5 py-0.5 text-[0.6rem] ${
                  weaponSocket === opt.id
                    ? "border-accent bg-accent/20 font-semibold text-accent"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {opt.labelKo}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span>진명 각성(Action): {Math.round(weaponAwakening * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              disabled={disabled}
              aria-label="무기 진명 각성 진행도"
              data-testid="bg3d-blender-weapon-awakening-slider"
              value={weaponAwakening}
              onChange={(e) => setWeaponAwakening(Number(e.target.value))}
              className="w-24 accent-accent"
            />
          </div>
        </div>
      </section>

      {/* 4. 판타지 몬스터 다관절 iTaSC IK & 5. GeometryNodes + BoidBrain 대규모 군단 */}
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div
          data-testid="bg3d-blender-monster-ik-section"
          className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-semibold text-fg">
              <Shield className="size-3.5 text-accent" aria-hidden />
              4. 몬스터 다관절 iTaSC 야코비안 IK
            </span>
            <span
              data-testid="bg3d-blender-monster-readout"
              className="font-mono text-[0.62rem] text-fg-2"
            >
              전고 {monsterSolveResult.silhouetteHeightMeters}m · 익폭{" "}
              {monsterSolveResult.silhouetteWingspanMeters}m · 수렴{" "}
              {monsterSolveResult.jacobianConverged ? "OK" : "WARN"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {BLENDER_FANTASY_MONSTER_PRESETS.map((monster) => {
              const active = monster.id === activeMonsterPreset.id;
              return (
                <button
                  key={monster.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-monster-${monster.id}`}
                  onClick={() => {
                    setSelectedMonsterId(monster.id);
                    onApplyMonsterIk?.(monster, monsterPose);
                  }}
                  className={`flex flex-col items-start rounded border px-2 py-1 text-left ${
                    active
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  <span className="text-[0.58rem] text-fg-3">
                    {monster.speciesClassKo}
                  </span>
                  <span className="truncate text-[0.64rem]">{monster.nameKo}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {MONSTER_POSE_MODES.map((pose) => (
              <button
                key={pose.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-monster-pose-${pose.id}`}
                onClick={() => {
                  setMonsterPose(pose.id);
                  onApplyMonsterIk?.(activeMonsterPreset, pose.id);
                }}
                className={`rounded border px-2 py-0.5 text-[0.6rem] ${
                  monsterPose === pose.id
                    ? "border-accent bg-accent/20 font-semibold text-accent"
                    : "border-line bg-card text-fg-2"
                }`}
              >
                {pose.labelKo}
              </button>
            ))}
          </div>
        </div>

        <div
          data-testid="bg3d-blender-crowd-boid-section"
          className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-semibold text-fg">
              <Users className="size-3.5 text-accent" aria-hidden />
              5. GeometryNodes & BoidBrain 대규모 군단
            </span>
            <span
              data-testid="bg3d-blender-crowd-readout"
              className="font-mono text-[0.62rem] text-fg-2"
            >
              {crowdResult.totalAgents}기 (가시 {crowdResult.visibleAgents}) · VRAM -
              {crowdResult.vramReductionPercent}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {BLENDER_FANTASY_CROWD_PRESETS.map((crowd) => {
              const active = crowd.id === activeCrowdPreset.id;
              return (
                <button
                  key={crowd.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-crowd-${crowd.id}`}
                  onClick={() => {
                    setSelectedCrowdId(crowd.id);
                    setCrowdAgentCount(crowd.defaultAgentCount);
                    onSimulateCrowd?.(crowd, crowd.defaultAgentCount);
                  }}
                  className={`flex flex-col items-start rounded border px-2 py-1 text-left ${
                    active
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  <span className="text-[0.58rem] text-fg-3">{crowd.categoryKo}</span>
                  <span className="truncate text-[0.64rem]">{crowd.nameKo}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded bg-card px-2 py-1 text-[0.6rem]">
            <span>
              LOD0 {crowdResult.lodCounts.lod0} / LOD1 {crowdResult.lodCounts.lod1} /
              LOD2 {crowdResult.lodCounts.lod2} · 교전{" "}
              {crowdResult.stateCounts.engagedCombat}기
            </span>
            <input
              type="range"
              min={24}
              max={600}
              step={12}
              disabled={disabled}
              aria-label="대규모 군단 개체 수"
              data-testid="bg3d-blender-crowd-count-slider"
              value={crowdAgentCount}
              onChange={(e) => {
                const nextCount = Number(e.target.value);
                setCrowdAgentCount(nextCount);
                onSimulateCrowd?.(activeCrowdPreset, nextCount);
              }}
              className="w-24 accent-accent"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export default StudioBg3dBlenderFantasyWebtoonPanel;
