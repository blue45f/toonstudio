import { FileText, Link2, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildStoryCrosslinkIndex,
  splitDocumentByMentions,
  type StoryBibleDocument,
  type StoryBibleEntity,
  type StoryBibleEntityKind,
} from "./story-bible-crosslink-model";

/** 후보를 새 바이블 항목으로 만들 때 고를 수 있는 종류 (호스트 저장 모델과 일치). */
export type StoryBibleCreatableKind = "scene" | "location" | "prop";

export interface StoryBibleCrosslinkPanelProps {
  readonly entities: readonly StoryBibleEntity[];
  readonly documents: readonly StoryBibleDocument[];
  readonly loading?: boolean;
  readonly error?: string | null;
  /** 항목 행의 "열기" — 호스트가 해당 항목 편집 화면으로 이동한다. */
  readonly onSelectEntity?: (entityId: string) => void;
  /** 미등록 후보를 새 바이블 항목으로 추가한다. */
  readonly onCreateEntry?: (name: string, kind: StoryBibleCreatableKind) => void;
}

const ENTITY_KIND_LABELS: Readonly<Record<StoryBibleEntityKind, string>> = {
  character: "캐릭터",
  location: "장소",
  prop: "소품",
  scene: "장면",
  term: "용어",
};

const CREATABLE_KINDS: readonly StoryBibleCreatableKind[] = ["location", "prop", "scene"];

/**
 * 스토리 바이블 "연결 지도" 패널.
 * 등록된 이름이 다른 기록에 등장하면 자동으로 이어 주고, 항목마다 어디서
 * 언급되는지(백링크)를 보여 준다. 자주 나오는데 아직 항목이 없는 이름은
 * 후보로 모아 한 번에 항목으로 만들 수 있다.
 */
