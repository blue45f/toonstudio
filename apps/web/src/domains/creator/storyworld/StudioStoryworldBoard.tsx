import { BookOpenCheck, Clapperboard, LayoutGrid, MapPin, Shapes, Users } from "lucide-react";
import { useMemo, useState } from "react";

import type { StoryworldProject } from "./studio-storyworld-causality";
import {
  buildStoryworldBoard,
  type StoryworldBoard,
  type StoryworldBoardElementKind,
} from "./studio-storyworld-board";

const KIND_LABELS: Readonly<Record<StoryworldBoardElementKind, string>> = {
  character: "캐릭터",
  scene: "장면",
  location: "장소",
  fact: "사실",
};

const KIND_ICONS: Readonly<Record<StoryworldBoardElementKind, typeof Users>> = {
  character: Users,
  scene: Clapperboard,
  location: MapPin,
  fact: BookOpenCheck,
};

type BoardFilter = StoryworldBoardElementKind | "all";

function graphLabel(label: string): string {
  return label.length > 10 ? `${label.slice(0, 10)}…` : label;
}

function BoardGraph({ board }: { readonly board: StoryworldBoard }) {
  const graph = board.graph;
  if (!graph) return null;
  const summary = `캐릭터 ${board.characters.length}·장면 ${board.scenes.length}·장소 ${board.locations.length} 요소와 관계 ${graph.edges.length}개를 잇는 그래프`;
  return (
    <figure className="storyworld-board-graph">
      <svg
        aria-label={summary}
        role="img"
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        width="100%"
      >
        <title>세계관 관계 미니 그래프</title>
        {graph.edges.map((edge) => (
          <path
            className={`storyworld-board-graph__edge storyworld-board-graph__edge--${edge.kind}`}
            d={edge.path}
            key={`${edge.kind}:${edge.fromNodeId}->${edge.toNodeId}`}
          />
        ))}
        {graph.nodes.map((node) => (
          <g className={`storyworld-board-graph__node storyworld-board-graph__node--${node.kind}`} key={node.nodeId}>
            <circle cx={node.x} cy={node.y} r={7} />
            <text
              textAnchor={node.kind === "character" ? "end" : "start"}
              x={node.kind === "character" ? node.x - 13 : node.x + 13}
              y={node.y + 4}
            >
              <title>{node.label}</title>
              {graphLabel(node.label)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        실선은 참여·장소, 점선은 장면 의존 관계입니다. 사실의 관계는 아래 사실 카드의 주체 표기로 확인합니다.
      </figcaption>
    </figure>
  );
}

function CharacterCards({ board }: { readonly board: StoryworldBoard }) {
  return (
    <div className="storyworld-board-grid">
      {board.characters.map((card) => (
        <article className="storyworld-board-card" key={card.id}>
          <div className="storyworld-board-card__topline">
            <Users aria-hidden size={16} />
            <strong>{card.name}</strong>
            <code>{card.id}</code>
          </div>
          {card.goal ? <p className="storyworld-board-card__goal">{card.goal}</p> : null}
          <ul className="storyworld-board-card__meta">
            <li>등장 장면 {card.sceneCount}</li>
            <li>아는 사실 {card.initialFactCount}</li>
            <li>비밀 {card.secretFactCount}</li>
          </ul>
        </article>
      ))}
    </div>
  );
}

function SceneCards({ board }: { readonly board: StoryworldBoard }) {
  return (
    <div className="storyworld-board-grid">
      {board.scenes.map((card) => (
        <article className="storyworld-board-card" key={card.id}>
          <div className="storyworld-board-card__topline">
            <span className="storyworld-board-card__order">{card.order}</span>
            <strong>{card.title}</strong>
            {card.disabled ? <span className="storyworld-board-card__badge">비활성</span> : null}
          </div>
          <ul className="storyworld-board-card__meta">
            <li>{card.locationId ? <>장소 <code>{card.locationId}</code></> : "장소 미지정"}</li>
            <li>참여자 {card.participantCount}</li>
            <li>선행 의존 {card.dependencyCount}</li>
          </ul>
        </article>
      ))}
    </div>
  );
}

function LocationCards({ board }: { readonly board: StoryworldBoard }) {
  return (
    <div className="storyworld-board-grid">
      {board.locations.map((card) => (
        <article className="storyworld-board-card" key={card.id}>
          <div className="storyworld-board-card__topline">
            <MapPin aria-hidden size={16} />
            <code className="storyworld-board-card__place">{card.id}</code>
          </div>
          <ul className="storyworld-board-card__meta">
            <li>장면 {card.sceneCount}곳</li>
            <li>등장 인물 {card.participantCount}명</li>
          </ul>
        </article>
      ))}
    </div>
  );
}

function FactCards({ board }: { readonly board: StoryworldBoard }) {
  return (
    <div className="storyworld-board-grid">
      {board.facts.map((card) => (
        <article className="storyworld-board-card" key={card.id}>
          <div className="storyworld-board-card__topline">
            <BookOpenCheck aria-hidden size={16} />
            <strong>{card.label}</strong>
            {card.canonical ? <span className="storyworld-board-card__badge">캐논</span> : null}
          </div>
          <ul className="storyworld-board-card__meta">
            <li>주체 {card.subjectLabel}</li>
            <li>키 <code>{card.key}</code></li>
          </ul>
        </article>
      ))}
    </div>
  );
}

const GROUP_RENDERERS: Readonly<Record<StoryworldBoardElementKind, (board: StoryworldBoard) => number>> = {
  character: (board) => board.characters.length,
  scene: (board) => board.scenes.length,
  location: (board) => board.locations.length,
  fact: (board) => board.facts.length,
};

function BoardGroup({ board, kind }: { readonly board: StoryworldBoard; readonly kind: StoryworldBoardElementKind }) {
  const Icon = KIND_ICONS[kind];
  return (
    <div className="storyworld-board-group">
      <h3>
        <Icon aria-hidden size={15} />
        {KIND_LABELS[kind]}
        <span>{GROUP_RENDERERS[kind](board)}</span>
      </h3>
      {kind === "character" ? <CharacterCards board={board} /> : null}
      {kind === "scene" ? <SceneCards board={board} /> : null}
      {kind === "location" ? <LocationCards board={board} /> : null}
      {kind === "fact" ? <FactCards board={board} /> : null}
    </div>
  );
}

export function StudioStoryworldBoard({ project, onOpenData }: {
  readonly project: StoryworldProject;
  readonly onOpenData: () => void;
}) {
  const board = useMemo(() => buildStoryworldBoard(project), [project]);
  const [filter, setFilter] = useState<BoardFilter>("all");

  if (!board.hasElements) {
    return (
      <section className="storyworld-panel storyworld-board" aria-labelledby="storyworld-board-title">
        <div className="storyworld-board-empty">
          <Shapes aria-hidden size={30} />
          <h2 id="storyworld-board-title">아직 세계관 요소가 없어요</h2>
          <p>
            인물·장면·사실을 만들면 이 자리에 요소 카드와 관계 그래프가 나타납니다.
            요소는 원본 데이터(JSON)에서 직접 정의하거나, 만든 JSON 파일을 가져오기 버튼으로 불러올 수 있습니다.
          </p>
          <button className="storyworld-button storyworld-button--primary" onClick={onOpenData} type="button">
            <LayoutGrid aria-hidden size={16} />
            원본 데이터에서 요소 만들기
          </button>
        </div>
      </section>
    );
  }

  const kinds = (Object.keys(KIND_LABELS) as StoryworldBoardElementKind[])
    .filter((kind) => GROUP_RENDERERS[kind](board) > 0);
  const visibleKinds = filter === "all" ? kinds : kinds.filter((kind) => kind === filter);

  return (
    <section className="storyworld-panel storyworld-board" aria-labelledby="storyworld-board-title">
      <div className="storyworld-panel__heading">
        <div>
          <h2 id="storyworld-board-title">세계관 보드</h2>
          <p>원본 데이터의 인물·장면·장소·사실 {board.elementCount}개와 그 관계를 한눈에 봅니다.</p>
        </div>
        <span className="storyworld-board__relations">관계 {board.relations.length}개</span>
      </div>

      <div className="storyworld-segmented storyworld-board__filters" role="group" aria-label="세계관 요소 종류 필터">
        {(["all", ...kinds] as BoardFilter[]).map((value) => (
          <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">
            {value === "all" ? `전체 ${board.elementCount}` : `${KIND_LABELS[value]} ${GROUP_RENDERERS[value](board)}`}
          </button>
        ))}
      </div>

      <BoardGraph board={board} />
      {board.graphOmission === "too-large" ? (
        <p className="storyworld-board-note">요소가 많아 관계 그래프는 접었습니다. 관계는 아래 카드의 표기로 확인하세요.</p>
      ) : null}

      <div className="storyworld-board-groups">
        {visibleKinds.map((kind) => <BoardGroup board={board} kind={kind} key={kind} />)}
      </div>
    </section>
  );
}
