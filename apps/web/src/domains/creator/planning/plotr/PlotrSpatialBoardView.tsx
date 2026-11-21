/**
 * 자유 공간 스토리보드 · 중첩 서브보드 · 자동 바인딩 Quick Arrows · 탄성 카드 스냅 뷰.
 *
 * `studio-spatial-story-board-canvas.ts` 엔진을 실제 화면에 마운트해
 * 카드 배치, 키보드/버튼 위치 스냅 이동, 화살표 연결, 서브보드 계층 드릴다운을 제공한다.
 */
import { ArrowRight, FolderPlus, Link2, Move, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  countNodesInSubtree,
  createNestedSubBoard,
  getBoardBreadcrumbPath,
  resolveQuickArrowGeometry,
  snapCardWithElasticGuides,
  type ElasticSnapGuideLine,
  type SpatialBoardNode,
  type SpatialBoardNodeKind,
  type SpatialStoryBoardDocument,
} from "../studio-spatial-story-board-canvas";
import "./plotr-story-atelier.css";

export interface PlotrSpatialBoardViewProps {
  readonly document: SpatialStoryBoardDocument;
  readonly onChange: (next: SpatialStoryBoardDocument) => void;
}

const NODE_KIND_LABELS: Readonly<Record<SpatialBoardNodeKind, string>> = Object.freeze({
  "scene-card": "장면 카드",
  "character-note": "인물 메모",
  "reference-image": "참고 자료",
  "sub-board": "하위 보드",
  sticky: "메모지",
});

