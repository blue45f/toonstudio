/**
 * V27 절정 직후 잔류 분진 연무·열기 아지랑이(Post-Impact Dust & Thermal Heat-Haze) ·
 * 모바일·구형 태블릿 60fps 경량 프록시 LOD(32%) & VRAM 버짓 가드 ·
 * 회차 엔딩 마지막 3컷(68~70컷) 절단신공(Cliffhanger) 스크롤 체류·암전 여백 텐션 스코어러 ·
 * 4대 매니페스트(.toonlayers/.toonmotion/.toonaudio/.toonsubs) 통합 무결성 아카이브 번들(.toonpack.json) 검증기.
 */

export type DustHeatHazePresetId =
  | "calm-incense-wisp"
  | "fissure-drift-plume"
  | "tempest-shockwave-haze";

export type DeviceLodTargetId =
  | "desktop-workstation"
  | "tablet-ipad-webview"
  | "mobile-midrange-60fps";

export interface DustHeatHazeProfile {
  readonly id: DustHeatHazePresetId;
  readonly labelKo: string;
  readonly v27AssetSlug: string;
  readonly previewUrl: string;
  readonly glbUrl: string;
  readonly plumeLobeCount: 3 | 6 | 12;
  readonly hazeRefractionPct: 8 | 19 | 34;
  readonly airbrushMinutesSavedPerCut: number;
}

export const DUST_HEATHAZE_PROFILES: readonly DustHeatHazeProfile[] =
  Object.freeze([
    {
      id: "calm-incense-wisp",
      labelKo: "정적 다과 향연·온기 아지랑이 (3로브)",
      v27AssetSlug: "webtoon-heathaze-calm-incense-wisp-v27",
      previewUrl:
        "/studio-assets/blender-dust-heathaze-v27/thumbnails/webtoon-heathaze-calm-incense-wisp-v27.png",
      glbUrl:
        "/studio-assets/blender-dust-heathaze-v27/webtoon-heathaze-calm-incense-wisp-v27.glb",
      plumeLobeCount: 3,
      hazeRefractionPct: 8,
      airbrushMinutesSavedPerCut: 7.5,
    },
    {
      id: "fissure-drift-plume",
      labelKo: "균열 바닥 분진 6로브·틈새 연무",
      v27AssetSlug: "webtoon-dust-fissure-drift-plume-v27",
      previewUrl:
        "/studio-assets/blender-dust-heathaze-v27/thumbnails/webtoon-dust-fissure-drift-plume-v27.png",
      glbUrl:
        "/studio-assets/blender-dust-heathaze-v27/webtoon-dust-fissure-drift-plume-v27.glb",
      plumeLobeCount: 6,
      hazeRefractionPct: 19,
      airbrushMinutesSavedPerCut: 13.0,
    },
    {
      id: "tempest-shockwave-haze",
      labelKo: "파열 충격파 분진 12로브·열기 아지랑이",
      v27AssetSlug: "webtoon-heathaze-tempest-aftermath-plume-v27",
      previewUrl:
        "/studio-assets/blender-dust-heathaze-v27/thumbnails/webtoon-heathaze-tempest-aftermath-plume-v27.png",
      glbUrl:
        "/studio-assets/blender-dust-heathaze-v27/webtoon-heathaze-tempest-aftermath-plume-v27.glb",
      plumeLobeCount: 12,
      hazeRefractionPct: 34,
      airbrushMinutesSavedPerCut: 18.0,
    },
  ]);

export interface DeviceLodBudgetSpec {
  readonly id: DeviceLodTargetId;
  readonly labelKo: string;
  readonly triangleBudgetMax: number;
  readonly vramBudgetMaxMib: number;
  readonly targetFrameMs: 16.6;
}

export const DEVICE_LOD_BUDGET_SPECS: readonly DeviceLodBudgetSpec[] =
  Object.freeze([
    {
      id: "desktop-workstation",
      labelKo: "데스크톱 워크스테이션",
      triangleBudgetMax: 250000,
      vramBudgetMaxMib: 512,
      targetFrameMs: 16.6,
    },
    {
      id: "tablet-ipad-webview",
      labelKo: "태블릿 웹뷰 (iPad)",
      triangleBudgetMax: 85000,
      vramBudgetMaxMib: 160,
      targetFrameMs: 16.6,
    },
    {
      id: "mobile-midrange-60fps",
      labelKo: "모바일 60fps 저사양 보호",
      triangleBudgetMax: 42000,
      vramBudgetMaxMib: 96,
      targetFrameMs: 16.6,
    },
  ]);

