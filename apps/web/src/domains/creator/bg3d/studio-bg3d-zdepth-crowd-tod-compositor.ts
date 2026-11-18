/**
 * V23 Z-심도 3D 효과음(SFX) 스탬프 · 공통 기준선 엑스트라 군중 블로킹 ·
 * 멀티 시간대(5600K 정오 · 3200K 노을 · 8500K 월광) 타임라인 ·
 * 세로 스크롤 여백(120~420px) 페이싱 · 클립스튜디오/PSD 다중 패스(.toonlayers.json) 컴포지터 엔진.
 */

export type WebtoonTimeOfDayId = "noon-5600k" | "sunset-3200k" | "moonlight-8500k";
export type DatumCrowdPresetCount = 4 | 6 | 15;

export interface WebtoonTimeOfDayProfile {
  readonly id: WebtoonTimeOfDayId;
  readonly labelKo: string;
  readonly kelvin: 5600 | 3200 | 8500;
  readonly solarElevationDeg: number;
  readonly keyHex: string;
  readonly bounceHex: string;
  readonly darkroomDeltaE: number;
  readonly v23AssetSlug: string;
  readonly previewUrl: string;
  readonly glbUrl: string;
}

export const WEBTOON_TIME_OF_DAY_PROFILES: readonly WebtoonTimeOfDayProfile[] = Object.freeze([
  {
    id: "noon-5600k",
    labelKo: "정오 슬릿 역광 (5600K)",
    kelvin: 5600,
    solarElevationDeg: 62,
    keyHex: "#faf5e6",
    bounceHex: "#d6deeb",
    darkroomDeltaE: 0.42,
    v23AssetSlug: "webtoon-zdepth-sfx-slit-creak-noon-5600k-v23",
    previewUrl: "/studio-assets/blender-zdepth-sfx-crowd-v23/thumbnails/webtoon-zdepth-sfx-slit-creak-noon-5600k-v23.png",
    glbUrl: "/studio-assets/blender-zdepth-sfx-crowd-v23/webtoon-zdepth-sfx-slit-creak-noon-5600k-v23.glb",
  },
  {
    id: "sunset-3200k",
    labelKo: "연회 노을 확산광 (3200K)",
    kelvin: 3200,
    solarElevationDeg: 14,
    keyHex: "#ffc78a",
    bounceHex: "#7c5869",
    darkroomDeltaE: 0.56,
    v23AssetSlug: "webtoon-zdepth-crowd-banquet-sunset-3200k-v23",
    previewUrl: "/studio-assets/blender-zdepth-sfx-crowd-v23/thumbnails/webtoon-zdepth-crowd-banquet-sunset-3200k-v23.png",
    glbUrl: "/studio-assets/blender-zdepth-sfx-crowd-v23/webtoon-zdepth-crowd-banquet-sunset-3200k-v23.glb",
  },
  {
    id: "moonlight-8500k",
    labelKo: "심야 각성 월광 (8500K)",
    kelvin: 8500,
    solarElevationDeg: 38,
    keyHex: "#ade0ff",
    bounceHex: "#31435e",
    darkroomDeltaE: 0.48,
    v23AssetSlug: "webtoon-zdepth-awakening-boom-moonlight-8500k-v23",
    previewUrl: "/studio-assets/blender-zdepth-sfx-crowd-v23/thumbnails/webtoon-zdepth-awakening-boom-moonlight-8500k-v23.png",
    glbUrl: "/studio-assets/blender-zdepth-sfx-crowd-v23/webtoon-zdepth-awakening-boom-moonlight-8500k-v23.glb",
  },
]);

export interface ToonLayerStackEntry {
  readonly order: number;
  readonly layerTag: string;
  readonly blendMode: "Normal" | "Screen" | "Add (Glow)" | "Multiply";
  readonly zPlaneMeters: number;
  readonly roleKo: string;
}

export interface ToonLayersManifestJson {
  readonly schema: "toonstudio.toonlayers.v23";
  readonly openRatioPct: number;
  readonly apertureFStop: number;
  readonly kelvin: number;
  readonly crowdCount: DatumCrowdPresetCount;
  readonly gutterPx: number;
  readonly layers: readonly ToonLayerStackEntry[];
}