const BTN_BASE =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function PlotrSpatialBoardView({
  document,
  onChange,
}: PlotrSpatialBoardViewProps) {
  const [activeBoardId, setActiveBoardId] = useState<string>(document.rootBoardId);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [activeGuides, setActiveGuides] = useState<readonly ElasticSnapGuideLine[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newKind, setNewKind] = useState<Exclude<SpatialBoardNodeKind, "sub-board">>("scene-card");
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const idCounterRef = useRef(1);
  const nextLocalId = (prefix: string) => {
    const seq = idCounterRef.current;
    idCounterRef.current += 1;
    return `${prefix}-${seq}`;
  };

  const safeBoardId = document.boards[activeBoardId] ? activeBoardId : document.rootBoardId;
  const breadcrumbs = useMemo(
    () => getBoardBreadcrumbPath(document, safeBoardId),
    [document, safeBoardId],
  );
  const boardNodes = useMemo(
    () => document.nodes.filter((n) => n.boardId === safeBoardId),
    [document.nodes, safeBoardId],
  );
  const boardArrows = useMemo(
    () => document.arrows.filter((a) => a.boardId === safeBoardId),
    [document.arrows, safeBoardId],
  );
  const resolvedArrows = useMemo(
    () =>
      boardArrows
        .map((arrow) => ({
          arrow,
          geom: resolveQuickArrowGeometry(arrow, boardNodes),
        }))
        .filter((entry) => entry.geom !== null),
    [boardArrows, boardNodes],
  );
  const subtreeCount = useMemo(
    () => countNodesInSubtree(document, safeBoardId),
    [document, safeBoardId],
  );

  const selectedNode = boardNodes.find((n) => n.id === selectedNodeId) ?? boardNodes[0] ?? null;

  const handleAddCard = () => {
    const titleKo = newTitle.trim();
    if (!titleKo) return;
    const offset = boardNodes.length;
    const created: SpatialBoardNode = {
      id: nextLocalId("snode"),
      boardId: safeBoardId,
      kind: newKind,
      titleKo,
      bodyKo: newBody.trim() || "자유롭게 배치할 수 있는 스토리 카드",
      x: 36 + (offset % 3) * 256,
      y: 44 + Math.floor(offset / 3) * 144,
      width: 224,
      height: 112,
      tags: [NODE_KIND_LABELS[newKind]],
    };
    onChange({
      ...document,
      nodes: [...document.nodes, created],
    });
    setSelectedNodeId(created.id);
    setNewTitle("");
    setNewBody("");
    setStatusNote(`'${titleKo}' 카드를 현재 보드에 놓았어요.`);
  };

  const handleAddSubBoard = () => {
    const titleKo = newTitle.trim() || `새 하위 보드 ${Object.keys(document.boards).length}`;
    const subId = nextLocalId("sub");
    const portalId = nextLocalId("portal");
    const nextDoc = createNestedSubBoard(document, {
      parentBoardId: safeBoardId,
      subBoardId: subId,
      portalNodeId: portalId,
      titleKo,
      summaryKo: newBody.trim() || "눌러서 세부 장면 보드로 들어가기",
      x: 36 + (boardNodes.length % 3) * 256,
      y: 44 + Math.floor(boardNodes.length / 3) * 144,
    });
    onChange(nextDoc);
    setNewTitle("");
    setNewBody("");
    setStatusNote(`하위 보드 '${titleKo}'를 만들었어요. 포털 카드를 누르면 바로 들어갑니다.`);
  };

  const handleNudgeSelected = (dx: number, dy: number) => {
    if (!selectedNode) return;
    const snapped = snapCardWithElasticGuides(
      selectedNode,
      Math.max(12, selectedNode.x + dx),
      Math.max(12, selectedNode.y + dy),
      boardNodes,
      { snapThresholdPx: 14, preferredGapPx: 24 },
    );
    setActiveGuides(snapped.guides);
    onChange({
      ...document,
      nodes: document.nodes.map((node) =>
        node.id === selectedNode.id ? { ...node, x: snapped.x, y: snapped.y } : node,
      ),
    });
    if (snapped.snappedX || snapped.snappedY) {
      setStatusNote("인접 카드 간격에 맞춰 탄성 스냅으로 정렬했어요.");
    }
  };

  const handleClickNode = (node: SpatialBoardNode) => {
    if (connectFromId && connectFromId !== node.id) {
      const nextArrow = {
        id: nextLocalId("arrow"),
        boardId: safeBoardId,
        fromNodeId: connectFromId,
        toNodeId: node.id,
        labelKo: "연결",
        curveOffsetPx: -16,
      };
      onChange({
        ...document,
        arrows: [...document.arrows, nextArrow],
      });
      setConnectFromId(null);
      setStatusNote(`두 카드를 자동 바인딩 화살표로 이었어요.`);
      return;
    }
    setSelectedNodeId(node.id);
    setActiveGuides([]);
  };

  const stageWidth = Math.max(760, ...boardNodes.map((n) => n.x + n.width + 64));
  const stageHeight = Math.max(360, ...boardNodes.map((n) => n.y + n.height + 64));

  return (
    <section
      aria-label="자유 공간 스토리보드"
      data-testid="plotr-spatial-board-view"
      className="space-y-3 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <nav aria-label="서브보드 경로" className="flex flex-wrap items-center gap-1 text-xs">
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.id} className="inline-flex items-center gap-1">
                {idx > 0 ? <ArrowRight className="size-3 text-fg-3" aria-hidden="true" /> : null}
                <button
                  type="button"
                  onClick={() => {
                    setActiveBoardId(crumb.id);
                    setSelectedNodeId(null);
                    setConnectFromId(null);
                  }}
                  className={`min-h-11 rounded-lg px-2 text-xs font-semibold ${
                    crumb.id === safeBoardId
                      ? "bg-accent-soft text-accent"
                      : "text-fg-2 hover:bg-raised hover:text-fg"
                  }`}
                >
                  {crumb.titleKo}
                </button>
              </span>
            ))}
          </nav>
          <p className="mt-0.5 text-xs text-fg-2 tabular-nums">
            현재 보드 카드 {boardNodes.length}장 · 하위 포함 총 {subtreeCount}장 · 화살표 {resolvedArrows.length}개
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={!selectedNode}
            title={!selectedNode ? "먼저 연결을 시작할 카드를 선택해 주세요" : undefined}
            onClick={() =>
              setConnectFromId((prev) =>
                prev === selectedNode?.id ? null : (selectedNode?.id ?? null),
              )
            }
            className={`${BTN_BASE} ${
              connectFromId
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg hover:bg-raised"
            } disabled:opacity-40`}
          >
            <Link2 className="size-3.5" aria-hidden="true" />
            <span>{connectFromId ? "연결할 대상 카드 클릭" : "화살표로 카드 잇기"}</span>
          </button>
        </div>
      </header>

      {/* 간편 카드 추가 줄 */}
      <div className="grid gap-2 rounded-xl border border-line bg-card p-3 sm:grid-cols-[9rem_1fr_1fr_auto]">
        <select
          aria-label="공간 카드 종류"
          value={newKind}
          onChange={(e) =>
            setNewKind(e.target.value as Exclude<SpatialBoardNodeKind, "sub-board">)
          }
          className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg"
        >
          <option value="scene-card">장면 카드</option>
          <option value="character-note">인물 메모</option>
          <option value="reference-image">참고 자료</option>
          <option value="sticky">메모지</option>
        </select>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="카드 제목 (예: 옥상 대치 구도)"
          aria-label="공간 카드 제목"
          className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
        />
        <input
          type="text"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="한 줄 메모 (선택)"
          aria-label="공간 카드 내용"
          className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handleAddCard}
            disabled={!newTitle.trim()}
            title={!newTitle.trim() ? "카드 제목을 먼저 입력해 주세요" : undefined}
            className={`${BTN_BASE} border-accent bg-accent text-on-accent disabled:opacity-40`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>카드 놓기</span>
          </button>
          <button
            type="button"
            onClick={handleAddSubBoard}
            className={`${BTN_BASE} border-line bg-panel text-fg hover:bg-raised`}
          >
            <FolderPlus className="size-3.5" aria-hidden="true" />
            <span>하위 보드</span>
          </button>
        </div>
      </div>

      {statusNote ? (
        <p role="status" aria-live="polite" className="text-xs text-fg-2">
          {statusNote}
        </p>
      ) : null}

      {/* 선택 카드 스냅 이동 툴바 (키보드·터치 모두 가능) */}
      {selectedNode ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-fg">
            <Move className="size-3.5 text-accent" aria-hidden="true" />
            <span>선택: {selectedNode.titleKo}</span>
          </span>
          <span className="tabular-nums text-fg-3">
            ({Math.round(selectedNode.x)}, {Math.round(selectedNode.y)})
          </span>
          <div className="ml-auto flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => handleNudgeSelected(-32, 0)}
              className={`${BTN_BASE} border-line bg-panel text-fg hover:bg-raised`}
            >
              왼쪽 이동
            </button>
            <button
              type="button"
              onClick={() => handleNudgeSelected(32, 0)}
              className={`${BTN_BASE} border-line bg-panel text-fg hover:bg-raised`}
            >
              오른쪽 이동
            </button>
            <button
              type="button"
              onClick={() => handleNudgeSelected(0, -28)}
              className={`${BTN_BASE} border-line bg-panel text-fg hover:bg-raised`}
            >
              위로 이동
            </button>
            <button
              type="button"
              onClick={() => handleNudgeSelected(0, 28)}
              className={`${BTN_BASE} border-line bg-panel text-fg hover:bg-raised`}
            >
              아래 이동
            </button>
          </div>
        </div>
      ) : null}

      {/* 무한 공간 캔버스 스테이지 */}
      <div className="plotr-spatial-stage max-h-[26rem]">
        <div className="relative" style={{ width: `${stageWidth}px`, height: `${stageHeight}px` }}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {activeGuides.map((guide, idx) =>
              guide.axis === "x" ? (
                <line
                  key={`gx-${idx}`}
                  x1={guide.positionPx}
                  y1={0}
                  x2={guide.positionPx}
                  y2={stageHeight}
                  stroke="var(--color-accent)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              ) : (
                <line
                  key={`gy-${idx}`}
                  x1={0}
                  y1={guide.positionPx}
                  x2={stageWidth}
                  y2={guide.positionPx}
                  stroke="var(--color-accent)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              ),
            )}
            {resolvedArrows.map(({ arrow, geom }) => {
              if (!geom) return null;
              const d = `M ${geom.start[0]} ${geom.start[1]} Q ${geom.controlPoint[0]} ${geom.controlPoint[1]} ${geom.end[0]} ${geom.end[1]}`;
              return (
                <g key={arrow.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                  />
                  <circle cx={geom.end[0]} cy={geom.end[1]} r={4} fill="var(--color-accent)" />
                </g>
              );
            })}
          </svg>

          {boardNodes.map((node) => {
            const isSelected = selectedNode?.id === node.id;
            const isConnectSource = connectFromId === node.id;
            return (
              <div
                key={node.id}
                data-testid={`spatial-node-${node.id}`}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.width}px`,
                  minHeight: `${node.height}px`,
                }}
                className={`absolute flex flex-col justify-between rounded-xl border p-2.5 text-left ${
                  isConnectSource
                    ? "border-cool bg-cool/10"
                    : isSelected
                      ? "border-accent bg-raised shadow-[inset_3px_0_0_var(--color-accent)]"
                      : "border-line bg-card"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleClickNode(node)}
                  className="min-h-11 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="text-[11px] font-semibold text-accent">
                    {NODE_KIND_LABELS[node.kind]}
                  </span>
                  <h4 className="mt-0.5 text-xs font-bold text-fg">{node.titleKo}</h4>
                  <p className="mt-1 line-clamp-2 text-xs text-fg-2">{node.bodyKo}</p>
                </button>
                {node.kind === "sub-board" && node.targetSubBoardId ? (
                  <button
                    type="button"
                    data-testid={`open-subboard-${node.targetSubBoardId}`}
                    onClick={() => {
                      setActiveBoardId(node.targetSubBoardId!);
                      setSelectedNodeId(null);
                    }}
                    className={`${BTN_BASE} mt-2 w-full border-accent/40 bg-accent-soft text-accent`}
                  >
                    하위 보드 열기
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PlotrSpatialBoardView;
