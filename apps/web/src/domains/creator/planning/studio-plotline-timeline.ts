/**
 * 플롯라인 타임라인 + 구조 템플릿 프리필 — 순수 모델.
 *
 * 근거: REPORT G3 (Plottr 타임라인·구조 템플릿). 시즌 비트 보드(회차×캐릭터
 * 등장 매트릭스)와 축이 다르다 — 여기는 행=플롯라인, 열=회차다.
 *
 * 원칙:
 * - 플롯라인 카드(PlotlineCard)가 이 표면의 정본이다. 저장은 호출자 몫이고
 *   이 모델은 순서·템플릿·필터·회차 플랜 반영을 순수 함수로만 제공한다.
 * - 구조 템플릿 적용은 "비트 골격 완성"이 판정 기준이다: 템플릿의 전 비트가
 *   카드로 채워지고, 비트 position(0~1)을 회차 열에 비례 배분한다.
 * - 카드 이동의 회차 플랜 반영은 applyTimelineToEpisodePlans가 맡는다:
 *   지정 범위(시즌 회차) 안에서는 메인 플롯라인 카드 순서가 곧
 *   EpisodePlan.turningPoints 순서다 (타임라인이 그 범위의 정본).
 * - 열 순서는 seasonArcView(episodeOrder 우선+번호순)를 재사용해
 *   줄거리 표면·비트 보드와 어긋나지 않게 한다.
 */
import type { SeasonPlan } from "@toonstudio/core/production";
import type { StudioStoryCharacter } from "../studio-story-bible";
import { seasonArcView, type EpisodePlanWithSynopsis } from "./studio-episode-synopsis";

export type PlotlineKind = "main" | "sub" | "character-arc";

export interface PlotlineTrack {
  readonly id: string;
  readonly label: string;
  readonly kind: PlotlineKind;
  /** character-arc 트랙이면 대상 캐릭터 id. 그 외 null. */
  readonly characterId: string | null;
}

export const MAIN_PLOTLINE_ID = "plotline-main";

export interface PlotlineCard {
  readonly id: string;
  readonly plotlineId: string;
  readonly episodeId: string;
  readonly title: string;
  readonly summary: string;
  readonly characterIds: readonly string[];
  readonly locationId: string | null;
  /** 같은 (플롯라인, 회차) 셀 안 순서. 0부터 연속. */
  readonly order: number;
  /** 구조 템플릿에서 온 카드면 그 비트 key. 수기 카드는 null. */
  readonly templateBeatKey: string | null;
}

/** 기본 트랙: 메인 1개 + 캐릭터별 아크 트랙. 서브는 호출자가 label을 정해 추가한다. */
export function defaultPlotlineTracks(
  characters: readonly StudioStoryCharacter[],
): readonly PlotlineTrack[] {
  return Object.freeze([
    Object.freeze({ id: MAIN_PLOTLINE_ID, label: "메인 플롯", kind: "main" as const, characterId: null }),
    ...characters.map((character) =>
      Object.freeze({
        id: `plotline-char:${character.id}`,
        label: `${character.name} 아크`,
        kind: "character-arc" as const,
        characterId: character.id,
      }),
    ),
  ]);
}

/** 회차 열 순서 — episodeOrder 우선, 나머지는 번호순 (seasonArcView 규칙 재사용). */
export function orderedEpisodePlans(
  season: SeasonPlan,
  plans: readonly EpisodePlanWithSynopsis[],
): readonly EpisodePlanWithSynopsis[] {
  const arc = seasonArcView(season, plans);
  const byId = new Map(plans.map((plan) => [plan.episodeId, plan]));
  return Object.freeze(
    arc.episodes
      .map((card) => byId.get(card.episodeId))
      .filter((plan): plan is EpisodePlanWithSynopsis => plan !== undefined),
  );
}

// ---------------------------------------------------------------------------
// 구조 템플릿 (프리필)
// ---------------------------------------------------------------------------

export interface StructureTemplateBeat {
  readonly key: string;
  readonly label: string;
  /** 카드 summary로 미리 채워지는 안내 문장. 작가가 자기 이야기로 고쳐 쓴다. */
  readonly guide: string;
  /** 시즌 전체에서 이 비트가 놓일 상대 위치 0~1. */
  readonly position: number;
}

export interface StructureTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly beats: readonly StructureTemplateBeat[];
}

