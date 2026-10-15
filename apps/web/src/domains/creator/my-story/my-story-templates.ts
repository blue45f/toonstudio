/**
 * 내 이야기 주제 템플릿 팩 6종 — 순수 데이터 모듈.
 *
 * 한 팩은 ① 질문 세트(6~8문항) ② 컷 구조 골격(4컷/8컷) ③ 톤 프리셋 ④ 나레이션·말풍선 기본값을
 * 한 덩어리로 묶는다. 이웃 템플릿 카탈로그(studio-template-catalog.ts)처럼 데이터와 조회 함수만
 * 두고 화면·저장소를 알지 못한다.
 *
 * 주제 선정 근거: 모두의 창업 웹툰 아이디어 목록에서 개인 경험·기억의 웹툰화(24♥)와 유사 제안
 * (동네 이야기, 시니어 경력 기록, 금융·안전 교육용 만화)가 모였다.
 *
 * 정직성 규칙
 * - 질문·예시·컷 역할 이름은 틀일 뿐이다. 이야기 내용은 사용자의 답변에서만 온다.
 * - 안전·금융 팩은 사실을 대신 만들어 주지 않는다. 사실 확인 책임이 사용자에게 있음을 caution으로
 *   화면에 드러낸다.
 */

import {
  isMyStoryTemplateId,
  MY_STORY_TOPIC_TITLES,
  type MyStoryCutCount,
  type MyStoryCutDef,
  type MyStoryCutRoleId,
  type MyStoryQuestion,
  type MyStorySlotId,
  type MyStoryTemplate,
  type MyStoryTemplateId,
  type MyStoryToneId,
} from "./my-story-model";

function question(
  slot: MyStorySlotId,
  label: readonly [string, string],
  prompt: readonly [string, string],
  example: readonly [string, string],
): MyStoryQuestion {
  return Object.freeze({
    slot,
    labelKo: label[0],
    labelEn: label[1],
    promptKo: prompt[0],
    promptEn: prompt[1],
    exampleKo: example[0],
    exampleEn: example[1],
  });
}

function cut(
  role: MyStoryCutRoleId,
  from: readonly MyStorySlotId[],
  narrate: MyStorySlotId | null = null,
  say: MyStorySlotId | null = null,
): MyStoryCutDef {
  return Object.freeze({ role, from: Object.freeze([...from]), narrate, say });
}

function skeletons(
  four: readonly MyStoryCutDef[] | null,
  eight: readonly MyStoryCutDef[] | null,
): Readonly<Record<MyStoryCutCount, readonly MyStoryCutDef[] | null>> {
  return Object.freeze({
    4: four ? Object.freeze([...four]) : null,
    8: eight ? Object.freeze([...eight]) : null,
  });
}

