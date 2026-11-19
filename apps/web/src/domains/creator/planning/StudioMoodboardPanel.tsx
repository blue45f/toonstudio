/**
 * 기획 무드보드 표면 — 열·카드 보드.
 *
 * - 데이터는 props(board)로 받고, 모든 변경은 모델 연산으로 만든 새 보드를
 *   onBoardChange 로 올린다 (저장·영속은 컨테이너/호스트 몫).
 * - onBoardChange 가 없으면 읽기 전용: 폼·이동·삭제 버튼을 그리지 않는다.
 * - 카드 이동은 드래그 없이 버튼(위로/아래로/옆 열로)으로 한다 — 키보드만으로
 *   배치할 수 있어야 한다는 사용성 원칙. 드래그는 후속 강화 몫.
 * - 이미지 카드는 카탈로그로 해석된 주소만 그리고, 깨진 참조는 사유를
 *   텍스트로 보여준다 (빈 칸으로 숨기지 않는다).
 */
import { useId, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from "react";
import { SketchPad, StrokePaths } from "@/shared/components/sketch-pad/SketchPad";
import { PAPER, type Stroke } from "@/shared/components/sketch-pad/sketch-strokes";
import { StudioToolArtwork, type StudioArtworkTool } from "../studio-tool-art/StudioToolArtwork";
import { StudioMoodboardCharacterTransfer } from "./StudioMoodboardCharacterTransfer";
import { StudioMoodboardConnections } from "./StudioMoodboardConnections";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import {
  addMoodboardCard,
  moodboardSummary,
  moodboardCardAnchor,
  moveMoodboardCard,
  removeMoodboardCard,
  resolveMoodboardCardImage,
  isMoodboardWebUrl,
  toggleMoodboardTodo,
  type Moodboard,
  type MoodboardAssetCatalogEntry,
  type MoodboardCard,
  type MoodboardCardKind,
} from "./studio-moodboard";
import {
  collectPastedTextIntoBoard,
  deriveCharacterProfileDraftFromMoodboard,
  deriveEpisodePlanDraftFromMoodboard,
  moodboardCardLabel,
  type MoodboardPlanningHandoff,
} from "./studio-moodboard-web-collect";

export interface StudioMoodboardPanelProps {
  readonly board: Moodboard;
  readonly tools?: ReactNode;
  readonly scriptProjectId?: string;
  readonly profileProjectId?: string;
  readonly onBoardChange?: (board: Moodboard) => void;
  /** 이미지 카드 ref 해석용 개인/프로젝트 에셋 카탈로그. 없으면 URL 참조만 해석된다. */
  readonly imageCatalog?: readonly MoodboardAssetCatalogEntry[];
  /** 테스트·스토리용 결정적 카드 id 생성기. 기본은 시각+순번. */
  readonly createCardId?: () => string;
  /** 기획 인계 콜백. 없으면 카드 고르기·인계 바를 그리지 않는다. */
  readonly onPlanningHandoff?: (handoff: MoodboardPlanningHandoff) => void;
  /** 회차 플랜 인계 대상 회차. 초안에 episodeId로 함께 남는다. */
  readonly planningEpisodeId?: string;
  /** 캐릭터 시트 인계 대상 캐릭터. 없으면 캐릭터 인계 버튼을 숨긴다. */
  readonly planningCharacterId?: string;
}

const KIND_LABELS: Readonly<Record<MoodboardCardKind, string>> = {
  sketch: "스케치",
  image: "이미지",
  note: "메모",
  link: "링크",
  todo: "할 일",
};

const CARD_ART: Record<MoodboardCardKind, StudioArtworkTool> = {
  sketch: "drawingDesk", image: "references", note: "text", link: "share", todo: "projects",
};

const KIND_PLACEHOLDERS: Readonly<Record<MoodboardCardKind, string>> = {
  sketch: "예: 복도 조명 구도",
  image: "에셋 이름이나 이미지 주소",
  note: "떠오른 생각을 한 줄로",
  link: "https:// 로 시작하는 주소",
  todo: "해야 할 일을 한 줄로",
};

interface CardDraft {
  readonly kind: MoodboardCardKind;
  readonly value: string;
}

const EMPTY_DRAFT: CardDraft = { kind: "note", value: "" };

export function StudioMoodboardPanel({
  board,
  tools,
  onBoardChange,
  scriptProjectId,
  profileProjectId,
  imageCatalog,
  createCardId,
  onPlanningHandoff,
  planningEpisodeId,
  planningCharacterId,
}: StudioMoodboardPanelProps) {
  const boardId = useId();
  const ideaBoard = r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.boardName", "아이디어 보드");
  const summary = moodboardSummary(board);
  const editable = onBoardChange !== undefined;
  const collectCounterRef = useRef(0);
  const [collectMessage, setCollectMessage] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<readonly string[]>([]);
  const [hasProfileTargets, setHasProfileTargets] = useState(false);
  const [handoffMessage, setHandoffMessage] = useState("");
  const firstColumnId = board.columns[0]?.id;

  const nextCollectId = () => {
    if (createCardId) return createCardId();
    collectCounterRef.current += 1;
    return `mood-collect-${Date.now()}-${collectCounterRef.current}`;
  };

  /** 붙여넣기 1동작 수집: 버튼을 누를 필요 없이 paste만으로 카드가 생긴다. */
  const handleCollectPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onBoardChange || !firstColumnId) return;
    const text = event.clipboardData.getData("text");
    if (!text.trim()) return;
    const result = collectPastedTextIntoBoard(board, firstColumnId, text, nextCollectId);
    if (result.foundUrlCount === 0) return; // URL이 아닌 붙여넣기는 기본 동작에 맡긴다.
    event.preventDefault();
    if (result.addedCardIds.length > 0) {
      onBoardChange(result.board);
      setCollectMessage(
        `웹에서 카드 ${result.addedCardIds.length}장을 첫 열에 모았어요.${result.skippedUrls.length > 0 ? ` 이미 있는 주소 ${result.skippedUrls.length}개는 건너뛰었어요.` : ""}`,
      );
    } else {
      setCollectMessage("이미 보드에 있는 주소예요. 새 카드가 생기지 않았어요.");
    }
  };

  const toggleSelected = (cardId: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    );
  };

  const sendEpisodeHandoff = () => {
    if (!onPlanningHandoff || selectedCardIds.length === 0) return;
    const draft = deriveEpisodePlanDraftFromMoodboard(board, selectedCardIds, planningEpisodeId);
    onPlanningHandoff({ target: "episode-plan", draft });
    setHandoffMessage(`선택한 카드 ${draft.sourceCardIds.length}장을 회차 플랜 초안으로 넘겼어요. 출처 카드는 보드에 그대로 남아요.`);
  };

  const sendCharacterHandoff = () => {
    if (!onPlanningHandoff || !planningCharacterId || selectedCardIds.length === 0) return;
    const draft = deriveCharacterProfileDraftFromMoodboard(board, selectedCardIds, planningCharacterId);
    onPlanningHandoff({ target: "character-sheet", draft });
    setHandoffMessage(`선택한 카드 ${draft.sourceCardIds.length}장을 캐릭터 시트 초안으로 넘겼어요. 출처 카드는 보드에 그대로 남아요.`);
  };

  return (
    <section aria-label={ideaBoard}>
      <header className="studio-moodboard-heading">
        <StudioToolArtwork tool="storyboard" />
        <div><h2>{board.title === "기획 무드보드" || board.title === "아이디어 보드" ? ideaBoard : board.title}</h2>
          <p>카드 {summary.total}장{summary.byKind.todo > 0 ? ` · 남은 할 일 ${summary.todosOpen}개` : ""}</p>
        </div>
      </header>
      {tools}
      {board.columns.length > 1 && <nav className="studio-moodboard-jump" aria-label={r3c04StatusText("studio.r3c04Status.planning.projectMoodboard.columnJump", "보드 열 바로가기")}>
        {board.columns.map((column, index) => <button type="button" key={column.id}
          aria-controls={boardId + "-column-" + index} onClick={() => {
            const heading = document.getElementById(boardId + "-column-" + index);
            heading?.focus({ preventScroll: true });
            heading?.scrollIntoView({ block: "start" });
          }}>{column.title}</button>)}
      </nav>}
      {editable && firstColumnId && (
        <div>
          <label>
            웹에서 가져오기 — 링크나 이미지 주소를 붙여넣으면 바로 카드가 돼요
            <textarea
              rows={2}
              placeholder="https:// 로 시작하는 주소를 여기에 붙여넣으세요"
              onPaste={handleCollectPaste}
            />
          </label>
          {collectMessage && <p aria-live="polite">{collectMessage}</p>}
        </div>
      )}
      <div className="studio-moodboard-columns">
        {board.columns.map((column, columnIndex) => (
          <section key={column.id} aria-label={`${column.title} 열`}>
            <h3 id={boardId + "-column-" + columnIndex} tabIndex={-1}>
              {column.title} <span>{column.cardIds.length}장</span>
            </h3>
            <ul>
              {column.cardIds.map((cardId, cardIndex) => {
                const card = board.cards[cardId];
                if (!card) return null;
                return (
                  <li key={card.id} id={moodboardCardAnchor(card.id)} tabIndex={-1} data-moodboard-kind={card.kind}>
                    <span className="studio-moodboard-card-kind"><StudioToolArtwork tool={CARD_ART[card.kind]} />{KIND_LABELS[card.kind]}</span>
                    {editingCardId === card.id && onBoardChange ? (
                      <EditCardForm card={card} onCancel={() => setEditingCardId(null)} onSave={updated => {
                        onBoardChange({ ...board, cards: { ...board.cards, [card.id]: updated } });
                        setEditingCardId(null);
                      }} />
                    ) : <MoodboardCardView card={card} imageCatalog={imageCatalog} />}
                    {(onPlanningHandoff || (profileProjectId && editable && hasProfileTargets && card.kind !== "sketch")) && (
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`${moodboardCardLabel(card)} · 기획으로 보낼 카드로 고르기`}
                          checked={selectedCardIds.includes(card.id)}
                          onChange={() => toggleSelected(card.id)}
                        />
                        기획으로 보낼 카드로 고르기
                      </label>
                    )}
                    {editable && (
                      <div>
                        {editingCardId !== card.id && <button type="button" onClick={() => setEditingCardId(card.id)}>카드 수정</button>}
                        {card.kind === "todo" && (
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(card.done)}
                              onChange={() => onBoardChange(toggleMoodboardTodo(board, card.id))}
                            />
                            완료
                          </label>
                        )}
                        <details className="studio-moodboard-card-organize">
                          <summary>이동·삭제</summary>
                          <div>
                            <button
                              type="button"
                              disabled={cardIndex === 0}
                              onClick={() =>
                                onBoardChange(moveMoodboardCard(board, card.id, column.id, cardIndex - 1))
                              }
                            >
                              위로
                            </button>
                            <button
                              type="button"
                              disabled={cardIndex === column.cardIds.length - 1}
                              onClick={() =>
                                onBoardChange(moveMoodboardCard(board, card.id, column.id, cardIndex + 1))
                              }
                            >
                              아래로
                            </button>
                            <button
                              type="button"
                              disabled={columnIndex === 0}
                              onClick={() =>
                                onBoardChange(
                                  moveMoodboardCard(
                                    board,
                                    card.id,
                                    board.columns[columnIndex - 1]!.id,
                                    board.columns[columnIndex - 1]!.cardIds.length,
                                  ),
                                )
                              }
                            >
                              왼쪽 열로
                            </button>
                            <button
                              type="button"
                              disabled={columnIndex === board.columns.length - 1}
                              onClick={() =>
                                onBoardChange(
                                  moveMoodboardCard(
                                    board,
                                    card.id,
                                    board.columns[columnIndex + 1]!.id,
                                    board.columns[columnIndex + 1]!.cardIds.length,
                                  ),
                                )
                              }
                            >
                              오른쪽 열로
                            </button>
                            <button
                              type="button"
                              onClick={() => onBoardChange(removeMoodboardCard(board, card.id))}
                            >
                              삭제
                            </button>
                          </div>
                        </details>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {board.columns.length > 0 && column.cardIds.length === 0 && (
              <p>{r3c04StatusText("studio.r3c04Status.planning.moodboard.emptyCards", "아직 카드가 없어요. 아래에서 첫 카드를 더해 보세요.")}</p>
            )}
            {editable && (
              <AddCardForm
                columnId={column.id}
                board={board}
                onBoardChange={onBoardChange}
                createCardId={createCardId}
              />
            )}
          </section>
        ))}
      </div>
      <StudioMoodboardConnections board={board} onChange={onBoardChange} scriptProjectId={scriptProjectId} />
      {profileProjectId && editable && <StudioMoodboardCharacterTransfer projectId={profileProjectId} board={board} cardIds={selectedCardIds} onAvailability={setHasProfileTargets} />}
      {onPlanningHandoff && (
        <div>
          <p>고른 카드 {selectedCardIds.length}장으로 기획 초안을 만들어요. 카드는 보드에서 사라지지 않아요.</p>
          <button type="button" disabled={selectedCardIds.length === 0} onClick={sendEpisodeHandoff}>
            회차 플랜(줄거리·목표) 초안으로 넘기기
          </button>
          {planningCharacterId && (
            <button type="button" disabled={selectedCardIds.length === 0} onClick={sendCharacterHandoff}>
              캐릭터 시트 초안으로 넘기기
            </button>
          )}
          {handoffMessage && <p aria-live="polite">{handoffMessage}</p>}
        </div>
      )}
    </section>
  );
}

function MoodboardCardView({
  card,
  imageCatalog,
}: {
  readonly card: MoodboardCard;
  readonly imageCatalog?: readonly MoodboardAssetCatalogEntry[];
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  if (card.kind === "sketch") return <figure className="studio-moodboard-sketch-preview">
    <svg viewBox="0 0 960 600" role="img" aria-label={`${card.text || "스케치"} · ${card.strokes?.length ?? 0}획`}>
      <rect width="960" height="600" fill={PAPER} /><StrokePaths strokes={card.strokes ?? []} />
    </svg><figcaption>{card.text || "스케치"}</figcaption>
  </figure>;
  if (card.kind === "image") {
    const resolution = resolveMoodboardCardImage(card, imageCatalog ?? []);
    if (resolution.status === "resolved") {
      return (
        <figure>
          {failedImage === resolution.imageUrl
            ? <p role="note">이미지를 표시할 수 없어요. 카드 수정에서 주소를 확인해 주세요.</p>
            : <img src={resolution.imageUrl} alt={resolution.label} onError={() => setFailedImage(resolution.imageUrl)} />}
          <figcaption>
            {resolution.label}
            {resolution.scope === "project"
              ? " · 프로젝트 에셋"
              : resolution.scope === "personal"
                ? " · 개인 에셋"
                : " · 외부 이미지"}
          </figcaption>
        </figure>
      );
    }
    return (
      <p role="note">
        이미지를 불러올 수 없어요. {resolution.status === "broken" ? resolution.reason : ""}
        {card.ref ? ` (참조: ${card.ref})` : ""}
      </p>
    );
  }
  if (card.kind === "link") {
    return (
      <p>
        <a href={card.ref} target="_blank" rel="noreferrer">
          {card.text?.trim() || card.ref}
        </a>
      </p>
    );
  }
  if (card.kind === "todo") {
    return <p>{card.done ? <s>{card.text}</s> : card.text}</p>;
  }
  return <p>{card.text}</p>;
}

function EditCardForm({ card, onCancel, onSave }: {
  readonly card: MoodboardCard;
  readonly onCancel: () => void;
  readonly onSave: (card: MoodboardCard) => void;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>(card.strokes ?? []);
  const reference = card.kind === "image" || card.kind === "link";
  const [value, setValue] = useState((reference ? card.ref : card.text) ?? "");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = value.trim();
    if (!next) { setError("카드 내용을 입력해 주세요."); return; }
    if (card.kind === "link" && !isMoodboardWebUrl(next)) { setError("http 또는 https 주소를 입력해 주세요."); return; }
    if (card.kind === "sketch" && !strokes.length) { setError("스케치에 선을 그려 주세요."); return; }
    onSave(reference ? { ...card, ref: next } : { ...card, text: next, ...(card.kind === "sketch" && { strokes }) });
  };
  return <form aria-label="카드 수정" onSubmit={submit}>
    <label>카드 내용<input value={value} onChange={event => setValue(event.target.value)} /></label>
    {card.kind === "sketch" && <SketchPad label="카드 스케치 수정" strokes={strokes} onChange={setStrokes} />}
    <button type="submit">수정 저장</button> <button type="button" onClick={onCancel}>취소</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

function AddCardForm({
  columnId,
  board,
  onBoardChange,
  createCardId,
}: {
  readonly columnId: string;
  readonly board: Moodboard;
  readonly onBoardChange: (board: Moodboard) => void;
  readonly createCardId?: () => string;
}) {
  const [draft, setDraft] = useState<CardDraft>(EMPTY_DRAFT);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [error, setError] = useState("");
  const counterRef = useRef(0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.value.trim() || (draft.kind === "sketch" ? "스케치" : "");
    if (draft.kind === "sketch" && !strokes.length) { setError("스케치에 선을 그려 주세요."); return; }
    if (!value) {
      setError(r3c04StatusText("studio.r3c04Status.planning.moodboard.cardContentRequired", "카드 내용을 입력해 주세요."));
      return;
    }
    if (draft.kind === "link" && !isMoodboardWebUrl(value)) {
      setError("http 또는 https 주소를 입력해 주세요.");
      return;
    }
    counterRef.current += 1;
    const id = createCardId
      ? createCardId()
      : `mood-card-${Date.now()}-${counterRef.current}`;
    const card: MoodboardCard =
      draft.kind === "image" || draft.kind === "link"
        ? { id, kind: draft.kind, ref: value }
        : draft.kind === "todo"
          ? { id, kind: "todo", text: value, done: false }
          : { id, kind: draft.kind, text: value, ...(draft.kind === "sketch" && { strokes }) };
    const next = addMoodboardCard(board, columnId, card);
    if (next === board) {
      setError(r3c04StatusText("studio.r3c04Status.planning.moodboard.cardAddFailed", "카드를 더할 수 없어요. 카드가 너무 많거나 이미 있는 카드예요."));
      return;
    }
    setError("");
    setDraft(EMPTY_DRAFT);
    setStrokes([]);
    onBoardChange(next);
  };

  return (
    <form aria-label="카드 더하기" onSubmit={submit}>
      <label>
        카드 종류
        <select
          value={draft.kind}
          onChange={(event) =>
            setDraft({ ...draft, kind: event.target.value as MoodboardCardKind })
          }
        >
          {(Object.keys(KIND_LABELS) as MoodboardCardKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label>
        내용
        <input
          value={draft.value}
          onChange={(event) => setDraft({ ...draft, value: event.target.value })}
          placeholder={KIND_PLACEHOLDERS[draft.kind]}
        />
      </label>
      {draft.kind === "sketch" && <SketchPad label="새 카드 스케치" strokes={strokes} onChange={setStrokes} />}
      <button type="submit">카드 더하기</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
