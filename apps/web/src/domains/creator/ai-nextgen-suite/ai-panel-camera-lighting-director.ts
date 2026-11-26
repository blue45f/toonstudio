import { z } from "zod";

import {
  executeDualProviderCascade,
  sanitizeValueStringsDeep,
  type JsonSchemaContract,
  type NextGenCascadeOptions,
  type NextGenCascadeResult,
} from "./ai-nextgen-provider-cascade";

/**
 * 대본 -> 3D 숏 리스트·조명·오디오툰 연출 디렉터 (`18..135mm` 초점거리, 카메라 부감·앙각·더치 틸트,
 * OKLCH 3점 조명 Key/Fill/Rim, AudioToon 효과음 큐).
 *
 * 미터 단위(`1.0 = 1m`) 바닥 접지(`Y >= 0`) 좌표계와 35mm 풀프레임 광학 시야각 공식을 따르며,
 * 모든 조명 색상은 생 색상 코드 없이 표준 `oklch(L C H)` 색공간으로만 산출한다.
 */

export const ELEVATION_PRESETS = [
  "worms-eye",
  "low-angle",
  "eye-level",
  "high-angle",
  "birds-eye",
] as const;

export type CameraElevationPreset = (typeof ELEVATION_PRESETS)[number];

export const FOLEY_CATEGORIES = [
  "impact",
  "ambience",
  "weather",
  "weapon",
  "heartbeat",
  "ui-tech",
  "footstep",
] as const;

export type AudioToonFoleyCategory = (typeof FOLEY_CATEGORIES)[number];

export interface ScriptPanelBeatInput {
  readonly cutNumber: number;
  readonly actionDescriptionKo: string;
  readonly dialogueKo?: string;
  readonly emotionHintKo?: string;
  readonly locationHintKo?: string;
}

export interface PanelCameraLightingDirectorInput {
  readonly sceneTitleKo: string;
  readonly genre: string;
  readonly timeOfDayKo?: string;
  readonly panels: readonly ScriptPanelBeatInput[];
}

export const OKLCH_CANONICAL_PATTERN =
  /^oklch\((?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?) (?:0(?:\.\d{1,4})?) \d{1,3}(?:\.\d{1,2})?\)$/u;

export const ThreePointLightNodeSchema = z
  .object({
    colorOklch: z.string().regex(OKLCH_CANONICAL_PATTERN),
    intensityRatio: z.number().min(0.05).max(2.5),
    azimuthDeg: z.number().min(-180).max(180),
    elevationDeg: z.number().min(-30).max(90),
    roleNoteKo: z.string().min(1).max(240),
  })
  .strict();

export const AudioToonSfxCueSchema = z
  .object({
    visualSfxKo: z.string().min(1).max(40),
    foleyCategory: z.enum(FOLEY_CATEGORIES),
    sfxCueDescriptionKo: z.string().min(1).max(260),
    gainDb: z.number().min(-36).max(0),
    pan: z.number().min(-1).max(1),
    entryOffsetMs: z.number().int().min(0).max(5_000),
  })
  .strict();

export const PanelShotDirectionSchema = z
  .object({
    cutNumber: z.number().int().min(1).max(500),
    shotSizeLabelKo: z.string().min(1).max(80),
    lensFocalLengthMm: z.number().min(18).max(135),
    horizontalFovDeg: z.number().min(14).max(92),
    elevationPreset: z.enum(ELEVATION_PRESETS),
    elevationDeg: z.number().min(-60).max(75),
    dutchTiltDeg: z.number().min(-35).max(35),
    cameraPositionM: z.tuple([z.number(), z.number().min(0), z.number()]),
    lookAtTargetM: z.tuple([z.number(), z.number().min(0), z.number()]),
    blockingNoteKo: z.string().min(1).max(320),
    lightingRig: z
      .object({
        moodNameKo: z.string().min(1).max(100),
        keyLight: ThreePointLightNodeSchema,
        fillLight: ThreePointLightNodeSchema,
        rimLight: ThreePointLightNodeSchema,
      })
      .strict(),
    audioToonCue: AudioToonSfxCueSchema,
  })
  .strict();