const RETROSPECTIVE: MyStoryTemplate = {
  id: "retrospective",
  titleKo: MY_STORY_TOPIC_TITLES.retrospective.ko,
  titleEn: MY_STORY_TOPIC_TITLES.retrospective.en,
  summaryKo: "지나간 시절의 한 장면을 떠올려 적어요.",
  summaryEn: "Recall one scene from your past.",
  defaultTitleKo: "내 인생의 한 장면",
  defaultTitleEn: "A scene from my life",
  tags: ["회고", "추억", "성장"],
  questions: [
    question("when", ["언제", "When"], ["언제쯤의 이야기인가요?", "When did this happen?"], ["열두 살 여름방학", "The summer I turned twelve"]),
    question("where", ["어디서", "Where"], ["어디에서 있었던 일인가요?", "Where did it happen?"], ["외갓집 마당", "My grandparents' yard"]),
    question("who", ["누가", "Who"], ["그 장면에 누가 있었나요?", "Who was there?"], ["나와 동생, 외할머니", "Me, my sibling and my grandmother"]),
    question("event", ["무슨 일", "What happened"], ["그곳에서 무슨 일이 있었나요?", "What happened there?"], ["수돗가에 모여 수박을 나눠 먹었다", "We gathered at the tap and shared a watermelon"]),
    question(
      "turn",
      ["결정적 순간", "The moment"],
      ["지금도 또렷이 기억나는 순간(말·물건·장면)은요?", "Which moment (a line, an object, an image) do you still remember clearly?"],
      ["할머니가 “많이 먹어라” 하며 웃으셨다", "Grandma smiled and said, “Eat up.”"],
    ),
    question("feeling", ["그때 마음", "Feeling"], ["그때 어떤 마음이었나요?", "How did you feel then?"], ["배부르고 든든했다", "Full and safe"]),
    question("ending", ["그 뒤", "Afterwards"], ["그 일은 어떻게 이어지거나 끝났나요?", "How did it continue or end?"], ["방학이 끝나 집으로 돌아왔다", "The break ended and we went home"]),
    question(
      "message",
      ["한 줄", "One line"],
      ["그 시절의 나(또는 지금의 나)에게 전하고 싶은 한 줄은요?", "What one line would you tell your younger self, or yourself now?"],
      ["그날의 수박 맛을 잊지 말자", "Don't forget how that watermelon tasted"],
    ),
  ],
  cutCounts: [8, 4],
  skeletons: skeletons(
    [
      cut("open", ["when", "where", "who"], "when"),
      cut("event", ["event", "turn"], "event", "turn"),
      cut("feeling", ["feeling"], "feeling"),
      cut("closing", ["ending", "message"], "message"),
    ],
    [
      cut("open", ["when"], "when"),
      cut("place", ["where"], "where"),
      cut("cast", ["who"]),
      cut("event", ["event"], "event", "event"),
      cut("moment", ["turn"], "turn", "turn"),
      cut("feeling", ["feeling"], "feeling"),
      cut("aftermath", ["ending"], "ending"),
      cut("closing", ["message"], "message"),
    ],
  ),
  toneIds: ["warm-memory", "steady-record"],
  narration: { position: "top", maxChars: 40 },
  balloon: { kind: "dialogue", maxChars: 20 },
};

const FAMILY: MyStoryTemplate = {
  id: "family",
  titleKo: MY_STORY_TOPIC_TITLES.family.ko,
  titleEn: MY_STORY_TOPIC_TITLES.family.en,
  summaryKo: "가족 한 사람과의 기억을 남겨요.",
  summaryEn: "Keep a memory of someone in your family.",
  defaultTitleKo: "우리 가족 이야기",
  defaultTitleEn: "A story about my family",
  tags: ["가족", "기억", "부모"],
  questions: [
    question(
      "who",
      ["누가", "Who"],
      ["누구에 대한 이야기인가요? (이름 대신 호칭으로 적어 주세요)", "Who is this about? (Use a title like “Mom” instead of a name)"],
      ["엄마", "Mom"],
    ),
    question("where", ["어디서", "Where"], ["어디에서 있었던 일인가요?", "Where did it happen?"], ["부엌", "The kitchen"]),
    question("when", ["언제", "When"], ["언제쯤의 일인가요?", "When was it?"], ["내가 아팠던 겨울밤", "A winter night when I was sick"]),
    question("event", ["무슨 일", "What happened"], ["그날 함께 무슨 일이 있었나요?", "What happened between you that day?"], ["밤새 죽을 끓여 주셨다", "They cooked porridge for me all night"]),
    question(
      "turn",
      ["그분의 모습", "Their way"],
      ["그분의 말버릇이나 손길, 표정 중 기억나는 것은요?", "What do you remember of their words, touch or expression?"],
      ["“먹고 기운 내자” 하며 이마를 짚어 주셨다", "They felt my forehead and said, “Eat, you'll feel better.”"],
    ),
    question("feeling", ["그때 마음", "Feeling"], ["그때 어떤 마음이었나요?", "How did you feel then?"], ["미안하고 고마웠다", "Sorry and grateful"]),
    question("ending", ["그 뒤", "Afterwards"], ["그날 이후 어떻게 됐나요? 지금은요?", "What happened after that day, and now?"], ["지금도 아플 때면 그 죽이 생각난다", "Whenever I'm sick I still think of that porridge"]),
    question("message", ["전하고 싶은 말", "What to say"], ["그분께 전하고 싶은 한 줄은요?", "What one line would you tell them?"], ["그때 고마웠어요", "Thank you for back then"]),
  ],
  cutCounts: [8, 4],
  skeletons: skeletons(
    [
      cut("cast", ["who", "where", "when"], "when"),
      cut("event", ["event"], "event", "event"),
      cut("moment", ["turn", "feeling"], "feeling", "turn"),
      cut("closing", ["ending", "message"], "message"),
    ],
    [
      cut("cast", ["who"]),
      cut("place", ["where"], "where"),
      cut("open", ["when"], "when"),
      cut("event", ["event"], "event", "event"),
      cut("moment", ["turn"], "turn", "turn"),
      cut("feeling", ["feeling"], "feeling"),
      cut("aftermath", ["ending"], "ending"),
      cut("closing", ["message"], "message"),
    ],
  ),
  toneIds: ["warm-memory", "steady-record"],
  narration: { position: "bottom", maxChars: 40 },
  balloon: { kind: "dialogue", maxChars: 20 },
};

