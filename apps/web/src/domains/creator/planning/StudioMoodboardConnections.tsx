import { useState } from "react";
import { studioProjectSectionHref } from "../studio-project-views";
import { connectMoodboardCards, moodboardCardAnchor, MOODBOARD_MAX_CONNECTIONS, type Moodboard, type MoodboardCard } from "./studio-moodboard";

export function StudioMoodboardConnections({ board, onChange, scriptProjectId }: { board: Moodboard; scriptProjectId?: string; onChange?: (next: Moodboard) => void }) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const cards = board.columns.flatMap(column => column.cardIds.map(id => board.cards[id]!));
  const edges = board.connections ?? [];
  if (!edges.length && (!onChange || cards.length < 2)) return null;
  const from = Object.hasOwn(board.cards, source) ? source : cards[0]?.id;
  const others = cards.filter(card => card.id !== from);
  const to = others.find(card => card.id === target)?.id ?? others[0]?.id;
  const exists = edges.some(edge => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from));
  const full = edges.length >= MOODBOARD_MAX_CONNECTIONS;
  const label = (card: MoodboardCard) => card.text?.trim() || card.ref || "스케치";
  const choices = (items: MoodboardCard[]) => items.map(card => <option value={card.id} key={card.id}>{label(card)}</option>);
  return <section aria-label="카드 연결" className="studio-moodboard-connections">
    <h3>카드 연결</h3>
    {edges.length > 0 && <ul>{edges.map(edge => <li key={JSON.stringify([edge.from, edge.to])}>
      <a href={`#${moodboardCardAnchor(edge.from)}`}>{label(board.cards[edge.from]!)}</a>
      <span aria-label="연결"> ↔ </span>
      <a href={`#${moodboardCardAnchor(edge.to)}`}>{label(board.cards[edge.to]!)}</a>
      {scriptProjectId && <a className="inline-flex min-h-11 items-center" href={studioProjectSectionHref(scriptProjectId, "story", "script",
        new URLSearchParams([["uiMode", "focus"], ["boardCard", edge.from], ["boardCard", edge.to]]))}>대본에서 열기</a>}
      {onChange && <button type="button" aria-label={`${label(board.cards[edge.from]!)} · ${label(board.cards[edge.to]!)} 연결 해제`}
        onClick={() => onChange({ ...board, connections: edges.filter(other => other !== edge) })}>연결 해제</button>}
    </li>)}</ul>}
    {onChange && <form aria-label="두 카드 연결" onSubmit={event => {
      event.preventDefault();
      if (from && to) { const next = connectMoodboardCards(board, from, to); if (next !== board) onChange(next); }
    }}>
      <label>첫 카드<select value={from} onChange={event => setSource(event.target.value)}>{choices(cards)}</select></label>
      <label>연결할 카드<select value={to} onChange={event => setTarget(event.target.value)}>{choices(others)}</select></label>
      <button type="submit" disabled={!to || exists || full}>카드 연결하기</button>
      {(exists || full) && <span role="status">{exists ? "이미 연결한 카드예요." : `카드는 ${MOODBOARD_MAX_CONNECTIONS}쌍까지 연결할 수 있어요.`}</span>}
    </form>}
  </section>;
}
