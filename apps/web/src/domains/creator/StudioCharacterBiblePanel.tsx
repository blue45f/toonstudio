import {
  ArrowRight,
  BookOpenText,
  ChevronDown,
  ChevronUp,
  Lock,
  LockOpen,
  Network,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  addStudioCharacter,
  patchStudioCharacter,
  removeStudioCharacter,
  reorderStudioCharacter,
  STUDIO_CHARACTER_BIBLE_MAX_CHARACTERS,
  STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEM_LENGTH,
  STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEMS,
  STUDIO_CHARACTER_BIBLE_MAX_NAME_LENGTH,
  STUDIO_CHARACTER_BIBLE_MAX_ROLE_LENGTH,
  STUDIO_CHARACTER_BIBLE_MAX_TEXT_LENGTH,
  type StudioCharacterBible,
  type StudioCharacterBibleEntry,
  type StudioCharacterBibleEntryPatch,
  type StudioCharacterBibleField,
} from "./studio-character-bible";
import {
  buildStudioCharacterRelationshipMap,
  parseStudioCharacterRelationships,
  removeStudioCharacterRelationship,
  STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS,
  STUDIO_CHARACTER_RELATIONSHIP_KINDS,
  upsertStudioCharacterRelationship,
  type StudioCharacterRelationship,
  type StudioCharacterRelationshipInput,
  type StudioCharacterRelationshipKind,
} from "./studio-character-relationships";
import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioDeleteCharacterBibleEntryRequest } from "./studio-destructive-command-catalog";
import { frozenStatus5Text } from "./status-i18n/studio-frozen5-status-i18n";

export interface StudioCharacterBiblePanelProps {
  open: boolean;
  onClose: () => void;
  bible: StudioCharacterBible;
  onChange: (bible: StudioCharacterBible) => void;
}

type CharacterFieldKind = "short" | "long" | "list";

interface CharacterFieldMeta {
  field: StudioCharacterBibleField;
  label: string;
  placeholder: string;
  kind: CharacterFieldKind;
  maxLength: number;
}

const IDENTITY_FIELDS: readonly CharacterFieldMeta[] = [
  {
    field: "name",
    label: "이름",
    placeholder: "예: 윤서하",
    kind: "short",
    maxLength: STUDIO_CHARACTER_BIBLE_MAX_NAME_LENGTH,
  },
  {
    field: "role",
    label: "역할",
    placeholder: "예: 주인공 · 신입 퇴마사",
    kind: "short",
    maxLength: STUDIO_CHARACTER_BIBLE_MAX_ROLE_LENGTH,
  },
];

const VISUAL_FIELDS: readonly CharacterFieldMeta[] = [
  {
    field: "appearance",
    label: "외형",
    placeholder: "얼굴형, 머리, 체형, 나이대처럼 장면마다 유지할 특징",
    kind: "long",
    maxLength: STUDIO_CHARACTER_BIBLE_MAX_TEXT_LENGTH,
  },
  {
    field: "costume",
    label: "의상",
    placeholder: "기본 복장과 장면별로 바뀌면 안 되는 디테일",
    kind: "long",
    maxLength: STUDIO_CHARACTER_BIBLE_MAX_TEXT_LENGTH,
  },
  {
    field: "colors",
    label: "대표 색",
    placeholder: "검푸른 머리\n황동 단추\n주홍 스카프",
    kind: "list",
    maxLength: STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEMS * (STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEM_LENGTH + 1),
  },
  {
    field: "props",
    label: "소품",
    placeholder: "낡은 회중시계, 검은 우산",
    kind: "list",
    maxLength: STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEMS * (STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEM_LENGTH + 1),
  },
];

const STORY_FIELDS: readonly CharacterFieldMeta[] = [
  {
    field: "voice",
    label: "말투와 목소리",
    placeholder: "문장 길이, 자주 쓰는 어미, 감정을 숨기는 방식",
    kind: "long",
    maxLength: STUDIO_CHARACTER_BIBLE_MAX_TEXT_LENGTH,
  },
  {
    field: "goal",
    label: "목표와 욕망",
    placeholder: "지금 원하는 것과 끝까지 지키려는 가치",
    kind: "long",
    maxLength: STUDIO_CHARACTER_BIBLE_MAX_TEXT_LENGTH,
  },
];

