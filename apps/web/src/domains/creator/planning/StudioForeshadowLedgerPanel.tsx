/**
 * 복선 장부 표면 — 기획(story) 뷰의 "복선" 탭 본문.
 *
 * 원칙 (creative-features REPORT ★1):
 * - 새 표면을 만들지 않고 story 뷰 탭으로 얹는다. 이 컴포넌트는 props만 받는
 *   표면이고, 로드·저장은 StudioProjectStoryPlanning 컨테이너가 맡는다.
 * - 상태는 작가가 직접 바꿀 때만 바뀐다. 상태 select의 변경이 유일한 전이
 *   경로이고, "예정 경과" 표시는 도출(digest)일 뿐 상태를 건드리지 않는다.
 * - 장부가 비어 있으면 등록 폼을 접어 둔다 — 빈 장부가 화면을 차지해
 *   안 쓰는 작가의 기획 동선을 방해하지 않기 위해서다.
 */
import { useMemo, useState } from "react";

import {
  FORESHADOW_STATUSES,
  FORESHADOW_VISIBILITIES,
  type ForeshadowLedgerDigest,
  type ForeshadowSeed,
  type ForeshadowStatus,
  type ForeshadowVisibility,
} from "./studio-foreshadow-ledger";

export interface ForeshadowEpisodeOption {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
}

export interface ForeshadowSeedDraft {
  readonly title: string;
  readonly note: string;
  readonly plantedEpisodeId: string;
  /** null = 회수 예정 구간을 정하지 않음 (장기 복선) */
  readonly payoffFromEpisodeId: string | null;
  readonly payoffToEpisodeId: string | null;
  readonly linkedFactIds: readonly string[];
  readonly linkedCharacterIds: readonly string[];
  readonly visibility: ForeshadowVisibility;
}

export interface StudioForeshadowLedgerPanelProps {
  readonly seeds: readonly ForeshadowSeed[];
  readonly digest: ForeshadowLedgerDigest;
  readonly episodes: readonly ForeshadowEpisodeOption[];
  readonly facts: readonly { readonly id: string; readonly label: string }[];
  readonly characters: readonly { readonly id: string; readonly name: string }[];
  readonly onCreateSeed: (draft: ForeshadowSeedDraft) => void;
  readonly onUpdateSeed: (seed: ForeshadowSeed) => void;
  readonly onChangeStatus: (seedId: string, status: ForeshadowStatus) => void;
}

const STATUS_LABEL: Readonly<Record<ForeshadowStatus, string>> = {
  planted: "심음",
  growing: "자라는 중",
  paidOff: "회수됨",
  dropped: "폐기",
};

const VISIBILITY_LABEL: Readonly<Record<ForeshadowVisibility, string>> = {
  author: "작가만",
  team: "팀 공개",
  reviewers: "검수자 공개",
};

type StatusFilter = ForeshadowStatus | "all" | "overdue";