export interface ZDepthCrowdTodCompositorInput {
  readonly openRatioPct: number;
  readonly apertureFStop: number;
  readonly foregroundCocPx: number;
  readonly timeOfDayId: WebtoonTimeOfDayId;
  readonly crowdCount: DatumCrowdPresetCount;
  readonly gutterPx: number;
  readonly baseBokehWeeklyHoursSaved: number;
  readonly foregroundBokehLayerTag: string;
}

export interface ZDepthCrowdTodCompositorEvaluation {
  readonly timeOfDay: WebtoonTimeOfDayProfile;
  readonly zDepthSfxPlaneYM: -0.34;
  readonly sfxWordLabelKo: string;
  readonly sfxBeamPierceBoostPct: number;
  readonly crowdCount: DatumCrowdPresetCount;
  readonly seatedDatumCount: number;
  readonly standingRailCount: number;
  readonly crowdBackCocPx: number;
  readonly crowdAlignmentMinutesSavedPerCut: number;
  readonly gutterPx: number;
  readonly sequenceScrollDwellSec: number;
  readonly eyeDropVelocityPxPerSec: number;
  readonly compositingWeeklyHoursSaved: number;
  readonly totalWeeklyHoursV23: number;
  readonly quarterlyHoursSavedV23: number;
  readonly quarterlyBankedEpisodesV23: number;
  readonly darkroomProofPassed: boolean;
  readonly manifest: ToonLayersManifestJson;
  readonly manifestJsonString: string;
  readonly zDepthSummaryKo: string;
  readonly scrollPacingSummaryKo: string;
  readonly exportRoiSummaryKo: string;
}