const NEIGHBORHOOD: MyStoryTemplate = {
  id: "neighborhood",
  titleKo: MY_STORY_TOPIC_TITLES.neighborhood.ko,
  titleEn: MY_STORY_TOPIC_TITLES.neighborhood.en,
  summaryKo: "내가 아는 동네의 한 풍경과 사람을 담아요.",
  summaryEn: "Capture a scene and the people of a place you know.",
  defaultTitleKo: "우리 동네 이야기",
  defaultTitleEn: "A story from my neighborhood",
  tags: ["동네", "골목", "이웃"],
  questions: [
    question("where", ["어느 동네", "Place"], ["어느 동네(골목·가게)의 이야기인가요?", "Which neighborhood, alley or shop is this about?"], ["시장 골목 끝 분식집", "The snack bar at the end of the market alley"]),
    question("who", ["누가", "Who"], ["그곳에는 어떤 사람들이 있나요? (호칭으로 적어 주세요)", "Who is there? (Use titles rather than names)"], ["분식집 이모, 단골 아저씨들", "The snack-bar auntie and the regulars"]),
    question("when", ["언제쯤", "When"], ["언제쯤의 모습인가요?", "When was this?"], ["내가 학교 다니던 때", "When I was still in school"]),
    question("event", ["무슨 일", "What happened"], ["그곳에서 어떤 일이 있었나요?", "What happened there?"], ["비 오는 날 우산을 빌려주셨다", "On a rainy day they lent me an umbrella"]),
    question("feeling", ["마음", "Feeling"], ["그때(또는 지금) 어떤 마음이 드나요?", "How did you feel then, or how do you feel now?"], ["고맙고 포근했다", "Thankful and warm"]),
    question("ending", ["지금은", "Today"], ["지금 그곳은 어떻게 됐나요?", "What has become of the place?"], ["가게는 문을 닫고 간판만 남았다", "The shop closed and only the sign remains"]),
    question("message", ["한 줄", "One line"], ["동네에 남기고 싶은 한 줄은요?", "What one line would you leave for the neighborhood?"], ["이 골목을 오래 기억하고 싶다", "I want to remember this alley for a long time"]),
  ],
  cutCounts: [4],
  skeletons: skeletons(
    [
      cut("place", ["where"], "where"),
      cut("cast", ["who", "when"], "when"),
      cut("event", ["event", "feeling"], "event", "event"),
      cut("closing", ["ending", "message"], "message"),
    ],
    null,
  ),
  toneIds: ["friendly-neighbor", "warm-memory"],
  narration: { position: "bottom", maxChars: 36 },
  balloon: { kind: "dialogue", maxChars: 18 },
};

