import { useMemo, useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  GitCompareArrows,
  Link2,
  Palette,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  CHARACTER_RELATION_DEFAULT_LABELS,
  LOREBOOK_CATEGORY_LABELS,
  computeCharacterLorebookBacklinks,
  deriveSymmetricCharacterRelations,
  updateSyncedBlockCanonicalContent,
  upsertCharacterAssociationEdge,
  type CharacterAssociationEdge,
  type CharacterRelationKind,
  type CharacterSheetArchiveItem,
  type LorebookPageCategory,
  type LorebookWikiPage,
  type NotionSyncedBlockContainer,
} from "./production-notion-lorebook-wiki-model";

const INITIAL_CHARACTERS: readonly CharacterSheetArchiveItem[] = [
  {
    characterId: "char-kael",
    name: "카엘 보르하트",
    roleTitle: "주인공 · 북부 제1기사단장",
    faction: "보르하트 공작가",
    ageAndHeight: "26세 · 186cm",
    personalityCallout: "왼손 검술 사용(오른팔 마력 각인 흉터). 전투 시 망토 버클은 항상 우측 고정.",
    hiddenSpoilerToggle: "시즌 1 완결부에서 고대 황실 직계 혈통임이 밝혀진다.",
    turnaroundViews: ["전신 삼면도 (전투복)", "표정 시트 6종", "봉인검 발도 포즈 시트"],
    colorPalette: [
      { partLabel: "헤어 베이스", hex: "#1E2430" },
      { partLabel: "눈동자(마력 각성)", hex: "#38BDF8" },
      { partLabel: "북부 제복 코트", hex: "#27303F" },
    ],
    syncedRuleBlockId: "sync-rule-seal-sword",
    sharedWithTeam: true,
    updatedAtIso: "2026-10-26",
  },
  {
    characterId: "char-selene",
    name: "셀레네 크라운",
    roleTitle: "주연 · 제3황녀 / 백탑 마법사",
    faction: "제국 황실 · 백탑",
    ageAndHeight: "23세 · 167cm",
    personalityCallout: "금빛 성흔 귀걸이는 좌측 귀에만 착용. 마법진 시전 시 푸른 육각형 룬 문양 필수.",
    hiddenSpoilerToggle: "카엘의 봉인검을 해방할 수 있는 유일한 열쇠 보유자.",
    turnaroundViews: ["전신 삼면도 (황실 예복)", "마탑 로브 시트", "표정 시트 8종"],
    colorPalette: [
      { partLabel: "헤어 베이스", hex: "#F5E6C8" },
      { partLabel: "눈동자(벽안)", hex: "#2563EB" },
      { partLabel: "백탑 로브", hex: "#F8FAFC" },
    ],
    syncedRuleBlockId: "sync-rule-seal-sword",
    sharedWithTeam: true,
    updatedAtIso: "2026-10-26",
  },
  {
    characterId: "char-vael",
    name: "바엘 아크로",
    roleTitle: "적대 주연 · 그림자 길드 수장",
    faction: "검은 마탑 · 그림자 길드",
    ageAndHeight: "29세 · 183cm",
    personalityCallout: "안대는 오른쪽 눈 착용. 단검 쌍수 역수 파지 고정.",
    hiddenSpoilerToggle: "과거 카엘과 같은 스승 밑에서 검술을 배운 사형 관계.",
    turnaroundViews: ["전신 삼면도 (암살복)", "가면 탈착 비교 시트"],
    colorPalette: [
      { partLabel: "헤어 베이스", hex: "#475569" },
      { partLabel: "붉은 안광", hex: "#EF4444" },
      { partLabel: "암살단 망토", hex: "#0F172A" },
    ],
    syncedRuleBlockId: "sync-rule-mana-law",
    sharedWithTeam: true,
    updatedAtIso: "2026-10-26",
  },
];

