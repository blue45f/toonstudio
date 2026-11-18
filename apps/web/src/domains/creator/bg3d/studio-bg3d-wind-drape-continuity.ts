/**
 * V25 개구부 기류 연동 드레이프 패브릭(Wind-Coupled Drape) ·
 * 하프 미러 유리 반사창(Fresnel 8~32% Half-Mirror Glass) ·
 * 숏폼 비트 싱크 오디오 스템 큐시트(.toonaudio.json) ·
 * 회차 간 상태 연속성 원장(Continuity Ledger) ·
 * 단행본 양면 펼침면(B5/A5 · 3mm 도련 · 350dpi) 듀얼 포맷 오버스캔 솔버.
 */

export type WindDrapeFabricId = "linen-rain" | "rofan-velvet" | "tempest-silk";
export type TankobonFormatId = "B5" | "A5";

export interface WindDrapeReflectionProfile {
  readonly id: WindDrapeFabricId;
  readonly labelKo: string;
  readonly fabricStyle: "linen" | "velvet" | "silk";
  readonly v25AssetSlug: string;
  readonly previewUrl: string;
  readonly glbUrl: string;
  readonly lintelAnchorHeightM: 2.36;
}

export const WIND_DRAPE_REFLECTION_PROFILES: readonly WindDrapeReflectionProfile[] =
  Object.freeze([
    {
      id: "linen-rain",
      labelKo: "미풍 린넨 커튼·반사창 (5200K)",
      fabricStyle: "linen",
      v25AssetSlug: "webtoon-wind-drape-halfmirror-rain-15pct-v25",
      previewUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/thumbnails/webtoon-wind-drape-halfmirror-rain-15pct-v25.png",
      glbUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/webtoon-wind-drape-halfmirror-rain-15pct-v25.glb",
      lintelAnchorHeightM: 2.36,
    },
    {
      id: "rofan-velvet",
      labelKo: "돌풍 로판 벨벳 휘장·반사창 (3800K)",
      fabricStyle: "velvet",
      v25AssetSlug: "webtoon-wind-drape-rofan-velvet-65pct-v25",
      previewUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/thumbnails/webtoon-wind-drape-rofan-velvet-65pct-v25.png",
      glbUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/webtoon-wind-drape-rofan-velvet-65pct-v25.glb",
      lintelAnchorHeightM: 2.36,
    },
    {
      id: "tempest-silk",
      labelKo: "폭풍 각성 비단 휘장·수막 반사 (8600K)",
      fabricStyle: "silk",
      v25AssetSlug: "webtoon-wind-drape-tempest-cape-100pct-v25",
      previewUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/thumbnails/webtoon-wind-drape-tempest-cape-100pct-v25.png",
      glbUrl:
        "/studio-assets/blender-wind-drape-reflection-v25/webtoon-wind-drape-tempest-cape-100pct-v25.glb",
      lintelAnchorHeightM: 2.36,
    },
  ]);

export interface ToonAudioStemCue {
  readonly cueId: string;
  readonly timestampMs: number;
  readonly stemChannel: "SFX_ZDepth" | "Foley_Drape" | "Foley_WetRipple" | "Ambience_Weather";
  readonly assetCueTag: string;
  readonly gainDb: number;
}

export interface ToonAudioManifestJson {
  readonly schema: "toonstudio.toonaudio.v25";
  readonly durationMs: 6000;
  readonly sampleRateHz: 48000;
  readonly locale: "KO" | "EN" | "JA";
  readonly cues: readonly ToonAudioStemCue[];
}

export interface ContinuityLedgerSnapshot {
  readonly openRatioPct: number;
  readonly indoorWetReachM: number;
  readonly kelvin: number;
  readonly billowDeflectionM: number;
  readonly digestHex: string;
}

export interface TankobonSpreadOverscanSpec {
  readonly formatId: TankobonFormatId;
  readonly trimSpreadMm: readonly [widthMm: number, heightMm: number];
  readonly bleedMm: 3;
  readonly fullBleedSpreadMm: readonly [widthMm: number, heightMm: number];
  readonly printPixels350Dpi: readonly [widthPx: number, heightPx: number];
  readonly horizontalOverscanPct: 34.0;
  readonly safeWorldWidthM: 3.7;
  readonly extraModelingMinutes: 0;
}

