/**
 * 세계관 설정 허브 — 작품의 설정을 종류별로 적고, 잇고, 찾는 표면.
 *
 * 원칙:
 * - 데이터는 props 경계 너머(studio-world-lore-store)가 정본이다. 이 표면은
 *   표시와 편집 초안만 들고, 저장은 onSaveEntries 콜백 하나로 올린다.
 * - 빈 상태는 "아무것도 없음"으로 끝내지 않는다. 예시 세계 하나로 시작하거나
 *   직접 첫 항목을 추가하는 두 길을 항상 보여준다.
 * - 연표는 별도 화면이 아니라 이 허브의 한 섹션이다 — 사건 항목이 곧 연표다.
 * - 이름 일관성 검사 패널은 nameCheck 슬롯으로 들어온다(별도 레인 산출).
 *   슬롯이 없으면 이 표면은 검사 없이도 온전히 동작한다.
 * - 상태 표기(lore-entry-status 레인): 모든 항목에 상태(확정/추측/의도적
 *   빈칸/폐기/격리)·버전·적용 범위(작품·시즌)를 함께 보여준다. 격리·폐기
 *   항목은 기본 목록에서 분리해 하단 "격리·레전드 보관함"에만 둔다.
 *   새 이름 등록은 일관성 게이트(evaluateLoreClaim)를 먼저 지난다 —
 *   확정 설정과 겹치면 저장이 막히고, 추측·빈칸과 겹치면 안내와 함께
 *   통과한다(선점 규칙: 기획 단계 선등록).
 * - 설정 변경 영향(setting-change-impact-alert-expansion 레인): 이름·규칙이
 *   바뀐 설정을 참조하는 회차 줄거리·대사·다른 설정을 loreChangeImpact
 *   슬롯으로 받아 머리글 배지 + 펼침 목록으로 보여준다(P-4의 바이블 전파를
 *   로어까지 확장). 슬롯이 없으면 배지·목록 없이 기존과 동일하게 동작한다.
 */
import { useMemo, useState, type ReactNode } from "react";

import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  STUDIO_LORE_ENTRY_KINDS,
  STUDIO_LORE_ENTRY_STATUSES,
  STUDIO_LORE_KIND_LABELS,
  STUDIO_LORE_STATUS_LABELS,
  activeLoreEntries,
  createWorldLoreExamples,
  formatLoreEntryStatusLine,
  loreEntriesByKind,
  loreKindCounts,
  loreRelatedEntries,
  loreStatusCounts,
  loreTimeline,
  nextLoreEntryId,
  removeLoreEntry,
  removeLoreExamples,
  retiredLoreEntries,
  searchLoreEntries,
  transitionLoreEntryStatus,
  upsertLoreEntry,
  type StudioLoreEntry,
  type StudioLoreEntryKind,
  type StudioLoreEntryStatus,
  type StudioWorldLore,
} from "./studio-world-lore";
import { evaluateLoreClaim } from "./studio-lore-consistency-gate";
import type { StudioLoreChangeNotice } from "./studio-lore-change-impact";
import {
  StudioLoreChangeImpactBadge,
  StudioLoreChangeImpactPanel,
} from "./StudioLoreChangeImpactPanel";

export interface StudioWorldLoreHubProps {
  readonly lore: StudioWorldLore;
  /** 연결 선택·이름 표시용 캐릭터 목록 (바이블 정본, 읽기 전용). */
  readonly characters: readonly StudioStoryCharacter[];
  readonly onSaveEntries: (entries: readonly StudioLoreEntry[]) => void;
  /** 이름 일관성 검사 패널 등 하단 확장 슬롯. 없으면 렌더하지 않는다. */
  readonly nameCheck?: ReactNode;
  /**
   * 설정 변경 영향 슬롯 (studio-lore-change-impact 산출). 호스트가 변경 전
   * 로어와 회차 줄거리·대사 참조 소스를 조립해 알림을 만들어 넘긴다.
   * 없으면 배지·영향 목록을 렌더하지 않는다.
   */
  readonly loreChangeImpact?: {
    readonly notices: readonly StudioLoreChangeNotice[];
    readonly acknowledgedIds: readonly string[];
    readonly onAcknowledge: (noticeId: string) => void;
    readonly onAcknowledgeAll: () => void;
    readonly onSelectEntry?: (entryId: string) => void;
    readonly onSelectEpisode?: (episodeId: string) => void;
  };
}

type KindFilter = StudioLoreEntryKind | "all";

