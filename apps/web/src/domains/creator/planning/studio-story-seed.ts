/**
 * 스토리 씨앗 빌더 — 투닝 플러스 Stories의 "씨앗 동선" 흡수.
 *
 * 문제: 우리 기획 표면은 "이미 생각이 있는 사람"이 적는 표면뿐이라,
 * 빈 페이지에서 시작하는 사람은 로그라인 한 줄에서 막힌다.
 * 투닝 Stories는 장르+키워드 몇 개로 줄거리 초안을 만들어 "고르는 시작"을 준다.
 *
 * 이 모듈의 로컬 제공자는 LLM이 아니다. 장르별 씨앗 키트(갈등·감정선·절벽·
 * 전개 풀)와 입력 슬롯을 결정적으로 조합해 초안 골격을 만든다 — 같은 입력은
 * 항상 같은 초안이다(테스트 가능, 오프라인 동작). AI 제공자는 같은 계약
 * (StorySeedProvider)으로 갈아 끼우며, 실연결 명세는 AI_PROVIDER_SPEC.md.
 * 초안은 "작가가 고치고 채우는 골격"이며 완성 원고로 표기하지 않는다.
 */

export interface StorySeedSettingRef {
  readonly id: string;
  readonly kind: "character" | "location" | "lore";
  readonly name: string;
  /**
   * 인용 목록에서 사람이 판단할 수 있게 붙는 한 줄 설명 (선택).
   * 캐릭터는 시트 특징(personality→motivation→speechStyle), 로어는 허브 요약이 온다.
   * 생성 문장에 그대로 넣지 않는다 — 표시·판단용이다.
   */
  readonly detail?: string;
  /** 출처 표기 (선택) — 예: "캐릭터 시트", "세계관 허브 · 세력·조직". */
  readonly sourceLabel?: string;
}

export interface StorySeedInput {
  /** taxonomy GENRES 중 하나 (자유 문자열도 허용 — 폴백 키트 사용). */
  readonly genre: string;
  readonly keywords: readonly string[];
  /** 분위기 메모 (선택) — 예: "차분하게", "숨 가쁘게". */
  readonly tone?: string;
  /** 주인공 한 줄 (선택) — 비우면 장르 기본값/캐릭터 설정을 쓴다. */
  readonly protagonist?: string;
  /** 무대 (선택) — 비우면 장르 기본값/장소 설정을 쓴다. */
  readonly stage?: string;
  /** 설정 반영: 세계관 허브·캐릭터 시트에서 온 인용 (선택). */
  readonly settingRefs?: readonly StorySeedSettingRef[];
}

export interface StorySeedDraft {
  readonly id: string;
  readonly genre: string;
  readonly keywords: readonly string[];
  readonly loglineCandidates: readonly [string, string, string];
  readonly goalDraft: string;
  readonly synopsisDraft: string;
  readonly openingHookDraft: string;
  readonly coreConflictDraft: string;
  /** 작가가 채우는 전환점 골격 3개 (가이드 문장 형태). */
  readonly turningPointScaffold: readonly [string, string, string];
  readonly cliffhangerDraft: string;
  readonly emotionalArc: { readonly from: string; readonly to: string };
  /** 다음 전개 제안 3개 — 고르면 다음 씨앗/전환점으로 이어지는 선택지. */
  readonly expansionProposals: readonly [string, string, string];
  readonly referencedSettingIds: readonly string[];
  readonly source: "local" | "ai";
}

interface GenreSeedKit {
  readonly protagonist: string;
  readonly stage: string;
  readonly spareKeyword: string;
  readonly conflict: string;
  readonly hook: string;
  readonly emotionFrom: string;
  readonly emotionTo: string;
  readonly cliffhanger: string;
  readonly expansions: readonly [string, string, string];
}

const K = (
  protagonist: string,
  stage: string,
  spareKeyword: string,
  conflict: string,
  hook: string,
  emotionFrom: string,
  emotionTo: string,
  cliffhanger: string,
  expansions: readonly [string, string, string],
): GenreSeedKit => ({
  protagonist,
  stage,
  spareKeyword,
  conflict,
  hook,
  emotionFrom,
  emotionTo,
  cliffhanger,
  expansions,
});

