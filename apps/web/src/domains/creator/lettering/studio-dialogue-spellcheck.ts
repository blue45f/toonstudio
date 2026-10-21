/**
 * Studio Dialogue Spellcheck — 대사 맞춤법·띄어쓰기 1차 검사(순수 코어, 초안).
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * `studio-dialogue-batch.ts`는 배치된 대사를 읽기 순서로 수집하는 일까지 책임지고,
 * `studio-finish-quality.ts`는 내보내기 게이트에서 문서 전체를 판정한다. 그 사이에
 * "대사를 읽고 오탈자를 의심하는" 단계가 없었다 — 실무에서 가장 흔한 반려 사유가
 * 대사 오탈자인데 자동 검사가 전무했다(전 공정 완결성 감사 후보 1).
 *
 * 이 모듈이 추가하는 것:
 *  · 수집된 대사 목록(DialogueBatchItem[]) 위에 얹는 로컬 규칙 기반 검사.
 *    외부 API·네트워크·유료 사전 없이, 정밀도가 확인된 패턴만으로 판정한다.
 *  · 결과는 "의심" 목록이다. 자동 수정은 하지 않는다 — fix는 고치기 후보(스팬+교체안)를
 *    제시만 하고, 적용 여부는 사람이 패널에서 결정한다(대사는 사투리·의성어·캐릭터
 *    말투처럼 "일부러 틀린" 표기가 정상인 영역이다).
 *  · 요약(summary)은 QC 체크리스트(production-episode-qc)가 구조적으로 받아
 *    "대사 맞춤법 검사" 항목으로 합류시킬 수 있는 형태(errorCount/warningCount)를 제공한다.
 *
 * 정직성 규칙:
 *  · 이 검사는 맞춤법 검사기가 아니다. 형태소 분석을 하지 않으므로 조사·어미의
 *    문맥 판단(안/않, 이/가, 로서/로써, 던지/든지 등)은 다루지 않는다 — 다루는 척
 *    거짓 양성(precision 낮은 지적)을 내는 것보다 비워 두는 쪽을 택했다.
 *  · 모든 지적 문구는 "의심"으로 표현한다. 확신이 없는 규칙은 severity를 낮춘다.
 *  · 잠긴 대사도 검사한다(읽기는 잠금과 무관). 숨김 대사는 기본 제외다.
 *
 * 규칙(studio-dialogue-batch.ts와 동일 규율):
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 사용자 노출 문자열은 한글.
 *  - 입력 배열/객체는 절대 변형하지 않는다.
 */

import { dialogueExcerpt, type DialogueBatchItem } from "./studio-dialogue-batch";

// ── 데이터 모델 ─────────────────────────────────────────────────────────────

export type DialogueSpellSeverity = "error" | "warning" | "info";

export type DialogueSpellRuleId =
  | "empty-dialogue"
  | "common-misspelling"
  | "spacing-dependent-noun"
  | "space-before-punctuation"
  | "double-space"
  | "missing-space-after-sentence"
  | "excess-blank-lines"
  | "edge-space"
  | "duplicate-dialogue"
  | "repeated-word"
  | "bubble-too-long"
  | "bubble-line-too-long"
  | "many-sentences"
  | "repeated-punctuation";

/** 고치기 후보 — 원문 text 안의 [start, end) 구간을 replacement로 바꾸면 되는 형태.
 *  v1 패널은 이 후보를 보여 주기만 하고 자동 적용하지 않는다. */
