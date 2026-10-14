/**
 * 말투 정책 — 표면 종류별 말투의 단일 선언처 (BLUEPRINT §3.4).
 *
 * 쉬운 말 감사에서 해요체 문장과 합니다체 문장이 같은 흐름 안에서도 섞여
 * 있는 것이 확인됐다(plain-language 감사 요약 5). 개별 문구를 고치는 것만으로는
 * 재발을 막을 수 없어, "어떤 표면이 어떤 말투를 쓰는지"를 여기서 선언으로
 * 고정하고 템플릿 변형(§3.1)과 연결한다.
 *
 * - 기본값: 사용자 대면 문장은 해요체(`polite`).
 * - 예외: 법적 문서(약관·개인정보·동의)와 결제 문서(결제·환불·정산 안내)는
 *   합니다체(`formal`)를 허용한다. 허용은 "그 표면 안에서는 합니다체로 통일"
 *   이라는 뜻이며, 한 흐름 안에서 두 말투를 섞어도 된다는 뜻이 아니다.
 *
 * 판정 기준: 같은 흐름 안에서 말투 혼재 0 — `hasMixedTone()`과
 * tone-copy.guard.test.ts가 이를 검사한다.
 */

/** 문장 말투. polite = 해요체(…해요/예요), formal = 합니다체(…합니다/입니다). */
export type ToneRegister = "polite" | "formal";

/**
 * 표면 종류 — 말투를 가르는 유일한 축.
 * - general: 일반 사용자 대면 표면(앱 화면·스튜디오·안내·에러 문구).
 * - legal: 약관·개인정보 처리방침·동의서 등 법적 문서 표면.
 * - payment: 결제·환불·정산 등 금전 문서 표면.
 */
export type SurfaceKind = "general" | "legal" | "payment";

/** 표면 종류 → 말투 정책. 해요체가 기본이고, 법적·결제 문서만 합니다체를 허용한다. */
export const TONE_POLICY: Readonly<Record<SurfaceKind, ToneRegister>> = Object.freeze({
  general: "polite",
  legal: "formal",
  payment: "formal",
});

/** 표면 종류를 선언하지 않은 표면의 기본값 — 일반 표면으로 본다. */
export const DEFAULT_SURFACE_KIND: SurfaceKind = "general";

/** 표면 종류에 선언된 말투를 돌려준다. */
export function toneForSurface(kind: SurfaceKind): ToneRegister {
  return TONE_POLICY[kind];
}

/**
 * 표면의 최종 말투를 정한다.
 * 우선순위: 표면 종류 선언(surfaceKind) > 템플릿 변형의 기본 말투(templateTone)
 * > 일반 표면 기본값(해요체). 템플릿 변형의 기본 말투는
 * layout-tokens.ts의 PAGE_TEMPLATE_TONE이 선언한다.
 */
export function resolveToneRegister(options: {
  readonly surfaceKind?: SurfaceKind;
  readonly templateTone?: ToneRegister;
}): ToneRegister {
  if (options.surfaceKind !== undefined) return TONE_POLICY[options.surfaceKind];
  return options.templateTone ?? TONE_POLICY[DEFAULT_SURFACE_KIND];
}

/**
 * 문장 단위 말투 분류.
 * - "polite": 해요체 종결(…요/죠).
 * - "formal": 합니다체 종결(…습니다/습니까/하십시오 등).
 * - "plain": 문어체 단정 종결(…이다/한다/된다 등). 해요체도 합니다체도 아니므로
 *   사용자 대면 문장에서는 피해야 하지만, 혼재 판정(해요체↔합니다체)에는 넣지 않는다.
 * - "none": 종결 어미가 없는 라벨·명사구·조각 문장. 말투를 가릴 대상이 아니다.
 */
export type SentenceTone = ToneRegister | "plain" | "none";

export interface ClassifiedSentence {
  readonly sentence: string;
  readonly tone: SentenceTone;
}

/**
 * 합니다체 종결 — …니다(입니다/합니다/됩니다/습니다)·…니까(입니까/합니까/습니까)
 * 계열과 합쇼체 명령(…하십시오). plain(…이다/한다) 종결은 "니다"로 끝나지 않아
 * 여기서 걸리지 않는다.
 */
const FORMAL_ENDING_PATTERN = /(입니다만|합니다만|됩니다만|하십시오|주십시오|니다|니까)$/u;
/** 해요체 종결 — …요/…죠로 끝나는 문장. (…습니다는 위에서 먼저 걸러진다.) */
const POLITE_ENDING_PATTERN = /(요|죠)$/u;
/** 문어체 단정 종결 — 사용자 대면 문장에서는 어느 말투로도 보지 않는다. */
const PLAIN_ENDING_PATTERN = /(이다|한다|된다|했다|겠다|인다|않는다)$/u;

/** 문장 끝의 종결 부호·따옴표·공백을 걷어 낸다. */
function stripSentenceTail(sentence: string): string {
  return sentence.replace(/[\s.!?…~"'”’」』)\]]+$/u, "");
}

/** 문장 하나의 말투를 분류한다. */
export function classifySentenceTone(sentence: string): SentenceTone {
  const tail = stripSentenceTail(sentence.trim());
  if (tail.length === 0) return "none";
  if (FORMAL_ENDING_PATTERN.test(tail)) return "formal";
  if (POLITE_ENDING_PATTERN.test(tail)) return "polite";
  if (PLAIN_ENDING_PATTERN.test(tail)) return "plain";
  return "none";
}

/** 텍스트를 문장으로 나누어 각각의 말투를 분류한다. */
export function classifyTextTone(text: string): readonly ClassifiedSentence[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((sentence) => ({ sentence, tone: classifySentenceTone(sentence) }));
}

/**
 * 선언된 말투와 반대 말투로 끝나는 문장들을 찾는다.
 * 해요체 표면에 합니다체 문장이, 합니다체 표면에 해요체 문장이 있으면 위반이다.
 * plain/none 문장은 혼재 위반으로 세지 않는다(분류 결과로만 보고한다).
 */
export function findToneViolations(text: string, register: ToneRegister): readonly ClassifiedSentence[] {
  const opposite: ToneRegister = register === "polite" ? "formal" : "polite";
  return classifyTextTone(text).filter((classified) => classified.tone === opposite);
}

/** 문구 묶음(한 흐름) 안에 실제로 등장한 말투들을 모은다. none/plain은 제외한다. */
export function registersInFlow(texts: readonly string[]): ReadonlySet<ToneRegister> {
  const registers = new Set<ToneRegister>();
  for (const text of texts) {
    for (const classified of classifyTextTone(text)) {
      if (classified.tone === "polite" || classified.tone === "formal") registers.add(classified.tone);
    }
  }
  return registers;
}

/**
 * 한 흐름 안에 해요체와 합니다체가 섞여 있는지 — 이 항목의 판정 기준.
 * 표면 종류가 legal/payment인 흐름도 "합니다체로 통일"이 원칙이라,
 * 해요체가 섞이면 혼재로 판정한다.
 */
export function hasMixedTone(texts: readonly string[]): boolean {
  return registersInFlow(texts).size > 1;
}