/** 장르별 씨앗 키트 — 갈등의 모양과 감정 이동만 장르별로 다르고, 조립 틀은 공유한다. */
export const STORY_SEED_GENRE_KITS: Readonly<Record<string, GenreSeedKit>> = {
  "로맨스": K(
    "감정을 숨기는 데 익숙한 주인공",
    "두 사람이 자꾸만 마주치는 동네",
    "우연한 재회",
    "다가가고 싶은 마음과 다치기 싫은 마음이 부딪힌다",
    "피하려던 상대와 한 공간에 갇히는 첫 장면",
    "경계",
    "두근거림",
    "고백 직전, 걸려 온 한 통의 전화",
    ["상대의 비밀이 감정보다 먼저 드러난다", "제3자의 등장으로 관계가 삼각이 된다", "함께 해결해야 할 일이 생겨 거리가 좁혀진다"],
  ),
  "로판": K(
    "원작의 결말을 아는 주인공",
    "궁정과 사교계가 얽힌 제국",
    "바뀐 운명",
    "원작의 운명을 피하려는 선택이 더 큰 파국을 부른다",
    "죽음의 장면 직전, 눈을 뜨는 회귀의 첫 장면",
    "필사적",
    "주도적",
    "피하려던 그 사람이 먼저 손을 내민다",
    ["원작과 달라진 전개가 연쇄를 일으킨다", "악역으로 알던 인물의 다른 얼굴이 보인다", "황실의 음모가 주인공의 선택과 얽힌다"],
  ),
  "판타지": K(
    "선택받았지만 확신이 없는 주인공",
    "마법과 검의 질서가 무너져 가는 왕국",
    "고대의 예언",
    "세계를 구할 힘과 그 힘이 요구하는 대가가 충돌한다",
    "평범한 물건이 이상한 빛을 내는 첫 장면",
    "막막함",
    "각성",
    "지도에 없는 땅의 이름이 불린다",
    ["동료 한 명이 여정에 합류하며 조건을 건다", "적의 진짜 목적이 구출로 뒤집힌다", "힘의 대가가 구체적인 얼굴로 나타난다"],
  ),
  "현판": K(
    "각성에서 밀려난 헌터 지망생",
    "던전과 길드가 돈이 되는 현대 도시",
    "숨겨진 히든 클래스",
    "모두에게 무시당하는 현실과 혼자만 아는 기회가 충돌한다",
    "남들은 못 보는 상태창이 뜨는 첫 장면",
    "무력감",
    "반전의 쾌감",
    "랭킹 게시판 최하단에 낯익은 이름이 뜬다",
    ["숨긴 능력을 목격한 목격자가 생긴다", "길드의 스카우트 제안이 함정과 함께 온다", "던전 안에서만 통하는 규칙을 발견한다"],
  ),
  "무협": K(
    "사문을 잃은 방랑 검객",
    "문파의 이해가 갈리는 강호",
    "전설의 비급",
    "복수의 맹세와 지키고 싶은 사람들이 충돌한다",
    "비 오는 주막, 낡은 검집이 눈에 띄는 첫 장면",
    "고독",
    "결의",
    "죽은 줄 알았던 사형의 이름이 불린다",
    ["은원의 상대가 사실은 은인으로 드러난다", "무공 대결보다 먼저 와야 할 약속이 생긴다", "강호의 소문이 주인공을 먼저 찾아온다"],
  ),
  "액션": K(
    "과거를 숨기고 사는 해결사",
    "밤의 거래가 오가는 항구 도시",
    "마지막 의뢰",
    "끝내려던 일이 가장 소중한 사람을 건드린다",
    "조용하던 골목에 낯선 차량이 들어서는 첫 장면",
    "긴장",
    "폭발",
    "표적의 얼굴을 확인한 순간의 정지",
    ["아군으로 알던 인물이 조건을 바꾼다", "시간 제한이 걸리며 계획이 무너진다", "도망이 아니라 맞서는 선택을 한다"],
  ),
  "스릴러": K(
    "사건의 유일한 목격자",
    "모두가 무언가를 숨기는 작은 도시",
    "사라진 기록",
    "진실을 말하면 잃는 것과 침묵하면 잃는 것이 충돌한다",
    "있어야 할 것이 없는 방의 첫 장면",
    "불안",
    "확신",
    "범인으로 믿었던 사람의 알리바이가 성립한다",
    ["증거 하나가 시간 순서를 뒤집는다", "믿었던 조력자의 거짓말이 드러난다", "두 번째 사건이 첫 사건의 의미를 바꾼다"],
  ),
  "미스터리": K(
    "의뢰를 거절하지 못하는 탐정",
    "닫힌 공간이 많은 오래된 저택",
    "모순된 증언",
    "모든 용의자의 말이 조금씩 어긋나 진실이 가려진다",
    "사건 현장에서 단 하나, 어울리지 않는 물건의 첫 장면",
    "호기심",
    "통찰",
    "해결됐다고 생각한 순간 나타나는 새 단서",
    ["용의자 전원의 알리바이에 공통의 빈틈이 있다", "피해자의 습관이 범행을 설계한다", "탐정 자신이 단서를 잘못 읽었음이 드러난다"],
  ),
  "드라마": K(
    "가족과 거리를 두고 살아온 주인공",
    "오래된 골목의 가게와 집들",
    "돌아온 가족",
    "미안함과 원망이 한 식탁에서 충돌한다",
    "닫았던 가게 문을 다시 여는 첫 장면",
    "어색함",
    "화해의 실마리",
    "숨겨 왔던 편지 한 통이 발견된다",
    ["가족의 비밀이 현재의 선택을 바꾼다", "이웃의 사정이 가족의 사정과 겹친다", "떠났던 사람이 돌아와 자리를 요구한다"],
  ),
  "일상": K(
    "작은 행복을 기록하는 주인공",
    "단골 가게가 모인 평범한 거리",
    "새로운 단골",
    "큰 사건은 없지만, 사소한 선택들이 하루를 바꾼다",
    "늘 가던 길에서 처음 보는 간판을 발견하는 첫 장면",
    "평온",
    "포근함",
    "내일도 오겠다는 인사를 남기는 손님",
    ["단골 한 명의 사연이 다음 화의 중심이 된다", "사소한 실수가 작은 축제가 된다", "계절이 바뀌며 거리의 풍경이 달라진다"],
  ),
  "코미디": K(
    "진지할수록 일이 꼬이는 주인공",
    "사고가 끊이지 않는 사무실",
    "엉뚱한 오해",
    "해명할수록 오해가 커지는 상황이 충돌한다",
    "자신만만하게 들어갔다가 바로 꼬이는 첫 장면",
    "자신감",
    "당황",
    "오해가 풀리자마자 터지는 더 큰 오해",
    ["조력자의 해결책이 일을 더 키운다", "라이벌과 어쩔 수 없이 한 팀이 된다", "비밀로 한 일이 전원에게 공개될 위기에 놓인다"],
  ),
  "학원": K(
    "전학 첫날부터 주목받는 주인공",
    "축제와 시험이 몰려오는 학교",
    "비밀 동아리",
    "인정받고 싶은 마음과 들키기 싫은 비밀이 충돌한다",
    "전학 첫날, 전교생이 쳐다보는 복도의 첫 장면",
    "긴장",
    "소속감",
    "축제 전날, 무대에 오를 이름이 바뀐다",
    ["라이벌이 사실은 같은 비밀을 가졌다", "선생님의 과거가 현재 사건과 이어진다", "동아리의 존폐를 건 대회가 열린다"],
  ),
  "스포츠": K(
    "벤치에서 시즌을 시작한 후보 선수",
    "지역 리그의 낡은 체육관",
    "마지막 출전 기회",
    "증명하고 싶은 실력과 무너진 자신감이 충돌한다",
    "관중석이 텅 빈 새벽 훈련의 첫 장면",
    "초조함",
    "투지",
    "결승 상대의 명단에 낯익은 이름이 있다",
    ["에이스의 부상으로 갑자기 기회가 온다", "라이벌 팀의 스카우트가 접근한다", "팀의 내분이 경기력으로 번진다"],
  ),
  "공포": K(
    "금기를 어긴 뒤 돌아온 주인공",
    "밤마다 같은 소리가 나는 낡은 건물",
    "들려서는 안 될 소리",
    "벗어나려는 시도마다 규칙이 하나씩 드러난다",
    "꺼졌던 전등이 혼자 켜지는 첫 장면",
    "찜찜함",
    "공포",
    "규칙을 어긴 대가가 아직 시작도 안 했음이 드러난다",
    ["먼저 온 사람의 기록이 경고를 남긴다", "일행 중 한 명이 규칙을 숨기고 있다", "안전하다고 믿은 장소가 가장 위험해진다"],
  ),
  "SF": K(
    "기억의 일부를 잃은 채 깨어난 주인공",
    "궤도 정거장과 지상을 오가는 항로",
    "전송된 신호",
    "인류의 질서와 한 사람의 기억이 충돌한다",
    "깨어난 캡슐 창밖으로 보이지 말아야 할 지구의 첫 장면",
    "혼란",
    "결단",
    "신호의 발신지가 자기 자신으로 확인된다",
    ["AI 조력자의 숨겨진 지령이 드러난다", "시간차가 만든 두 개의 현재가 겹친다", "정거장의 규칙이 한 사람을 위해 깨진다"],
  ),
};