export function StudioForeshadowLedgerPanel({
  seeds,
  digest,
  episodes,
  facts,
  characters,
  onCreateSeed,
  onUpdateSeed,
  onChangeStatus,
}: StudioForeshadowLedgerPanelProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const episodeLabel = (episodeId: string) => {
    const episode = episodes.find((entry) => entry.episodeId === episodeId);
    return episode ? `${episode.episodeNumber}화 ${episode.title}` : episodeId;
  };

  const visibleSeeds = useMemo(() => {
    if (filter === "all") return seeds;
    if (filter === "overdue") {
      const overdueIds = new Set(digest.overdue.map((seed) => seed.id));
      return seeds.filter((seed) => overdueIds.has(seed.id));
    }
    return seeds.filter((seed) => seed.status === filter);
  }, [seeds, digest, filter]);

  const editingSeed = editingId
    ? seeds.find((seed) => seed.id === editingId) ?? null
    : null;

  return (
    <section aria-label="복선 장부">
      <header>
        <h1>복선 장부</h1>
        <p>
          심어 둔 복선을 잊지 않도록 적어 두는 장부예요. 회수했는지는 직접
          표시해 주세요 — 예정이 지났다고 자동으로 회수 처리하지 않아요.
        </p>
      </header>

      <p aria-label="장부 요약">
        심음 {digest.counts.planted} · 자라는 중 {digest.counts.growing} · 회수됨{" "}
        {digest.counts.paidOff} · 폐기 {digest.counts.dropped}
        {digest.overdue.length > 0
          ? ` · 회수 예정이 지난 복선 ${digest.overdue.length}개`
          : ""}
        {digest.longRunning.length > 0
          ? ` · 장기 복선 ${digest.longRunning.length}개`
          : ""}
      </p>

      <nav aria-label="복선 상태 필터">
        <button type="button" onClick={() => setFilter("all")}>전체</button>
        {FORESHADOW_STATUSES.map((status) => (
          <button key={status} type="button" onClick={() => setFilter(status)}>
            {STATUS_LABEL[status]}
          </button>
        ))}
        <button type="button" onClick={() => setFilter("overdue")}>
          예정 지난 복선
        </button>
      </nav>

      {seeds.length === 0 ? (
        <details>
          <summary>아직 등록된 복선이 없어요 — 첫 복선 등록하기</summary>
          <SeedForm
            episodes={episodes}
            facts={facts}
            characters={characters}
            onSubmit={onCreateSeed}
          />
        </details>
      ) : (
        <>
          <ul aria-label="복선 목록">
            {visibleSeeds.map((seed) => (
              <li key={seed.id}>
                <article aria-label={seed.title}>
                  <h2>{seed.title}</h2>
                  <p>심은 회차: {episodeLabel(seed.plantedIn.episodeId)}</p>
                  <p>
                    {seed.expectedPayoff
                      ? `회수 예정: ${episodeLabel(seed.expectedPayoff.fromEpisodeId)}`
                        + (seed.expectedPayoff.toEpisodeId
                          ? ` ~ ${episodeLabel(seed.expectedPayoff.toEpisodeId)}`
                          : " 이후")
                      : "회수 예정: 정하지 않음 (장기 복선)"}
                  </p>
                  {digest.overdue.some((entry) => entry.id === seed.id) && (
                    <p>회수 예정 구간이 지났어요. 회수했으면 상태를 바꿔 주세요.</p>
                  )}
                  {seed.note && <p>{seed.note}</p>}
                  {seed.linkedFactIds.length > 0 && (
                    <p>
                      연결된 설정: {seed.linkedFactIds
                        .map((id) => facts.find((fact) => fact.id === id)?.label ?? id)
                        .join(", ")}
                    </p>
                  )}
                  {seed.linkedCharacterIds.length > 0 && (
                    <p>
                      연결된 캐릭터: {seed.linkedCharacterIds
                        .map((id) => characters.find((c) => c.id === id)?.name ?? id)
                        .join(", ")}
                    </p>
                  )}
                  <p>공개 범위: {VISIBILITY_LABEL[seed.visibility]}</p>
                  <label>
                    상태
                    <select
                      value={seed.status}
                      onChange={(event) => onChangeStatus(
                        seed.id,
                        event.target.value as ForeshadowStatus,
                      )}
                    >
                      {FORESHADOW_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => setEditingId(seed.id)}>
                    고치기
                  </button>
                </article>
              </li>
            ))}
          </ul>
          {visibleSeeds.length === 0 && <p>이 상태의 복선이 없어요.</p>}
          {editingSeed ? (
            <SeedForm
              key={editingSeed.id}
              episodes={episodes}
              facts={facts}
              characters={characters}
              initial={editingSeed}
              onSubmit={(draft) => {
                onUpdateSeed(applyDraft(editingSeed, draft));
                setEditingId(null);
              }}
            />
          ) : (
            <details>
              <summary>새 복선 등록하기</summary>
              <SeedForm
                episodes={episodes}
                facts={facts}
                characters={characters}
                onSubmit={onCreateSeed}
              />
            </details>
          )}
        </>
      )}
    </section>
  );
}

function applyDraft(seed: ForeshadowSeed, draft: ForeshadowSeedDraft): ForeshadowSeed {
  return Object.freeze({
    ...seed,
    title: draft.title,
    note: draft.note,
    plantedIn: Object.freeze({ ...seed.plantedIn, episodeId: draft.plantedEpisodeId }),
    ...(draft.payoffFromEpisodeId
      ? {
          expectedPayoff: Object.freeze({
            fromEpisodeId: draft.payoffFromEpisodeId,
            toEpisodeId: draft.payoffToEpisodeId,
          }),
        }
      : { expectedPayoff: undefined }),
    linkedFactIds: Object.freeze([...draft.linkedFactIds]),
    linkedCharacterIds: Object.freeze([...draft.linkedCharacterIds]),
    visibility: draft.visibility,
    updatedAt: new Date().toISOString(),
  });
}