const INITIAL_RELATION_EDGES: readonly CharacterAssociationEdge[] = [
  {
    id: "rel-kael-selene",
    record1CharacterId: "char-kael",
    record2CharacterId: "char-selene",
    kind: "lord-knight",
    forwardLabel: "호위 기사 (비밀 서약)",
    inverseLabel: "주군 (성흔 계약자)",
    mirrorInverse: true,
    affinityScore: 85,
    note: "2화 지하 서고 사건 이후 비밀 동맹 및 상호 호위 계약 체결",
  },
  {
    id: "rel-kael-vael",
    record1CharacterId: "char-kael",
    record2CharacterId: "char-vael",
    kind: "hostile",
    forwardLabel: "적대·숙적",
    inverseLabel: "적대·숙적",
    mirrorInverse: true,
    affinityScore: -90,
    note: "봉인석을 둘러싼 추격전 상대이자 과거 동문 사형",
  },
];

const INITIAL_SYNCED_BLOCKS: readonly NotionSyncedBlockContainer[] = [
  {
    syncedBlockId: "sync-rule-seal-sword",
    title: "동기화 블록 #1 · 봉인검 & 성흔 작화 절대 규칙",
    canonicalContent:
      "[전 회차 공통 작화 주의] 봉인검 검신 길이는 115cm이며 발도 시 푸른 오라(#38BDF8)가 검날 테두리에만 발광합니다. 어시스턴트 채색 시 글로우 레이어 투명도 65% 고정.",
    sourcePageTitle: "세계관 설정 · 마도 병기 도감",
    referenceEpisodeIds: ["1화", "2화", "3화"],
    lastSyncedAtIso: "2026-10-26T09:00:00.000Z",
  },
  {
    syncedBlockId: "sync-rule-mana-law",
    title: "동기화 블록 #2 · 검은 마탑 심야 조명 톤 규칙",
    canonicalContent:
      "[배경·명암 공통] 검은 마탑 내부 씬은 역광 보라색(#6366F1) 림라이트를 기본 적용합니다.",
    sourcePageTitle: "세계관 설정 · 검은 마탑 로케이션",
    referenceEpisodeIds: ["2화", "3화"],
    lastSyncedAtIso: "2026-10-26T09:00:00.000Z",
  },
];

const INITIAL_WIKI_PAGES: readonly LorebookWikiPage[] = [
  {
    pageId: "wiki-worldview-1",
    category: "worldview",
    title: "세계관 핵심 설정 · 북부 성채와 4대 마탑 체계",
    episodeRangeLabel: "시즌 1 전체 공통",
    calloutBanner: "어시스턴트 필독: 카엘 보르하트와 셀레네 크라운의 의상 문양은 절대 좌우 반전 금지!",
    bodyMarkdown:
      "제국 북부 전선을 지키는 카엘 보르하트 공작가와 황실 백탑의 셀레네 크라운이 바엘 아크로의 그림자 길드에 맞서 고대 봉인석을 수호하는 다크 판타지 세계관.",
    spoilerToggleContent: "4대 마탑 최하층은 모두 고대 지하 수로로 연결되어 있다.",
    embeddedSyncedBlockIds: ["sync-rule-seal-sword", "sync-rule-mana-law"],
    sharedLiveWithAssistants: true,
  },
  {
    pageId: "wiki-synopsis-ep2",
    category: "synopsis",
    title: "2화 시놉시스 · 심야의 검은 마탑 침입전",
    episodeRangeLabel: "2화 (72컷)",
    calloutBanner: "핵심 연출: 34~52컷 지붕 추격전은 세로 스크롤 낙하감을 극대화한다.",
    bodyMarkdown:
      "카엘 보르하트가 마탑 지하 서고에서 바엘 아크로와 격돌하고, 위기 순간 셀레네 크라운이 성흔 마법으로 퇴로를 연다.",
    spoilerToggleContent: "클리프행어(72컷): 바엘의 가면이 반쯤 깨지며 카엘과 같은 검술 자세를 취한다.",
    embeddedSyncedBlockIds: ["sync-rule-seal-sword"],
    sharedLiveWithAssistants: true,
  },
];