const FALLBACK_KIT: GenreSeedKit = K(
  "자기 자리를 찾지 못한 주인공",
  "이야기가 벌어지는 무대",
  "예상 못 한 만남",
  "원하는 것과 두려운 것이 한 장면에서 충돌한다",
  "평범한 하루가 어긋나기 시작하는 첫 장면",
  "망설임",
  "결심",
  "다음 화를 열지 않고는 못 배기는 한 줄의 발견",
  ["조력자 한 명이 조건을 걸고 합류한다", "적대자의 진짜 목적이 드러난다", "주인공의 선택이 예상 밖의 대가를 부른다"],
);

export function storySeedGenreKit(genre: string): GenreSeedKit {
  return STORY_SEED_GENRE_KITS[genre.trim()] ?? FALLBACK_KIT;
}

function normalizeKeywords(raw: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const keyword of raw) {
    const trimmed = keyword.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 5) break;
  }
  return Object.freeze(out);
}

function seedHash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

interface Slots {
  readonly protagonist: string;
  readonly stage: string;
  readonly keyword: string;
  readonly keyword2: string;
}

function fill(template: string, slots: Slots): string {
  return template
    .replaceAll("{주인공}", slots.protagonist)
    .replaceAll("{무대}", slots.stage)
    .replaceAll("{키워드2}", slots.keyword2)
    .replaceAll("{키워드}", slots.keyword);
}