export function evaluateZDepthCrowdTodCompositor(
  input: ZDepthCrowdTodCompositorInput,
): ZDepthCrowdTodCompositorEvaluation {
  const clampedOpen = Math.min(100, Math.max(0, Math.round(input.openRatioPct)));
  const clampedGutter = Math.min(420, Math.max(120, Math.round(input.gutterPx)));
  const timeOfDay =
    WEBTOON_TIME_OF_DAY_PROFILES.find((p) => p.id === input.timeOfDayId) ??
    WEBTOON_TIME_OF_DAY_PROFILES[1]!;

  const sfxWordLabelKo =
    clampedOpen <= 25
      ? "개문 슬릿 마찰음 (끼익 · 스르륵)"
      : clampedOpen <= 75
        ? "연회 프리즘 울림음 (촤르륵 · 영롱)"
        : "각성 방사 충격음 (콰아앙 · 번쩍)";

  const sfxBeamPierceBoostPct = Math.round(28 + clampedOpen * 0.54);

  const seatedDatumCount =
    input.crowdCount === 4 ? 0 : input.crowdCount === 6 ? 4 : 9;
  const standingRailCount = input.crowdCount - seatedDatumCount;
  const crowdBackCocPx = Number(
    Math.max(4.2, (36.8 / input.apertureFStop).toFixed(1)),
  );
  const crowdAlignmentMinutesSavedPerCut =
    input.crowdCount === 4 ? 12.0 : input.crowdCount === 6 ? 16.5 : 22.0;

  // 3연속 시퀀스 세로 스크롤 여백(120~420px) · 체류시간 · 시선 낙하 속도
  const cutHeightSumPx = 3 * 1360 + 2 * clampedGutter;
  const bokehFocusHoldBonusSec = Number((input.foregroundCocPx * 0.045).toFixed(2));
  const sequenceScrollDwellSec = Number(
    (cutHeightSumPx / 680 + bokehFocusHoldBonusSec).toFixed(2),
  );
  const eyeDropVelocityPxPerSec = Math.round(cutHeightSumPx / sequenceScrollDwellSec);

  // 클립스튜디오/PSD 6패스 매니페스트 패키징으로 후반 레이어 세팅 8.5분/컷 -> 0.5분/컷 절감 (주간 주요 합성 21컷 기준 +2.8h/주)
  const compositingWeeklyHoursSaved = 2.8;
  const totalWeeklyHoursV23 = Number(
    (input.baseBokehWeeklyHoursSaved + compositingWeeklyHoursSaved).toFixed(1),
  );
  const quarterlyHoursSavedV23 = Number((totalWeeklyHoursV23 * 13).toFixed(1));
  const quarterlyBankedEpisodesV23 = Number(
    (quarterlyHoursSavedV23 / 80).toFixed(2),
  );

  const layers: readonly ToonLayerStackEntry[] = Object.freeze([
    {
      order: 1,
      layerTag: input.foregroundBokehLayerTag,
      blendMode: "Screen",
      zPlaneMeters: -0.74,
      roleKo: `전경 아웃포커싱 보케 (CoC ${input.foregroundCocPx.toFixed(1)}px)`,
    },
    {
      order: 2,
      layerTag: `FX_Mid_ZDepth_SFX_${clampedOpen}pct`,
      blendMode: "Normal",
      zPlaneMeters: -0.34,
      roleKo: `Z-심도 3D 효과음 스탬프 (${sfxWordLabelKo})`,
    },
    {
      order: 3,
      layerTag: "CHAR_IK_Socket_Guide",
      blendMode: "Normal",
      zPlaneMeters: 0.0,
      roleKo: "중경 주연 캐릭터 IK 접지 가이드 (0.18m~1.32m)",
    },
    {
      order: 4,
      layerTag: "BG_Crowd_Datum_Silhouette",
      blendMode: "Multiply",
      zPlaneMeters: 0.58,
      roleKo: `기준선 스냅 엑스트라 군중 ${input.crowdCount}인 (후경 CoC ${crowdBackCocPx.toFixed(1)}px)`,
    },
    {
      order: 5,
      layerTag: `FX_Volumetric_GodRay_${timeOfDay.kelvin}K`,
      blendMode: "Add (Glow)",
      zPlaneMeters: 0.86,
      roleKo: `${timeOfDay.kelvin}K 슬릿 볼륨 고드레이 광선`,
    },
    {
      order: 6,
      layerTag: "BG_LineArt_SharedDatum_Base",
      blendMode: "Normal",
      zPlaneMeters: 1.05,
      roleKo: "후경 건축 기준선 배경 선화·바닥 그림자 베이스",
    },
  ]);

  const manifest: ToonLayersManifestJson = Object.freeze({
    schema: "toonstudio.toonlayers.v23",
    openRatioPct: clampedOpen,
    apertureFStop: input.apertureFStop,
    kelvin: timeOfDay.kelvin,
    crowdCount: input.crowdCount,
    gutterPx: clampedGutter,
    layers,
  });

  const darkroomProofPassed = timeOfDay.darkroomDeltaE <= 0.8;

  return Object.freeze({
    timeOfDay,
    zDepthSfxPlaneYM: -0.34,
    sfxWordLabelKo,
    sfxBeamPierceBoostPct,
    crowdCount: input.crowdCount,
    seatedDatumCount,
    standingRailCount,
    crowdBackCocPx,
    crowdAlignmentMinutesSavedPerCut,
    gutterPx: clampedGutter,
    sequenceScrollDwellSec,
    eyeDropVelocityPxPerSec,
    compositingWeeklyHoursSaved,
    totalWeeklyHoursV23,
    quarterlyHoursSavedV23,
    quarterlyBankedEpisodesV23,
    darkroomProofPassed,
    manifest,
    manifestJsonString: JSON.stringify(manifest, null, 2),
    zDepthSummaryKo: `Z-심도 -0.34m (${sfxWordLabelKo} · 광선 투과 +${sfxBeamPierceBoostPct}%) · 군중 ${input.crowdCount}인(착석 ${seatedDatumCount}/난간 ${standingRailCount} · 컷당 ${crowdAlignmentMinutesSavedPerCut.toFixed(1)}분->0.0분)`,
    scrollPacingSummaryKo: `컷 간 여백 ${clampedGutter}px · 3컷 체류 ${sequenceScrollDwellSec.toFixed(2)}초 · 시선 낙하 ${eyeDropVelocityPxPerSec}px/s · ΔE ${timeOfDay.darkroomDeltaE.toFixed(2)}`,
    exportRoiSummaryKo: `.toonlayers.json 6패스(8.5분->0.5분/컷, +${compositingWeeklyHoursSaved.toFixed(1)}h/주) -> 주간 ${totalWeeklyHoursV23.toFixed(1)}h · 13주 분기 ${quarterlyHoursSavedV23.toFixed(1)}h (${quarterlyBankedEpisodesV23.toFixed(2)}회차 비축)`,
  });
}