export interface DialogueSpellFix {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

export interface DialogueSpellFinding {
  readonly id: string;
  /** DialogueBatchItem.id */
  readonly itemId: string;
  readonly pageId: string;
  /** 0 기준 페이지 순번(표시할 땐 +1). */
  readonly pageIndex: number;
  readonly ruleId: DialogueSpellRuleId;
  readonly severity: DialogueSpellSeverity;
  /** 사용자에게 보여 줄 한 줄 설명 — 전부 "의심" 어조. */
  readonly message: string;
  /** 대사 한 줄 미리보기(패널 행 식별용). */
  readonly excerpt: string;
  /** 지적한 원문 구간. 대사 전체를 가리키는 규칙(빈 대사·길이 등)이면 없음. */
  readonly matchText?: string;
  readonly fix?: DialogueSpellFix;
}

export interface DialogueSpellcheckOptions {
  /** 숨김 대사도 검사(기본 false — 화면에 안 보이는 대사는 게시물에 없다). */
  readonly includeHidden?: boolean;
  /** 말풍선 대사 글자 수(공백·개행 제외) 경고 기준. 기본 60. */
  readonly maxBubbleChars?: number;
  /** 말풍선 한 줄 글자 수 경고 기준. 기본 20. */
  readonly maxBubbleLineChars?: number;
  /** 텍스트 요소 글자 수 참고 기준. 기본 140. */
  readonly maxTextChars?: number;
  /** 끄는 규칙. 말투·연출상 의도된 표기가 많은 작품에서 규칙 단위로 끌 수 있게 한다. */
  readonly disabledRules?: readonly DialogueSpellRuleId[];
}

/** QC 체크리스트 합류용 요약 — production-episode-qc의 extras 입력과 구조가 같다. */
export interface DialogueSpellcheckSummary {
  readonly totalItemCount: number;
  readonly checkedItemCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly findingCount: number;
  readonly byRule: Readonly<Partial<Record<DialogueSpellRuleId, number>>>;
}

// ── 규칙 1: 자주 틀리는 표기 사전 ──────────────────────────────────────────
// 정밀도 우선으로 고른 항목만 둔다. 문맥 판단이 필요한 쌍(안/않·던지/든지·
// 로서/로써·이/히 부사 전반)은 넣지 않았다 — 거짓 지적이 쌓이면 검사가 버려진다.

interface MisspellingEntry {
  readonly pattern: RegExp;
  /** 매치 구간을 이 문자열로 바꾸는 후보. $1 같은 캡처 참조를 쓸 수 있다. */
  readonly replacement: string;
  readonly message: string;
  readonly severity: DialogueSpellSeverity;
}

/**
 * 종성이 ㄹ인 한글 음절 전집 — '-(으)ㄹ게요' 약속 말끝 판정용으로 프로그램으로
 * 만든다. 약속·의지의 '게요'는 항상 ㄹ받침 음절(할·갈·있을·읽을…) 뒤에 붙으므로,
 * '께요' 앞 음절이 ㄹ받침일 때만 오기로 본다. 그래야 존댓말 조사 '께'가 붙은
 * "선생님께요·어머니께요" 같은 올바른 표기를 지적하지 않는다(오탐 0 우선).
 * 잔여 한계: ㄹ받침으로 끝나는 인명(민철 등)+께요는 여전히 걸릴 수 있다 —
 * 고유명사 판별은 형태소 분석 없이는 불가능해 문서화된 한계로 남긴다.
 */
const L_FINAL_SYLLABLE_CHARS = (() => {
  let chars = "";
  for (let initial = 0; initial < 19; initial += 1) {
    for (let medial = 0; medial < 21; medial += 1) {
      chars += String.fromCharCode(0xac00 + (initial * 21 + medial) * 28 + 8);
    }
  }
  return chars;
})();

const KE_YO_PROMISE_PATTERN = new RegExp(`([${L_FINAL_SYLLABLE_CHARS}])께요`, "g");

const MISSPELLINGS: readonly MisspellingEntry[] = [
  {
    pattern: /됬/g,
    replacement: "됐",
    message: "'됬'은 없는 표기예요. '됐'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /됀/g,
    replacement: "된",
    message: "'됀'은 없는 표기예요. '된'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /되요/g,
    replacement: "돼요",
    message: "'되요'는 줄인 말 '돼요'로 써요.",
    severity: "warning",
  },
  {
    pattern: /몇일/g,
    replacement: "며칠",
    message: "'몇일'이 아니라 '며칠'이 표준 표기예요.",
    severity: "warning",
  },
  {
    pattern: /오랫만/g,
    replacement: "오랜만",
    message: "'오랫만'이 아니라 '오랜만'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /금새/g,
    replacement: "금세",
    message: "'금새'는 '금세'의 잘못 알려진 표기예요.",
    severity: "warning",
  },
  {
    pattern: /어의없/g,
    replacement: "어이없",
    message: "'어의없다'가 아니라 '어이없다'예요.",
    severity: "warning",
  },
  {
    pattern: /희안/g,
    replacement: "희한",
    message: "'희안하다'가 아니라 '희한하다'예요.",
    severity: "warning",
  },
  {
    pattern: /설겆이/g,
    replacement: "설거지",
    message: "'설겆이'가 아니라 '설거지'예요.",
    severity: "warning",
  },
  {
    pattern: /깨끗히/g,
    replacement: "깨끗이",
    message: "'깨끗히'가 아니라 '깨끗이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /일일히/g,
    replacement: "일일이",
    message: "'일일히'가 아니라 '일일이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /어떻해/g,
    replacement: "어떡해",
    message: "'어떻해'가 아니라 '어떡해'예요.",
    severity: "warning",
  },
  {
    // 앞 음절이 ㄹ받침일 때만 매치한다(KE_YO_PROMISE_PATTERN, $1은 그 음절) —
    // 존댓말 조사 '께'+'요'(선생님께요 등)를 오기로 잡던 오탐을 막기 위한 가드.
    pattern: KE_YO_PROMISE_PATTERN,
    replacement: "$1게요",
    message: "약속·의지의 말끝은 '할게요'처럼 '게요'로 써요. (존댓말 조사 '께'와 다릅니다)",
    severity: "warning",
  },
  {
    pattern: /할께/g,
    replacement: "할게",
    message: "'할께'가 아니라 '할게'로 써요. 약속·의지의 말끝은 '게'예요. (존댓말 조사 '께'와 다릅니다)",
    severity: "warning",
  },
  {
    pattern: /될께/g,
    replacement: "될게",
    message: "'될께'가 아니라 '될게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /줄께/g,
    replacement: "줄게",
    message: "'줄께'가 아니라 '줄게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /그럴께/g,
    replacement: "그럴게",
    message: "'그럴께'가 아니라 '그럴게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /갈께/g,
    replacement: "갈게",
    message: "'갈께'가 아니라 '갈게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /있을께/g,
    replacement: "있을게",
    message: "'있을께'가 아니라 '있을게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /웬지/g,
    replacement: "왠지",
    message: "'웬지'가 아니라 '왠지'예요.",
    severity: "warning",
  },
  {
    pattern: /왠만/g,
    replacement: "웬만",
    message: "'왠만하면'이 아니라 '웬만하면'이에요.",
    severity: "warning",
  },
  {
    pattern: /뭐에요/g,
    replacement: "뭐예요",
    message: "'뭐에요'가 아니라 '뭐예요'예요.",
    severity: "warning",
  },
  {
    pattern: /슴니다/g,
    replacement: "습니다",
    message: "'있슴니다' 같은 표기는 '있습니다'로 써요.",
    severity: "warning",
  },
  {
    pattern: /읍니다/g,
    replacement: "습니다",
    message: "'읍니다'는 옛 표기예요. 지금은 '습니다'로 써요.",
    severity: "info",
  },
  {
    pattern: /바램/g,
    replacement: "바람",
    message: "소망의 뜻이면 '바램'이 아니라 '바람'이 표준이에요.",
    severity: "info",
  },

  // ── 사전 확장(2차): 무모호 오기 100+ 목표분 ──────────────────────────
  // 문맥 판별이 필요한 항목(안/않·던지/든지·맞히다/맡기다 식 교정 방향이
  // 갈리는 경우)은 계속 제외한다. 오탐 0이 검출률보다 우선이다.
  // -려고 오용 — ㄹ어간 정형(살려고·만들려고)은 넣지 않았다.
  {
    pattern: /할려고/g,
    replacement: "하려고",
    message: "'할려고'이 아니라 '하려고'로 써요.",
    severity: "warning",
  },
  {
    pattern: /될려고/g,
    replacement: "되려고",
    message: "'될려고'이 아니라 '되려고'로 써요.",
    severity: "warning",
  },
  {
    pattern: /갈려고/g,
    replacement: "가려고",
    message: "'갈려고'이 아니라 '가려고'로 써요.",
    severity: "warning",
  },
  {
    pattern: /볼려고/g,
    replacement: "보려고",
    message: "'볼려고'이 아니라 '보려고'로 써요.",
    severity: "warning",
  },
  {
    pattern: /줄려고/g,
    replacement: "주려고",
    message: "'줄려고'이 아니라 '주려고'로 써요.",
    severity: "warning",
  },
  {
    pattern: /올려고/g,
    replacement: "오려고",
    message: "'올려고'이 아니라 '오려고'로 써요.",
    severity: "warning",
  },
  {
    pattern: /먹을려고/g,
    replacement: "먹으려고",
    message: "'먹을려고'이 아니라 '먹으려고'로 써요.",
    severity: "warning",
  },
  // '-께' 말끝 추가분 — 위 1차분과 같은 규약(동사 어간 한정).
  {
    pattern: /볼께/g,
    replacement: "볼게",
    message: "'볼께'이 아니라 '볼게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /올께/g,
    replacement: "올게",
    message: "'올께'이 아니라 '올게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /먹을께/g,
    replacement: "먹을게",
    message: "'먹을께'이 아니라 '먹을게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /기다릴께/g,
    replacement: "기다릴게",
    message: "'기다릴께'이 아니라 '기다릴게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /만날께/g,
    replacement: "만날게",
    message: "'만날께'이 아니라 '만날게'로 써요.",
    severity: "warning",
  },
  {
    pattern: /보낼께/g,
    replacement: "보낼게",
    message: "'보낼께'이 아니라 '보낼게'로 써요.",
    severity: "warning",
  },
  // 드러나다 계열 — '들어-'로 시작하는 정형은 없다.
  {
    pattern: /들어나다/g,
    replacement: "드러나다",
    message: "'들어나다'이 아니라 '드러나다'로 써요.",
    severity: "warning",
  },
  {
    pattern: /들어났/g,
    replacement: "드러났",
    message: "'들어났'이 아니라 '드러났'로 써요.",
    severity: "warning",
  },
  {
    pattern: /들어내다/g,
    replacement: "드러내다",
    message: "'들어내다'이 아니라 '드러내다'로 써요.",
    severity: "warning",
  },
  // 요새·웬일 — '왠지'는 정형이라 건드리지 않는다. '요세미티'(고유명사)는 제외.
  {
    pattern: /요세(?!미티)/g,
    replacement: "요새",
    message: "'요세'이 아니라 '요새'로 써요.",
    severity: "warning",
  },
  {
    pattern: /왠일/g,
    replacement: "웬일",
    message: "'왠일'이 아니라 '웬일'로 써요.",
    severity: "warning",
  },
  // 명사 오기 — 정형과 음절이 겹치지 않는 것만.
  {
    pattern: /역활/g,
    replacement: "역할",
    message: "'역활'이 아니라 '역할'로 써요.",
    severity: "warning",
  },
  {
    pattern: /궁굼/g,
    replacement: "궁금",
    message: "'궁굼'이 아니라 '궁금'로 써요.",
    severity: "warning",
  },
  {
    pattern: /닭계장/g,
    replacement: "닭개장",
    message: "'닭계장'이 아니라 '닭개장'로 써요.",
    severity: "warning",
  },
  {
    pattern: /육계장/g,
    replacement: "육개장",
    message: "'육계장'이 아니라 '육개장'로 써요.",
    severity: "warning",
  },
  {
    pattern: /미싯가루/g,
    replacement: "미숫가루",
    message: "'미싯가루'이 아니라 '미숫가루'로 써요.",
    severity: "warning",
  },
  {
    pattern: /삭월세/g,
    replacement: "사글세",
    message: "'삭월세'이 아니라 '사글세'로 써요.",
    severity: "warning",
  },
  {
    pattern: /댓가/g,
    replacement: "대가",
    message: "'댓가'이 아니라 '대가'로 써요.",
    severity: "warning",
  },
  {
    pattern: /짜집기/g,
    replacement: "짜깁기",
    message: "'짜집기'이 아니라 '짜깁기'로 써요.",
    severity: "warning",
  },
  {
    pattern: /짜투리/g,
    replacement: "자투리",
    message: "'짜투리'이 아니라 '자투리'로 써요.",
    severity: "warning",
  },
  // 부사 '-이' 정형인데 '-히'로 잘못 쓰는 경우.
  {
    pattern: /곰곰히/g,
    replacement: "곰곰이",
    message: "'곰곰히'이 아니라 '곰곰이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /뚜렷히/g,
    replacement: "뚜렷이",
    message: "'뚜렷히'이 아니라 '뚜렷이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /번번히/g,
    replacement: "번번이",
    message: "'번번히'이 아니라 '번번이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /깊숙히/g,
    replacement: "깊숙이",
    message: "'깊숙히'이 아니라 '깊숙이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /빽빽히/g,
    replacement: "빽빽이",
    message: "'빽빽히'이 아니라 '빽빽이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /촘촘히/g,
    replacement: "촘촘이",
    message: "'촘촘히'이 아니라 '촘촘이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /틈틈히/g,
    replacement: "틈틈이",
    message: "'틈틈히'이 아니라 '틈틈이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /곳곳히/g,
    replacement: "곳곳이",
    message: "'곳곳히'이 아니라 '곳곳이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /샅샅히/g,
    replacement: "샅샅이",
    message: "'샅샅히'이 아니라 '샅샅이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /낱낱히/g,
    replacement: "낱낱이",
    message: "'낱낱히'이 아니라 '낱낱이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /족족히/g,
    replacement: "족족이",
    message: "'족족히'이 아니라 '족족이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /듬직히/g,
    replacement: "듬직이",
    message: "'듬직히'이 아니라 '듬직이'로 써요.",
    severity: "warning",
  },
  // 부사 '-히' 정형인데 '-이'로 잘못 쓰는 경우(솔직히·꼼꼼히 부류).
  {
    pattern: /솔직이/g,
    replacement: "솔직히",
    message: "'솔직이'이 아니라 '솔직히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /꼼꼼이/g,
    replacement: "꼼꼼히",
    message: "'꼼꼼이'이 아니라 '꼼꼼히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /가만이/g,
    replacement: "가만히",
    message: "'가만이'이 아니라 '가만히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /조용이/g,
    replacement: "조용히",
    message: "'조용이'이 아니라 '조용히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /편안이/g,
    replacement: "편안히",
    message: "'편안이'이 아니라 '편안히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /무사이/g,
    replacement: "무사히",
    message: "'무사이'이 아니라 '무사히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /대단이/g,
    replacement: "대단히",
    message: "'대단이'이 아니라 '대단히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /특별이/g,
    replacement: "특별히",
    message: "'특별이'이 아니라 '특별히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /확실이/g,
    replacement: "확실히",
    message: "'확실이'이 아니라 '확실히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /당연이/g,
    replacement: "당연히",
    message: "'당연이'이 아니라 '당연히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /갑작이/g,
    replacement: "갑자기",
    message: "'갑작이'이 아니라 '갑자기'로 써요.",
    severity: "warning",
  },
  {
    pattern: /천천이/g,
    replacement: "천천히",
    message: "'천천이'이 아니라 '천천히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /단단이/g,
    replacement: "단단히",
    message: "'단단이'이 아니라 '단단히'로 써요.",
    severity: "warning",
  },
  {
    pattern: /튼튼이/g,
    replacement: "튼튼히",
    message: "'튼튼이'이 아니라 '튼튼히'로 써요.",
    severity: "warning",
  },
  // 기타 명사·부사 어간 오기.
  {
    pattern: /나즈막히/g,
    replacement: "나지막이",
    message: "'나즈막히'이 아니라 '나지막이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /나즈막(?!히)/g,
    replacement: "나지막",
    message: "'나즈막'이 아니라 '나지막'로 써요.",
    severity: "warning",
  },
  {
    pattern: /두리뭉실/g,
    replacement: "두루뭉술",
    message: "'두리뭉실'이 아니라 '두루뭉술'로 써요.",
    severity: "warning",
  },
  {
    pattern: /귀뜸/g,
    replacement: "귀띔",
    message: "'귀뜸'이 아니라 '귀띔'로 써요.",
    severity: "warning",
  },
  {
    pattern: /눈꼽/g,
    replacement: "눈곱",
    message: "'눈꼽'이 아니라 '눈곱'로 써요.",
    severity: "warning",
  },
  {
    pattern: /눈쌀/g,
    replacement: "눈살",
    message: "'눈쌀'이 아니라 '눈살'로 써요.",
    severity: "warning",
  },
  // 부사·연결 표현 오기.
  {
    pattern: /도데체/g,
    replacement: "도대체",
    message: "'도데체'이 아니라 '도대체'로 써요.",
    severity: "warning",
  },
  {
    pattern: /어짜피/g,
    replacement: "어차피",
    message: "'어짜피'이 아니라 '어차피'로 써요.",
    severity: "warning",
  },
  {
    pattern: /하마트면/g,
    replacement: "하마터면",
    message: "'하마트면'이 아니라 '하마터면'로 써요.",
    severity: "warning",
  },
  {
    pattern: /단언컨데/g,
    replacement: "단언컨대",
    message: "'단언컨데'이 아니라 '단언컨대'로 써요.",
    severity: "warning",
  },
  {
    pattern: /애시당초/g,
    replacement: "애초",
    message: "'애시당초'이 아니라 '애초'로 써요.",
    severity: "warning",
  },
  {
    pattern: /여지껏/g,
    replacement: "여태껏",
    message: "'여지껏'이 아니라 '여태껏'로 써요.",
    severity: "warning",
  },
  // 설렘·헤매 계열 — '헤메'는 '헤메다·헤메이다'의 어간 오기를 함께 잡는다.
  {
    pattern: /설레임/g,
    replacement: "설렘",
    message: "'설레임'이 아니라 '설렘'로 써요.",
    severity: "warning",
  },
  {
    pattern: /설레이다/g,
    replacement: "설레다",
    message: "'설레이다'이 아니라 '설레다'로 써요.",
    severity: "warning",
  },
  {
    pattern: /헤메/g,
    replacement: "헤매",
    message: "'헤메'이 아니라 '헤매'로 써요.",
    severity: "warning",
  },
  // 외래어 표기 오기 — 표준 표기가 하나로 정해진 것만.
  {
    pattern: /메세지/g,
    replacement: "메시지",
    message: "'메세지'이 아니라 '메시지'로 써요.",
    severity: "warning",
  },
  {
    pattern: /메신져/g,
    replacement: "메신저",
    message: "'메신져'이 아니라 '메신저'로 써요.",
    severity: "warning",
  },
  {
    pattern: /컨닝/g,
    replacement: "커닝",
    message: "'컨닝'이 아니라 '커닝'로 써요.",
    severity: "warning",
  },
  {
    pattern: /케익/g,
    replacement: "케이크",
    message: "'케익'이 아니라 '케이크'로 써요.",
    severity: "warning",
  },
  {
    pattern: /쥬스/g,
    replacement: "주스",
    message: "'쥬스'이 아니라 '주스'로 써요.",
    severity: "warning",
  },
  {
    pattern: /빠마/g,
    replacement: "파마",
    message: "'빠마'이 아니라 '파마'로 써요.",
    severity: "warning",
  },
  {
    pattern: /리모컨/g,
    replacement: "리모콘",
    message: "'리모컨'이 아니라 '리모콘'로 써요.",
    severity: "warning",
  },
  {
    pattern: /에어콘/g,
    replacement: "에어컨",
    message: "'에어콘'이 아니라 '에어컨'로 써요.",
    severity: "warning",
  },
  // 불규칙 활용 오기 — 활용형 자체가 존재하지 않는 형태만.
  {
    pattern: /잠궈/g,
    replacement: "잠가",
    message: "'잠궈'이 아니라 '잠가'로 써요.",
    severity: "warning",
  },
  {
    pattern: /잠궜/g,
    replacement: "잠갔",
    message: "'잠궜'이 아니라 '잠갔'로 써요.",
    severity: "warning",
  },
  {
    pattern: /담궈/g,
    replacement: "담가",
    message: "'담궈'이 아니라 '담가'로 써요.",
    severity: "warning",
  },
  {
    pattern: /담궜/g,
    replacement: "담갔",
    message: "'담궜'이 아니라 '담갔'로 써요.",
    severity: "warning",
  },
  {
    pattern: /치뤄/g,
    replacement: "치러",
    message: "'치뤄'이 아니라 '치러'로 써요.",
    severity: "warning",
  },
  {
    pattern: /치뤘/g,
    replacement: "치렀",
    message: "'치뤘'이 아니라 '치렀'로 써요.",
    severity: "warning",
  },
  {
    pattern: /부셔/g,
    replacement: "부숴",
    message: "'부셔'이 아니라 '부숴'로 써요.",
    severity: "warning",
  },
  {
    pattern: /건내/g,
    replacement: "건네",
    message: "'건내'이 아니라 '건네'로 써요.",
    severity: "warning",
  },
  {
    pattern: /갖어/g,
    replacement: "가져",
    message: "'갖어'이 아니라 '가져'로 써요.",
    severity: "warning",
  },
  {
    pattern: /맡히다/g,
    replacement: "맡기다",
    message: "'맡히다'이 아니라 '맡기다'로 써요.",
    severity: "warning",
  },
  // 형용사 어간 오기.
  {
    pattern: /이쁘/g,
    replacement: "예쁘",
    message: "'이쁘'이 아니라 '예쁘'로 써요.",
    severity: "warning",
  },
  {
    pattern: /이뻐/g,
    replacement: "예뻐",
    message: "'이뻐'이 아니라 '예뻐'로 써요.",
    severity: "warning",
  },
  {
    pattern: /기엽/g,
    replacement: "귀엽",
    message: "'기엽'이 아니라 '귀엽'로 써요.",
    severity: "warning",
  },
  {
    pattern: /짓굿/g,
    replacement: "짓궂",
    message: "'짓굿'이 아니라 '짓궂'로 써요.",
    severity: "warning",
  },
  // '-대로' 오기 — 장소 '데'와 문맥 판별이 필요한 경우는 넣지 않았다.
  {
    pattern: /마음데로/g,
    replacement: "마음대로",
    message: "'마음데로'이 아니라 '마음대로'로 써요.",
    severity: "warning",
  },
  {
    pattern: /제멋데로/g,
    replacement: "제멋대로",
    message: "'제멋데로'이 아니라 '제멋대로'로 써요.",
    severity: "warning",
  },
  // 기타 무모호 오기.
  {
    pattern: /익숙치/g,
    replacement: "익숙지",
    message: "'익숙치'이 아니라 '익숙지'로 써요.",
    severity: "warning",
  },
  {
    pattern: /오랜동안/g,
    replacement: "오랫동안",
    message: "'오랜동안'이 아니라 '오랫동안'로 써요.",
    severity: "warning",
  },
  // '-에요' 오용 — 앞말이 정해진 고정 형태만.
  {
    pattern: /거에요/g,
    replacement: "거예요",
    message: "'거에요'이 아니라 '거예요'로 써요.",
    severity: "warning",
  },
  {
    pattern: /아니예요/g,
    replacement: "아니에요",
    message: "'아니예요'이 아니라 '아니에요'로 써요.",
    severity: "warning",
  },
  {
    pattern: /무엇에요/g,
    replacement: "무엇이에요",
    message: "'무엇에요'이 아니라 '무엇이에요'로 써요.",
    severity: "warning",
  },
  // 어떡·어쨌든 계열.
  {
    pattern: /어떻하/g,
    replacement: "어떡하",
    message: "'어떻하'이 아니라 '어떡하'로 써요.",
    severity: "warning",
  },
  {
    pattern: /어쨋든/g,
    replacement: "어쨌든",
    message: "'어쨋든'이 아니라 '어쨌든'로 써요.",
    severity: "warning",
  },
  {
    pattern: /어쨌던/g,
    replacement: "어쨌든",
    message: "'어쨌던'이 아니라 '어쨌든'로 써요.",
    severity: "warning",
  },
  // 붓다 활용 오기.
  {
    pattern: /붇어/g,
    replacement: "부어",
    message: "'붇어'이 아니라 '부어'로 써요.",
    severity: "warning",
  },
  {
    pattern: /붇다/g,
    replacement: "붓다",
    message: "'붇다'이 아니라 '붓다'로 써요.",
    severity: "warning",
  },
  // 기타 무모호 오기.
  {
    pattern: /(^|\s)만히/g,
    replacement: "$1많이",
    message: "'만히'이 아니라 '많이'로 써요.",
    severity: "warning",
  },

  // ── 사전 확장(3차): 음식·일상 무모호 오기 ──────────────────────────
  // 정형과 음절이 겹치거나 문맥 판별이 필요한 항목(찌게 단독·베게 등)은
  // 계속 제외한다 — '김치찌게'처럼 앞말이 고정된 형태만 넣었다.
  {
    pattern: /곱배기/g,
    replacement: "곱빼기",
    message: "'곱배기'이 아니라 '곱빼기'로 써요.",
    severity: "warning",
  },
  {
    pattern: /떡볶기/g,
    replacement: "떡볶이",
    message: "'떡볶기'이 아니라 '떡볶이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /수재비/g,
    replacement: "수제비",
    message: "'수재비'이 아니라 '수제비'로 써요.",
    severity: "warning",
  },
  {
    pattern: /뚝빼기/g,
    replacement: "뚝배기",
    message: "'뚝빼기'이 아니라 '뚝배기'로 써요.",
    severity: "warning",
  },
  {
    pattern: /돈까스/g,
    replacement: "돈가스",
    message: "'돈까스'이 아니라 '돈가스'로 써요.",
    severity: "warning",
  },
  {
    pattern: /김치찌게/g,
    replacement: "김치찌개",
    message: "'김치찌게'이 아니라 '김치찌개'로 써요.",
    severity: "warning",
  },
  {
    pattern: /된장찌게/g,
    replacement: "된장찌개",
    message: "'된장찌게'이 아니라 '된장찌개'로 써요.",
    severity: "warning",
  },
  {
    pattern: /순댓국/g,
    replacement: "순대국",
    message: "'순댓국'이 아니라 '순대국'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /후라이드/g,
    replacement: "프라이드",
    message: "'후라이드'이 아니라 '프라이드'로 써요.",
    severity: "warning",
  },
  // 관용·한자어 오기 — 표준 형태가 하나로 정해진 것만.
  {
    pattern: /주구장창/g,
    replacement: "주야장천",
    message: "'주구장창'이 아니라 '주야장천'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /희노애락/g,
    replacement: "희로애락",
    message: "'희노애락'이 아니라 '희로애락'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /문뜩/g,
    replacement: "문득",
    message: "'문뜩'이 아니라 '문득'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /번뜩/g,
    replacement: "번득",
    message: "'번뜩'이 아니라 '번득'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /새카맣/g,
    replacement: "새까맣",
    message: "'새카맣'이 아니라 '새까맣'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /귀저기/g,
    replacement: "기저귀",
    message: "'귀저기'이 아니라 '기저귀'로 써요.",
    severity: "warning",
  },
  {
    pattern: /작작년/g,
    replacement: "재작년",
    message: "'작작년'이 아니라 '재작년'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /찝찝/g,
    replacement: "찜찜",
    message: "'찝찝'이 아니라 '찜찜'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /밤세/g,
    replacement: "밤새",
    message: "'밤세'이 아니라 '밤새'로 써요.",
    severity: "warning",
  },
];

// ── 규칙 2: 띄어쓰기 휴리스틱 ──────────────────────────────────────────────
// 의존명사가 앞말에 붙은 대표 형태만 본다. 조사가 붙는 것은 정상이므로 건드리지 않는다.

interface SpacingEntry {
  readonly pattern: RegExp;
  readonly replacement: string;
  readonly message: string;
}

const SPACING_PATTERNS: readonly SpacingEntry[] = [
  {
    pattern: /것같(다|아|요|네|은|고|지)/g,
    replacement: "것 같$1",
    message: "'것 같다'는 의존명사 '것'을 띄어 써요.",
  },
  {
    pattern: /수있(다|어|는|을|고|네)/g,
    replacement: "수 있$1",
    message: "'할 수 있다'처럼 의존명사 '수'를 띄어 써요.",
  },
  {
    pattern: /수없(다|어|는|을|고|네)/g,
    replacement: "수 없$1",
    message: "'할 수 없다'처럼 의존명사 '수'를 띄어 써요.",
  },
];

// ── 내부 유틸 ──────────────────────────────────────────────────────────────

function normalizeForDuplicate(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function countNonSpaceChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

/** 의성어·의태어처럼 같은 글자를 겹쳐 만든 어절인지 — 반복 지적에서 제외한다. */
function looksLikeSoundWord(word: string): boolean {
  if (word.length <= 1) return true;
  const chars = Array.from(word);
  return chars.every((ch) => ch === chars[0]);
}

// ── 검사 본체 ──────────────────────────────────────────────────────────────

/**
 * 수집된 대사 목록을 검사해 의심 목록을 돌려준다.
 * 정렬은 결정적이다: 목록 순서 → 원문 위치 → 규칙 선언 순서.
 */
export function checkDialogueSpelling(
  items: readonly DialogueBatchItem[],
  options: DialogueSpellcheckOptions = {},
): DialogueSpellFinding[] {
  const includeHidden = options.includeHidden ?? false;
  const maxBubbleChars = options.maxBubbleChars ?? 60;
  const maxBubbleLineChars = options.maxBubbleLineChars ?? 20;
  const maxTextChars = options.maxTextChars ?? 140;
  const disabled = new Set(options.disabledRules ?? []);

  const findings: DialogueSpellFinding[] = [];
  const seenTexts = new Map<string, DialogueBatchItem>();

  const push = (
    item: DialogueBatchItem,
    ruleId: DialogueSpellRuleId,
    severity: DialogueSpellSeverity,
    message: string,
    extra?: { matchText?: string; fix?: DialogueSpellFix },
  ) => {
    if (disabled.has(ruleId)) return;
    findings.push({
      id: `${item.id}:${ruleId}:${extra?.fix?.start ?? findings.length}`,
      itemId: item.id,
      pageId: item.pageId,
      pageIndex: item.pageIndex,
      ruleId,
      severity,
      message,
      excerpt: dialogueExcerpt(item.text),
      ...(extra?.matchText !== undefined ? { matchText: extra.matchText } : {}),
      ...(extra?.fix ? { fix: extra.fix } : {}),
    });
  };

  for (const item of items) {
    if (item.hidden && !includeHidden) continue;
    const text = item.text;

    // 빈 대사 — 최종 검사(studio-finish-quality)의 DIALOGUE_EMPTY와 같은 판정을
    // 식자 단계에서 먼저 보여 주는 것이라 심각도를 맞췄다.
    if (!text.trim()) {
      push(
        item,
        "empty-dialogue",
        item.elType === "bubble" ? "error" : "warning",
        item.elType === "bubble"
          ? "말풍선 내용이 비어 있어요. 의도한 빈 말풍선인지 확인해 주세요."
          : "텍스트 내용이 비어 있어요. 불필요한 요소라면 지워 주세요.",
      );
      continue;
    }

    // 자주 틀리는 표기 — 먼저 선언된 항목이 구간을 차지하면 겹치는 후순위는
    // 건너뛴다(예: '기다릴께요'는 '기다릴께' 항목과 '께요' 범용 항목이 동시에
    // 걸리는데, 같은 자리를 두 번 지적하면 패널에 중복 제안이 쌓인다).
    const misspellingSpans: { readonly start: number; readonly end: number }[] = [];
    for (const entry of MISSPELLINGS) {
      for (const match of text.matchAll(entry.pattern)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (misspellingSpans.some((span) => start < span.end && span.start < end)) continue;
        misspellingSpans.push({ start, end });
        push(item, "common-misspelling", entry.severity, entry.message, {
          matchText: match[0],
          fix: {
            start,
            end,
            replacement: match[0].replace(entry.pattern, entry.replacement),
          },
        });
      }
    }

    // 띄어쓰기 — 의존명사 붙음. 여러 규칙의 매치를 본문 순서대로 모은다.
    // 규칙별 순회 그대로 두면 규칙 순서(것→수)로 나와 읽기 순서와 어긋난다.
    const spacingMatches: { readonly start: number; readonly text: string; readonly entry: SpacingEntry }[] = [];
    for (const entry of SPACING_PATTERNS) {
      for (const match of text.matchAll(entry.pattern)) {
        spacingMatches.push({ start: match.index ?? 0, text: match[0], entry });
      }
    }
    spacingMatches.sort((left, right) => left.start - right.start);
    for (const found of spacingMatches) {
      push(item, "spacing-dependent-noun", "warning", found.entry.message, {
        matchText: found.text,
        fix: {
          start: found.start,
          end: found.start + found.text.length,
          replacement: found.text.replace(found.entry.pattern, found.entry.replacement),
        },
      });
    }

    // 띄어쓰기 — 문장부호 앞 공백
    for (const match of text.matchAll(/\s+([.,!?…~])/g)) {
      const start = match.index ?? 0;
      push(item, "space-before-punctuation", "warning", "문장부호 앞에는 공백을 두지 않아요.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: match[1] ?? "" },
      });
    }

    // 띄어쓰기 — 연속 공백(줄바꿈 제외)
    for (const match of text.matchAll(/ {2,}/g)) {
      const start = match.index ?? 0;
      push(item, "double-space", "info", "공백이 여러 개 이어졌어요. 붙여넣기 흔적일 수 있어요.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: " " },
      });
    }

    // 띄어쓰기 — 문장이 붙음(부호 뒤 공백 없음)
    for (const match of text.matchAll(/([.!?…])([가-힣A-Za-z0-9])/g)) {
      const start = match.index ?? 0;
      push(
        item,
        "missing-space-after-sentence",
        "info",
        "문장이 끝난 뒤 공백 없이 다음 문장이 붙어 있어요.",
        {
          matchText: match[0],
          fix: { start, end: start + match[0].length, replacement: `${match[1]} ${match[2]}` },
        },
      );
    }

    // 빈 줄 과다
    for (const match of text.matchAll(/\n{3,}/g)) {
      const start = match.index ?? 0;
      push(item, "excess-blank-lines", "info", "빈 줄이 세 줄 이상 이어졌어요.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: "\n\n" },
      });
    }