/**
 * 결정적 로컬 씨앗 생성. 같은 입력 → 같은 초안 (랜덤·시각 사용 안 함).
 * 장르가 비어 있으면 null — 빌더 UI가 장르 선택을 먼저 안내한다.
 */
export function buildLocalStorySeed(input: StorySeedInput): StorySeedDraft | null {
  const genre = input.genre.trim();
  if (!genre) return null;
  const kit = storySeedGenreKit(genre);
  const keywords = normalizeKeywords(input.keywords);
  const refs = input.settingRefs ?? [];
  const characterRef = refs.find((ref) => ref.kind === "character");
  const locationRef = refs.find((ref) => ref.kind === "location");

  const slots: Slots = {
    protagonist: input.protagonist?.trim() || characterRef?.name || kit.protagonist,
    stage: input.stage?.trim() || locationRef?.name || kit.stage,
    keyword: keywords[0] ?? kit.spareKeyword,
    keyword2: keywords[1] ?? kit.spareKeyword,
  };

  const loglineCandidates = [
    fill("{무대}에서 시작되는 이야기. {키워드}에 휘말린 {주인공}의 선택이 모든 것을 바꾼다.", slots),
    fill("{주인공}의 평범한 하루는 {키워드} 때문에 끝났다. 이제 남은 건 {키워드2}뿐.", slots),
    fill("{키워드} — 모두가 피하던 그것과 마주한 {주인공}. 무대는 {무대}, 대가는 아직 아무도 모른다.", slots),
  ] as const;

  const toneNote = input.tone?.trim() ? `(${input.tone.trim()} 분위기로) ` : "";
  // 세계관 허브 로어 인용은 이름만 출처로 남기지 않고 줄거리에도 실제로 작동시킨다.
  // 장소 로어는 위에서 location 으로 슬롯을 채우고, 나머지 로어(kind=lore)는
  // "이 회차의 배경 설정" 문장으로 시놉시스에 명시한다 (최대 3개, 결정적 순서 유지).
  const loreNames = refs
    .filter((ref) => ref.kind === "lore")
    .map((ref) => ref.name.trim())
    .filter(Boolean)
    .slice(0, 3);
  const loreNote =
    loreNames.length > 0
      ? ` 배경 설정으로는 ${loreNames.join(" · ")}을(를) 인용한다 — 이 설정과 어긋나는 장면은 쓰지 않는다.`
      : "";
  const synopsisDraft =
    `${toneNote}${loglineCandidates[0]} ${fill(kit.conflict, slots)} ` +
    `이번 회차에서는 ${fill(kit.hook, slots)}으로 문을 열고, 감정은 ${kit.emotionFrom}에서 ${kit.emotionTo} 쪽으로 기운다. ` +
    `자세한 장면은 전환점 골격을 채우면서 구체화한다.${loreNote}`;

  const draft: StorySeedDraft = {
    id: `seed-${seedHash(JSON.stringify([genre, keywords, slots.protagonist, slots.stage, input.tone ?? ""]))}`,
    genre,
    keywords,
    loglineCandidates,
    goalDraft: fill("{주인공}의 첫 선택이 정해지는 회차로 만든다. 선택 뒤에 무엇이 달라지는지가 이 회의 목표다.", slots),
    synopsisDraft,
    openingHookDraft: fill(kit.hook, slots),
    coreConflictDraft: fill(kit.conflict, slots),
    turningPointScaffold: [
      fill("전환 1 — {키워드}의 진짜 얼굴이 드러나는 장면으로 채우기 (누가·어디서·무엇을 보고)", slots),
      fill("전환 2 — {주인공}이(가) 피하려던 선택을 마주하는 장면으로 채우기 (무엇을 잃을 각오인지)", slots),
      "전환 3 — 다음 화로 넘길 단서가 심어지는 장면으로 채우기 (독자만 아는 정보 하나)",
    ],
    cliffhangerDraft: fill(kit.cliffhanger, slots),
    emotionalArc: { from: kit.emotionFrom, to: kit.emotionTo },
    expansionProposals: [
      fill(kit.expansions[0], slots),
      fill(kit.expansions[1], slots),
      fill(kit.expansions[2], slots),
    ],
    referencedSettingIds: Object.freeze(refs.map((ref) => ref.id)),
    source: "local",
  };
  return Object.freeze(draft);
}

