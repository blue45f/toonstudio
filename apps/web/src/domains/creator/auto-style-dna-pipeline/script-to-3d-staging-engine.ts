/**
 * 한국어/영어 웹툰 대본 → 3D 배경 프리셋 · 소품 배치 좌표 · 조명 색온도 · 카메라 화각(24~85mm)
 * 자동 스테이징 블루프린트 생성 엔진.
 *
 * 오른손 미터 좌표계(`1.0 = 1m`, 바닥 `Y = 0`)를 기준으로 소품·인물 원형 풋프린트 충돌 해소를 수행한다.
 */

import {
  DYNAMIC_PROP_RULES,
  EMOTION_KEYWORDS,
  LOCATION_PRESETS,
  TIME_KEYWORDS,
  type Background3dPresetSpec,
  type CameraShotScale,
  type PropPlacementCategory,
  type StagingEmotionMood,
  type StagingLocationId,
  type StagingTimeOfDay,
} from "./script-to-3d-staging-catalog";

export {
  DEMO_WEBTOON_SCRIPTS,
  LOCATION_PRESETS,
  type Background3dPresetSpec,
  type CameraShotScale,
  type DemoWebtoonScriptPreset,
  type PropPlacementCategory,
  type StagingEmotionMood,
  type StagingLocationId,
  type StagingTimeOfDay,
} from "./script-to-3d-staging-catalog";