function beat(key: string, label: string, guide: string, position: number): StructureTemplateBeat {
  return Object.freeze({ key, label, guide, position });
}

export const STRUCTURE_TEMPLATES: readonly StructureTemplate[] = Object.freeze([
  Object.freeze({
    id: "three-act",
    label: "3막 구조",
    description: "설정·대립·해결의 가장 기본적인 골격 (8비트).",
    beats: Object.freeze([
      beat("setup", "설정", "주인공과 세계, 평소의 균형을 보여준다.", 0.02),
      beat("inciting", "촉발 사건", "균형을 깨는 사건이 주인공을 움직이게 한다.", 0.1),
      beat("first-plot-point", "1막 전환점", "주인공이 되돌릴 수 없는 선택을 한다.", 0.25),
      beat("rising-action", "대립 심화", "장애물이 커지고 판돈이 오른다.", 0.38),
      beat("midpoint", "중간 전환", "승리처럼 보이는 순간, 또는 진실이 뒤집힌다.", 0.5),
      beat("crisis", "위기", "모든 것을 잃을 듯한 최저점에 닿는다.", 0.68),
      beat("climax", "절정", "주인공이 가장 비싼 대가를 치르고 맞선다.", 0.85),
      beat("resolution", "해결", "새로운 균형과 주인공의 변화를 보여준다.", 0.97),
    ]),
  }),
  Object.freeze({
    id: "hero-journey",
    label: "영웅 여정",
    description: "출발·시련·귀환의 12단계 여정 골격.",
    beats: Object.freeze([
      beat("ordinary-world", "일상의 세계", "여정 전 주인공의 평범한 삶을 보여준다.", 0),
      beat("call-to-adventure", "모험의 소명", "주인공에게 도전이 찾아온다.", 0.08),
      beat("refusal", "소명 거부", "두려움 때문에 처음엔 물러선다.", 0.14),
      beat("meeting-mentor", "멘토와의 만남", "조력자가 도구와 용기를 건넨다.", 0.2),
      beat("crossing-threshold", "관문 통과", "익숙한 세계를 떠나 낯선 세계로 들어간다.", 0.25),
      beat("tests-allies-enemies", "시험·동맹·적", "새 세계의 규칙을 배우고 편이 갈린다.", 0.38),
      beat("approach", "동굴 접근", "가장 깊은 위험을 향해 다가간다.", 0.5),
      beat("ordeal", "시련", "죽음에 가장 가까운 순간을 겪는다.", 0.6),
      beat("reward", "보상", "시련을 넘고 얻은 것을 손에 쥔다.", 0.7),
      beat("road-back", "귀환의 길", "대가를 치르며 돌아오기 시작한다.", 0.8),
      beat("resurrection", "부활", "마지막 시험에서 변화가 증명된다.", 0.9),
      beat("return-with-elixir", "영약과 귀환", "얻은 것을 세계에 나눈다.", 1),
    ]),
  }),
  Object.freeze({
    id: "save-the-cat",
    label: "Save the Cat 비트 시트",
    description: "공감의 순간을 포함한 15비트 상업 스토리 골격.",
    beats: Object.freeze([
      beat("opening-image", "오프닝 이미지", "이야기의 톤과 세계를 한 장면으로 제시한다.", 0),
      beat("theme-stated", "주제 제시", "누군가의 입으로 주제가 스치듯 등장한다.", 0.05),
      beat("setup", "설정", "주인공의 삶과 고쳐야 할 결함을 깔아 둔다.", 0.08),
      beat("catalyst", "촉매", "삶을 뒤집는 사건이 터진다.", 0.11),
      beat("debate", "망설임", "이 길이 맞는지 주인공이 흔들린다.", 0.17),
      beat("break-into-two", "2막 진입", "주인공이 스스로 선택해 새 세계로 들어간다.", 0.22),
      beat("b-story", "서브 스토리", "주제를 비추는 관계·서브 플롯이 시작된다.", 0.28),
      beat("fun-and-games", "놀이와 약속", "이 이야기가 약속한 재미를 본격적으로 보여준다.", 0.38),
      beat("midpoint", "중간점", "가짜 승리 또는 가짜 패배로 판이 뒤집힌다.", 0.5),
      beat("bad-guys-close-in", "악당의 압박", "외부의 적과 내부의 균열이 동시에 조여 온다.", 0.62),
      beat("all-is-lost", "전부 잃다", "희망이 사라지고 죽음의 냄새가 나는 최저점.", 0.72),
      beat("dark-night", "영혼의 밤", "주인공이 자기 결함과 정면으로 마주한다.", 0.78),
      beat("break-into-three", "3막 진입", "서브 스토리에서 얻은 깨달음으로 해법이 보인다.", 0.83),
      beat("finale", "피날레", "새롭게 변한 주인공이 계획을 실행해 세계를 바꾼다.", 0.92),
      beat("final-image", "파이널 이미지", "오프닝과 대비되는 변화의 증거로 닫는다.", 1),
    ]),
  }),
]);