/** 회차 기획(EpisodePlan 확장 필드)에 적용할 패치 — 정본 필드 이름과 1:1. */
export interface StorySeedPlanPatch {
  readonly logline: string;
  readonly goal: string;
  readonly synopsis: string;
  readonly openingHook: string;
  readonly coreConflict: string;
  readonly turningPoints: readonly string[];
  readonly cliffhanger: string;
  readonly emotionalArc: { readonly from: string; readonly to: string };
  /** 초안이 인용한 설정 id — EpisodePlan 확장과 같은 이름으로 저장돼 인계 카드까지 간다. */
  readonly referencedSettingIds: readonly string[];
}

export function storySeedPlanPatch(
  draft: StorySeedDraft,
  loglineIndex: 0 | 1 | 2 = 0,
): StorySeedPlanPatch {
  return Object.freeze({
    logline: draft.loglineCandidates[loglineIndex],
    goal: draft.goalDraft,
    synopsis: draft.synopsisDraft,
    openingHook: draft.openingHookDraft,
    coreConflict: draft.coreConflictDraft,
    turningPoints: draft.turningPointScaffold,
    cliffhanger: draft.cliffhangerDraft,
    emotionalArc: draft.emotionalArc,
    referencedSettingIds: draft.referencedSettingIds,
  });
}

/** 제공자 계약 — 로컬 결정적 제공자가 기본, AI 제공자는 같은 모양으로 갈아 끼운다. */
export interface StorySeedProvider {
  readonly kind: "local" | "ai";
  generate(input: StorySeedInput): Promise<StorySeedDraft | null>;
}

export const localStorySeedProvider: StorySeedProvider = {
  kind: "local",
  generate: (input) => Promise.resolve(buildLocalStorySeed(input)),
};
