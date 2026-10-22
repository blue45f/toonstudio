/**
 * Studio Dialogue Spellcheck — 자주 틀리는 표기 사전 항목(후반).
 *
 * 순서가 규칙 선언 순서(=지적 정렬 순서)라 후반/후반을 함부로 섞지 않는다.
 */

import type { MisspellingEntry } from "./studio-dialogue-spellcheck-dictionary";

export const MISSPELLING_ENTRIES_B: readonly MisspellingEntry[] = [
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