function SeedForm({
  episodes,
  facts,
  characters,
  initial,
  onSubmit,
}: {
  readonly episodes: readonly ForeshadowEpisodeOption[];
  readonly facts: readonly { readonly id: string; readonly label: string }[];
  readonly characters: readonly { readonly id: string; readonly name: string }[];
  readonly initial?: ForeshadowSeed;
  readonly onSubmit: (draft: ForeshadowSeedDraft) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [plantedEpisodeId, setPlantedEpisodeId] = useState(
    initial?.plantedIn.episodeId ?? episodes[0]?.episodeId ?? "",
  );
  const [hasPayoffWindow, setHasPayoffWindow] = useState(
    initial ? initial.expectedPayoff !== undefined : false,
  );
  const [payoffFromEpisodeId, setPayoffFromEpisodeId] = useState(
    initial?.expectedPayoff?.fromEpisodeId ?? episodes[0]?.episodeId ?? "",
  );
  const [payoffToEpisodeId, setPayoffToEpisodeId] = useState(
    initial?.expectedPayoff?.toEpisodeId ?? "",
  );
  const [linkedFactIds, setLinkedFactIds] = useState<readonly string[]>(
    initial?.linkedFactIds ?? [],
  );
  const [linkedCharacterIds, setLinkedCharacterIds] = useState<readonly string[]>(
    initial?.linkedCharacterIds ?? [],
  );
  const [visibility, setVisibility] = useState<ForeshadowVisibility>(
    initial?.visibility ?? "author",
  );

  const toggle = (
    list: readonly string[],
    setList: (next: readonly string[]) => void,
    id: string,
    checked: boolean,
  ) => {
    setList(checked ? [...list, id] : list.filter((entry) => entry !== id));
  };

  return (
    <form
      aria-label={initial ? "복선 고치기" : "복선 등록"}
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || !plantedEpisodeId) return;
        onSubmit({
          title: title.trim(),
          note,
          plantedEpisodeId,
          payoffFromEpisodeId: hasPayoffWindow ? payoffFromEpisodeId || null : null,
          payoffToEpisodeId: hasPayoffWindow && payoffToEpisodeId ? payoffToEpisodeId : null,
          linkedFactIds,
          linkedCharacterIds,
          visibility,
        });
        if (!initial) setTitle("");
      }}
    >
      <h2>{initial ? "복선 고치기" : "복선 등록"}</h2>
      <label>
        복선 이름
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 주인공이 숨긴 편지"
        />
      </label>
      <label>
        메모
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="어떻게 심었고, 어떻게 거둘 생각인지"
        />
      </label>
      <label>
        심은 회차
        <select
          value={plantedEpisodeId}
          onChange={(event) => setPlantedEpisodeId(event.target.value)}
        >
          {episodes.map((episode) => (
            <option key={episode.episodeId} value={episode.episodeId}>
              {episode.episodeNumber}화 {episode.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={hasPayoffWindow}
          onChange={(event) => setHasPayoffWindow(event.target.checked)}
        />
        회수 예정 구간 정하기 (비워 두면 장기 복선으로 두고 경고하지 않아요)
      </label>
      {hasPayoffWindow && (
        <fieldset>
          <legend>회수 예정 구간</legend>
          <label>
            시작 회차
            <select
              value={payoffFromEpisodeId}
              onChange={(event) => setPayoffFromEpisodeId(event.target.value)}
            >
              {episodes.map((episode) => (
                <option key={episode.episodeId} value={episode.episodeId}>
                  {episode.episodeNumber}화 {episode.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            끝 회차 (비우면 그 이후 언제든)
            <select
              value={payoffToEpisodeId}
              onChange={(event) => setPayoffToEpisodeId(event.target.value)}
            >
              <option value="">정하지 않음</option>
              {episodes.map((episode) => (
                <option key={episode.episodeId} value={episode.episodeId}>
                  {episode.episodeNumber}화 {episode.title}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
      {facts.length > 0 && (
        <fieldset>
          <legend>연결할 설정 (스토리 바이블)</legend>
          {facts.map((fact) => (
            <label key={fact.id}>
              <input
                type="checkbox"
                checked={linkedFactIds.includes(fact.id)}
                onChange={(event) => toggle(
                  linkedFactIds,
                  setLinkedFactIds,
                  fact.id,
                  event.target.checked,
                )}
              />
              {fact.label}
            </label>
          ))}
        </fieldset>
      )}
      {characters.length > 0 && (
        <fieldset>
          <legend>연결할 캐릭터</legend>
          {characters.map((character) => (
            <label key={character.id}>
              <input
                type="checkbox"
                checked={linkedCharacterIds.includes(character.id)}
                onChange={(event) => toggle(
                  linkedCharacterIds,
                  setLinkedCharacterIds,
                  character.id,
                  event.target.checked,
                )}
              />
              {character.name}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        공개 범위 (복선은 그 자체로 스포일러예요)
        <select
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as ForeshadowVisibility)}
        >
          {FORESHADOW_VISIBILITIES.map((value) => (
            <option key={value} value={value}>
              {VISIBILITY_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">{initial ? "저장" : "장부에 등록"}</button>
    </form>
  );
}