interface LoreDraft {
  readonly id: string | null;
  readonly kind: StudioLoreEntryKind;
  readonly name: string;
  readonly aliasesText: string;
  readonly summary: string;
  readonly details: string;
  readonly eraLabel: string;
  readonly timelineOrderText: string;
  readonly relatedEntryIds: readonly string[];
  readonly characterIds: readonly string[];
  readonly status: StudioLoreEntryStatus;
  readonly versionText: string;
  readonly workIdsText: string;
  readonly seasonLabelsText: string;
}

const EMPTY_DRAFT: LoreDraft = {
  id: null,
  kind: "place",
  name: "",
  aliasesText: "",
  summary: "",
  details: "",
  eraLabel: "",
  timelineOrderText: "",
  relatedEntryIds: [],
  characterIds: [],
  status: "speculative",
  versionText: "1",
  workIdsText: "",
  seasonLabelsText: "",
};

function draftFromEntry(entry: StudioLoreEntry): LoreDraft {
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    aliasesText: entry.aliases.join(", "),
    summary: entry.summary,
    details: entry.details,
    eraLabel: entry.eraLabel,
    timelineOrderText: entry.timelineOrder === null ? "" : String(entry.timelineOrder),
    relatedEntryIds: entry.relatedEntryIds,
    characterIds: entry.characterIds,
    status: entry.status,
    versionText: String(entry.version),
    workIdsText: entry.appliesToWorkIds.join(", "),
    seasonLabelsText: entry.appliesToSeasonLabels.join(", "),
  };
}

function toggleId(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id];
}