export function structureTemplateById(templateId: string): StructureTemplate | null {
  return STRUCTURE_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export interface ApplyTemplateInput {
  readonly templateId: string;
  readonly plotlineId: string;
  /** 열 순서대로 정렬된 회차 id 목록. 비어 있으면 빈 배열을 돌려준다. */
  readonly episodeIds: readonly string[];
  /** character-arc 트랙이면 그 캐릭터를 카드에 미리 걸어 둔다. */
  readonly characterIds?: readonly string[];
  /** 같은 셀에 이미 있는 카드 수 — 템플릿 카드 order를 그 뒤에 붙인다. */
  readonly existingCountsByEpisodeId?: Readonly<Record<string, number>>;
}

/**
 * 템플릿 적용 → 비트 카드 프리필. 판정 "템플릿 적용만으로 비트 골격 완성"의 본체:
 * 템플릿의 모든 비트가 정확히 한 장씩, position 비례 회차에 배치된다.
 * 카드 id는 결정적이다(tpl:<템플릿>:<비트>:<플롯라인>) — 재적용 병합이 중복을 막는다.
 */
export function applyStructureTemplate(input: ApplyTemplateInput): readonly PlotlineCard[] {
  const template = structureTemplateById(input.templateId);
  if (!template || input.episodeIds.length === 0) return Object.freeze([]);
  const lastIndex = input.episodeIds.length - 1;
  const placedPerEpisode = new Map<string, number>();
  const cards = template.beats.map((templateBeat) => {
    const episodeIndex = Math.min(lastIndex, Math.max(0, Math.round(templateBeat.position * lastIndex)));
    const episodeId = input.episodeIds[episodeIndex] as string;
    const alreadyPlaced = placedPerEpisode.get(episodeId) ?? 0;
    placedPerEpisode.set(episodeId, alreadyPlaced + 1);
    const base = input.existingCountsByEpisodeId?.[episodeId] ?? 0;
    return Object.freeze({
      id: `tpl:${template.id}:${templateBeat.key}:${input.plotlineId}`,
      plotlineId: input.plotlineId,
      episodeId,
      title: templateBeat.label,
      summary: templateBeat.guide,
      characterIds: Object.freeze([...(input.characterIds ?? [])]),
      locationId: null,
      order: base + alreadyPlaced,
      templateBeatKey: templateBeat.key,
    });
  });
  return Object.freeze(cards);
}

/** 템플릿 카드를 기존 카드에 병합 — 같은 id 또는 같은 (플롯라인, 템플릿 비트)는 다시 넣지 않는다. */
export function mergeTemplateCards(
  existing: readonly PlotlineCard[],
  templateCards: readonly PlotlineCard[],
): readonly PlotlineCard[] {
  const existingIds = new Set(existing.map((card) => card.id));
  const existingBeatKeys = new Set(
    existing
      .filter((card) => card.templateBeatKey !== null)
      .map((card) => `${card.plotlineId}:${card.templateBeatKey}`),
  );
  const additions = templateCards.filter(
    (card) =>
      !existingIds.has(card.id) &&
      !(card.templateBeatKey !== null && existingBeatKeys.has(`${card.plotlineId}:${card.templateBeatKey}`)),
  );
  return Object.freeze([...existing, ...additions]);
}

// ---------------------------------------------------------------------------
// 타임라인 보드 도출 + 필터
// ---------------------------------------------------------------------------

export interface PlotlineTimelineCell {
  readonly episodeId: string;
  readonly cards: readonly PlotlineCard[];
}

export interface PlotlineTimelineRow {
  readonly track: PlotlineTrack;
  readonly cells: readonly PlotlineTimelineCell[];
  readonly cardCount: number;
}

export interface PlotlineTimeline {
  readonly episodes: readonly EpisodePlanWithSynopsis[];
  readonly rows: readonly PlotlineTimelineRow[];
  /** 필터가 걸려 있으면 true — 빈 트랙을 숨긴 상태다. */
  readonly filtered: boolean;
  readonly totalCards: number;
}

export interface PlotlineTimelineInput {
  readonly season: SeasonPlan;
  readonly plans: readonly EpisodePlanWithSynopsis[];
  readonly tracks: readonly PlotlineTrack[];
  readonly cards: readonly PlotlineCard[];
  /** 이 캐릭터가 걸린 카드만 남긴다. null이면 전체. */
  readonly characterFilterId?: string | null;
  /** 이 장소인 카드만 남긴다. null이면 전체. */
  readonly locationFilterId?: string | null;
}

function cardMatchesFilter(
  card: PlotlineCard,
  trackById: ReadonlyMap<string, PlotlineTrack>,
  characterFilterId: string | null,
  locationFilterId: string | null,
): boolean {
  if (locationFilterId !== null && card.locationId !== locationFilterId) return false;
  if (characterFilterId !== null) {
    const track = trackById.get(card.plotlineId);
    const onCard = card.characterIds.includes(characterFilterId);
    const onArcTrack = track?.kind === "character-arc" && track.characterId === characterFilterId;
    if (!onCard && !onArcTrack) return false;
  }
  return true;
}

export function buildPlotlineTimeline(input: PlotlineTimelineInput): PlotlineTimeline {
  const episodes = orderedEpisodePlans(input.season, input.plans);
  const characterFilterId = input.characterFilterId ?? null;
  const locationFilterId = input.locationFilterId ?? null;
  const filtered = characterFilterId !== null || locationFilterId !== null;
  const trackById = new Map(input.tracks.map((track) => [track.id, track]));
  const visibleCards = input.cards.filter((card) =>
    cardMatchesFilter(card, trackById, characterFilterId, locationFilterId),
  );

  const rows: PlotlineTimelineRow[] = [];
  for (const track of input.tracks) {
    const trackCards = visibleCards.filter((card) => card.plotlineId === track.id);
    if (filtered && trackCards.length === 0) continue; // 필터 시 트랙을 좁힌다
    const cells = episodes.map((episode) => {
      const cellCards = trackCards
        .filter((card) => card.episodeId === episode.episodeId)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      return Object.freeze({ episodeId: episode.episodeId, cards: Object.freeze(cellCards) });
    });
    rows.push(
      Object.freeze({ track, cells: Object.freeze(cells), cardCount: trackCards.length }),
    );
  }
  return Object.freeze({
    episodes,
    rows: Object.freeze(rows),
    filtered,
    totalCards: visibleCards.length,
  });
}

/** 보드 아래 점검 문장 — 메인 플롯이 비는 회차와 템플릿 미적용을 짚는다. */
export function plotlineTimelineHints(timeline: PlotlineTimeline): readonly string[] {
  const hints: string[] = [];
  const mainRow = timeline.rows.find((row) => row.track.kind === "main");
  if (mainRow && !timeline.filtered) {
    const emptyNumbers = timeline.episodes
      .filter((episode, index) => (mainRow.cells[index]?.cards.length ?? 0) === 0)
      .map((episode) => episode.episodeNumber);
    if (emptyNumbers.length > 0) {
      hints.push(`메인 플롯이 비는 회차가 있어요: ${emptyNumbers.map((n) => `${n}화`).join(", ")}.`);
    }
    if (mainRow.cardCount === 0) {
      hints.push("구조 템플릿을 적용하면 비트 카드가 회차마다 미리 채워져요.");
    }
  }
  if (timeline.filtered && timeline.totalCards === 0) {
    hints.push("이 필터에 맞는 카드가 없어요. 필터를 풀면 전체 타임라인이 보여요.");
  }
  return Object.freeze(hints);
}

// ---------------------------------------------------------------------------
// 카드 이동 (드래그 재배열) + 회차 플랜 반영
// ---------------------------------------------------------------------------

/**
 * 카드를 같은/다른 회차 셀로 이동한다. 영향 받는 셀(출발·도착)의 order만
 * 0부터 연속으로 다시 매기고, 나머지 카드는 참조를 그대로 유지한다.
 * targetIndex는 도착 셀 기준(카드를 뺀 뒤) 위치이며 범위를 벗어나면 끝으로 붙는다.
 */
export function movePlotlineCard(
  cards: readonly PlotlineCard[],
  cardId: string,
  targetEpisodeId: string,
  targetIndex: number,
): readonly PlotlineCard[] {
  const moving = cards.find((card) => card.id === cardId);
  if (!moving) return cards;
  const rest = cards.filter((card) => card.id !== cardId);
  const cellOf = (list: readonly PlotlineCard[], episodeId: string) =>
    list
      .filter((card) => card.plotlineId === moving.plotlineId && card.episodeId === episodeId)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const sourceCell = cellOf(rest, moving.episodeId);
  const targetCell = cellOf(rest, targetEpisodeId);
  const insertAt = Math.min(Math.max(0, targetIndex), targetCell.length);
  const newTargetCell = [...targetCell.slice(0, insertAt), moving, ...targetCell.slice(insertAt)];

  const renumbered = new Map<string, PlotlineCard>();
  sourceCell.forEach((card, index) => {
    if (card.order !== index) renumbered.set(card.id, Object.freeze({ ...card, order: index }));
  });
  newTargetCell.forEach((card, index) => {
    const episodeId = card.id === cardId ? targetEpisodeId : card.episodeId;
    if (card.order !== index || card.episodeId !== episodeId) {
      renumbered.set(card.id, Object.freeze({ ...card, episodeId, order: index }));
    }
  });
  if (renumbered.size === 0) return cards;
  return Object.freeze(cards.map((card) => renumbered.get(card.id) ?? card));
}

/**
 * 카드 순서 → 회차 플랜 반영. scopeEpisodeIds 안의 회차는 메인 플롯라인
 * 카드(타임라인 순서: 회차 열 순서 → 셀 안 order)가 turningPoints가 된다.
 * 카드를 다른 회차로 옮기면 원래 회차의 핵심 사건에서 빠지고 새 회차에 들어간다.
 * 범위 밖 회차와 메인 외 플롯라인은 건드리지 않는다.
 */
export function applyTimelineToEpisodePlans(
  plans: readonly EpisodePlanWithSynopsis[],
  cards: readonly PlotlineCard[],
  scopeEpisodeIds: readonly string[],
  plotlineId: string = MAIN_PLOTLINE_ID,
): readonly EpisodePlanWithSynopsis[] {
  const scope = new Set(scopeEpisodeIds);
  const titlesByEpisode = new Map<string, PlotlineCard[]>();
  for (const card of cards) {
    if (card.plotlineId !== plotlineId || !scope.has(card.episodeId)) continue;
    const list = titlesByEpisode.get(card.episodeId) ?? [];
    list.push(card);
    titlesByEpisode.set(card.episodeId, list);
  }
  return Object.freeze(
    plans.map((plan) => {
      if (!scope.has(plan.episodeId)) return plan;
      const titles = (titlesByEpisode.get(plan.episodeId) ?? [])
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((card) => card.title);
      const unchanged =
        titles.length === plan.turningPoints.length &&
        titles.every((title, index) => title === plan.turningPoints[index]);
      return unchanged ? plan : Object.freeze({ ...plan, turningPoints: Object.freeze(titles) });
    }),
  );
}

/** 기존 회차 플랜의 핵심 사건에서 메인 플롯 카드 초안을 만든다 (빈 타임라인 시작점). */
export function derivePlotlineCardsFromPlans(
  plans: readonly EpisodePlanWithSynopsis[],
): readonly PlotlineCard[] {
  const cards: PlotlineCard[] = [];
  for (const plan of plans) {
    plan.turningPoints.forEach((title, index) => {
      if (!title.trim()) return;
      cards.push(
        Object.freeze({
          id: `plan:${plan.episodeId}:${index}`,
          plotlineId: MAIN_PLOTLINE_ID,
          episodeId: plan.episodeId,
          title: title.trim(),
          summary: "",
          characterIds: Object.freeze([...plan.characterRefs]),
          locationId: plan.locationRefs[0] ?? null,
          order: index,
          templateBeatKey: null,
        }),
      );
    });
  }
  return Object.freeze(cards);
}