const FIELD_GROUPS = [
  { title: "정체성", description: "이름과 작품 안에서 맡은 역할", fields: IDENTITY_FIELDS },
  { title: "비주얼 일관성", description: "컷이 바뀌어도 같은 인물로 보이게 하는 기준", fields: VISUAL_FIELDS },
  { title: "서사 일관성", description: "대사와 선택이 캐릭터답게 이어지는 기준", fields: STORY_FIELDS },
] as const;

const CONTROL_CLASS =
  "mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function createCharacterId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `character_${globalThis.crypto.randomUUID()}`;
  }
  return `character_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseListInput(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of value.split(/[\n,;]+/u)) {
    const item = candidate.trim().slice(0, STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEM_LENGTH);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEMS) break;
  }
  return result;
}

function entryFieldValue(entry: StudioCharacterBibleEntry, field: StudioCharacterBibleField): string {
  const value = entry[field];
  return Array.isArray(value) ? value.join("\n") : value;
}

function fieldPatch(field: StudioCharacterBibleField, value: string): StudioCharacterBibleEntryPatch {
  switch (field) {
    case "name":
      return { name: value };
    case "role":
      return { role: value };
    case "appearance":
      return { appearance: value };
    case "costume":
      return { costume: value };
    case "colors":
      return { colors: parseListInput(value) };
    case "voice":
      return { voice: value };
    case "goal":
      return { goal: value };
    case "relationships":
      return { relationships: parseListInput(value) };
    case "props":
      return { props: parseListInput(value) };
  }
}

interface CharacterFieldEditorProps {
  entry: StudioCharacterBibleEntry;
  meta: CharacterFieldMeta;
  onPatch: (patch: StudioCharacterBibleEntryPatch) => void;
}

function CharacterFieldEditor({ entry, meta, onPatch }: CharacterFieldEditorProps) {
  const locked = entry.lockedFields.includes(meta.field);
  const id = `character-bible-${entry.id}-${meta.field}`;
  const hintId = meta.kind === "list" ? `${id}-hint` : undefined;
  const sharedProps = {
    id,
    name: meta.field,
    defaultValue: entryFieldValue(entry, meta.field),
    maxLength: meta.maxLength,
    placeholder: meta.placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onPatch(fieldPatch(meta.field, event.target.value));
    },
    className: CONTROL_CLASS,
    "aria-describedby": hintId,
  };

  return (
    <div
      className={`min-w-0 border-t px-0 py-3 transition-colors sm:px-3 ${locked ? "border-accent/45 bg-accent-soft/10" : "border-line"}`}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="min-w-0 flex-1 text-xs font-semibold text-fg-2">
          {meta.label}
        </label>
        <button
          type="button"
          aria-pressed={locked}
          aria-label={`${meta.label} ${locked ? "잠금 해제" : "AI 제약으로 잠그기"}`}
          title={locked ? "AI 제약 해제" : "AI가 바꾸지 못하도록 잠그기"}
          onClick={() =>
            onPatch({
              lockedFields: locked
                ? entry.lockedFields.filter((field) => field !== meta.field)
                : [...entry.lockedFields, meta.field],
            })
          }
          className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            locked
              ? "border-accent/45 bg-accent-soft text-accent hover:bg-accent-soft/70"
              : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
          }`}
        >
          {locked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
          {locked ? "잠김" : "잠금"}
        </button>
      </div>

      {meta.kind === "short" ? (
        <input key={`${entry.id}:${meta.field}`} type="text" {...sharedProps} />
      ) : (
        <textarea
          key={`${entry.id}:${meta.field}`}
          rows={meta.kind === "list" ? 2 : 3}
          {...sharedProps}
          className={`${CONTROL_CLASS} resize-y`}
        />
      )}
      {meta.kind === "list" && (
        <p id={hintId} className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
          쉼표 또는 줄바꿈으로 구분 · 최대 {STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEMS}개
        </p>
      )}
    </div>
  );
}