export const PanelCameraLightingDirectorOutputSchema = z
  .object({
    directorSummaryKo: z.string().min(1).max(480),
    continuityAxisNoteKo: z.string().min(1).max(320),
    shots: z.array(PanelShotDirectionSchema).min(1).max(24),
  })
  .strict();

export type ThreePointLightNode = z.infer<typeof ThreePointLightNodeSchema>;
export type AudioToonSfxCue = z.infer<typeof AudioToonSfxCueSchema>;
export type PanelShotDirection = z.infer<typeof PanelShotDirectionSchema>;
export type PanelCameraLightingDirectorOutput = z.infer<
  typeof PanelCameraLightingDirectorOutputSchema
>;

const LIGHT_NODE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["colorOklch", "intensityRatio", "azimuthDeg", "elevationDeg", "roleNoteKo"],
  properties: {
    colorOklch: {
      type: "string",
      description:
        "반드시 'oklch(L C H)' 공백 구분 수치 형식(L 0.15~0.96, C 0.02~0.24, H 0~360; key/fill/rim 세 조명의 밝기와 색상각 H를 서로 다르게 설계)",
    },
    intensityRatio: { type: "number", description: "광량 비율(0.05~2.5)" },
    azimuthDeg: { type: "number", description: "수평 방위각(-180~180도)" },
    elevationDeg: { type: "number", description: "수직 고도각(-30~90도)" },
    roleNoteKo: { type: "string", description: "해당 조명의 연출 역할(한국어)" },
  },
} as const;

export const PANEL_CAMERA_LIGHTING_JSON_SCHEMA: JsonSchemaContract = Object.freeze({
  name: "toonstudio_panel_camera_lighting_director",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["directorSummaryKo", "continuityAxisNoteKo", "shots"],
    properties: {
      directorSummaryKo: {
        type: "string",
        description: "장면 전체의 렌즈 호흡·조명 대비·음향 설계 총평(번역투 없는 한국어)",
      },
      continuityAxisNoteKo: {
        type: "string",
        description: "180도 시선축 유지 및 세로 스크롤 카메라 시선 유도 원칙",
      },
      shots: {
        type: "array",
        description: "패널별 3D 카메라·OKLCH 3점 조명·AudioToon 효과음 큐",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "cutNumber",
            "shotSizeLabelKo",
            "lensFocalLengthMm",
            "horizontalFovDeg",
            "elevationPreset",
            "elevationDeg",
            "dutchTiltDeg",
            "cameraPositionM",
            "lookAtTargetM",
            "blockingNoteKo",
            "lightingRig",
            "audioToonCue",
          ],
          properties: {
            cutNumber: { type: "integer" },
            shotSizeLabelKo: { type: "string", description: "숏 크기(예: 익스트림 클로즈업, 미디엄 풀숏)" },
            lensFocalLengthMm: { type: "number", description: "초점거리(18~135mm 범위 준수)" },
            horizontalFovDeg: { type: "number", description: "수평 시야각(14~92도)" },
            elevationPreset: {
              type: "string",
              enum: ["worms-eye", "low-angle", "eye-level", "high-angle", "birds-eye"],
            },
            elevationDeg: { type: "number", description: "카메라 고도각(-60~75도)" },
            dutchTiltDeg: { type: "number", description: "더치 틸트 기울기(-35~35도)" },
            cameraPositionM: {
              type: "array",
              description: "[x, y, z] 미터 좌표(y >= 0)",
              items: { type: "number" },
            },
            lookAtTargetM: {
              type: "array",
              description: "[x, y, z] 주시점 미터 좌표(y >= 0)",
              items: { type: "number" },
            },
            blockingNoteKo: { type: "string", description: "피사체 배치 및 전경·후경 심도 연출 노트" },
            lightingRig: {
              type: "object",
              additionalProperties: false,
              required: ["moodNameKo", "keyLight", "fillLight", "rimLight"],
              properties: {
                moodNameKo: { type: "string" },
                keyLight: LIGHT_NODE_JSON_SCHEMA,
                fillLight: LIGHT_NODE_JSON_SCHEMA,
                rimLight: LIGHT_NODE_JSON_SCHEMA,
              },
            },
            audioToonCue: {
              type: "object",
              additionalProperties: false,
              required: [
                "visualSfxKo",
                "foleyCategory",
                "sfxCueDescriptionKo",
                "gainDb",
                "pan",
                "entryOffsetMs",
              ],
              properties: {
                visualSfxKo: {
                  type: "string",
                  description: "만화 컷 위에 적는 짧은 의성어·의태어 2~6글자(예: 쏴아아, 번쩍, 콰아앙, 두근)",
                },
                foleyCategory: {
                  type: "string",
                  enum: [
                    "impact",
                    "ambience",
                    "weather",
                    "weapon",
                    "heartbeat",
                    "ui-tech",
                    "footstep",
                  ],
                },
                sfxCueDescriptionKo: { type: "string", description: "오디오툰 사운드 질감 설명" },
                gainDb: { type: "number", description: "음량 게인(-36~0 dB)" },
                pan: { type: "number", description: "좌우 패닝(-1~1)" },
                entryOffsetMs: { type: "integer", description: "컷 진입 후 재생 지연(0~5000ms)" },
              },
            },
          },
        },
      },
    },
  },
});