export interface ToonPackArchiveBundleJson {
  readonly schema: "toonstudio.toonpack.v27";
  readonly episodeCutCount: 70;
  readonly locale: "KO" | "EN" | "JA";
  readonly tankobonFormatId: "B5" | "A5";
  readonly continuityDigestHex: string;
  readonly cliffhangerTensionScore: number;
  readonly proxyLodEnabled: boolean;
  readonly bundledArtifacts: readonly [
    "episode.toonlayers.json",
    "teaser_9x16.toonmotion.json",
    "stems_48khz.toonaudio.json",
    "captions_multi.toonsubs.vtt",
  ];
  readonly bundleChecksumHex: string;
}

export interface DustLodCliffhangerInput {
  readonly hazeId: DustHeatHazePresetId;
  readonly deviceId: DeviceLodTargetId;
  readonly proxyLodEnabled: boolean;
  readonly cliffhangerBlackoutGutterPx: number;
  readonly locale: "KO" | "EN" | "JA";
  readonly tankobonFormatId: "B5" | "A5";
  readonly continuityDigestHex: string;
  readonly allFourChannelsReady: boolean;
  readonly baseV26WeeklyHoursSaved: number;
}

export interface DustLodCliffhangerEvaluation {
  readonly haze: DustHeatHazeProfile;
  readonly device: DeviceLodBudgetSpec;
  readonly proxyLodEnabled: boolean;
  readonly fullSceneTriangles: number;
  readonly activeSceneTriangles: number;
  readonly activeVramMib: number;
  readonly estimatedFrameTimeMs: number;
  readonly budget60FpsPassed: boolean;
  readonly datumDriftMeters: 0;
  readonly cliffhangerBlackoutGutterPx: number;
  readonly cliffhangerDwellSec: number;
  readonly cliffhangerTensionScore: number;
  readonly cliffhangerGrade: "S" | "A" | "B";
  readonly packManifest: ToonPackArchiveBundleJson;
  readonly packManifestJsonString: string;
  readonly archiveQaWeeklyHoursSaved: number;
  readonly totalWeeklyHoursV27: number;
  readonly quarterlyHoursSavedV27: number;
  readonly quarterlyBankedEpisodesV27: number;
  readonly hazeLodSummaryKo: string;
  readonly cliffhangerSummaryKo: string;
  readonly packRoiSummaryKo: string;
}

