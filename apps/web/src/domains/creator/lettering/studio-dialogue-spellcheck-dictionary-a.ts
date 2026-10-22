/**
 * Studio Dialogue Spellcheck — 자주 틀리는 표기 사전 항목(전반).
 *
 * 순서가 규칙 선언 순서(=지적 정렬 순서)라 전반/후반을 함부로 섞지 않는다.
 */

import type { MisspellingEntry } from "./studio-dialogue-spellcheck-dictionary";

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

export const MISSPELLING_ENTRIES_A: readonly MisspellingEntry[] = [
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
];