export interface WindDrapeContinuityInput {
  readonly openRatioPct: number;
  readonly fabricId: WindDrapeFabricId;
  readonly fresnelOverridePct?: number;
  readonly indoorWetReachM: number;
  readonly indoorRippleCount: number;
  readonly kelvin: number;
  readonly locale: "KO" | "EN" | "JA";
  readonly onomatopoeiaText: string;
  readonly lockedLedger: ContinuityLedgerSnapshot | null;
  readonly tankobonFormatId: TankobonFormatId;
  readonly baseV24WeeklyHoursSaved: number;
}

export interface WindDrapeContinuityEvaluation {
  readonly profile: WindDrapeReflectionProfile;
  readonly windSpeedMs: number;
  readonly billowDeflectionM: number;
  readonly fresnelReflectPct: number;
  readonly windowMaskingMinutesSavedPerCut: number;
  readonly currentSnapshot: ContinuityLedgerSnapshot;
  readonly continuityCompliant: boolean;
  readonly continuityStatusKo: string;
  readonly tankobonSpec: TankobonSpreadOverscanSpec;
  readonly audioMixingWeeklyHoursSaved: number;
  readonly totalWeeklyHoursV25: number;
  readonly quarterlyHoursSavedV25: number;
  readonly quarterlyBankedEpisodesV25: number;
  readonly audioManifest: ToonAudioManifestJson;
  readonly audioManifestJsonString: string;
  readonly drapeMirrorSummaryKo: string;
  readonly overscanSummaryKo: string;
  readonly audioRoiSummaryKo: string;
}

