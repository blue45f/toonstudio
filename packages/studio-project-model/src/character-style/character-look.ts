/**
 * "내 룩" 문서 계약 `toonstudio.character-lab.look/1` — `@toonstudio/studio-project-model` 정식 승격 단위.
 *
 * 기존 `apps/character-lab`에서 내보낸 `.look.json` 문서와 Studio 통합 3D 셰이퍼 룩 문서가
 * 동일한 봉투 스키마로 검증·호환되도록 공용 프로젝트 모델 패키지에 단일 정본으로 둔다.
 */
import { z } from "zod";

export const CHARACTER_LOOK_FORMAT = "toonstudio.character-lab.look/1" as const;
/** 파일 접미(`<이름>.look.json`) */
export const CHARACTER_LOOK_FILE_SUFFIX = ".look.json" as const;

export const LOOK_SCOPES = ["full", "outfit", "colors", "face", "style"] as const;
export type LookScope = (typeof LOOK_SCOPES)[number];

export const LOOK_SCOPE_LABELS_KO: Readonly<Record<LookScope, string>> = Object.freeze({
  full: "전체",
  outfit: "의상",
  colors: "색",
  face: "얼굴",
  style: "화풍",
});

/** 섞기 잠금 그룹(얼굴·몸·색·옷·소품·화풍) */
export const LOOK_LOCK_GROUPS = ["face", "body", "colors", "outfit", "accessories", "style"] as const;
export type LookLockGroup = (typeof LOOK_LOCK_GROUPS)[number];

export const LOOK_LOCK_LABELS_KO: Readonly<Record<LookLockGroup, string>> = Object.freeze({
  face: "얼굴",
  body: "몸",
  colors: "색",
  outfit: "옷",
  accessories: "소품",
  style: "화풍",
});

/** payload 구역 이름 */
export const LOOK_PAYLOAD_SECTIONS = [
  "slots",
  "body",
  "face",
  "colors",
  "style",
  "look",
  "toon",
  "wardrobe",
  "partParams",
  "surfaces",
  "hairColor",
] as const;
export type LookPayloadSection = (typeof LOOK_PAYLOAD_SECTIONS)[number];

/** 범위별 허용 구역. */
export const LOOK_SCOPE_SECTIONS: Readonly<Record<LookScope, readonly LookPayloadSection[]>> = Object.freeze({
  full: LOOK_PAYLOAD_SECTIONS,
  outfit: ["slots", "colors", "wardrobe", "partParams", "surfaces"],
  colors: ["colors", "hairColor"],
  face: ["slots", "face"],
  style: ["style", "look", "toon"],
});

export const CHARACTER_LOOK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}$/u;
export const CHARACTER_LOOK_NAME_MAX = 40;
export const CHARACTER_LOOK_SEED_MAX = 0xffffffff;

const SECTION_SET: ReadonlySet<string> = new Set(LOOK_PAYLOAD_SECTIONS);

/** payload 스키마를 받아 look/1 문서 스키마를 만든다. */
export function characterLookSchemaFor<P extends z.ZodType>(payloadSchema: P) {
  return z
    .object({
      format: z.literal(CHARACTER_LOOK_FORMAT),
      id: z.string().regex(CHARACTER_LOOK_ID_PATTERN, "룩 id는 소문자·숫자로 시작하는 1~63자 식별자여야 합니다."),
      nameKo: z
        .string()
        .trim()
        .min(1, "룩 이름이 비어 있습니다.")
        .max(CHARACTER_LOOK_NAME_MAX, `룩 이름은 ${CHARACTER_LOOK_NAME_MAX}자 이하여야 합니다.`),
      scope: z.enum(LOOK_SCOPES),
      payload: payloadSchema,
      locks: z.array(z.enum(LOOK_LOCK_GROUPS)).max(LOOK_LOCK_GROUPS.length),
      seed: z.number().int().min(0).max(CHARACTER_LOOK_SEED_MAX).optional(),
    })
    .strict()
    .superRefine((look, ctx) => {
      if (new Set(look.locks).size !== look.locks.length) {
        ctx.addIssue({ code: "custom", message: "잠금 그룹이 중복되었습니다.", path: ["locks"] });
      }
      const payload: unknown = (look as { readonly payload?: unknown }).payload;
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        ctx.addIssue({ code: "custom", message: "payload는 객체여야 합니다.", path: ["payload"] });
        return;
      }
      const sections = Object.keys(payload).filter(
        (key) => (payload as Record<string, unknown>)[key] !== undefined,
      );
      if (sections.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "payload가 비어 있습니다(범위의 구역을 하나 이상 담아야 합니다).",
          path: ["payload"],
        });
      }
      const allowed: readonly string[] = LOOK_SCOPE_SECTIONS[look.scope];
      for (const section of sections) {
        if (!SECTION_SET.has(section)) {
          ctx.addIssue({
            code: "custom",
            message: `알 수 없는 payload 구역입니다: ${section}`,
            path: ["payload", section],
          });
        } else if (!allowed.includes(section)) {
          ctx.addIssue({
            code: "custom",
            message: `범위 ${LOOK_SCOPE_LABELS_KO[look.scope]}(${look.scope})에는 구역 ${section}을 담을 수 없습니다.`,
            path: ["payload", section],
          });
        }
      }
    });
}

/** 봉투 타입 */
export interface CharacterLookEnvelope<P> {
  readonly format: typeof CHARACTER_LOOK_FORMAT;
  readonly id: string;
  readonly nameKo: string;
  readonly scope: LookScope;
  readonly payload: P;
  readonly locks: readonly LookLockGroup[];
  readonly seed?: number;
}

/** 파일 내용이 look/1 문서처럼 보이는지 확인한다. */
export function isCharacterLookFormat(json: unknown): boolean {
  return (
    typeof json === "object" &&
    json !== null &&
    (json as { format?: unknown }).format === CHARACTER_LOOK_FORMAT
  );
}