export function ProductionNotionLorebookWikiSuite() {
  const [characters, setCharacters] =
    useState<readonly CharacterSheetArchiveItem[]>(INITIAL_CHARACTERS);
  const [relationEdges, setRelationEdges] =
    useState<readonly CharacterAssociationEdge[]>(INITIAL_RELATION_EDGES);
  const [syncedBlocks, setSyncedBlocks] =
    useState<readonly NotionSyncedBlockContainer[]>(INITIAL_SYNCED_BLOCKS);
  const [wikiPages] = useState<readonly LorebookWikiPage[]>(INITIAL_WIKI_PAGES);

  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("char-kael");
  const [categoryFilter, setCategoryFilter] = useState<LorebookPageCategory | "all">("all");

  // 양방향 인물 관계 추가/수정 폼 상태
  const [relSourceId, setRelSourceId] = useState<string>("char-selene");
  const [relTargetId, setRelTargetId] = useState<string>("char-vael");
  const [relKind, setRelKind] = useState<CharacterRelationKind>("hostile");
  const [relMirrorInverse, setRelMirrorInverse] = useState<boolean>(true);
  const [relAffinity, setRelAffinity] = useState<number>(-75);
  const [relNote, setRelNote] = useState<string>("황실 연회장 잠입 사건으로 대립 격화");

  // 동기화 블록 실시간 편집 상태
  const [activeSyncedBlockId, setActiveSyncedBlockId] = useState<string>(
    "sync-rule-seal-sword",
  );
  const [syncedDraft, setSyncedDraft] = useState<string>(
    INITIAL_SYNCED_BLOCKS[0]!.canonicalContent,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCharacter =
    characters.find((c) => c.characterId === selectedCharacterId) ?? characters[0]!;

  const characterRelations = useMemo(
    () =>
      deriveSymmetricCharacterRelations(
        selectedCharacter.characterId,
        characters,
        relationEdges,
      ),
    [selectedCharacter.characterId, characters, relationEdges],
  );

  const backlinks = useMemo(
    () => computeCharacterLorebookBacklinks(characters, wikiPages, syncedBlocks),
    [characters, wikiPages, syncedBlocks],
  );

  const selectedBacklink = backlinks.find(
    (b) => b.characterId === selectedCharacter.characterId,
  );

  const filteredPages = useMemo(
    () =>
      categoryFilter === "all"
        ? wikiPages
        : wikiPages.filter((p) => p.category === categoryFilter),
    [wikiPages, categoryFilter],
  );

  const handleUpsertRelation = () => {
    setRelationEdges((prev) =>
      upsertCharacterAssociationEdge(prev, {
        record1CharacterId: relSourceId,
        record2CharacterId: relTargetId,
        kind: relKind,
        mirrorInverse: relMirrorInverse,
        affinityScore: relAffinity,
        note: relNote,
      }),
    );
    const sourceName =
      characters.find((c) => c.characterId === relSourceId)?.name ?? relSourceId;
    const targetName =
      characters.find((c) => c.characterId === relTargetId)?.name ?? relTargetId;
    setNotice(
      `'${sourceName} ↔ ${targetName}' 인물 관계를 ${relMirrorInverse ? "양방향 대칭 미러링(relation_toggle_inverse_on)" : "단방향"}으로 저장했습니다.`,
    );
  };

  const handleSaveSyncedBlock = () => {
    setSyncedBlocks((prev) =>
      updateSyncedBlockCanonicalContent(prev, activeSyncedBlockId, syncedDraft),
    );
    setNotice(
      `동기화 블록(${activeSyncedBlockId}) 원본을 수정하여 참조 중인 모든 회차 시놉시스·캐릭터 시트에 실시간 반영했습니다.`,
    );
  };

  const handleToggleCharacterShare = (characterId: string) => {
    setCharacters((prev) =>
      prev.map((c) =>
        c.characterId === characterId ? { ...c, sharedWithTeam: !c.sharedWithTeam } : c,
      ),
    );
  };

  return (
    <section
      aria-label="노션형 작품 설정집·시놉시스·인물 관계도·캐릭터 시트 아카이브"
      className="rounded-3xl border border-line bg-card p-5 shadow-sm space-y-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            <BookOpenText className="size-4" aria-hidden="true" />
            Notion Lorebook · Character Matrix &amp; Synced Wiki
          </div>
          <h3 className="mt-1 text-xl font-black text-fg">
            작품 설정집 · 시놉시스 · 양방향 인물 관계도 &amp; 캐릭터 시트 아카이브
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            세계관 설정, 인물 관계도(양방향 대칭 릴레이션), 캐릭터 시트 이미지·컬러칩, 회차 간 동기화 블록(`Synced Block`)을 팀원들과 실시간 공유합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "worldview", "synopsis"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "min-h-8 rounded-lg border px-2.5 text-xs font-bold",
                categoryFilter === cat
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2",
              )}
            >
              {cat === "all" ? "전체 문서" : LOREBOOK_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </header>

      {notice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-2.5 text-xs font-semibold text-fg"
        >
          <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* 1. 캐릭터 시트 아카이브 갤러리 + 양방향 인물 관계도 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-black text-fg">
              <Palette className="size-4 text-accent" aria-hidden="true" />
              캐릭터 시트 이미지 &amp; 지정 컬러칩 아카이브
            </h4>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="캐릭터 시트 선택">
              {characters.map((char) => (
                <button
                  key={char.characterId}
                  type="button"
                  aria-pressed={char.characterId === selectedCharacter.characterId}
                  onClick={() => setSelectedCharacterId(char.characterId)}
                  className={cn(
                    "min-h-8 rounded-lg border px-2.5 text-xs font-bold",
                    char.characterId === selectedCharacter.characterId
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2",
                  )}
                >
                  {char.name}
                </button>
              ))}
            </div>
          </div>

          <article
            aria-label={`${selectedCharacter.name} 캐릭터 시트 상세`}
            className="rounded-xl border border-line bg-card p-4 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h5 className="text-base font-black text-fg">{selectedCharacter.name}</h5>
                  <span className="rounded-md bg-raised px-2 py-0.5 text-[0.6875rem] font-bold text-accent">
                    {selectedCharacter.faction}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-fg-2">
                  {selectedCharacter.roleTitle} · {selectedCharacter.ageAndHeight}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={selectedCharacter.sharedWithTeam}
                onClick={() => handleToggleCharacterShare(selectedCharacter.characterId)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold",
                  selectedCharacter.sharedWithTeam
                    ? "border-good/40 bg-good/10 text-good"
                    : "border-line bg-panel text-fg-3",
                )}
              >
                <Share2 className="size-3.5" aria-hidden="true" />
                {selectedCharacter.sharedWithTeam ? "어시스턴트 실시간 공유 중" : "비공개 초안"}
              </button>
            </div>

            {/* 노션 Callout 블록 */}
            <div className="rounded-xl border border-accent/35 bg-accent-soft p-3 text-xs leading-5 text-fg">
              <strong className="font-black">작화·선화 Callout: </strong>
              {selectedCharacter.personalityCallout}
            </div>

            {/* 캐릭터 시트 이미지 뷰 아카이브 */}
            <div>
              <p className="text-[0.6875rem] font-bold text-fg-3 mb-1.5">
                아카이빙된 캐릭터 시트 이미지 슬롯
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {selectedCharacter.turnaroundViews.map((viewLabel) => (
                  <div
                    key={viewLabel}
                    className="rounded-lg border border-line bg-panel p-2.5 text-center text-xs font-semibold text-fg"
                  >
                    <div className="mb-1.5 flex h-12 items-center justify-center rounded bg-raised text-[0.6875rem] font-bold text-accent">
                      SHEET PNG
                    </div>
                    {viewLabel}
                  </div>
                ))}
              </div>
            </div>

            {/* 밑색 어시스턴트용 지정 컬러 팔레트 */}
            <div>
              <p className="text-[0.6875rem] font-bold text-fg-3 mb-1.5">
                밑색·채색 어시스턴트용 지정 HEX 컬러칩
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedCharacter.colorPalette.map((chip) => (
                  <span
                    key={chip.partLabel}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-fg"
                  >
                    <span
                      className="size-3.5 rounded-full border border-line"
                      style={{ backgroundColor: chip.hex }}
                      aria-hidden="true"
                    />
                    {chip.partLabel}: <code>{chip.hex}</code>
                  </span>
                ))}
              </div>
            </div>

            {/* 노션 Toggle 블록 (스포일러 설정) & 자동 역링크(Backlinks) */}
            <details className="rounded-lg border border-line bg-panel p-2.5 text-xs">
              <summary className="cursor-pointer font-bold text-fg">
                스포일러·복선 토글 블록 열기 (`toggle`)
              </summary>
              <p className="mt-1.5 text-fg-2">{selectedCharacter.hiddenSpoilerToggle}</p>
            </details>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2 text-[0.6875rem] text-fg-2">
              <Link2 className="size-3.5 text-accent" aria-hidden="true" />
              <span className="font-bold">자동 역링크(Mentioned in):</span>
              {selectedBacklink && selectedBacklink.mentionedInPages.length > 0 ? (
                selectedBacklink.mentionedInPages.map((page) => (
                  <span
                    key={page.pageId}
                    className="rounded-full border border-line bg-panel px-2 py-0.5 font-semibold text-fg"
                  >
                    {page.pageTitle}
                  </span>
                ))
              ) : (
                <span>언급된 문서 없음</span>
              )}
            </div>
          </article>
        </div>

        {/* 양방향 인물 관계도 (AssociationRelationStore) */}
        <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
          <h4 className="flex items-center gap-1.5 text-sm font-black text-fg">
            <GitCompareArrows className="size-4 text-accent" aria-hidden="true" />
            양방향 인물 관계도 매트릭스 (`AssociationRelationStore`)
          </h4>
          <p className="text-xs text-fg-2">
            선택된 <strong>{selectedCharacter.name}</strong> 기준 정방향·역방향 대칭 미러링 관계입니다.
          </p>

          <div className="space-y-2">
            {characterRelations.map((rel) => (
              <div
                key={rel.edgeId}
                className="rounded-xl border border-line bg-card p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-fg">
                    {selectedCharacter.name} → {rel.counterpartName}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
                      rel.affinityScore >= 0
                        ? "border-good/40 bg-good/10 text-good"
                        : "border-bad/40 bg-bad/10 text-bad",
                    )}
                  >
                    {rel.relationLabel} (호감도 {rel.affinityScore})
                  </span>
                </div>
                <p className="text-[0.6875rem] text-fg-2">{rel.note}</p>
                <p className="text-[0.625rem] text-fg-3">
                  방향성: {rel.direction === "forward" ? "정방향 포인터" : "역방향 자동 미러링(inverse)"}
                </p>
              </div>
            ))}
          </div>

          {/* 인물 관계 추가/갱신 폼 */}
          <div className="rounded-xl border border-line bg-card p-3 space-y-2.5 text-xs">
            <p className="font-black text-fg">새 인물 관계 연결 · 역방향 미러링 설정</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 font-semibold text-fg-2">
                기준 캐릭터 (Record 1)
                <select
                  aria-label="관계 기준 캐릭터"
                  value={relSourceId}
                  onChange={(e) => setRelSourceId(e.target.value)}
                  className="min-h-8 rounded border border-line bg-panel px-2 text-fg"
                >
                  {characters.map((c) => (
                    <option key={c.characterId} value={c.characterId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-semibold text-fg-2">
                상대 캐릭터 (Record 2)
                <select
                  aria-label="관계 상대 캐릭터"
                  value={relTargetId}
                  onChange={(e) => setRelTargetId(e.target.value)}
                  className="min-h-8 rounded border border-line bg-panel px-2 text-fg"
                >
                  {characters.map((c) => (
                    <option key={c.characterId} value={c.characterId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-semibold text-fg-2">
                관계 유형
                <select
                  aria-label="인물 관계 유형"
                  value={relKind}
                  onChange={(e) => setRelKind(e.target.value as CharacterRelationKind)}
                  className="min-h-8 rounded border border-line bg-panel px-2 text-fg"
                >
                  {(
                    Object.keys(
                      CHARACTER_RELATION_DEFAULT_LABELS,
                    ) as CharacterRelationKind[]
                  ).map((k) => (
                    <option key={k} value={k}>
                      {CHARACTER_RELATION_DEFAULT_LABELS[k].forward} ↔{" "}
                      {CHARACTER_RELATION_DEFAULT_LABELS[k].inverse}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-semibold text-fg-2">
                호감·신뢰도 (-100~100)
                <input
                  type="number"
                  aria-label="인물 관계 호감도"
                  value={relAffinity}
                  onChange={(e) => setRelAffinity(Number(e.target.value) || 0)}
                  className="min-h-8 rounded border border-line bg-panel px-2 text-fg"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 font-semibold text-fg-2">
              관계 설정 메모
              <input
                aria-label="인물 관계 설정 메모"
                value={relNote}
                onChange={(e) => setRelNote(e.target.value)}
                className="min-h-8 rounded border border-line bg-panel px-2 text-fg"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 font-semibold text-fg">
                <input
                  type="checkbox"
                  checked={relMirrorInverse}
                  onChange={(e) => setRelMirrorInverse(e.target.checked)}
                />
                역방향 관계 자동 미러링 (`relation_toggle_inverse_on`)
              </label>
              <button
                type="button"
                onClick={handleUpsertRelation}
                className={buttonClass({ size: "sm" })}
              >
                인물 관계 저장
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 동기화 블록(Synced Block / transclusion) & 세계관·시놉시스 아카이브 */}
      <div className="grid gap-4 border-t border-line pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="rounded-2xl border border-accent/35 bg-panel p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-black text-fg">
              <RefreshCw className="size-4 text-accent" aria-hidden="true" />
              노션 동기화 블록 (`transclusion_container`)
            </h4>
            <select
              aria-label="편집할 동기화 블록 선택"
              value={activeSyncedBlockId}
              onChange={(e) => {
                const nextId = e.target.value;
                setActiveSyncedBlockId(nextId);
                const found = syncedBlocks.find((b) => b.syncedBlockId === nextId);
                if (found) setSyncedDraft(found.canonicalContent);
              }}
              className="min-h-8 rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg"
            >
              {syncedBlocks.map((b) => (
                <option key={b.syncedBlockId} value={b.syncedBlockId}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-fg-2">
            원본 설정 블록을 한 번 수정하면 이 블록을 임베드(`transclusion_reference`)한 모든 회차 시놉시스와 캐릭터 시트에 실시간 반영됩니다.
          </p>
          <textarea
            aria-label="동기화 블록 원본 내용"
            rows={3}
            value={syncedDraft}
            onChange={(e) => setSyncedDraft(e.target.value)}
            className="w-full rounded-xl border border-line bg-card p-2.5 text-xs leading-5 text-fg"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.6875rem] text-fg-3">
              실시간 참조 회차:{" "}
              {syncedBlocks
                .find((b) => b.syncedBlockId === activeSyncedBlockId)
                ?.referenceEpisodeIds.join(", ")}
            </span>
            <button
              type="button"
              onClick={handleSaveSyncedBlock}
              className={buttonClass({ size: "sm" })}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              전 회차 동기화 반영
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
          <h4 className="text-sm font-black text-fg">
            실시간 공유 세계관 설정집 &amp; 회차별 시놉시스 문서
          </h4>
          <div className="space-y-3">
            {filteredPages.map((page) => (
              <article
                key={page.pageId}
                className="rounded-xl border border-line bg-card p-3.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-fg">{page.title}</span>
                  <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2">
                    {LOREBOOK_CATEGORY_LABELS[page.category]} · {page.episodeRangeLabel}
                  </span>
                </div>
                <div className="rounded-lg border border-warn/35 bg-warn/10 px-2.5 py-1.5 text-[0.6875rem] font-semibold text-fg">
                  {page.calloutBanner}
                </div>
                <p className="leading-5 text-fg-2">{page.bodyMarkdown}</p>
                {page.embeddedSyncedBlockIds.map((syncId) => {
                  const synced = syncedBlocks.find((b) => b.syncedBlockId === syncId);
                  if (!synced) return null;
                  return (
                    <div
                      key={syncId}
                      data-testid={`embedded-${page.pageId}-${syncId}`}
                      className="rounded-lg border-l-4 border-accent bg-accent-soft/60 p-2 text-[0.6875rem] text-fg"
                    >
                      <p className="font-black text-accent">
                        동기화 참조됨 ({synced.title})
                      </p>
                      <p className="mt-0.5">{synced.canonicalContent}</p>
                    </div>
                  );
                })}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