const RELATIONSHIP_KIND_STROKES: Record<StudioCharacterRelationshipKind, string> = {
  conflict: "#e5484d",
  ally: "#46a758",
  family: "#f5a524",
  lover: "#e93d82",
  other: "#8e8e93",
};

const RELATIONSHIP_SELECT_CLASS =
  "min-h-9 rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none transition-colors hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface RelationshipCallbacks {
  onApply: (bible: StudioCharacterBible) => void;
  onError: (message: string) => void;
  onSelectCharacter: (characterId: string) => void;
}

function commitRelationship(
  callbacks: RelationshipCallbacks,
  apply: () => StudioCharacterBible,
) {
  try {
    callbacks.onApply(apply());
  } catch (cause) {
    callbacks.onError(cause instanceof Error ? cause.message : frozenStatus5Text("studio.frozenStatus5.bible.relationSaveFailed", "관계를 저장하지 못했어요."));
  }
}

interface RelationshipRowEditorProps extends RelationshipCallbacks {
  bible: StudioCharacterBible;
  entry: StudioCharacterBibleEntry;
  draft: StudioCharacterRelationship;
}

function RelationshipRowEditor({ bible, entry, draft, ...callbacks }: RelationshipRowEditorProps) {
  const [freeTarget, setFreeTarget] = useState(draft.targetCharacterId === null);
  const [targetName, setTargetName] = useState(draft.targetName);
  const [memo, setMemo] = useState(draft.memo);
  const others = bible.characters.filter((character) => character.id !== entry.id);

  const commit = (input: StudioCharacterRelationshipInput) =>
    commitRelationship(callbacks, () =>
      upsertStudioCharacterRelationship(bible, entry.id, input, draft.index),
    );

  return (
    <li className="rounded-xl border border-line bg-card/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="관계 대상"
          value={freeTarget ? "" : (draft.targetCharacterId ?? "")}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value;
            if (!value) {
              setFreeTarget(true);
              return;
            }
            setFreeTarget(false);
            commit({ targetName: "", targetCharacterId: value, kind: draft.kind, memo });
          }}
          className={RELATIONSHIP_SELECT_CLASS}
        >
          {others.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name || "이름 없는 캐릭터"}
            </option>
          ))}
          <option value="">직접 입력</option>
        </select>
        <select
          aria-label="관계 종류"
          value={draft.kind}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
            commit({
              targetName: freeTarget ? targetName : "",
              targetCharacterId: freeTarget ? null : draft.targetCharacterId,
              kind: event.target.value as StudioCharacterRelationshipKind,
              memo,
            })
          }
          className={RELATIONSHIP_SELECT_CLASS}
        >
          {STUDIO_CHARACTER_RELATIONSHIP_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        {draft.targetCharacterId && (
          <button
            type="button"
            onClick={() => callbacks.onSelectCharacter(draft.targetCharacterId as string)}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            시트로 이동 <ArrowRight size={12} aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-label={`관계 ${draft.index + 1} 삭제`}
          onClick={() =>
            commitRelationship(callbacks, () =>
              removeStudioCharacterRelationship(bible, entry.id, draft.index),
            )
          }
          className="ml-auto grid size-8 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:border-bad/45 hover:bg-bad/10 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
      {freeTarget && (
        <input
          type="text"
          aria-label="관계 대상 이름"
          value={targetName}
          maxLength={STUDIO_CHARACTER_BIBLE_MAX_NAME_LENGTH}
          placeholder="대상 이름 (시트가 없는 인물도 적을 수 있어요)"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTargetName(event.target.value)}
          onBlur={() =>
            commit({ targetName, targetCharacterId: null, kind: draft.kind, memo })
          }
          className={`${CONTROL_CLASS} mt-2`}
        />
      )}
      <input
        type="text"
        aria-label="관계 메모"
        value={memo}
        maxLength={STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEM_LENGTH}
        placeholder="어떤 관계인지 — 예: 불신하지만 의지하는 동료"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMemo(event.target.value)}
        onBlur={() =>
          commit({
            targetName: freeTarget ? targetName : "",
            targetCharacterId: freeTarget ? null : draft.targetCharacterId,
            kind: draft.kind,
            memo,
          })
        }
        className={`${CONTROL_CLASS} mt-2`}
      />
    </li>
  );
}