function computeLedgerDigestHex(
  openRatioPct: number,
  indoorWetReachM: number,
  kelvin: number,
  billowDeflectionM: number,
): string {
  const raw = `${openRatioPct}|${indoorWetReachM.toFixed(2)}|${kelvin}|${billowDeflectionM.toFixed(2)}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createContinuityLedgerSnapshot(
  openRatioPct: number,
  indoorWetReachM: number,
  kelvin: number,
): ContinuityLedgerSnapshot {
  const clamped = Math.min(100, Math.max(0, Math.round(openRatioPct)));
  const billowDeflectionM = Number((0.08 + 0.7 * (clamped / 100)).toFixed(2));
  return Object.freeze({
    openRatioPct: clamped,
    indoorWetReachM,
    kelvin,
    billowDeflectionM,
    digestHex: computeLedgerDigestHex(clamped, indoorWetReachM, kelvin, billowDeflectionM),
  });
}

export function evaluateWindDrapeAndContinuity(
  input: WindDrapeContinuityInput,
): WindDrapeContinuityEvaluation {
  const clampedOpen = Math.min(100, Math.max(0, Math.round(input.openRatioPct)));
  const ratio = clampedOpen / 100;
  const profile =
    WIND_DRAPE_REFLECTION_PROFILES.find((p) => p.id === input.fabricId) ??
    WIND_DRAPE_REFLECTION_PROFILES[1]!;

  const windSpeedMs = Number((1.0 + 7.8 * ratio).toFixed(1));
  const billowDeflectionM = Number((0.08 + 0.7 * ratio).toFixed(2));
  const defaultFresnel = Number((32.0 - 20.0 * ratio).toFixed(1));
  const fresnelReflectPct =
    input.fresnelOverridePct !== undefined
      ? Math.min(32, Math.max(8, Number(input.fresnelOverridePct.toFixed(1))))
      : defaultFresnel;
  const windowMaskingMinutesSavedPerCut = 19.0;

  const currentSnapshot: ContinuityLedgerSnapshot = Object.freeze({
    openRatioPct: clampedOpen,
    indoorWetReachM: input.indoorWetReachM,
    kelvin: input.kelvin,
    billowDeflectionM,
    digestHex: computeLedgerDigestHex(
      clampedOpen,
      input.indoorWetReachM,
      input.kelvin,
      billowDeflectionM,
    ),
  });

  const continuityCompliant =
    input.lockedLedger === null ||
    input.lockedLedger.digestHex === currentSnapshot.digestHex;

  const continuityStatusKo =
    input.lockedLedger === null
      ? `연속성 원장 대기 (#${currentSnapshot.digestHex})`
      : continuityCompliant
        ? `연속성 일치 (#${currentSnapshot.digestHex} · 옥에 티 0건)`
        : `연속성 이탈 감지 (직전 #${input.lockedLedger.digestHex} ≠ 현재 #${currentSnapshot.digestHex})`;

  const tankobonSpec: TankobonSpreadOverscanSpec =
    input.tankobonFormatId === "B5"
      ? Object.freeze<TankobonSpreadOverscanSpec>({
          formatId: "B5",
          trimSpreadMm: [364, 257],
          bleedMm: 3,
          fullBleedSpreadMm: [370, 263],
          printPixels350Dpi: [5098, 3624],
          horizontalOverscanPct: 34.0,
          safeWorldWidthM: 3.7,
          extraModelingMinutes: 0,
        })
      : Object.freeze<TankobonSpreadOverscanSpec>({
          formatId: "A5",
          trimSpreadMm: [296, 210],
          bleedMm: 3,
          fullBleedSpreadMm: [302, 216],
          printPixels350Dpi: [4161, 2976],
          horizontalOverscanPct: 34.0,
          safeWorldWidthM: 3.7,
          extraModelingMinutes: 0,
        });

  const cues: readonly ToonAudioStemCue[] = Object.freeze([
    {
      cueId: "cue-01-portal-sfx",
      timestampMs: 0,
      stemChannel: "SFX_ZDepth",
      assetCueTag: `${input.locale}:${input.onomatopoeiaText}`,
      gainDb: -3.0,
    },
    {
      cueId: "cue-02-drape-billow",
      timestampMs: 1850,
      stemChannel: "Foley_Drape",
      assetCueTag: `drape_${profile.fabricStyle}_${windSpeedMs}ms`,
      gainDb: -6.5,
    },
    {
      cueId: "cue-03-wet-ripples",
      timestampMs: 4100,
      stemChannel: "Foley_WetRipple",
      assetCueTag: `ripples_${input.indoorRippleCount}rings_${input.indoorWetReachM}m`,
      gainDb: -5.0,
    },
    {
      cueId: "cue-04-weather-bed",
      timestampMs: 0,
      stemChannel: "Ambience_Weather",
      assetCueTag: `ambience_${input.kelvin}K_bed`,
      gainDb: -11.0,
    },
  ]);

  const audioManifest: ToonAudioManifestJson = Object.freeze({
    schema: "toonstudio.toonaudio.v25",
    durationMs: 6000,
    sampleRateHz: 48000,
    locale: input.locale,
    cues,
  });

  // 주간 숏폼 사운드 스템 믹싱 95분/편 -> 5분/편 (-90분 = +1.5h/주)
  const audioMixingWeeklyHoursSaved = 1.5;
  const totalWeeklyHoursV25 = Number(
    (input.baseV24WeeklyHoursSaved + audioMixingWeeklyHoursSaved).toFixed(1),
  );
  const quarterlyHoursSavedV25 = Number((totalWeeklyHoursV25 * 13).toFixed(1));
  const quarterlyBankedEpisodesV25 = Number(
    (quarterlyHoursSavedV25 / 80).toFixed(2),
  );

  return Object.freeze({
    profile,
    windSpeedMs,
    billowDeflectionM,
    fresnelReflectPct,
    windowMaskingMinutesSavedPerCut,
    currentSnapshot,
    continuityCompliant,
    continuityStatusKo,
    tankobonSpec,
    audioMixingWeeklyHoursSaved,
    totalWeeklyHoursV25,
    quarterlyHoursSavedV25,
    quarterlyBankedEpisodesV25,
    audioManifest,
    audioManifestJsonString: JSON.stringify(audioManifest, null, 2),
    drapeMirrorSummaryKo: `풍속 ${windSpeedMs.toFixed(1)}m/s · 커튼 펄럭임 ${billowDeflectionM.toFixed(2)}m · 하프 미러 Fresnel ${fresnelReflectPct.toFixed(1)}%(창가 마스킹 ${windowMaskingMinutesSavedPerCut.toFixed(0)}분->0분)`,
    overscanSummaryKo: `${tankobonSpec.formatId} 펼침면 ${tankobonSpec.fullBleedSpreadMm[0]}×${tankobonSpec.fullBleedSpreadMm[1]}mm(3mm 도련 · ${tankobonSpec.printPixels350Dpi[0]}×${tankobonSpec.printPixels350Dpi[1]}px @350dpi · 수평 +${tankobonSpec.horizontalOverscanPct}% · 추가 모델링 0분)`,
    audioRoiSummaryKo: `.toonaudio.json 4스템(95분->5분/편, +${audioMixingWeeklyHoursSaved.toFixed(1)}h/주) -> 주간 ${totalWeeklyHoursV25.toFixed(1)}h · 13주 분기 ${quarterlyHoursSavedV25.toFixed(1)}h (${quarterlyBankedEpisodesV25.toFixed(2)}회차 비축)`,
  });
}