export function StudioWorldLoreHub({
  lore,
  characters,
  onSaveEntries,
  nameCheck,
  loreChangeImpact,
}: StudioWorldLoreHubProps) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StudioLoreEntryStatus | "all">("all");
  const [showRetired, setShowRetired] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<LoreDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [showChangeImpact, setShowChangeImpact] = useState(false);

  const counts = useMemo(() => loreKindCounts(lore), [lore]);
  const statusCounts = useMemo(() => loreStatusCounts(lore), [lore]);
  const retired = useMemo(() => retiredLoreEntries(lore), [lore]);
  const visible = useMemo(() => {
    const active: StudioWorldLore = { projectId: lore.projectId, entries: activeLoreEntries(lore) };
    const searched = searchLoreEntries(active, query);
    return statusFilter === "all"
      ? searched
      : searched.filter((entry) => entry.status === statusFilter);
  }, [lore, query, statusFilter]);
  const timeline = useMemo(() => loreTimeline(lore), [lore]);
  const characterName = (id: string) =>
    characters.find((character) => character.id === id)?.name ?? id;
  const hasExamples = lore.entries.some((entry) => entry.origin === "example");

  const saveEntries = (entries: readonly StudioLoreEntry[]) => onSaveEntries(entries);

  const startWithExamples = () => {
    const examples = createWorldLoreExamples(lore.projectId);
    let next: StudioWorldLore = lore;
    for (const entry of examples.entries) next = upsertLoreEntry(next, entry);
    saveEntries(next.entries);
  };

  const submitDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setDraftError("이름을 먼저 적어 주세요. 이름이 곧 이 설정의 정본 표기예요.");
      return;
    }
    const order = draft.timelineOrderText.trim();
    const timelineOrder = order === "" ? null : Number(order);
    if (timelineOrder !== null && !Number.isFinite(timelineOrder)) {
      setDraftError("연표 순서는 숫자로 적어 주세요. 작을수록 먼저 일어난 일이에요.");
      return;
    }
    const version = Number(draft.versionText.trim() || "1");
    if (!Number.isFinite(version) || version < 1) {
      setDraftError("버전은 1 이상의 숫자로 적어 주세요.");
      return;
    }
    const aliases = draft.aliasesText.split(",").map((alias) => alias.trim()).filter(Boolean);
    const appliesToWorkIds = draft.workIdsText.split(",").map((v) => v.trim()).filter(Boolean);
    const appliesToSeasonLabels = draft.seasonLabelsText
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    // 선점 게이트 — 확정 설정과 이름이 겹치면 저장을 막는다(block).
    // 추측·빈칸과 겹치는 경우(pass-with-nudge)는 저장을 진행한다 —
    // 판정 분기 자체는 studio-lore-consistency-gate 가 정본이다.
    const gate = evaluateLoreClaim(lore, {
      entryId: draft.id,
      kind: draft.kind,
      name,
      aliases,
      appliesToWorkIds,
      appliesToSeasonLabels,
    });
    if (gate.blocked) {
      setDraftError(gate.reasons.map((reason) => reason.message).join(" "));
      return;
    }
    const existing = draft.id
      ? lore.entries.find((entry) => entry.id === draft.id)
      : undefined;
    const entry: StudioLoreEntry = {
      id: draft.id ?? nextLoreEntryId(lore, draft.kind),
      kind: draft.kind,
      name,
      aliases,
      summary: draft.summary.trim(),
      details: draft.details.trim(),
      eraLabel: draft.eraLabel.trim(),
      timelineOrder,
      relatedEntryIds: draft.relatedEntryIds.filter((id) => id !== draft.id),
      characterIds: draft.characterIds,
      origin: existing?.origin ?? "authored",
      status: draft.status,
      version: Math.trunc(version),
      appliesToWorkIds,
      appliesToSeasonLabels,
    };
    saveEntries(upsertLoreEntry(lore, entry).entries);
    setDraft(null);
    setDraftError(null);
  };

  const visibleKinds = STUDIO_LORE_ENTRY_KINDS.filter(
    (kind) => filter === "all" || filter === kind,
  );

  return (
    <section aria-label="세계관 설정">
      <header>
        <h1>세계관 설정</h1>
        <p>
          장소·세력·종족·규칙·연표를 항목으로 적어 두면, 회차가 쌓여도 설정이
          흔들리지 않아요. 이름은 여기서 적은 표기가 정본이 됩니다.
        </p>
      </header>

      {loreChangeImpact && (
        <div>
          <StudioLoreChangeImpactBadge
            notices={loreChangeImpact.notices}
            acknowledgedIds={loreChangeImpact.acknowledgedIds}
            onClick={() => setShowChangeImpact((value) => !value)}
          />
          {showChangeImpact && (
            <StudioLoreChangeImpactPanel
              notices={loreChangeImpact.notices}
              acknowledgedIds={loreChangeImpact.acknowledgedIds}
              onAcknowledge={loreChangeImpact.onAcknowledge}
              onAcknowledgeAll={loreChangeImpact.onAcknowledgeAll}
              onSelectEntry={loreChangeImpact.onSelectEntry}
              onSelectEpisode={loreChangeImpact.onSelectEpisode}
            />
          )}
        </div>
      )}

      {lore.entries.length === 0 ? (
        <div>
          <p>아직 적어 둔 설정이 없어요. 세계를 이루는 것들부터 하나씩 세워 보세요.</p>
          <button type="button" onClick={startWithExamples}>
            예시 세계로 시작하기
          </button>{" "}
          <button type="button" onClick={() => { setDraft(EMPTY_DRAFT); setDraftError(null); }}>
            직접 첫 설정 추가하기
          </button>
          <p>
            예시는 서로 이어진 작은 세계(잠긴 도서관과 등불지기 길드)예요.
            감을 잡은 뒤에는 한 번에 지우고 내 설정으로 바꿀 수 있어요.
          </p>
        </div>
      ) : (
        <div>
          <p>
            설정 {lore.entries.length}개 ·{" "}
            {STUDIO_LORE_ENTRY_KINDS.map(
              (kind) => `${STUDIO_LORE_KIND_LABELS[kind].ko} ${counts[kind]}`,
            ).join(" · ")}
          </p>
          <p>
            상태 ·{" "}
            {STUDIO_LORE_ENTRY_STATUSES.map(
              (status) => `${STUDIO_LORE_STATUS_LABELS[status].ko} ${statusCounts[status]}`,
            ).join(" · ")}
          </p>
          <div role="group" aria-label="종류 필터">
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              전체
            </button>
            {STUDIO_LORE_ENTRY_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={filter === kind}
                onClick={() => setFilter(kind)}
              >
                {STUDIO_LORE_KIND_LABELS[kind].ko}
              </button>
            ))}
          </div>
          <div role="group" aria-label="상태 필터">
            <button
              type="button"
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            >
              상태 전체
            </button>
            {STUDIO_LORE_ENTRY_STATUSES.filter(
              (status) => status !== "deprecated" && status !== "quarantined",
            ).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {STUDIO_LORE_STATUS_LABELS[status].ko}
              </button>
            ))}
          </div>
          <label>
            설정 찾기{" "}
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름·별칭·내용으로 찾기"
            />
          </label>{" "}
          <button type="button" onClick={() => { setDraft(EMPTY_DRAFT); setDraftError(null); }}>
            설정 추가
          </button>
          {hasExamples && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => saveEntries(removeLoreExamples(lore).entries)}
              >
                예시 항목만 지우기
              </button>
            </>
          )}
        </div>
      )}

      {draft && (
        <form
          aria-label={draft.id ? "설정 고치기" : "설정 추가"}
          onSubmit={(event) => {
            event.preventDefault();
            submitDraft();
          }}
        >
          <h2>{draft.id ? "설정 고치기" : "설정 추가"}</h2>
          <label>
            종류{" "}
            <select
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as StudioLoreEntryKind })
              }
            >
              {STUDIO_LORE_ENTRY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {STUDIO_LORE_KIND_LABELS[kind].ko}
                </option>
              ))}
            </select>
          </label>
          <label>
            이름{" "}
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="예: 침수된 옛 도서관"
            />
          </label>
          <label>
            상태{" "}
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as StudioLoreEntryStatus })
              }
            >
              {STUDIO_LORE_ENTRY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STUDIO_LORE_STATUS_LABELS[status].ko}
                </option>
              ))}
            </select>{" "}
            <span>{STUDIO_LORE_STATUS_LABELS[draft.status].hintKo}</span>
          </label>
          <label>
            버전{" "}
            <input
              type="text"
              inputMode="numeric"
              value={draft.versionText}
              onChange={(event) => setDraft({ ...draft, versionText: event.target.value })}
            />
          </label>
          <label>
            적용 작품{" "}
            <input
              type="text"
              value={draft.workIdsText}
              onChange={(event) => setDraft({ ...draft, workIdsText: event.target.value })}
              placeholder="쉼표로 구분 — 비우면 전 작품"
            />
          </label>
          <label>
            적용 시즌{" "}
            <input
              type="text"
              value={draft.seasonLabelsText}
              onChange={(event) =>
                setDraft({ ...draft, seasonLabelsText: event.target.value })
              }
              placeholder="쉼표로 구분 — 예: 시즌 1, 시즌 2 (비우면 전 시즌)"
            />
          </label>
          <label>
            다른 표기(별칭){" "}
            <input
              type="text"
              value={draft.aliasesText}
              onChange={(event) => setDraft({ ...draft, aliasesText: event.target.value })}
              placeholder="쉼표로 구분 — 예: 옛 도서관, 물밑 서고"
            />
          </label>
          <label>
            한 줄 요약{" "}
            <input
              type="text"
              value={draft.summary}
              onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            />
          </label>
          <label>
            상세 설정{" "}
            <textarea
              value={draft.details}
              onChange={(event) => setDraft({ ...draft, details: event.target.value })}
              rows={4}
            />
          </label>
          {draft.kind === "event" && (
            <>
              <label>
                시기 표기{" "}
                <input
                  type="text"
                  value={draft.eraLabel}
                  onChange={(event) => setDraft({ ...draft, eraLabel: event.target.value })}
                  placeholder="예: 대침수 12년 뒤"
                />
              </label>
              <label>
                연표 순서{" "}
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.timelineOrderText}
                  onChange={(event) =>
                    setDraft({ ...draft, timelineOrderText: event.target.value })
                  }
                  placeholder="작을수록 먼저"
                />
              </label>
            </>
          )}
          {lore.entries.some((entry) => entry.id !== draft.id) && (
            <fieldset>
              <legend>이어지는 설정</legend>
              {lore.entries
                .filter((entry) => entry.id !== draft.id)
                .map((entry) => (
                  <label key={entry.id}>
                    <input
                      type="checkbox"
                      checked={draft.relatedEntryIds.includes(entry.id)}
                      onChange={() =>
                        setDraft({
                          ...draft,
                          relatedEntryIds: toggleId(draft.relatedEntryIds, entry.id),
                        })
                      }
                    />{" "}
                    {entry.name} ({STUDIO_LORE_KIND_LABELS[entry.kind].ko})
                  </label>
                ))}
            </fieldset>
          )}
          {characters.length > 0 && (
            <fieldset>
              <legend>이어지는 캐릭터</legend>
              {characters.map((character) => (
                <label key={character.id}>
                  <input
                    type="checkbox"
                    checked={draft.characterIds.includes(character.id)}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        characterIds: toggleId(draft.characterIds, character.id),
                      })
                    }
                  />{" "}
                  {character.name}
                </label>
              ))}
            </fieldset>
          )}
          {draftError && <p role="alert">{draftError}</p>}
          <button type="submit">저장</button>{" "}
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setDraftError(null);
            }}
          >
            취소
          </button>
        </form>
      )}

      {(filter === "all" || filter === "event") && timeline.length > 0 && !query.trim() && (
        <section aria-label="연표">
          <h2>연표</h2>
          <ol>
            {timeline.map((entry) => (
              <li key={entry.id}>
                {entry.eraLabel ? `${entry.eraLabel} — ` : ""}
                {entry.name}
                {entry.summary ? ` · ${entry.summary}` : ""}
              </li>
            ))}
          </ol>
        </section>
      )}

      {visibleKinds.map((kind) => {
        const entries = loreEntriesByKind({ projectId: lore.projectId, entries: visible }, kind);
        if (entries.length === 0) return null;
        return (
          <section key={kind} aria-label={STUDIO_LORE_KIND_LABELS[kind].ko}>
            <h2>
              {STUDIO_LORE_KIND_LABELS[kind].ko} {entries.length}
            </h2>
            <ul>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <article aria-label={entry.name}>
                    <h3>
                      {entry.name}
                      {entry.origin === "example" ? " (예시)" : ""}
                    </h3>
                    <p>
                      상태: {formatLoreEntryStatusLine(entry)}
                      {entry.origin === "example" ? " · 예시" : ""}
                    </p>
                    {entry.status === "intentional-gap" && (
                      <p>의도적으로 비워 둔 설정이에요 — 내용을 채우지 않아도 오류가 아니에요.</p>
                    )}
                    {entry.status === "speculative" && (
                      <p>아직 추측 단계예요. 확정하면 다른 설정과의 충돌이 여기서 막혀요.</p>
                    )}
                    {entry.aliases.length > 0 && (
                      <p>다른 표기: {entry.aliases.join(", ")}</p>
                    )}
                    {entry.kind === "event" && entry.eraLabel && <p>시기: {entry.eraLabel}</p>}
                    {entry.summary && <p>{entry.summary}</p>}
                    {entry.details && <p>{entry.details}</p>}
                    {loreRelatedEntries(lore, entry).length > 0 && (
                      <p>
                        이어지는 설정:{" "}
                        {loreRelatedEntries(lore, entry).map((rel) => rel.name).join(", ")}
                      </p>
                    )}
                    {entry.characterIds.length > 0 && (
                      <p>
                        이어지는 캐릭터:{" "}
                        {entry.characterIds.map((id) => characterName(id)).join(", ")}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(draftFromEntry(entry));
                        setDraftError(null);
                      }}
                    >
                      고치기
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => saveEntries(removeLoreEntry(lore, entry.id).entries)}
                    >
                      지우기
                    </button>{" "}
                    {entry.status !== "confirmed" && (
                      <button
                        type="button"
                        onClick={() =>
                          saveEntries(
                            transitionLoreEntryStatus(lore, entry.id, "confirmed").entries,
                          )
                        }
                      >
                        확정으로 올리기
                      </button>
                    )}{" "}
                    <button
                      type="button"
                      onClick={() =>
                        saveEntries(
                          transitionLoreEntryStatus(lore, entry.id, "quarantined").entries,
                        )
                      }
                    >
                      격리(레전드)로 보내기
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {lore.entries.length > 0 && visible.length === 0 && (
        <p>찾는 설정이 없어요. 다른 말로 찾아보거나, 새 설정으로 추가해 보세요.</p>
      )}

      {retired.length > 0 && (
        <section aria-label="격리·레전드 보관함">
          <h2>격리·레전드 보관함 {retired.length}</h2>
          <p>
            폐기·격리된 설정은 본편 정본에서 분리해 보관해요. 이름은 새 설정이
            다시 쓸 수 있고, 필요하면 확정으로 되돌릴 수 있어요.
          </p>
          <button type="button" onClick={() => setShowRetired((value) => !value)}>
            {showRetired ? "보관함 접기" : "보관함 펼치기"}
          </button>
          {showRetired && (
            <ul>
              {retired.map((entry) => (
                <li key={entry.id}>
                  <article aria-label={entry.name}>
                    <h3>{entry.name}</h3>
                    <p>상태: {formatLoreEntryStatusLine(entry)}</p>
                    {entry.summary && <p>{entry.summary}</p>}
                    <button
                      type="button"
                      onClick={() =>
                        saveEntries(
                          transitionLoreEntryStatus(lore, entry.id, "confirmed").entries,
                        )
                      }
                    >
                      확정으로 되돌리기
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => saveEntries(removeLoreEntry(lore, entry.id).entries)}
                    >
                      지우기
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {nameCheck}
    </section>
  );
}