export function StoryBibleCrosslinkPanel({
  entities,
  documents,
  loading = false,
  error = null,
  onSelectEntity,
  onCreateEntry,
}: StoryBibleCrosslinkPanelProps) {
  const index = useMemo(
    () => buildStoryCrosslinkIndex(entities, documents),
    [entities, documents],
  );
  const entityById = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity])),
    [entities],
  );
  const linkByEntityId = useMemo(
    () => new Map(index.entityLinks.map((link) => [link.entityId, link])),
    [index],
  );
  const mentionsByDocumentId = useMemo(
    () => new Map(index.documentLinks.map((link) => [link.documentId, link.mentions])),
    [index],
  );

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [candidateKinds, setCandidateKinds] = useState<Readonly<Record<string, StoryBibleCreatableKind>>>({});

  const selectedEntity = selectedEntityId ? entityById.get(selectedEntityId) ?? null : null;
  const selectedLink = selectedEntityId ? linkByEntityId.get(selectedEntityId) ?? null : null;
  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) ?? null;
  const selectedSegments = selectedDocument
    ? splitDocumentByMentions(
        selectedDocument.body,
        mentionsByDocumentId.get(selectedDocument.id) ?? [],
      )
    : [];

  if (loading) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-8 text-sm text-fg-3">
        바이블 연결을 읽고 있어요…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {error ? (
        <p role="alert" className="m-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-black text-fg">
          <Link2 size={15} aria-hidden /> 연결 지도
        </h3>
        <span className="rounded-full bg-raised px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums text-fg-2">
          항목 {entities.length}개 · 언급 {index.mentions.length}곳 · 새 이름 후보 {index.candidates.length}개
        </span>
      </div>
      <p className="px-4 pt-1.5 text-xs leading-relaxed text-fg-3 sm:px-5">
        기록 속에서 서로의 이름이 나오면 자동으로 이어 줍니다. 항목을 고르면 어디서
        언급됐는지 볼 수 있고, 자주 나오는데 아직 항목이 없는 이름은 아래 후보에서
        바로 항목으로 만들 수 있어요.
      </p>

      {entities.length === 0 ? (
        <div className="m-4 rounded-xl border border-dashed border-line p-6 text-center text-xs leading-relaxed text-fg-3 sm:mx-5">
          아직 연결할 항목이 없습니다. 먼저 장면·장소·소품을 등록하면, 다른 기록에
          그 이름이 나올 때 자동으로 연결됩니다.
        </div>
      ) : documents.length === 0 ? (
        <div className="m-4 rounded-xl border border-dashed border-line p-6 text-center text-xs leading-relaxed text-fg-3 sm:mx-5">
          연결을 찾을 기록이 아직 없습니다. 항목 설명이나 약속·회수 원장에 내용을
          적으면 이름이 서로 이어지기 시작합니다.
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:px-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <ul className="space-y-1.5" aria-label="바이블 항목과 백링크">
            {entities.map((entity) => {
              const link = linkByEntityId.get(entity.id);
              const active = entity.id === selectedEntityId;
              return (
                <li key={entity.id}>
                  <div
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                      active ? "border-accent bg-accent/10" : "border-line bg-card hover:bg-raised"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEntityId(entity.id);
                        setSelectedDocumentId(link?.backlinks[0]?.documentId ?? null);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      aria-pressed={active}
                    >
                      <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-2">
                        {ENTITY_KIND_LABELS[entity.kind]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                        {entity.name}
                      </span>
                      <span className="shrink-0 text-[0.65rem] tabular-nums text-fg-3">
                        {link && link.mentionCount > 0
                          ? `${link.backlinks.length}개 기록 · ${link.mentionCount}곳`
                          : "언급 없음"}
                      </span>
                    </button>
                    {onSelectEntity ? (
                      <button
                        type="button"
                        onClick={() => onSelectEntity(entity.id)}
                        className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-line px-2.5 text-[0.65rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        열기
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="min-w-0 rounded-xl border border-line bg-card p-4">
            {selectedEntity ? (
              <>
                <h4 className="text-xs font-black text-fg">
                  {selectedEntity.name}
                  <span className="ml-2 text-[0.65rem] font-semibold text-fg-3">
                    {ENTITY_KIND_LABELS[selectedEntity.kind]}
                    {selectedEntity.aliases.length > 0
                      ? ` · 별칭 ${selectedEntity.aliases.join(", ")}`
                      : ""}
                  </span>
                </h4>
                {selectedLink && selectedLink.backlinks.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {selectedLink.backlinks.map((backlink) => (
                      <li key={backlink.documentId}>
                        <button
                          type="button"
                          onClick={() => setSelectedDocumentId(backlink.documentId)}
                          className={`inline-flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                            backlink.documentId === selectedDocumentId
                              ? "border-accent bg-accent/10 text-fg"
                              : "border-line text-fg-2 hover:bg-raised"
                          }`}
                        >
                          <FileText size={13} aria-hidden className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate font-semibold">{backlink.documentTitle}</span>
                          <span className="shrink-0 tabular-nums text-fg-3">{backlink.count}곳</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-lg bg-raised px-3 py-2.5 text-xs leading-relaxed text-fg-3">
                    아직 다른 기록에서 언급되지 않았어요. 회차 기획이나 약속 원장에
                    이 이름이 나오면 여기에 자동으로 모입니다.
                  </p>
                )}
                {selectedDocument ? (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-[0.65rem] font-bold text-fg-3">
                      {selectedDocument.kindLabel} · {selectedDocument.title}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-fg-2">
                      {selectedSegments.map((segment, segmentIndex) =>
                        segment.entityId ? (
                          <mark
                            key={segmentIndex}
                            className={`rounded px-0.5 ${
                              segment.entityId === selectedEntityId
                                ? "bg-accent/25 text-fg"
                                : "bg-raised text-fg"
                            }`}
                            title={entityById.get(segment.entityId)?.name ?? segment.text}
                          >
                            {segment.text}
                          </mark>
                        ) : (
                          <span key={segmentIndex}>{segment.text}</span>
                        ),
                      )}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs leading-relaxed text-fg-3">
                왼쪽에서 항목을 고르면 그 항목이 언급된 기록이 여기에 모입니다.
                등장 장면을 한 번에 확인해 설정이 어긋나지 않게 관리하세요.
              </p>
            )}
          </div>
        </div>
      )}

      {index.candidates.length > 0 ? (
        <section aria-label="미등록 이름 후보" className="px-4 pb-5 sm:px-5">
          <h4 className="inline-flex items-center gap-1.5 text-xs font-black text-fg">
            <Sparkles size={13} aria-hidden /> 자주 나오는데 아직 항목이 없는 이름
          </h4>
          <ul className="mt-2 space-y-1.5">
            {index.candidates.map((candidate) => {
              const kind = candidateKinds[candidate.term] ?? "location";
              return (
                <li
                  key={candidate.term}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2"
                >
                  <span className="text-xs font-semibold text-fg">{candidate.term}</span>
                  <span className="text-[0.65rem] tabular-nums text-fg-3">
                    {candidate.documentIds.length}개 기록에서 {candidate.count}번
                  </span>
                  {onCreateEntry ? (
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      <label className="sr-only" htmlFor={`crosslink-kind-${candidate.term}`}>
                        {candidate.term} 항목 종류
                      </label>
                      <select
                        id={`crosslink-kind-${candidate.term}`}
                        value={kind}
                        onChange={(event) =>
                          setCandidateKinds((prev) => ({
                            ...prev,
                            [candidate.term]: event.target.value as StoryBibleCreatableKind,
                          }))
                        }
                        className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {CREATABLE_KINDS.map((creatable) => (
                          <option key={creatable} value={creatable}>
                            {ENTITY_KIND_LABELS[creatable]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => onCreateEntry(candidate.term, kind)}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-accent bg-accent px-3 text-xs font-semibold text-on-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <Plus size={13} aria-hidden /> 항목 만들기
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