const CAREER: MyStoryTemplate = {
  id: "career",
  titleKo: MY_STORY_TOPIC_TITLES.career.ko,
  titleEn: MY_STORY_TOPIC_TITLES.career.en,
  summaryKo: "일하며 겪은 가장 큰 순간을 기록해요.",
  summaryEn: "Record the biggest moment of your working life.",
  defaultTitleKo: "나의 일 이야기",
  defaultTitleEn: "A story from my working life",
  tags: ["경력", "직업", "시니어"],
  questions: [
    question("when", ["언제", "When"], ["언제 무렵의 이야기인가요?", "Roughly when was this?"], ["입사 3년 차 겨울", "My third winter at the company"]),
    question("where", ["어디서", "Where"], ["어떤 일터(현장)였나요?", "What was the workplace?"], ["공장 생산 라인", "A factory production line"]),
    question("who", ["나의 역할", "My role"], ["그때 나는 어떤 일을 맡고 있었나요? 함께한 사람은요?", "What was your job then, and who worked with you?"], ["생산 반장, 팀원 열 명과 함께", "Line supervisor with a team of ten"]),
    question("event", ["도전·사건", "Challenge"], ["가장 큰 도전이나 사건은 무엇이었나요?", "What was the biggest challenge or incident?"], ["납기 이틀 전 기계가 멈췄다", "The machine stopped two days before delivery"]),
    question(
      "turn",
      ["결정·배움", "Decision"],
      ["그때 내린 결정이나 배운 점은요?", "What did you decide, or what did you learn?"],
      ["밤새 작업 순서를 바꿔 다시 돌렸다", "We reordered the work overnight and ran it again"],
    ),
    question("feeling", ["그때 마음", "Feeling"], ["그때 어떤 마음이었나요?", "How did you feel then?"], ["막막했지만 책임감이 앞섰다", "Daunted, but my sense of duty came first"]),
    question("ending", ["결과", "Result"], ["결과는 어땠고, 무엇이 남았나요?", "How did it turn out, and what remained?"], ["납기를 맞췄고 그 방식이 매뉴얼이 됐다", "We met the deadline and the method became a manual"]),
    question("message", ["후배에게", "To the next"], ["후배(다음 세대)에게 전하고 싶은 한 줄은요?", "What one line would you pass on to the next generation?"], ["멈췄을 땐 순서부터 다시 보자", "When it stops, look at the order first"]),
  ],
  cutCounts: [8, 4],
  skeletons: skeletons(
    [
      cut("open", ["when", "where"], "when"),
      cut("cast", ["who", "event"], "event", "event"),
      cut("moment", ["turn", "feeling"], "turn", "turn"),
      cut("closing", ["ending", "message"], "message"),
    ],
    [
      cut("open", ["when"], "when"),
      cut("place", ["where"], "where"),
      cut("cast", ["who"], "who"),
      cut("event", ["event"], "event", "event"),
      cut("moment", ["turn"], "turn", "turn"),
      cut("feeling", ["feeling"], "feeling"),
      cut("aftermath", ["ending"], "ending"),
      cut("closing", ["message"], "message"),
    ],
  ),
  toneIds: ["steady-record", "warm-memory"],
  narration: { position: "top", maxChars: 44 },
  balloon: { kind: "dialogue", maxChars: 22 },
};