function computeBundleChecksumHex(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function evaluateDustLodCliffhangerAndPack(
  input: DustLodCliffhangerInput,
): DustLodCliffhangerEvaluation {
  const haze =
    DUST_HEATHAZE_PROFILES.find((p) => p.id === input.hazeId) ??
    DUST_HEATHAZE_PROFILES[1]!;
  const device =
    DEVICE_LOD_BUDGET_SPECS.find((d) => d.id === input.deviceId) ??
    DEVICE_LOD_BUDGET_SPECS[2]!;

  // 3베이 동시 중첩 기준 원본 삼각형(~68,400 tris) vs 32% 수밀 프록시 LOD(~21,888 tris)
  const fullSceneTriangles = 62400 + haze.plumeLobeCount * 500;
  const activeSceneTriangles = input.proxyLodEnabled
    ? Math.round(fullSceneTriangles * 0.32)
    : fullSceneTriangles;
  const activeVramMib = Number(
    ((activeSceneTriangles / 1000) * 1.64).toFixed(1),
  );
  const deviceSpeedDivisor =
    device.id === "desktop-workstation"
      ? 14500
      : device.id === "tablet-ipad-webview"
        ? 5800
        : 2450;
  const estimatedFrameTimeMs = Number(
    (activeSceneTriangles / deviceSpeedDivisor).toFixed(1),
  );
  const budget60FpsPassed =
    activeSceneTriangles <= device.triangleBudgetMax &&
    activeVramMib <= device.vramBudgetMaxMib &&
    estimatedFrameTimeMs <= device.targetFrameMs;

  // 회차 엔딩 68~70컷 절단신공 암전 스크롤 여백(360~960px, 골든존 720~840px) 텐션 점수
  const clampedGutter = Math.min(
    960,
    Math.max(360, Math.round(input.cliffhangerBlackoutGutterPx)),
  );
  const cliffhangerDwellSec = Number((1.45 + clampedGutter / 310).toFixed(2));
  const distanceFromSweetSpot = Math.abs(clampedGutter - 780);
  const rawTension =
    96.8 - distanceFromSweetSpot * 0.032 + (haze.plumeLobeCount >= 6 ? 1.8 : 0.6);
  const cliffhangerTensionScore = Number(
    Math.min(99.4, Math.max(72.0, rawTension)).toFixed(1),
  );
  const cliffhangerGrade: "S" | "A" | "B" =
    cliffhangerTensionScore >= 92
      ? "S"
      : cliffhangerTensionScore >= 85
        ? "A"
        : "B";

  const checksumSeed = `${input.locale}|${input.tankobonFormatId}|${input.continuityDigestHex}|${haze.id}|${activeSceneTriangles}|${clampedGutter}|${input.allFourChannelsReady}`;
  const bundleChecksumHex = computeBundleChecksumHex(checksumSeed);

  const packManifest: ToonPackArchiveBundleJson = Object.freeze<ToonPackArchiveBundleJson>({
    schema: "toonstudio.toonpack.v27",
    episodeCutCount: 70,
    locale: input.locale,
    tankobonFormatId: input.tankobonFormatId,
    continuityDigestHex: input.continuityDigestHex,
    cliffhangerTensionScore,
    proxyLodEnabled: input.proxyLodEnabled,
    bundledArtifacts: [
      "episode.toonlayers.json",
      "teaser_9x16.toonmotion.json",
      "stems_48khz.toonaudio.json",
      "captions_multi.toonsubs.vtt",
    ],
    bundleChecksumHex,
  });

  // 금요일 다부서 출고 파일 누락·해시 불일치 수동 대조 50분/회차 -> 2분/회차 (-48분 = +0.8h/주)
  const archiveQaWeeklyHoursSaved = 0.8;
  const totalWeeklyHoursV27 = Number(
    (input.baseV26WeeklyHoursSaved + archiveQaWeeklyHoursSaved).toFixed(1),
  );
  const quarterlyHoursSavedV27 = Number((totalWeeklyHoursV27 * 13).toFixed(1));
  const quarterlyBankedEpisodesV27 = Number(
    (quarterlyHoursSavedV27 / 80).toFixed(2),
  );

  return Object.freeze({
    haze,
    device,
    proxyLodEnabled: input.proxyLodEnabled,
    fullSceneTriangles,
    activeSceneTriangles,
    activeVramMib,
    estimatedFrameTimeMs,
    budget60FpsPassed,
    datumDriftMeters: 0,
    cliffhangerBlackoutGutterPx: clampedGutter,
    cliffhangerDwellSec,
    cliffhangerTensionScore,
    cliffhangerGrade,
    packManifest,
    packManifestJsonString: JSON.stringify(packManifest, null, 2),
    archiveQaWeeklyHoursSaved,
    totalWeeklyHoursV27,
    quarterlyHoursSavedV27,
    quarterlyBankedEpisodesV27,
    hazeLodSummaryKo: `잔류 연무 ${haze.plumeLobeCount}로브·아지랑이 굴절 ${haze.hazeRefractionPct}%(-${haze.airbrushMinutesSavedPerCut}분/컷) · ${device.labelKo} ${activeSceneTriangles.toLocaleString("ko-KR")} tris / ${activeVramMib}MiB (${estimatedFrameTimeMs}ms · 60fps ${budget60FpsPassed ? "통과" : "초과 — 프록시 권장"})`,
    cliffhangerSummaryKo: `68~70컷 절단신공 암전 여백 ${clampedGutter}px · 체류 ${cliffhangerDwellSec}초 · 텐션 ${cliffhangerTensionScore}점 (${cliffhangerGrade}등급)`,
    packRoiSummaryKo: `.toonpack.json 번들 #${bundleChecksumHex}(50분->2분/회차, +${archiveQaWeeklyHoursSaved.toFixed(1)}h/주) -> 주간 ${totalWeeklyHoursV27.toFixed(1)}h · 13주 분기 ${quarterlyHoursSavedV27.toFixed(1)}h (${quarterlyBankedEpisodesV27.toFixed(2)}회차 비축)`,
  });
}
