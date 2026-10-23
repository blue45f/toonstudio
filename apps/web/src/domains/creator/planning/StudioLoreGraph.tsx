/**
 * 설정 관계도 — 세계관 허브의 항목 연결을 보여주는 보기 전용 표면.
 *
 * 원칙:
 * - 편집은 여기서 하지 않는다. 연결을 바꾸려면 허브 목록에서 항목을 고친다.
 *   이 표면은 "무엇이 무엇과 이어졌는가"를 한눈에 읽는 자리다.
 * - 좌표·간선·상한 판정은 전부 모델(studio-lore-graph)이 정한다. 이 컴포넌트는
 *   그리고, 고르고(선택 노드의 연결 읽기), 목록으로 보여줄 뿐이다.
 * - 그래프 아래에는 항상 같은 연결의 목록이 붙는다 — 그래프를 읽지 못하는
 *   사용자(작은 화면·스크린 리더)에게도 연결이 온전히 닿아야 하기 때문이다.
 *   노드 상한을 넘으면 모델이 목록 모드로 축소하고, 여기서는 그래프 없이
 *   목록과 이유만 보여준다.
 */
import { useMemo, useState } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  STUDIO_LORE_KIND_LABELS,
  type StudioWorldLore,
} from "./studio-world-lore";
import {
  buildLoreGraph,
  type LoreGraph,
  type LoreGraphNodeKind,
} from "./studio-lore-graph";

export interface StudioLoreGraphProps {
  readonly lore: StudioWorldLore;
  /** 연결 표시용 캐릭터 목록 (바이블 정본, 읽기 전용). */
  readonly characters: readonly StudioStoryCharacter[];
}

const NODE_KIND_LABELS: Readonly<Record<LoreGraphNodeKind, string>> = {
  place: STUDIO_LORE_KIND_LABELS.place.ko,
  faction: STUDIO_LORE_KIND_LABELS.faction.ko,
  species: STUDIO_LORE_KIND_LABELS.species.ko,
  artifact: STUDIO_LORE_KIND_LABELS.artifact.ko,
  rule: STUDIO_LORE_KIND_LABELS.rule.ko,
  event: STUDIO_LORE_KIND_LABELS.event.ko,
  character: "캐릭터",
};

/** 종류를 색으로도 구분한다 — 단, 색만으로 구분하지 않고 범례·라벨을 함께 둔다. */
const NODE_KIND_COLORS: Readonly<Record<LoreGraphNodeKind, string>> = {
  place: "#2563eb",
  faction: "#7c3aed",
  species: "#059669",
  artifact: "#d97706",
  rule: "#dc2626",
  event: "#0891b2",
  character: "#111827",
};

function graphLabel(label: string): string {
  return label.length > 10 ? `${label.slice(0, 10)}…` : label;
}

function GraphCanvas({
  graph,
  selectedNodeId,
  onSelect,
}: {
  readonly graph: LoreGraph;
  readonly selectedNodeId: string | null;
  readonly onSelect: (nodeId: string | null) => void;
}) {
  const summary = `설정 ${graph.totalNodeCount}개 노드와 연결 ${graph.totalEdgeCount}개의 관계도`;
  return (
    <figure>
      <svg
        aria-label={summary}
        role="img"
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        width="100%"
      >
        <title>설정 관계도</title>
        {graph.edges.map((edge) => {
          const active =
            selectedNodeId !== null &&
            (edge.fromNodeId === selectedNodeId || edge.toNodeId === selectedNodeId);
          return (
            <path
              key={`${edge.kind}:${edge.fromNodeId}->${edge.toNodeId}`}
              d={edge.path}
              fill="none"
              stroke={active ? "#111827" : "#9ca3af"}
              strokeWidth={active ? 2.4 : 1.2}
              strokeDasharray={edge.kind === "character" ? "5 4" : undefined}
            />
          );
        })}
        {graph.nodes.map((node) => {
          const selected = node.nodeId === selectedNodeId;
          return (
            <g
              key={node.nodeId}
              onClick={() => onSelect(selected ? null : node.nodeId)}
              style={{ cursor: "pointer" }}
            >
              <title>{`${node.label} (${NODE_KIND_LABELS[node.kind]}) — 연결 ${node.degree}개`}</title>
              <circle
                cx={node.x}
                cy={node.y}
                r={selected ? 10 : 8}
                fill={NODE_KIND_COLORS[node.kind]}
                stroke={selected ? "#111827" : "#ffffff"}
                strokeWidth={selected ? 2.4 : 1.4}
              />
              <text x={node.x + 14} y={node.y + 4} fontSize={13} fill="#111827">
                {graphLabel(node.label)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        실선은 설정끼리의 연결, 점선은 캐릭터와의 연결이에요. 점을 누르면 그 항목의
        연결만 아래에서 읽을 수 있어요.
      </figcaption>
    </figure>
  );
}

function GraphList({
  graph,
  selectedNodeId,
}: {
  readonly graph: LoreGraph;
  readonly selectedNodeId: string | null;
}) {
  const rows =
    selectedNodeId === null
      ? graph.listRows
      : graph.listRows.filter((row) => row.nodeId === selectedNodeId);
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.nodeId}>
          <strong>{row.label}</strong> ({NODE_KIND_LABELS[row.kind]})
          {row.connectedLabels.length > 0 ? (
            <> — 이어진 항목: {row.connectedLabels.join(", ")}</>
          ) : (
            <>{r3c04StatusText("studio.r3c04Status.planning.loreGraph.noConnectedInline", " — 아직 이어진 항목이 없어요")}</>
          )}
        </li>
      ))}
    </ul>
  );
}