const SAFETY: MyStoryTemplate = {
  id: "safety",
  titleKo: MY_STORY_TOPIC_TITLES.safety.ko,
  titleEn: MY_STORY_TOPIC_TITLES.safety.en,
  summaryKo: "알려 주고 싶은 안전 수칙을 짧은 만화로 풀어요.",
  summaryEn: "Turn a safety rule you want to share into a short comic.",
  defaultTitleKo: "안전 수칙 한 컷 교육",
  defaultTitleEn: "A short lesson on a safety rule",
  tags: ["안전", "수칙", "교육"],
  questions: [
    question("where", ["상황·장소", "Where"], ["어떤 장소나 상황에서 일어나는 일인가요?", "In what place or situation does this happen?"], ["공사 현장 출입구", "A construction-site entrance"]),
    question("who", ["누가", "Who"], ["누가 겪는 상황인가요? (가상의 인물도 좋아요)", "Who goes through it? (A made-up character is fine)"], ["처음 출근한 신입 직원", "A new hire on their first day"]),
    question("event", ["위험한 순간", "Risky moment"], ["어떤 위험한 순간이 생기나요?", "What risky moment comes up?"], ["안전모 없이 안으로 들어가려 했다", "They tried to walk in without a helmet"]),
    question("turn", ["올바른 행동", "What to do"], ["그때 지켜야 할 올바른 행동(수칙)은 무엇인가요?", "What is the right action (the rule) to follow?"], ["출입 전에 안전모와 안전화를 확인한다", "Check the helmet and boots before entering"]),
    question("ending", ["결과", "Result"], ["수칙을 지키면(또는 어기면) 어떻게 되나요?", "What happens if the rule is followed, or broken?"], ["선배가 막아 줘서 다치지 않았다", "A senior stopped them and nobody got hurt"]),
    question("message", ["수칙 한 줄", "The rule"], ["꼭 기억해야 할 수칙 한 줄은요?", "What one-line rule must be remembered?"], ["들어가기 전, 안전모부터", "Before you enter, helmet first"]),
  ],
  cutCounts: [4],
  skeletons: skeletons(
    [
      cut("situation", ["where", "who"], "where"),
      cut("risk", ["event"], "event", "event"),
      cut("rule", ["turn"], "turn", "turn"),
      cut("result", ["ending", "message"], "message"),
    ],
    null,
  ),
  toneIds: ["clear-guide", "calm-caution"],
  narration: { position: "bottom", maxChars: 28 },
  balloon: { kind: "dialogue", maxChars: 16 },
  cautionKo:
    "이 도구는 안전 수칙의 내용을 만들어 주지 않아요. 수칙은 관련 기관의 최신 안내로 직접 확인해서 적어 주세요.",
  cautionEn:
    "This tool does not write safety rules for you. Check each rule against the latest guidance from the relevant authority before you write it down.",
};