interface AddRelationshipFormProps extends RelationshipCallbacks {
  bible: StudioCharacterBible;
  entry: StudioCharacterBibleEntry;
}

function AddRelationshipForm({ bible, entry, ...callbacks }: AddRelationshipFormProps) {
  const [targetId, setTargetId] = useState("");
  const [targetName, setTargetName] = useState("");
  const [kind, setKind] = useState<StudioCharacterRelationshipKind>("other");
  const [memo, setMemo] = useState("");
  const others = bible.characters.filter((character) => character.id !== entry.id);

  const add = () => {
    commitRelationship(callbacks, () =>
      upsertStudioCharacterRelationship(bible, entry.id, {
        targetName,
        targetCharacterId: targetId || null,
        kind,
        memo,
      }),
    );
    setTargetName("");
    setMemo("");
  };

  return (
    <div className="rounded-xl border border-dashed border-line px-3 py-2.5">
      <p className="text-[0.68rem] font-semibold text-fg-2">관계 추가</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="새 관계 대상"
          value={targetId}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setTargetId(event.target.value)}
          className={RELATIONSHIP_SELECT_CLASS}
        >
          <option value="">직접 입력</option>
          {others.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name || "이름 없는 캐릭터"}
            </option>
          ))}
        </select>
        <select
          aria-label="새 관계 종류"
          value={kind}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setKind(event.target.value as StudioCharacterRelationshipKind)}
          className={RELATIONSHIP_SELECT_CLASS}
        >
          {STUDIO_CHARACTER_RELATIONSHIP_KINDS.map((kindOption) => (
            <option key={kindOption} value={kindOption}>
              {STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS[kindOption]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus size={13} aria-hidden /> 추가
        </button>
      </div>
      {!targetId && (
        <input
          type="text"
          aria-label="새 관계 대상 이름"
          value={targetName}
          maxLength={STUDIO_CHARACTER_BIBLE_MAX_NAME_LENGTH}
          placeholder="대상 이름"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTargetName(event.target.value)}
          className={`${CONTROL_CLASS} mt-2`}
        />
      )}
      <input
        type="text"
        aria-label="새 관계 메모"
        value={memo}
        maxLength={STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEM_LENGTH}
        placeholder="메모 — 예: 실종된 형"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMemo(event.target.value)}
        className={`${CONTROL_CLASS} mt-2`}
      />
    </div>
  );
}

interface RelationshipMapViewProps extends RelationshipCallbacks {
  bible: StudioCharacterBible;
  selectedCharacterId: string;
}

