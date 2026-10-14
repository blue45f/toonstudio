/**
 * 사용자 문구 용어 레지스트리 — 정본 표기와 금지 별칭의 단일 출처.
 *
 * 같은 개념을 표면마다 다른 단어로 부르면(소재/에셋, 마켓/에셋 마켓처럼)
 * 처음 온 사용자는 서로 다른 기능으로 오해한다. 새 사용자 문구를 쓸 때는
 * 이 레지스트리의 정본 표기를 쓰고, 금지 별칭은 쓰지 않는다.
 * 판정 근거: plain-language 감사 P1-3, BLUEPRINT §3.4(용어 사전 정본).
 *
 * 이 모듈은 코드 식별자(API 키, i18n 키, 타입명)에는 관여하지 않는다.
 * 화면에 보이는 문구만 대상이다.
 */

export interface TerminologyEntry {
  readonly id: string;
  /** 화면에 써야 하는 정본 표기 */
  readonly canonical: string;
  /** 같은 개념을 가리키지만 새로 쓰면 안 되는 표기 */
  readonly forbiddenAliases: readonly string[];
  /** 이 결정이 미치는 표면 */
  readonly scope: string;
  /** 왜 이 표기가 정본인지 */
  readonly rationale: string;
}

export const TERMINOLOGY: readonly TerminologyEntry[] = Object.freeze([
  {
    id: "production-material",
    canonical: "소재",
    forbiddenAliases: ["에셋"],
    scope: "메뉴·마켓·검색·스튜디오 소재 표면의 사용자 문구",
    rationale:
      "처음 온 사용자는 '에셋'이 무엇인지 모른다. 제작에 쓰는 재료는 '소재'로 통일한다. (코드 식별자 asset은 그대로 둔다.)",
  },
  {
    id: "market-name",
    canonical: "마켓",
    forbiddenAliases: ["에셋 마켓", "무료 공유 마켓"],
    scope: "마켓 진입점·공유 완료 문구·검색 결과 분류",
    rationale:
      "장소의 이름은 하나로 고정한다. 무료 여부는 이름이 아니라 배지·필터로 알린다.",
  },
  {
    id: "save-for-later-action",
    canonical: "찜하기",
    forbiddenAliases: ["즐겨찾기 추가", "보관함에 넣기"],
    scope: "작품·소재를 나중을 위해 담는 행동의 이름",
    rationale: "담는 행동은 '찜하기' 하나로 통일한다. 담은 곳의 이름은 library-place 항목을 본다.",
  },
  {
    id: "library-place",
    canonical: "서재",
    forbiddenAliases: ["보관함", "찜 목록"],
    scope: "찜한 작품·소재가 모이는 장소의 이름",
    rationale: "담은 것이 모이는 곳은 '서재'라고 부른다. 행동(찜하기)과 장소(서재)를 섞지 않는다.",
  },
  {
    id: "early-access",
    canonical: "얼리 액세스",
    forbiddenAliases: ["서포터 선공개", "롤링 페이월"],
    scope: "선공개·얼리 액세스 배지·요금 안내 문구",
    rationale:
      "같은 제도를 세 가지 이름으로 부르면 서로 다른 혜택으로 오해한다. 표기는 '얼리 액세스'로 통일한다.",
  },
]);

export interface TerminologyViolation {
  readonly entryId: string;
  readonly canonical: string;
  readonly alias: string;
}

const ENTRIES_BY_ID: ReadonlyMap<string, TerminologyEntry> = new Map(
  TERMINOLOGY.map((entry) => [entry.id, entry]),
);

export function terminologyEntry(id: string): TerminologyEntry | undefined {
  return ENTRIES_BY_ID.get(id);
}

/**
 * 문구 안에 금지 별칭이 들어 있는지 찾는다. 긴 별칭부터 검사해
 * 부분 겹침("에셋" ⊂ "에셋 마켓")을 한 건으로만 보고한다.
 * 린트·리뷰 보조용이며, 고유명사 등 의도된 사용은 호출 쪽에서 판단한다.
 */
export function findForbiddenAliases(text: string): readonly TerminologyViolation[] {
  const violations: TerminologyViolation[] = [];
  const claimed: Array<readonly [number, number]> = [];
  const candidates = TERMINOLOGY.flatMap((entry) =>
    entry.forbiddenAliases.map((alias) => ({ entry, alias })),
  ).sort((a, b) => b.alias.length - a.alias.length);
  for (const { entry, alias } of candidates) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(alias, from);
      if (at < 0) break;
      const span: readonly [number, number] = [at, at + alias.length];
      const overlapped = claimed.some(([start, end]) => span[0] < end && start < span[1]);
      if (!overlapped) {
        violations.push({ entryId: entry.id, canonical: entry.canonical, alias });
        claimed.push(span);
      }
      from = at + alias.length;
    }
  }
  return violations;
}