const FINANCE: MyStoryTemplate = {
  id: "finance",
  titleKo: MY_STORY_TOPIC_TITLES.finance.ko,
  titleEn: MY_STORY_TOPIC_TITLES.finance.en,
  summaryKo: "알아 두면 좋은 금융 상식을 이야기로 풀어요.",
  summaryEn: "Turn a piece of money know-how into a story.",
  defaultTitleKo: "금융 상식 한 컷 이야기",
  defaultTitleEn: "A short story about money basics",
  tags: ["금융", "사기 예방", "교육"],
  questions: [
    question("who", ["누가", "Who"], ["누가 겪는 상황인가요? (가상의 인물도 좋아요)", "Who goes through it? (A made-up character is fine)"], ["사회 초년생", "Someone in their first job"]),
    question("when", ["어떤 때", "When"], ["어떤 때 일어나는 일인가요?", "When does this happen?"], ["월급날 저녁, 모르는 번호로 전화가 왔다", "On payday evening a call came from an unknown number"]),
    question("event", ["벌어진 일", "What happened"], ["어떤 제안이나 문제가 생겼나요?", "What offer or problem came up?"], ["“저금리 대환대출”이라며 선입금을 요구했다", "They offered a “low-rate loan swap” and asked for money upfront"]),
    question("feeling", ["그때 마음", "Feeling"], ["그때 어떤 마음이 들었나요?", "How did it feel at that moment?"], ["솔깃하면서도 불안했다", "Tempted, but uneasy"]),
    question("turn", ["알아 둘 상식", "What to know"], ["이때 알아 두면 좋은 상식이나 올바른 판단은 무엇인가요?", "What should one know, or how should one judge here?"], ["대출 전에 돈부터 보내라는 요구는 의심한다", "Be suspicious of anyone who asks for money before a loan"]),
    question("ending", ["결과", "Result"], ["그래서 어떻게 됐나요?", "So what happened?"], ["전화를 끊고 공식 창구에 확인했다", "They hung up and checked with the official counter"]),
    question("message", ["기억할 한 줄", "Takeaway"], ["꼭 기억할 한 줄은요?", "What one line must be remembered?"], ["선입금 요구는 일단 멈춤", "A request for upfront money means stop"]),
  ],
  cutCounts: [4],
  skeletons: skeletons(
    [
      cut("situation", ["who", "when"], "when"),
      cut("risk", ["event", "feeling"], "event", "event"),
      cut("rule", ["turn"], "turn", "turn"),
      cut("result", ["ending", "message"], "message"),
    ],
    null,
  ),
  toneIds: ["clear-guide", "calm-caution"],
  narration: { position: "bottom", maxChars: 30 },
  balloon: { kind: "dialogue", maxChars: 18 },
  cautionKo:
    "투자나 금융 상품을 권하는 내용이 아니에요. 금리·한도·제도 같은 사실은 금융감독원 등 공식 자료로 확인해서 직접 적어 주세요.",
  cautionEn:
    "This is not investment or product advice. Verify facts such as rates, limits and rules with official sources before you write them in.",
};

/** 표시 순서가 곧 선택 화면 순서다. */
export const MY_STORY_TEMPLATES: readonly MyStoryTemplate[] = Object.freeze([
  RETROSPECTIVE,
  FAMILY,
  NEIGHBORHOOD,
  CAREER,
  SAFETY,
  FINANCE,
]);

const TEMPLATE_BY_ID: ReadonlyMap<MyStoryTemplateId, MyStoryTemplate> = new Map(
  MY_STORY_TEMPLATES.map((template) => [template.id, template]),
);

export function myStoryTemplateById(
  templateId: string | null | undefined,
): MyStoryTemplate | null {
  if (!isMyStoryTemplateId(templateId)) return null;
  return TEMPLATE_BY_ID.get(templateId) ?? null;
}

/** 템플릿이 지원하는 컷 수 중 요청값을 고르고, 지원하지 않으면 기본값(첫 항목)으로 돌린다. */
export function resolveMyStoryCutCount(
  template: MyStoryTemplate,
  requested: number | null | undefined,
): MyStoryCutCount {
  const matched = template.cutCounts.find((count) => count === requested);
  return matched ?? template.cutCounts[0] ?? 4;
}

/** 템플릿이 허용하는 톤 중 요청값을 고르고, 허용되지 않으면 기본 톤(첫 항목)으로 돌린다. */
export function resolveMyStoryToneId(
  template: MyStoryTemplate,
  requested: string | null | undefined,
): MyStoryToneId {
  const matched = template.toneIds.find((toneId) => toneId === requested);
  return matched ?? template.toneIds[0] ?? "warm-memory";
}

/** 컷 수에 맞는 골격. 지원하지 않는 컷 수면 기본 컷 수의 골격을 돌려준다. */
export function myStorySkeleton(
  template: MyStoryTemplate,
  cutCount: number | null | undefined,
): { readonly cutCount: MyStoryCutCount; readonly cuts: readonly MyStoryCutDef[] } {
  const resolved = resolveMyStoryCutCount(template, cutCount);
  return { cutCount: resolved, cuts: template.skeletons[resolved] ?? [] };
}