function RelationshipMapView({ bible, selectedCharacterId, ...callbacks }: RelationshipMapViewProps) {
  const map = buildStudioCharacterRelationshipMap(bible);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const selectedEdge = map.edges.find((edge) => edge.key === selectedEdgeKey) ?? null;
  const nodeForCharacter = (characterId: string) =>
    map.nodes.find((node) => node.characterId === characterId);
  const nodeForGhost = (name: string) =>
    map.nodes.find((node) => node.characterId === null && node.name === name);
  const ownerName = (characterId: string) =>
    bible.characters.find((character) => character.id === characterId)?.name || "이름 없는 캐릭터";

  if (map.edges.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs leading-relaxed text-fg-3">
        {frozenStatus5Text("studio.frozenStatus5.bible.mapEmpty", "관계를 추가하면 이곳에 관계 맵이 그려집니다.")}
      </p>
    );
  }

  return (
    <div>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="캐릭터 관계 맵"
        className="mx-auto aspect-square w-full max-w-md"
      >
        {map.edges.map((edge) => {
          const from = nodeForCharacter(edge.ownerCharacterId);
          const to = edge.targetCharacterId
            ? nodeForCharacter(edge.targetCharacterId)
            : nodeForGhost(edge.targetName);
          if (!from || !to) return null;
          const selected = edge.key === selectedEdgeKey;
          return (
            <line
              key={edge.key}
              x1={from.x * 100}
              y1={from.y * 100}
              x2={to.x * 100}
              y2={to.y * 100}
              stroke={RELATIONSHIP_KIND_STROKES[edge.kind]}
              strokeWidth={selected ? 1.4 : 0.6}
              strokeOpacity={selected ? 1 : 0.55}
              strokeDasharray={edge.bidirectional ? undefined : "2 1.6"}
              className="cursor-pointer"
              onClick={() => setSelectedEdgeKey(edge.key)}
            >
              <title>{`${ownerName(edge.ownerCharacterId)} → ${edge.targetName} (${STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS[edge.kind]})${edge.memo ? ` — ${edge.memo}` : ""}`}</title>
            </line>
          );
        })}
        {map.nodes.map((node) => {
          const isCharacter = node.characterId !== null;
          const selected = node.characterId === selectedCharacterId;
          return (
            <g
              key={node.key}
              transform={`translate(${node.x * 100} ${node.y * 100})`}
              className={isCharacter ? "cursor-pointer" : undefined}
              onClick={() => {
                if (node.characterId) callbacks.onSelectCharacter(node.characterId);
              }}
            >
              <circle
                r={5}
                fill={selected ? "#7c6cf0" : isCharacter ? "#4a4a52" : "transparent"}
                stroke={isCharacter ? "#a49af5" : "#8e8e93"}
                strokeWidth={0.5}
                strokeDasharray={isCharacter ? undefined : "1.4 1.2"}
              />
              <text
                textAnchor="middle"
                dy={9.5}
                fontSize={3.4}
                fill="currentColor"
                className="fill-fg-2"
              >
                {node.name.length > 7 ? `${node.name.slice(0, 7)}…` : node.name}
              </text>
              {!isCharacter && (
                <title>{`${node.name} — 아직 캐릭터 시트가 없어요`}</title>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="관계 종류 범례">
        {STUDIO_CHARACTER_RELATIONSHIP_KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1 text-[0.65rem] text-fg-3">
            <span
              aria-hidden
              className="inline-block h-0.5 w-4 rounded-full"
              style={{ backgroundColor: RELATIONSHIP_KIND_STROKES[kind] }}
            />
            {STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS[kind]}
          </span>
        ))}
        <span className="text-[0.65rem] text-fg-3">실선 = 서로 등록한 관계 · 점선 = 한쪽만 등록</span>
      </div>

      {selectedEdge && (
        <div className="mt-3 rounded-xl border border-accent/35 bg-accent-soft/10 px-3 py-2.5">
          <p className="text-xs font-semibold text-fg">
            {ownerName(selectedEdge.ownerCharacterId)} → {selectedEdge.targetName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label="맵에서 관계 종류 바꾸기"
              value={selectedEdge.kind}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                commitRelationship(callbacks, () =>
                  upsertStudioCharacterRelationship(
                    bible,
                    selectedEdge.ownerCharacterId,
                    {
                      targetName: selectedEdge.targetName,
                      targetCharacterId: selectedEdge.targetCharacterId,
                      kind: event.target.value as StudioCharacterRelationshipKind,
                      memo: selectedEdge.memo,
                    },
                    selectedEdge.index,
                  ),
                )
              }
              className={RELATIONSHIP_SELECT_CLASS}
            >
              {STUDIO_CHARACTER_RELATIONSHIP_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            {selectedEdge.targetCharacterId && (
              <button
                type="button"
                onClick={() =>
                  callbacks.onSelectCharacter(selectedEdge.targetCharacterId as string)
                }
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                대상 시트로 이동 <ArrowRight size={12} aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                commitRelationship(callbacks, () =>
                  removeStudioCharacterRelationship(
                    bible,
                    selectedEdge.ownerCharacterId,
                    selectedEdge.index,
                  ),
                );
                setSelectedEdgeKey(null);
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.68rem] font-semibold text-fg-3 transition-colors hover:border-bad/45 hover:bg-bad/10 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad"
            >
              <Trash2 size={12} aria-hidden /> 관계 삭제
            </button>
            <button
              type="button"
              onClick={() => setSelectedEdgeKey(null)}
              className="inline-flex min-h-8 items-center rounded-lg px-2 text-[0.68rem] font-semibold text-fg-3 transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              닫기
            </button>
          </div>
          {selectedEdge.memo && (
            <p className="mt-1.5 text-[0.68rem] leading-relaxed text-fg-3">{selectedEdge.memo}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface CharacterRelationshipsSectionProps extends RelationshipCallbacks {
  bible: StudioCharacterBible;
  entry: StudioCharacterBibleEntry;
  onPatch: (patch: StudioCharacterBibleEntryPatch) => void;
}

function CharacterRelationshipsSection({
  bible,
  entry,
  onPatch,
  ...callbacks
}: CharacterRelationshipsSectionProps) {
  const locked = entry.lockedFields.includes("relationships");
  const drafts = parseStudioCharacterRelationships(bible, entry.id);

  return (
    <section className="mt-5" aria-labelledby="character-bible-relationships">
      <div className="mb-1 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h4 id="character-bible-relationships" className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Network size={14} aria-hidden className="text-accent" /> 관계 · 관계 맵
          </h4>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
            자유 텍스트로 적어 둔 관계도 대상·종류·메모로 나눠 보여줍니다. 맵이나 목록에서 바꾸면 이 시트에 바로 저장돼요.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={locked}
          aria-label={`관계 ${locked ? "잠금 해제" : "AI 제약으로 잠그기"}`}
          title={locked ? "AI 제약 해제" : "AI가 바꾸지 못하도록 잠그기"}
          onClick={() =>
            onPatch({
              lockedFields: locked
                ? entry.lockedFields.filter((field) => field !== "relationships")
                : [...entry.lockedFields, "relationships"],
            })
          }
          className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            locked
              ? "border-accent/45 bg-accent-soft text-accent hover:bg-accent-soft/70"
              : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
          }`}
        >
          {locked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
          {locked ? "잠김" : "잠금"}
        </button>
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-3 text-xs leading-relaxed text-fg-3">
          {frozenStatus5Text("studio.frozenStatus5.bible.relationsEmpty", "아직 등록된 관계가 없어요. 아래에서 첫 관계를 추가하세요.")}
        </p>
      ) : (
        <ol className="space-y-2" aria-label="구조화된 관계 목록">
          {drafts.map((draft) => (
            <RelationshipRowEditor
              key={`${entry.id}:${draft.index}:${draft.raw}`}
              bible={bible}
              entry={entry}
              draft={draft}
              {...callbacks}
            />
          ))}
        </ol>
      )}

      <div className="mt-2">
        <AddRelationshipForm bible={bible} entry={entry} {...callbacks} />
      </div>

      <div className="mt-4">
        <RelationshipMapView bible={bible} selectedCharacterId={entry.id} {...callbacks} />
      </div>
    </section>
  );
}

export function StudioCharacterBiblePanel({
  open,
  onClose,
  bible,
  onChange,
}: StudioCharacterBiblePanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [requestedCharacterId, setRequestedCharacterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const selectedCharacter =
    bible.characters.find((character) => character.id === requestedCharacterId) ?? bible.characters[0] ?? null;
  const selectedIndex = selectedCharacter
    ? bible.characters.findIndex((character) => character.id === selectedCharacter.id)
    : -1;
  const lockedCount = selectedCharacter?.lockedFields.length ?? 0;

  const applyChange = (nextBible: StudioCharacterBible) => {
    try {
      onChange(nextBible);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : frozenStatus5Text("studio.frozenStatus5.bible.saveFailed", "캐릭터 바이블을 저장하지 못했어요."));
    }
  };

  const addCharacter = () => {
    const id = createCharacterId();
    try {
      const nextBible = addStudioCharacter(bible, {
        id,
        name: `캐릭터 ${bible.characters.length + 1}`,
      });
      setRequestedCharacterId(id);
      applyChange(nextBible);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : frozenStatus5Text("studio.frozenStatus5.bible.addFailed", "캐릭터를 추가하지 못했어요."));
    }
  };

  const patchCharacter = (patch: StudioCharacterBibleEntryPatch) => {
    if (!selectedCharacter) return;
    applyChange(patchStudioCharacter(bible, selectedCharacter.id, patch));
  };

  const moveCharacter = (toIndex: number) => {
    if (!selectedCharacter) return;
    applyChange(reorderStudioCharacter(bible, selectedCharacter.id, toIndex));
  };

  const deleteCharacter = () => {
    if (!selectedCharacter) return;
    const label = selectedCharacter.name.trim() || "이 캐릭터";
    void (async () => {
      if (
        !(await confirmStudioDestructiveAction(
          studioDeleteCharacterBibleEntryRequest(label),
        ))
      ) return;
      const nextSelection =
        bible.characters[selectedIndex + 1] ?? bible.characters[selectedIndex - 1] ?? null;
      setRequestedCharacterId(nextSelection?.id ?? null);
      applyChange(removeStudioCharacter(bible, selectedCharacter.id));
    })();
  };

  const modal = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-character-bible-title"
      tabIndex={-1}
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm focus:outline-none sm:p-4"
    >
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <BookOpenText size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="studio-character-bible-title" className="text-base font-bold tracking-tight text-fg">
              캐릭터 바이블
            </h2>
            <p className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-fg-3">
              외형·말투·관계를 한곳에 정리해 컷과 장면 사이의 캐릭터 일관성을 지킵니다.
            </p>
          </div>
          <span className="hidden rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] tabular-nums text-fg-3 sm:inline-flex">
            {bible.characters.length}/{STUDIO_CHARACTER_BIBLE_MAX_CHARACTERS}명
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="캐릭터 바이블 닫기"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={15} aria-hidden />
          </button>
        </header>

        {error && (
          <p role="alert" className="shrink-0 border-b border-bad/35 bg-bad/10 px-4 py-2 text-xs leading-relaxed text-bad sm:px-5">
            {error}
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="flex max-h-48 shrink-0 flex-col border-b border-line bg-card/35 md:max-h-none md:min-h-0 md:border-b-0 md:border-r">
            <div className="flex shrink-0 items-center gap-2 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-fg-2">등장인물</p>
                <p className="mt-0.5 text-[0.65rem] tabular-nums text-fg-3">
                  {bible.characters.length}명 · 선택해 편집
                </p>
              </div>
              <button
                type="button"
                onClick={addCharacter}
                disabled={bible.characters.length >= STUDIO_CHARACTER_BIBLE_MAX_CHARACTERS}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus size={14} aria-hidden /> 추가
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {bible.characters.length === 0 ? (
                <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-line px-3 text-center">
                  <div>
                    <UserRound size={20} className="mx-auto text-fg-3" aria-hidden />
                    <p className="mt-1.5 text-xs font-semibold text-fg-2">{frozenStatus5Text("studio.frozenStatus5.bible.charactersEmpty", "등장인물을 먼저 추가하세요")}</p>
                  </div>
                </div>
              ) : (
                <ol className="space-y-1" aria-label="캐릭터 목록">
                  {bible.characters.map((character, index) => {
                    const selected = character.id === selectedCharacter?.id;
                    return (
                      <li key={character.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setRequestedCharacterId(character.id);
                            setError(null);
                          }}
                          aria-current={selected ? "true" : undefined}
                          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                            selected
                              ? "border-accent/45 bg-accent-soft/20"
                              : "border-transparent text-fg-2 hover:border-line hover:bg-raised"
                          }`}
                        >
                          <span
                            className={`grid size-7 shrink-0 place-items-center rounded-lg text-[0.65rem] font-bold tabular-nums ${
                              selected ? "bg-accent text-on-accent" : "bg-raised text-fg-3"
                            }`}
                            aria-hidden
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-fg">
                              {character.name || "이름 없는 캐릭터"}
                            </span>
                            <span className="mt-0.5 block truncate text-[0.65rem] text-fg-3">
                              {character.role || "역할 미정"}
                            </span>
                          </span>
                          {character.lockedFields.length > 0 && (
                            <span
                              className="inline-flex shrink-0 items-center gap-0.5 text-[0.6rem] tabular-nums text-accent"
                              aria-label={`${character.lockedFields.length}개 필드 잠김`}
                            >
                              <Lock size={10} aria-hidden /> {character.lockedFields.length}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto">
            {!selectedCharacter ? (
              <div className="grid min-h-full place-items-center px-5 py-12 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-line bg-card text-fg-3">
                    <BookOpenText size={22} aria-hidden />
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-fg">처음 등장하는 순간부터 설정을 고정하세요</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-3">
                    인물을 추가한 뒤 외형·말투·관계를 기록하세요. AI 생성 전 잠근 항목은 변경 금지 조건으로 사용됩니다.
                  </p>
                  <button
                    type="button"
                    onClick={addCharacter}
                    className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Plus size={14} aria-hidden /> 첫 캐릭터 만들기
                  </button>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-wrap items-start gap-3 border-b border-line pb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold text-fg">
                        {selectedCharacter.name || "이름 없는 캐릭터"}
                      </h3>
                      <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.65rem] tabular-nums text-fg-3">
                        잠금 {lockedCount}/9
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-fg-3">
                      변경 내용을 입력하는 즉시 현재 문서에 반영합니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveCharacter(selectedIndex - 1)}
                      disabled={selectedIndex <= 0}
                      aria-label={`${selectedCharacter.name || "캐릭터"} 위로 이동`}
                      className="grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronUp size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCharacter(selectedIndex + 1)}
                      disabled={selectedIndex < 0 || selectedIndex >= bible.characters.length - 1}
                      aria-label={`${selectedCharacter.name || "캐릭터"} 아래로 이동`}
                      className="grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronDown size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={deleteCharacter}
                      aria-label={`${selectedCharacter.name || "캐릭터"} 삭제`}
                      className="grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:border-bad/45 hover:bg-bad/10 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </div>

                <p className="my-4 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft/10 px-3 py-2.5 text-xs leading-relaxed text-fg-2">
                  <Lock size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                  <span>
                    <strong className="font-semibold text-fg">잠근 항목은 AI 제약으로 전달됩니다.</strong>{" "}
                    캐릭터 설정이 확정된 항목만 잠그면 시나리오와 이미지 생성에서 임의 변경을 줄일 수 있어요.
                  </span>
                </p>

                <div key={selectedCharacter.id}>
                  {FIELD_GROUPS.map((group) => (
                    <section key={group.title} className="mt-5 first:mt-0" aria-labelledby={`character-bible-${group.title}`}>
                      <div className="mb-1">
                        <h4 id={`character-bible-${group.title}`} className="text-sm font-bold text-fg">
                          {group.title}
                        </h4>
                        <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">{group.description}</p>
                      </div>
                      <div className="grid sm:grid-cols-2 sm:gap-x-4">
                        {group.fields.map((meta) => (
                          <CharacterFieldEditor
                            key={meta.field}
                            entry={selectedCharacter}
                            meta={meta}
                            onPatch={patchCharacter}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                  <CharacterRelationshipsSection
                    bible={bible}
                    entry={selectedCharacter}
                    onPatch={patchCharacter}
                    onApply={applyChange}
                    onError={(message) => setError(message)}
                    onSelectCharacter={(characterId) => {
                      setRequestedCharacterId(characterId);
                      setError(null);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2 text-[0.65rem] leading-relaxed text-fg-3 sm:px-5">
          <span>바이블은 현재 작품 문서와 함께 저장됩니다.</span>
          <span className="hidden sm:inline">Esc로 닫기</span>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
