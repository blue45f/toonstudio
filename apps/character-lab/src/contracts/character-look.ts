/**
 * "내 룩" 문서 계약 `toonstudio.character-lab.look/1`(2026-10-23 CORE-1). `zod` 외 import 금지(architecture.test.ts 규칙 1-a, 승격 단위).
 *
 * 문서 = { format, id, nameKo, scope, payload, locks, seed? }.
 * - scope는 저장·불러오기 범위(전체·의상·색·얼굴·화풍)다. payload에는 그 범위가 허용하는 구역(section)만 들어간다.
 * - payload 구역의 모양은 소비자마다 다르므로(캐릭터 랩 레시피 v3, 나중에 Studio) 이 파일은 봉투만 정의하고 payload 스키마는 주입받는다
 *   (`characterLookSchemaFor`). 캐릭터 랩의 payload 스키마·추출·적용은 `character-look-recipe.ts`다.
 * - locks는 섞기(mixer)에서 고정한 그룹 기록이고 적용 동작을 바꾸지 않는다(섞기 결과 payload에는 잠그지 않은 그룹만 들어간다).
 * - seed는 섞기 시드(uint32). 같은 레시피·카탈로그·잠금·시드면 같은 결과가 나와야 한다(`Math.random` 금지, shared/prng mulberry32).
 */
import { z } from "zod";

export const CHARACTER_LOOK_FORMAT = "toonstudio.character-lab.look/1" as const;
/** 파일 접미(`<이름>.look.json`) */
export const CHARACTER_LOOK_FILE_SUFFIX = ".look.json" as const;

export const LOOK_SCOPES = ["full", "outfit", "colors", "face", "style"] as const;
export type LookScope = (typeof LOOK_SCOPES)[number];

export const LOOK_SCOPE_LABELS_KO: Readonly<Record<LookScope, string>> = {
  full: "전체",
  outfit: "의상",
  colors: "색",
  face: "얼굴",
  style: "화풍",
};

/** 섞기 잠금 그룹(얼굴·몸·색·옷·소품·화풍) */
export const LOOK_LOCK_GROUPS = ["face", "body", "colors", "outfit", "accessories", "style"] as const;
export type LookLockGroup = (typeof LOOK_LOCK_GROUPS)[number];

export const LOOK_LOCK_LABELS_KO: Readonly<Record<LookLockGroup, string>> = {
  face: "얼굴",
  body: "몸",
  colors: "색",
  outfit: "옷",
  accessories: "소품",
  style: "화풍",
};

/** payload 구역 이름(레시피 v3 필드와 같은 이름. `look`·`toon`은 셰이딩의 하위 필드) */
export const LOOK_PAYLOAD_SECTIONS = ["slots", "body", "face", "colors", "style", "look", "toon", "wardrobe", "partParams", "surfaces", "hairColor"] as const;
export type LookPayloadSection = (typeof LOOK_PAYLOAD_SECTIONS)[number];

/** 범위별 허용 구역. 구역 안의 키 범위(예: 의상 범위의 색은 의상 채널만)는 소비자 스키마가 더 좁힌다. */
export const LOOK_SCOPE_SECTIONS: Readonly<Record<LookScope, readonly LookPayloadSection[]>> = {
  full: LOOK_PAYLOAD_SECTIONS,
  outfit: ["slots", "colors", "wardrobe", "partParams", "surfaces"],
  colors: ["colors", "hairColor"],
  face: ["slots", "face"],
  style: ["style", "look", "toon"],
};

export const CHARACTER_LOOK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}$/u;
export const CHARACTER_LOOK_NAME_MAX = 40;
export const CHARACTER_LOOK_SEED_MAX = 0xffffffff;

const SECTION_SET: ReadonlySet<string> = new Set(LOOK_PAYLOAD_SECTIONS);

/** payload 스키마를 받아 look/1 문서 스키마를 만든다. 범위 밖 구역·빈 payload·중복 잠금을 한글 사유로 거부한다. */
export function characterLookSchemaFor<P extends z.ZodType>(payloadSchema: P) {
  return z
    .object({
      format: z.literal(CHARACTER_LOOK_FORMAT),
      id: z.string().regex(CHARACTER_LOOK_ID_PATTERN, "룩 id는 소문자·숫자로 시작하는 1~63자 식별자여야 합니다."),
      nameKo: z.string().trim().min(1, "룩 이름이 비어 있습니다.").max(CHARACTER_LOOK_NAME_MAX, `룩 이름은 ${CHARACTER_LOOK_NAME_MAX}자 이하여야 합니다.`),
      scope: z.enum(LOOK_SCOPES),
      payload: payloadSchema,
      locks: z.array(z.enum(LOOK_LOCK_GROUPS)).max(LOOK_LOCK_GROUPS.length),
      seed: z.number().int().min(0).max(CHARACTER_LOOK_SEED_MAX).optional(),
    })
    .strict()
    .superRefine((look, ctx) => {
      if (new Set(look.locks).size !== look.locks.length) ctx.addIssue({ code: "custom", message: "잠금 그룹이 중복되었습니다.", path: ["locks"] });
      // payload 타입은 주입한 스키마의 제네릭이라 여기서는 모양만 본다.
      const payload: unknown = (look as { readonly payload?: unknown }).payload;
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        ctx.addIssue({ code: "custom", message: "payload는 객체여야 합니다.", path: ["payload"] });
        return;
      }
      const sections = Object.keys(payload).filter((key) => (payload as Record<string, unknown>)[key] !== undefined);
      if (sections.length === 0) ctx.addIssue({ code: "custom", message: "payload가 비어 있습니다(범위의 구역을 하나 이상 담아야 합니다).", path: ["payload"] });
      const allowed: readonly string[] = LOOK_SCOPE_SECTIONS[look.scope];
      for (const section of sections) {
        if (!SECTION_SET.has(section)) {
          ctx.addIssue({ code: "custom", message: `알 수 없는 payload 구역입니다: ${section}`, path: ["payload", section] });
        } else if (!allowed.includes(section)) {
          ctx.addIssue({ code: "custom", message: `범위 ${LOOK_SCOPE_LABELS_KO[look.scope]}(${look.scope})에는 구역 ${section}을 담을 수 없습니다.`, path: ["payload", section] });
        }
      }
    });
}

/** 봉투 타입(payload 타입은 소비자가 정한다) */
export interface CharacterLookEnvelope<P> {
  readonly format: typeof CHARACTER_LOOK_FORMAT;
  readonly id: string;
  readonly nameKo: string;
  readonly scope: LookScope;
  readonly payload: P;
  readonly locks: readonly LookLockGroup[];
  readonly seed?: number;
}

/** 파일 내용이 look/1 문서처럼 보이는지(형식 문자열만 확인, 검증은 스키마로) */
export function isCharacterLookFormat(json: unknown): boolean {
  return typeof json === "object" && json !== null && (json as { format?: unknown }).format === CHARACTER_LOOK_FORMAT;
}