export function StudioLoreGraph({ lore, characters }: StudioLoreGraphProps) {
  const graph = useMemo(() => buildLoreGraph(lore, characters), [lore, characters]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // 빈 상태는 허브 본문이 맡는다 — 관계도 섹션을 따로 세우지 않는다.
  if (lore.entries.length === 0) return null;

  const selectedRow = graph.listRows.find((row) => row.nodeId === selectedNodeId) ?? null;

  return (
    <section aria-label="설정 관계도">
      <h2>설정 관계도</h2>
      <p>
        설정 {graph.totalNodeCount}개 · 연결 {graph.totalEdgeCount}개
        {graph.isolatedCount > 0 ? ` · 아직 안 이어진 설정 ${graph.isolatedCount}개` : ""}
      </p>
      <p aria-label="종류 범례">
        {(Object.keys(NODE_KIND_LABELS) as LoreGraphNodeKind[]).map((kind) => (
          <span key={kind}>
            <span
              aria-hidden
              style={{
                background: NODE_KIND_COLORS[kind],
                borderRadius: "50%",
                display: "inline-block",
                height: 10,
                width: 10,
              }}
            />{" "}
            {NODE_KIND_LABELS[kind]}{" "}
          </span>
        ))}
      </p>

      {graph.omission === "too-large" ? (
        <p role="note">
          설정과 연결이 많아(노드 {graph.totalNodeCount}개 · 연결 {graph.totalEdgeCount}개)
          관계도는 접고 목록으로 보여줘요. 연결 자체는 아래 목록에서 온전히 확인할 수
          있어요.
        </p>
      ) : null}
      {graph.omission === "no-relations" ? (
        <p role="note">{r3c04StatusText("studio.r3c04Status.planning.loreGraph.noRelations", "아직 설정 사이에 이어진 연결이 없어요. 항목을 고칠 때 “이어지는 설정”과 “이어지는 캐릭터”를 체크하면, 여기에 관계도가 그려져요.")}</p>
      ) : null}

      {graph.mode === "graph" ? (
        <GraphCanvas graph={graph} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} />
      ) : null}

      {selectedRow ? (
        <p>
          선택한 항목: <strong>{selectedRow.label}</strong> —{" "}
          {selectedRow.connectedLabels.length > 0
            ? `이어진 항목 ${selectedRow.connectedLabels.length}개: ${selectedRow.connectedLabels.join(", ")}`
            : r3c04StatusText("studio.r3c04Status.planning.loreGraph.noConnectedSelected", "이어진 항목이 없어요")}
          {" "}
          <button type="button" onClick={() => setSelectedNodeId(null)}>
            전체 연결 보기
          </button>
        </p>
      ) : null}

      <h3>연결 목록</h3>
      <GraphList graph={graph} selectedNodeId={graph.mode === "graph" ? selectedNodeId : null} />
    </section>
  );
}