    // 앞뒤 공백
    if (text !== text.trim()) {
      push(item, "edge-space", "info", "대사 앞뒤에 공백이 있어요.", {
        fix: { start: 0, end: text.length, replacement: text.trim() },
      });
    }

    // 같은 어절 반복 — 의성어·감탄 반복은 연출일 수 있어 제외하고 본다.
    for (const match of text.matchAll(/(\S+)[ \t]+\1(?=[\s.,!?…~]|$)/g)) {
      const word = match[1] ?? "";
      if (word.length < 2 || looksLikeSoundWord(word)) continue;
      const start = match.index ?? 0;
      push(item, "repeated-word", "warning", `같은 말이 두 번 이어졌어요: "${word}"`, {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: word },
      });
    }

    // 중복 대사 — 짧은 대답("응", "네")의 반복은 자연스러워서 제외한다.
    const normalized = normalizeForDuplicate(text);
    if (normalized.length >= 4) {
      const first = seenTexts.get(normalized);
      if (first) {
        push(
          item,
          "duplicate-dialogue",
          "warning",
          first.pageIndex === item.pageIndex
            ? "이 페이지에 똑같은 대사가 또 있어요. 복사 실수인지 확인해 주세요."
            : `${first.pageIndex + 1}페이지의 대사와 똑같아요. 복사 실수인지 확인해 주세요.`,
        );
      } else {
        seenTexts.set(normalized, item);
      }
    }

    // 말풍선 길이 — 실제 넘침 판정은 최종 검사(BUBBLE_TEXT_OVERFLOW)가 지오메트리로
    // 하고, 여기는 글자 수만으로 "읽기 전에 알아차리는" 경고다.
    const nonSpaceChars = countNonSpaceChars(text);
    if (item.elType === "bubble") {
      if (nonSpaceChars > maxBubbleChars) {
        push(
          item,
          "bubble-too-long",
          "warning",
          `한 말풍선에 대사가 길어요 (${nonSpaceChars}자). 말풍선을 나누면 읽기 쉬워요.`,
        );
      }
      const longestLine = Math.max(...text.split("\n").map((line) => countNonSpaceChars(line)));
      if (longestLine > maxBubbleLineChars) {
        push(
          item,
          "bubble-line-too-long",
          "warning",
          `한 줄이 길어요 (${longestLine}자). 줄바꿈 위치를 조정해 보세요.`,
        );
      }
    } else if (nonSpaceChars > maxTextChars) {
      push(item, "bubble-too-long", "info", `텍스트가 길어요 (${nonSpaceChars}자).`);
    }

    // 문장 수 — 말풍선 하나에 문장이 많으면 독자가 숨을 고르기 어렵다.
    const sentenceCount = text.split(/[.!?…]+/).filter((part) => part.trim().length > 0).length;
    if (item.elType === "bubble" && sentenceCount >= 4) {
      push(
        item,
        "many-sentences",
        "info",
        `한 말풍선에 문장이 ${sentenceCount}개예요. 나누면 호흡이 살아요.`,
      );
    }

    // 구두점 반복 — 만화 연출일 수 있어 참고로만 알린다.
    if (/([!?])\1{2,}|[.]{4,}|~{3,}/.test(text)) {
      push(
        item,
        "repeated-punctuation",
        "info",
        "느낌표·물음표·줄임표가 많이 겹쳤어요. 의도한 연출이면 그대로 두세요.",
      );
    }
  }

  return findings;
}

/** 검사 결과를 QC 합류·패널 요약 표시용으로 집계한다. */
export function summarizeDialogueSpellcheck(
  items: readonly DialogueBatchItem[],
  findings: readonly DialogueSpellFinding[],
  options: DialogueSpellcheckOptions = {},
): DialogueSpellcheckSummary {
  const includeHidden = options.includeHidden ?? false;
  const byRule: Partial<Record<DialogueSpellRuleId, number>> = {};
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const finding of findings) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1;
    if (finding.severity === "error") errorCount += 1;
    else if (finding.severity === "warning") warningCount += 1;
    else infoCount += 1;
  }
  return {
    totalItemCount: items.length,
    checkedItemCount: items.filter((item) => includeHidden || !item.hidden).length,
    errorCount,
    warningCount,
    infoCount,
    findingCount: findings.length,
    byRule,
  };
}