function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampRange(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function trimBounded(value: unknown, fallback: string, maxLen: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return fallback;
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}…`;
}

/**
 * 35mm 풀프레임 센서 가로 폭(`36mm`) 기준 초점거리(`18..135mm`)의 수평 시야각(FOV)을 계산한다.
 */
export function computeHorizontalFovDegFromFocalLengthMm(focalLengthMm: number): number {
  const clampedMm = clampRange(focalLengthMm, 35, 18, 135);
  const radians = 2 * Math.atan(36 / (2 * clampedMm));
  return roundTo((radians * 180) / Math.PI, 1);
}

/**
 * 임의 OKLCH 문자열(`oklch(82% 0.09 75deg)` 등 변형 포함)을 정규 `oklch(L C H)` 형식으로 정규화한다.
 */
export function normalizeToOklchColor(raw: unknown, fallbackOklch: string): string {
  if (typeof raw !== "string") return fallbackOklch;
  const trimmed = raw.trim().toLowerCase();
  if (OKLCH_CANONICAL_PATTERN.test(trimmed)) return trimmed;
  if (!trimmed.startsWith("oklch(") || !trimmed.endsWith(")")) {
    return fallbackOklch;
  }
  const inner = trimmed
    .slice(6, -1)
    .split("/")[0]!
    .replace(/,/gu, " ")
    .trim();
  const tokens = inner.split(/\s+/u).filter((tok) => tok.length > 0);
  if (tokens.length < 3) return fallbackOklch;

  const rawL = tokens[0]!;
  const parsedL = rawL.endsWith("%")
    ? Number(rawL.slice(0, -1)) / 100
    : Number(rawL);
  const parsedC = Number(tokens[1]!);
  const rawH = tokens[2]!.endsWith("deg") ? tokens[2]!.slice(0, -3) : tokens[2]!;
  const parsedH = Number(rawH);

  if (!Number.isFinite(parsedL) || !Number.isFinite(parsedC) || !Number.isFinite(parsedH)) {
    return fallbackOklch;
  }

  const normL = roundTo(Math.min(1, Math.max(0, parsedL)), 3);
  const normC = roundTo(Math.min(0.37, Math.max(0, parsedC)), 3);
  const wrappedH = roundTo(((parsedH % 360) + 360) % 360, 1);
  return `oklch(${normL} ${normC} ${wrappedH})`;
}

function selectGenreLightingPreset(genre: string): {
  readonly moodNameKo: string;
  readonly keyColor: string;
  readonly fillColor: string;
  readonly rimColor: string;
} {
  if (genre.includes("느와르") || genre.includes("스릴러") || genre.includes("SF")) {
    return {
      moodNameKo: "차가운 도시 네온 역광 대비",
      keyColor: "oklch(0.76 0.08 235)",
      fillColor: "oklch(0.38 0.04 255)",
      rimColor: "oklch(0.82 0.16 195)",
    };
  }
  if (genre.includes("로판") || genre.includes("로맨스")) {
    return {
      moodNameKo: "따스한 황금빛 샹들리에 역광",
      keyColor: "oklch(0.88 0.09 78)",
      fillColor: "oklch(0.68 0.04 55)",
      rimColor: "oklch(0.92 0.11 85)",
    };
  }
  if (genre.includes("무협") || genre.includes("액션")) {
    return {
      moodNameKo: "달빛 청회색 주광과 불티 림라이트",
      keyColor: "oklch(0.79 0.05 245)",
      fillColor: "oklch(0.42 0.03 240)",
      rimColor: "oklch(0.78 0.18 42)",
    };
  }
  return {
    moodNameKo: "선명한 스튜디오 자연광 밸런스",
    keyColor: "oklch(0.86 0.06 82)",
    fillColor: "oklch(0.64 0.03 230)",
    rimColor: "oklch(0.89 0.08 95)",
  };
}

/**
 * 외부 네트워크 없이도 대본 비트를 물리·광학 정합 3D 숏 리스트로 변환하는 로컬 디렉터.
 */
export function buildLocalPanelCameraLightingShotList(
  rawInput: PanelCameraLightingDirectorInput,
): PanelCameraLightingDirectorOutput {
  const clean = sanitizeValueStringsDeep(rawInput, { polishKorean: true }).sanitized;
  const panels =
    clean.panels.length > 0
      ? clean.panels.slice(0, 24)
      : [{ cutNumber: 1, actionDescriptionKo: "주인공이 복도 끝에서 멈춰 선다." }];

  const lightPreset = selectGenreLightingPreset(clean.genre);

  const shots: PanelShotDirection[] = panels.map((panel, index) => {
    const desc = `${panel.actionDescriptionKo} ${panel.emotionHintKo ?? ""}`;
    const isAction = /폭발|공격|검|질주|충돌|추격|타격|도약/u.test(desc);
    const isIntimate = /눈동자|속삭|눈물|독백|떨리|숨/u.test(desc);
    const isEstablishing = index === 0 && !isIntimate;

    const lensFocalLengthMm = isIntimate ? 85 : isAction ? 24 : isEstablishing ? 28 : 50;
    const horizontalFovDeg = computeHorizontalFovDegFromFocalLengthMm(lensFocalLengthMm);

    const elevationPreset: CameraElevationPreset = isAction
      ? "low-angle"
      : isEstablishing
        ? "high-angle"
        : "eye-level";
    const elevationDeg =
      elevationPreset === "low-angle" ? -18 : elevationPreset === "high-angle" ? 24 : 0;
    const dutchTiltDeg = isAction ? 14 : 0;

    const sideSign = index % 2 === 0 ? -1 : 1;
    const distanceZ = isIntimate ? 1.4 : isAction ? 2.6 : 3.8;
    const camHeightY = elevationPreset === "low-angle" ? 0.95 : elevationPreset === "high-angle" ? 2.6 : 1.55;

    const foleyCategory: AudioToonFoleyCategory = /검|칼|총|무기/u.test(desc)
      ? "weapon"
      : isAction
        ? "impact"
        : /비|바람|천둥/u.test(desc)
          ? "weather"
          : isIntimate
            ? "heartbeat"
            : "ambience";

    const visualSfxKo =
      foleyCategory === "weapon"
        ? "챙그랑"
        : foleyCategory === "impact"
          ? "콰아앙"
          : foleyCategory === "weather"
            ? "쏴아아"
            : foleyCategory === "heartbeat"
              ? "두근"
              : "스르륵";

    return {
      cutNumber: Math.max(1, Math.trunc(panel.cutNumber)),
      shotSizeLabelKo: isIntimate
        ? "익스트림 클로즈업(ECU)"
        : isAction
          ? "다이내믹 로우 미디엄 풀숏"
          : isEstablishing
            ? "공간 설정 와이드 숏(WS)"
            : "아이레벨 바스트 숏(MS)",
      lensFocalLengthMm,
      horizontalFovDeg,
      elevationPreset,
      elevationDeg,
      dutchTiltDeg,
      cameraPositionM: [roundTo(sideSign * 0.65, 2), camHeightY, distanceZ],
      lookAtTargetM: [0, 1.45, 0],
      blockingNoteKo: isIntimate
        ? "85mm 준망원 압축감으로 배경을 부드럽게 날리고 인물의 시선 흔들림에 초점을 맞춥니다."
        : isAction
          ? "24mm 광각 원근 과장과 14도 더치 틸트로 전경 무기와 후경 공간의 속도감을 극적으로 벌립니다."
          : "카메라를 180도 시선축 한쪽에 고정해 컷 전환 시 인물의 좌우 위치가 뒤집히지 않게 유지합니다.",
      lightingRig: {
        moodNameKo: lightPreset.moodNameKo,
        keyLight: {
          colorOklch: lightPreset.keyColor,
          intensityRatio: isAction ? 1.45 : 1.15,
          azimuthDeg: 38,
          elevationDeg: 42,
          roleNoteKo: "주 피사체의 얼굴 입체감과 핵심 시선 방향을 비추는 주광",
        },
        fillLight: {
          colorOklch: lightPreset.fillColor,
          intensityRatio: 0.35,
          azimuthDeg: -48,
          elevationDeg: 18,
          roleNoteKo: "암부 디테일이 먹히지 않게 받쳐 주는 보조 확산광",
        },
        rimLight: {
          colorOklch: lightPreset.rimColor,
          intensityRatio: 1.25,
          azimuthDeg: -145,
          elevationDeg: 32,
          roleNoteKo: "배경과 캐릭터 외곽 실루엣을 선명하게 분리하는 역광 림라이트",
        },
      },
      audioToonCue: {
        visualSfxKo,
        foleyCategory,
        sfxCueDescriptionKo: `${visualSfxKo} 식자 위치와 맞물려 공간 잔향과 타격 저음을 짧게 얹습니다.`,
        gainDb: isAction ? -4 : -12,
        pan: roundTo(sideSign * 0.25, 2),
        entryOffsetMs: isIntimate ? 180 : 0,
      },
    };
  });

  return {
    directorSummaryKo: `${clean.sceneTitleKo}(${clean.genre}) ${shots.length}개 패널을 24~85mm 렌즈 호흡 변화와 OKLCH 3점 조명으로 설계해 세로 스크롤 시선 유도와 입체감을 함께 잡았습니다.`,
    continuityAxisNoteKo:
      "대화·대치 중인 두 인물 사이의 180도 액션 축을 넘지 않도록 카메라 X축 부호와 시선 방향을 일관되게 유지하세요.",
    shots,
  };
}

function normalizeTuple3M(
  raw: unknown,
  fallback: readonly [number, number, number],
): [number, number, number] {
  if (!Array.isArray(raw) || raw.length < 3) {
    return [fallback[0], Math.max(0, fallback[1]), fallback[2]];
  }
  const x = roundTo(clampRange(raw[0], fallback[0], -200, 200), 2);
  const y = roundTo(clampRange(raw[1], fallback[1], 0, 120), 2);
  const z = roundTo(clampRange(raw[2], fallback[2], -200, 200), 2);
  return [x, y, z];
}

function normalizeLightNode(
  raw: unknown,
  fallback: ThreePointLightNode,
): ThreePointLightNode {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    colorOklch: normalizeToOklchColor(obj.colorOklch, fallback.colorOklch),
    intensityRatio: roundTo(clampRange(obj.intensityRatio, fallback.intensityRatio, 0.05, 2.5), 2),
    azimuthDeg: roundTo(clampRange(obj.azimuthDeg, fallback.azimuthDeg, -180, 180), 1),
    elevationDeg: roundTo(clampRange(obj.elevationDeg, fallback.elevationDeg, -30, 90), 1),
    roleNoteKo: trimBounded(obj.roleNoteKo, fallback.roleNoteKo, 240),
  };
}

function normalizePanelShotListParsed(
  decoded: unknown,
  fallbackInput: PanelCameraLightingDirectorInput,
): unknown {
  if (!decoded || typeof decoded !== "object") return decoded;
  const raw = decoded as Record<string, unknown>;
  const localRef = buildLocalPanelCameraLightingShotList(fallbackInput);

  const rawShots = Array.isArray(raw.shots) ? raw.shots : [];
  const shots =
    rawShots.length > 0
      ? rawShots.slice(0, 24).map((entry, idx) => {
          const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
          const refShot = localRef.shots[idx] ?? localRef.shots[0]!;
          const lensMm = roundTo(
            clampRange(item.lensFocalLengthMm, refShot.lensFocalLengthMm, 18, 135),
            1,
          );
          const elevationPreset: CameraElevationPreset = ELEVATION_PRESETS.includes(
            item.elevationPreset as CameraElevationPreset,
          )
            ? (item.elevationPreset as CameraElevationPreset)
            : refShot.elevationPreset;

          const rawRig = (
            item.lightingRig && typeof item.lightingRig === "object" ? item.lightingRig : {}
          ) as Record<string, unknown>;
          const rawAudio = (
            item.audioToonCue && typeof item.audioToonCue === "object" ? item.audioToonCue : {}
          ) as Record<string, unknown>;

          const foleyCat: AudioToonFoleyCategory = FOLEY_CATEGORIES.includes(
            rawAudio.foleyCategory as AudioToonFoleyCategory,
          )
            ? (rawAudio.foleyCategory as AudioToonFoleyCategory)
            : refShot.audioToonCue.foleyCategory;

          return {
            cutNumber: Math.max(
              1,
              Math.min(500, Math.round(clampRange(item.cutNumber, refShot.cutNumber, 1, 500))),
            ),
            shotSizeLabelKo: trimBounded(item.shotSizeLabelKo, refShot.shotSizeLabelKo, 80),
            lensFocalLengthMm: lensMm,
            horizontalFovDeg: computeHorizontalFovDegFromFocalLengthMm(lensMm),
            elevationPreset,
            elevationDeg: roundTo(
              clampRange(item.elevationDeg, refShot.elevationDeg, -60, 75),
              1,
            ),
            dutchTiltDeg: roundTo(
              clampRange(item.dutchTiltDeg, refShot.dutchTiltDeg, -35, 35),
              1,
            ),
            cameraPositionM: normalizeTuple3M(item.cameraPositionM, refShot.cameraPositionM),
            lookAtTargetM: normalizeTuple3M(item.lookAtTargetM, refShot.lookAtTargetM),
            blockingNoteKo: trimBounded(item.blockingNoteKo, refShot.blockingNoteKo, 320),
            lightingRig: {
              moodNameKo: trimBounded(
                rawRig.moodNameKo,
                refShot.lightingRig.moodNameKo,
                100,
              ),
              keyLight: normalizeLightNode(rawRig.keyLight, refShot.lightingRig.keyLight),
              fillLight: normalizeLightNode(rawRig.fillLight, refShot.lightingRig.fillLight),
              rimLight: normalizeLightNode(rawRig.rimLight, refShot.lightingRig.rimLight),
            },
            audioToonCue: {
              visualSfxKo: trimBounded(
                rawAudio.visualSfxKo,
                refShot.audioToonCue.visualSfxKo,
                40,
              ),
              foleyCategory: foleyCat,
              sfxCueDescriptionKo: trimBounded(
                rawAudio.sfxCueDescriptionKo,
                refShot.audioToonCue.sfxCueDescriptionKo,
                260,
              ),
              gainDb: roundTo(
                clampRange(rawAudio.gainDb, refShot.audioToonCue.gainDb, -36, 0),
                1,
              ),
              pan: roundTo(clampRange(rawAudio.pan, refShot.audioToonCue.pan, -1, 1), 2),
              entryOffsetMs: Math.round(
                clampRange(rawAudio.entryOffsetMs, refShot.audioToonCue.entryOffsetMs, 0, 5_000),
              ),
            },
          };
        })
      : localRef.shots;

  return {
    directorSummaryKo: trimBounded(raw.directorSummaryKo, localRef.directorSummaryKo, 480),
    continuityAxisNoteKo: trimBounded(raw.continuityAxisNoteKo, localRef.continuityAxisNoteKo, 320),
    shots,
  };
}

export function buildPanelCameraLightingPrompt(input: PanelCameraLightingDirectorInput): {
  readonly systemInstruction: string;
  readonly userPrompt: string;
  readonly piiInputRedactedCount: number;
} {
  const sanitized = sanitizeValueStringsDeep(input, { polishKorean: false });
  const safe = sanitized.sanitized;

  const systemInstruction = [
    "당신은 한국 세로 스크롤 웹툰 3D 배경·카메라·조명·사운드 총괄 촬영감독(DP)입니다.",
    "각 패널의 초점거리는 반드시 18mm~135mm 사이로 지정하고, 카메라 위치·주시점은 미터 단위 바닥 접지 좌표(y >= 0)로 설계하세요.",
    "3점 조명(keyLight, fillLight, rimLight)의 colorOklch는 'oklch(L C H)' 공백 구분 수치 형식(L 0.2~0.95, C 0.02~0.24, H 0~360)만 사용하며, 세 조명의 밝기와 색상각(H)이 서로 대비되게 설계하세요.",
    "audioToonCue.visualSfxKo에는 문장 설명이 아니라 '쏴아아', '콰아앙', '두근' 같은 짧은 만화 식자 의성어·의태어만 적으세요.",
    "설명 문구는 번역투 없이 현장 콘티·블렌더·3D 뷰포트에서 바로 적용할 수 있는 자연스러운 한국어로 쓰세요.",
  ].join("\n");

  const panelLines = safe.panels.slice(0, 24).map((p) => {
    const dlg = p.dialogueKo ? ` | 대사: "${p.dialogueKo}"` : "";
    const emo = p.emotionHintKo ? ` | 감정: ${p.emotionHintKo}` : "";
    const loc = p.locationHintKo ? ` | 공간: ${p.locationHintKo}` : "";
    return `- ${p.cutNumber}컷: ${p.actionDescriptionKo}${dlg}${emo}${loc}`;
  });

  const userPrompt = [
    `장면 제목: ${safe.sceneTitleKo}`,
    `장르: ${safe.genre}`,
    `시간대/환경: ${safe.timeOfDayKo ?? "실내외 기본 시간대"}`,
    "패널 목록:",
    ...panelLines,
  ].join("\n");

  return {
    systemInstruction,
    userPrompt,
    piiInputRedactedCount: sanitized.redactedCount,
  };
}

export async function runPanelCameraLightingDirector(
  input: PanelCameraLightingDirectorInput,
  options?: NextGenCascadeOptions,
): Promise<NextGenCascadeResult<PanelCameraLightingDirectorOutput>> {
  const prompt = buildPanelCameraLightingPrompt(input);
  return executeDualProviderCascade({
    systemInstruction: prompt.systemInstruction,
    userPrompt: prompt.userPrompt,
    piiInputRedactedCount: prompt.piiInputRedactedCount,
    jsonSchema: PANEL_CAMERA_LIGHTING_JSON_SCHEMA,
    outputSchema: PanelCameraLightingDirectorOutputSchema,
    normalizeParsed: (decoded) => normalizePanelShotListParsed(decoded, input),
    buildLocalFallback: () => buildLocalPanelCameraLightingShotList(input),
    options,
  });
}