export interface ParsedScriptScene {
  readonly sceneIndex: number;
  readonly sceneCode: string;
  readonly language: "ko" | "en" | "mixed";
  readonly rawText: string;
  readonly location: StagingLocationId;
  readonly locationConfidence: number;
  readonly timeOfDay: StagingTimeOfDay;
  readonly emotion: StagingEmotionMood;
  readonly characterCount: number;
  readonly detectedCharacters: readonly string[];
  readonly mentionedPropKeys: readonly string[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface StagedPropPlacement {
  readonly propId: string;
  readonly assetKey: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly category: PropPlacementCategory;
  readonly source: "preset-essential" | "script-triggered";
  readonly position: readonly [number, number, number];
  readonly rotationYDeg: number;
  readonly scale: readonly [number, number, number];
  readonly footprintRadiusM: number;
  readonly groundedOnSurface: "floor" | "tabletop";
}

export interface CharacterBlockingSpot {
  readonly slotIndex: number;
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly facingYawDeg: number;
  readonly footprintRadiusM: number;
  readonly postureHintKo: string;
  readonly postureHintEn: string;
}

export interface SceneLightingBlueprint {
  readonly timeOfDay: StagingTimeOfDay;
  readonly keyLightKelvin: number;
  readonly fillLightKelvin: number;
  readonly rimLightKelvin: number;
  readonly keyIntensity: number;
  readonly fillRatio: number;
  readonly rimIntensity: number;
  readonly keyAzimuthDeg: number;
  readonly keyElevationDeg: number;
  readonly shadowSoftness: number;
  readonly fogDensity: number;
  readonly ambientOklch: string;
}

export interface CameraStagingBlueprint {
  readonly focalLengthMm: number;
  readonly verticalFovDeg: number;
  readonly horizontalFovDeg: number;
  readonly shotScale: CameraShotScale;
  readonly cameraPosition: readonly [number, number, number];
  readonly lookAtTarget: readonly [number, number, number];
  readonly pitchDeg: number;
  readonly dutchRollDeg: number;
  readonly depthOfFieldFStop: number;
  readonly framingNoteKo: string;
  readonly framingNoteEn: string;
}

export interface StagingSpatialValidation {
  readonly overlapCount: number;
  readonly allPropsGrounded: boolean;
  readonly focalLengthInRange: boolean;
  readonly characterClearanceOk: boolean;
}

export interface Scene3dStagingBlueprint {
  readonly parsed: ParsedScriptScene;
  readonly backgroundPreset: Background3dPresetSpec;
  readonly props: readonly StagedPropPlacement[];
  readonly characters: readonly CharacterBlockingSpot[];
  readonly lighting: SceneLightingBlueprint;
  readonly camera: CameraStagingBlueprint;
  readonly validation: StagingSpatialValidation;
}

export interface Episode3dStagingPlan {
  readonly totalScenes: number;
  readonly blueprints: readonly Scene3dStagingBlueprint[];
  readonly uniquePresetIds: readonly string[];
  readonly continuityNoteKo: string;
  readonly continuityNoteEn: string;
}

const MIN_FOCAL_MM = 24;
const MAX_FOCAL_MM = 85;
const FULL_FRAME_HEIGHT_MM = 24;
const FULL_FRAME_WIDTH_MM = 36;

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const round2 = (value: number): number => Math.round(value * 100) / 100;

function detectScriptLanguage(text: string): "ko" | "en" | "mixed" {
  const koCount = (text.match(/[가-힣]/g) ?? []).length;
  const enCount = (text.match(/[A-Za-z]/g) ?? []).length;
  if (koCount > 0 && enCount > 12) return "mixed";
  return koCount >= enCount ? "ko" : "en";
}

function scoreKeywordTable<K extends string>(
  lowerText: string,
  table: Readonly<Record<K, readonly string[]>>,
  fallback: K,
): { readonly bestKey: K; readonly bestScore: number } {
  let bestKey = fallback;
  let bestScore = 0;
  for (const key of Object.keys(table) as K[]) {
    let score = 0;
    for (const term of table[key]) {
      if (lowerText.includes(term.toLowerCase())) score += term.length >= 4 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return { bestKey, bestScore };
}

function extractCharactersFromScene(sceneText: string): { readonly count: number; readonly names: readonly string[] } {
  const names = new Set<string>();
  for (const rawLine of sceneText.split(/\r?\n/)) {
    const match = /^([가-힣A-Za-z0-9_]{1,14})\s*[:：]\s*(.+)$/.exec(rawLine.trim());
    const speaker = match?.[1]?.trim() ?? "";
    if (
      speaker.length > 0 &&
      !["scene", "s", "cut", "int", "ext", "장소", "시간", "배경", "씬", "컷"].includes(speaker.toLowerCase())
    ) {
      names.add(speaker);
    }
  }

  const lower = sceneText.toLowerCase();
  let explicitCount = 0;
  if (/(\b4\s*(people|characters|guards)|네\s*명|4명|군중|crowd|squad)/.test(lower)) explicitCount = 4;
  else if (/(\bthree\b|\b3\s*(people|characters|friends|agents)|세\s*명|3명|셋이)/.test(lower)) explicitCount = 3;
  else if (/(\btwo\b|\bboth\b|\b2\s*(people|characters|friends)|두\s*사람|두\s*명|2명|둘이|마주\s*서|마주\s*앉|대치)/.test(lower)) explicitCount = 2;
  else if (/(\balone\b|\bsolo\b|혼자|홀로|단독|주인공)/.test(lower)) explicitCount = 1;

  const finalCount = clamp(Math.max(names.size, explicitCount, 1), 1, 5);
  const list = Array.from(names);
  while (list.length < finalCount) list.push(`캐릭터 ${list.length + 1}`);
  return { count: finalCount, names: list.slice(0, finalCount) };
}

function parseSingleSceneBlock(sceneIndex: number, sceneCode: string, chunk: string): ParsedScriptScene {
  const lower = chunk.toLowerCase();
  const locationKeywords: Record<StagingLocationId, readonly string[]> = {
    rooftop: LOCATION_PRESETS.rooftop.keywords,
    classroom: LOCATION_PRESETS.classroom.keywords,
    cafe: LOCATION_PRESETS.cafe.keywords,
    alley_night: LOCATION_PRESETS.alley_night.keywords,
    office: LOCATION_PRESETS.office.keywords,
    bedroom: LOCATION_PRESETS.bedroom.keywords,
    subway_station: LOCATION_PRESETS.subway_station.keywords,
    fantasy_throne: LOCATION_PRESETS.fantasy_throne.keywords,
    hospital_corridor: LOCATION_PRESETS.hospital_corridor.keywords,
    park_street: LOCATION_PRESETS.park_street.keywords,
  };

  const locHit = scoreKeywordTable<StagingLocationId>(lower, locationKeywords, "cafe");
  const timeHit = scoreKeywordTable<StagingTimeOfDay>(lower, TIME_KEYWORDS, locHit.bestKey === "alley_night" ? "night" : "sunset");
  const emotionHit = scoreKeywordTable<StagingEmotionMood>(lower, EMOTION_KEYWORDS, "calm_daily");
  const characters = extractCharactersFromScene(chunk);
  const mentionedPropKeys = DYNAMIC_PROP_RULES
    .filter((rule) => rule.keywords.some((kw) => lower.includes(kw.toLowerCase())))
    .map((rule) => rule.key);

  const preset = LOCATION_PRESETS[locHit.bestKey].spec;
  return {
    sceneIndex,
    sceneCode,
    language: detectScriptLanguage(chunk),
    rawText: chunk,
    location: locHit.bestKey,
    locationConfidence: round2(clamp(locHit.bestScore > 0 ? 0.65 + locHit.bestScore * 0.08 : 0.45, 0.4, 0.99)),
    timeOfDay: timeHit.bestKey,
    emotion: emotionHit.bestKey,
    characterCount: characters.count,
    detectedCharacters: characters.names,
    mentionedPropKeys,
    summaryKo: `${sceneCode} · ${preset.labelKo} · ${timeHit.bestKey} · ${emotionHit.bestKey} (${characters.count}인)`,
    summaryEn: `${sceneCode} · ${preset.labelEn} · ${timeHit.bestKey} · ${emotionHit.bestKey} (${characters.count} actor${characters.count > 1 ? "s" : ""})`,
  };
}

/** 한국어/영어 웹툰 대본을 씬 단위로 파싱해 장소·시간대·감정·인물 수·소품 단서를 추출한다. */
export function parseWebtoonScript(scriptText: string): readonly ParsedScriptScene[] {
  const normalized = scriptText.trim();
  if (!normalized) {
    return [parseSingleSceneBlock(0, "S#1", "카페에서 두 사람이 노을빛 창가에 앉아 대화를 나눈다.")];
  }
  const chunks = normalized
    .split(/(?=(?:^|\n)\s*(?:\[?\s*S#\d+\s*\]?|Scene\s+\d+[:.]?|씬\s*\d+[:.]?))/gi)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  const safeChunks = chunks.length > 0 ? chunks : [normalized];
  return safeChunks.map((chunk, idx) => {
    const m = /^(?:\[?\s*(S#\d+)\s*\]?|(Scene\s+\d+)|(씬\s*\d+))/i.exec(chunk);
    return parseSingleSceneBlock(idx, (m?.[1] ?? m?.[2] ?? m?.[3] ?? `S#${idx + 1}`).trim(), chunk);
  });
}

function buildLightingBlueprint(timeOfDay: StagingTimeOfDay, emotion: StagingEmotionMood, indoor: boolean): SceneLightingBlueprint {
  const table: Readonly<Record<StagingTimeOfDay, readonly [number, number, number, number, number, number, number, number, number, string]>> = {
    dawn: [4100, 7600, 3600, 1.35, 0.42, 0.75, 14, 0.55, 0.028, "oklch(0.62 0.065 255)"],
    morning: [5400, 6800, 5200, 1.85, 0.5, 0.55, 32, 0.42, 0.012, "oklch(0.82 0.032 230)"],
    noon: [5800, 6500, 5600, 2.15, 0.52, 0.45, 64, 0.28, 0.006, "oklch(0.88 0.018 220)"],
    sunset: [3100, 6400, 2700, 1.75, 0.36, 1.15, 16, 0.46, 0.022, "oklch(0.68 0.095 45)"],
    night: [7800, 4200, 8600, 1.15, 0.24, 1.35, 28, 0.32, 0.034, "oklch(0.32 0.072 262)"],
    rainy_overcast: [7100, 7800, 6600, 1.25, 0.58, 0.65, 44, 0.78, 0.045, "oklch(0.56 0.042 242)"],
  };
  const [baseKeyK, fillK, rimK, keyI, baseFillR, baseRimI, elev, soft, fog, ambientOklch] = table[timeOfDay];
  let keyK = indoor && timeOfDay === "night" ? 3600 : baseKeyK;
  let fillRatio = baseFillR;
  let rimIntensity = baseRimI;
  let keyAzimuthDeg = 38;

  if (emotion === "tension" || emotion === "mystery") {
    fillRatio = Math.max(0.16, fillRatio - 0.14);
    rimIntensity = Math.min(1.85, rimIntensity + 0.35);
    keyAzimuthDeg = 68;
  } else if (emotion === "romance") {
    keyK = Math.max(2700, keyK - 450);
    fillRatio = Math.min(0.68, fillRatio + 0.1);
    rimIntensity = Math.min(1.6, rimIntensity + 0.25);
    keyAzimuthDeg = -32;
  } else if (emotion === "action") {
    rimIntensity = Math.min(1.9, rimIntensity + 0.4);
    keyAzimuthDeg = 52;
  }

  return {
    timeOfDay,
    keyLightKelvin: Math.round(clamp(keyK, 2400, 9500)),
    fillLightKelvin: Math.round(clamp(fillK, 2800, 9500)),
    rimLightKelvin: Math.round(clamp(rimK, 2400, 9800)),
    keyIntensity: round2(keyI),
    fillRatio: round2(fillRatio),
    rimIntensity: round2(rimIntensity),
    keyAzimuthDeg,
    keyElevationDeg: elev,
    shadowSoftness: round2(soft),
    fogDensity: round2(indoor ? fog * 0.35 : fog),
    ambientOklch,
  };
}

function buildCharacterBlocking(parsed: ParsedScriptScene): readonly CharacterBlockingSpot[] {
  const count = parsed.characterCount;
  const isConfrontation = parsed.emotion === "tension" || parsed.emotion === "action";
  const isIntimate = parsed.emotion === "romance";
  const coords: readonly (readonly [number, number, number])[] =
    count === 1
      ? [[0, 0, 0.45]]
      : count === 2
        ? isConfrontation
          ? [[-1.35, 0, 0.3], [1.35, 0, -0.1]]
          : isIntimate
            ? [[-0.62, 0, 0.35], [0.62, 0, 0.35]]
            : [[-0.95, 0, 0.4], [0.95, 0, 0.2]]
        : count === 3
          ? [[-1.35, 0, 0.45], [0, 0, -0.35], [1.35, 0, 0.45]]
          : [[-1.65, 0, 0.6], [-0.55, 0, -0.4], [0.55, 0, -0.4], [1.65, 0, 0.6], [0, 0, 1.2]];

  return Array.from({ length: count }, (_, i) => {
    const pos = coords[i] ?? [i * 1.1 - 1.1, 0, 0.4];
    return {
      slotIndex: i,
      name: parsed.detectedCharacters[i] ?? `캐릭터 ${i + 1}`,
      position: [round2(pos[0]), 0, round2(pos[2])] as const,
      facingYawDeg: count === 2 ? (i === 0 ? 78 : -78) : i % 2 === 0 ? 18 : -18,
      footprintRadiusM: 0.42,
      postureHintKo: isConfrontation ? "대치 스탠스 · 중심 전방" : isIntimate ? "시선 교차 · 상반신 근접" : "자연 대화 스탠스",
      postureHintEn: isConfrontation ? "Confrontation stance" : isIntimate ? "Close gaze alignment" : "Natural dialogue stance",
    };
  });
}

function buildCameraBlueprint(parsed: ParsedScriptScene, characters: readonly CharacterBlockingSpot[]): CameraStagingBlueprint {
  let focalMm = 45;
  let shotScale: CameraShotScale = "medium";
  let cameraPos: readonly [number, number, number] = [0.25, 1.48, 3.8];
  let pitchDeg = -2;
  let dutchRollDeg = 0;
  let fStop = 2.8;
  let noteKo = "표준 45mm 미디엄 샷 · 인물과 공간 균형";
  let noteEn = "Standard 45mm medium shot balancing actors and environment";

  if (parsed.emotion === "action") {
    focalMm = 26; shotScale = "wide"; cameraPos = [-0.8, 1.05, 4.4]; pitchDeg = 8; dutchRollDeg = 6; fStop = 4.0;
    noteKo = "26mm 광각 로우앵글 + 미세 더치 틸트 · 공간감과 역동성 극대화";
    noteEn = "26mm wide low-angle with subtle Dutch roll for kinetic impact";
  } else if (parsed.emotion === "romance") {
    focalMm = parsed.characterCount <= 2 ? 80 : 65; shotScale = "medium-close"; cameraPos = [0.45, 1.52, 2.9]; pitchDeg = 0; fStop = 1.8;
    noteKo = `${focalMm}mm 망원 압축 · 배경 보케와 시선 감정선 집중`;
    noteEn = `${focalMm}mm telephoto compression for intimate emotional focus`;
  } else if (parsed.emotion === "tension") {
    focalMm = parsed.characterCount >= 3 ? 35 : 70; shotScale = parsed.characterCount >= 3 ? "medium" : "medium-close";
    cameraPos = [-0.65, 1.38, 3.4]; pitchDeg = 4; dutchRollDeg = 4; fStop = 2.2;
    noteKo = `${focalMm}mm 대치 구도 · 미세 더치 앵글로 긴장감 강조`;
    noteEn = `${focalMm}mm confrontation framing with subtle tension tilt`;
  } else if (parsed.emotion === "melancholy") {
    focalMm = parsed.characterCount === 1 ? 28 : 50; shotScale = parsed.characterCount === 1 ? "extreme-wide" : "medium";
    cameraPos = [0.5, 1.95, parsed.characterCount === 1 ? 5.2 : 3.9]; pitchDeg = -9; fStop = 2.4;
    noteKo = `${focalMm}mm 부감 여백 구도 · 고독감과 공간 여운 강조`;
    noteEn = `${focalMm}mm high-angle negative space emphasizing solitude`;
  } else if (parsed.emotion === "mystery") {
    focalMm = 32; shotScale = "wide"; cameraPos = [-0.9, 1.32, 4.5]; pitchDeg = 3; dutchRollDeg = 2.5;
    noteKo = "32mm 심도 광각 · 전경 소품과 그림자 단서 동시 노출";
    noteEn = "32mm deep-context wide framing revealing environmental clues";
  } else if (parsed.characterCount >= 4) {
    focalMm = 28; shotScale = "wide"; cameraPos = [0.25, 1.65, 4.9];
    noteKo = "28mm 다인군 그룹 샷 · 전 인물 블로킹 수렴";
    noteEn = "28mm group wide shot capturing all actor blocking";
  }

  const clampedFocal = clamp(Math.round(focalMm), MIN_FOCAL_MM, MAX_FOCAL_MM);
  const avgX = characters.reduce((acc, c) => acc + c.position[0], 0) / Math.max(1, characters.length);
  const avgZ = characters.reduce((acc, c) => acc + c.position[2], 0) / Math.max(1, characters.length);

  return {
    focalLengthMm: clampedFocal,
    verticalFovDeg: round2((2 * Math.atan(FULL_FRAME_HEIGHT_MM / (2 * clampedFocal)) * 180) / Math.PI),
    horizontalFovDeg: round2((2 * Math.atan(FULL_FRAME_WIDTH_MM / (2 * clampedFocal)) * 180) / Math.PI),
    shotScale,
    cameraPosition: [round2(avgX + cameraPos[0]), round2(cameraPos[1]), round2(avgZ + cameraPos[2])],
    lookAtTarget: [round2(avgX), 1.42, round2(avgZ)],
    pitchDeg,
    dutchRollDeg,
    depthOfFieldFStop: fStop,
    framingNoteKo: noteKo,
    framingNoteEn: noteEn,
  };
}

function resolvePropCollisions(
  rawProps: readonly StagedPropPlacement[],
  characters: readonly CharacterBlockingSpot[],
  stageWidthM: number,
  stageDepthM: number,
): { readonly resolved: readonly StagedPropPlacement[]; readonly overlapCount: number } {
  const halfW = stageWidthM * 0.46;
  const halfD = stageDepthM * 0.46;
  const items = rawProps.map((prop) => ({ ...prop, x: prop.position[0], y: prop.position[1], z: prop.position[2] }));

  for (let pass = 0; pass < 10; pass += 1) {
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i];
      if (!a || a.groundedOnSurface !== "floor") continue;
      for (const ch of characters) {
        const dx = a.x - ch.position[0];
        const dz = a.z - ch.position[2];
        const dist = Math.hypot(dx, dz);
        const minSep = a.footprintRadiusM + ch.footprintRadiusM + 0.14;
        if (dist < minSep) {
          const nx = dist > 1e-4 ? dx / dist : 1;
          const nz = dist > 1e-4 ? dz / dist : 0.4;
          a.x = clamp(a.x + nx * (minSep - dist), -halfW, halfW);
          a.z = clamp(a.z + nz * (minSep - dist), -halfD, halfD);
        }
      }
      for (let j = i + 1; j < items.length; j += 1) {
        const b = items[j];
        if (!b || b.groundedOnSurface !== "floor") continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const minSep = a.footprintRadiusM + b.footprintRadiusM + 0.1;
        if (dist < minSep) {
          const nx = dist > 1e-4 ? dx / dist : 0.8;
          const nz = dist > 1e-4 ? dz / dist : 0.6;
          const push = (minSep - dist) * 0.55;
          if (a.category !== "architecture") {
            a.x = clamp(a.x - nx * push, -halfW, halfW);
            a.z = clamp(a.z - nz * push, -halfD, halfD);
          }
          if (b.category !== "architecture") {
            b.x = clamp(b.x + nx * push, -halfW, halfW);
            b.z = clamp(b.z + nz * push, -halfD, halfD);
          }
        }
      }
    }
  }

  let overlapCount = 0;
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i];
    if (!a || a.groundedOnSurface !== "floor") continue;
    for (let j = i + 1; j < items.length; j += 1) {
      const b = items[j];
      if (!b || b.groundedOnSurface !== "floor") continue;
      if (Math.hypot(b.x - a.x, b.z - a.z) + 0.02 < a.footprintRadiusM + b.footprintRadiusM) overlapCount += 1;
    }
  }

  return {
    overlapCount,
    resolved: items.map((item) => ({
      propId: item.propId,
      assetKey: item.assetKey,
      labelKo: item.labelKo,
      labelEn: item.labelEn,
      category: item.category,
      source: item.source,
      position: [round2(item.x), round2(item.y), round2(item.z)] as const,
      rotationYDeg: item.rotationYDeg,
      scale: item.scale,
      footprintRadiusM: item.footprintRadiusM,
      groundedOnSurface: item.groundedOnSurface,
    })),
  };
}

/** 파싱된 단일 대본 씬으로부터 3D 배경·소품·인물·조명·카메라 블루프린트를 생성한다. */
export function generate3dStagingBlueprintFromScene(parsed: ParsedScriptScene): Scene3dStagingBlueprint {
  const def = LOCATION_PRESETS[parsed.location];
  const characters = buildCharacterBlocking(parsed);
  const lighting = buildLightingBlueprint(parsed.timeOfDay, parsed.emotion, def.spec.indoor);
  const camera = buildCameraBlueprint(parsed, characters);

  const initialProps: StagedPropPlacement[] = def.essentialProps.map((ep, idx) => ({
    propId: `${parsed.sceneCode.toLowerCase()}-essential-${idx + 1}`,
    assetKey: ep.assetKey,
    labelKo: ep.labelKo,
    labelEn: ep.labelEn,
    category: ep.category,
    source: "preset-essential",
    position: ep.position,
    rotationYDeg: ep.rotationYDeg,
    scale: ep.scale,
    footprintRadiusM: ep.footprintRadiusM,
    groundedOnSurface: "floor",
  }));

  let dynamicIdx = 0;
  for (const key of parsed.mentionedPropKeys) {
    const rule = DYNAMIC_PROP_RULES.find((r) => r.key === key);
    if (!rule) continue;
    dynamicIdx += 1;
    initialProps.push({
      propId: `${parsed.sceneCode.toLowerCase()}-hero-${dynamicIdx}`,
      assetKey: rule.assetKey,
      labelKo: rule.labelKo,
      labelEn: rule.labelEn,
      category: "hero-prop",
      source: "script-triggered",
      position: [round2(rule.preferredOffset[0]), rule.onTabletop ? def.tabletopHeightM : 0, round2(rule.preferredOffset[1])],
      rotationYDeg: (dynamicIdx * 23) % 360,
      scale: rule.scale,
      footprintRadiusM: rule.footprintRadiusM,
      groundedOnSurface: rule.onTabletop ? "tabletop" : "floor",
    });
  }

  const { resolved, overlapCount } = resolvePropCollisions(initialProps, characters, def.spec.widthM, def.spec.depthM);
  return {
    parsed,
    backgroundPreset: def.spec,
    props: resolved,
    characters,
    lighting,
    camera,
    validation: {
      overlapCount,
      allPropsGrounded: resolved.every((p) => p.position[1] >= 0),
      focalLengthInRange: camera.focalLengthMm >= MIN_FOCAL_MM && camera.focalLengthMm <= MAX_FOCAL_MM,
      characterClearanceOk: characters.every((ch) =>
        resolved.every(
          (p) => p.groundedOnSurface !== "floor" || Math.hypot(p.position[0] - ch.position[0], p.position[2] - ch.position[2]) + 0.02 >= p.footprintRadiusM + ch.footprintRadiusM,
        ),
      ),
    },
  };
}

/** 한국어/영어 웹툰 대본 원문 전체를 분석해 씬별 3D 스테이징 블루프린트 플랜을 생성한다. */
export function generateEpisode3dStagingPlan(scriptText: string): Episode3dStagingPlan {
  const blueprints = parseWebtoonScript(scriptText).map((scene) => generate3dStagingBlueprintFromScene(scene));
  const uniquePresetIds = Array.from(new Set(blueprints.map((b) => b.backgroundPreset.presetId)));
  return {
    totalScenes: blueprints.length,
    blueprints,
    uniquePresetIds,
    continuityNoteKo: `총 ${blueprints.length}개 씬 · 고유 3D 배경 ${uniquePresetIds.length}종 · 모든 카메라 화각 24~85mm 준수`,
    continuityNoteEn: `${blueprints.length} scene(s) · ${uniquePresetIds.length} unique 3D backdrop preset(s) · all lenses within 24–85mm`,
  };
}
