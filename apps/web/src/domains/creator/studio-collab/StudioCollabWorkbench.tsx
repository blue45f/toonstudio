import { useMemo, useState } from "react";

import { StudioSideBySideCompare } from "./StudioSideBySideCompare";
import { StudioProductionWorkflow } from "./StudioProductionWorkflow";
import { createVirtualPeerPair, type VirtualPeerPair } from "./studio-crdt-peer-sync";
import type { CompareCommentAnchor, ComparePair, CompareVersion } from "./studio-side-by-side-compare";
import type { ProductionWorkflowState } from "./studio-production-workflow";

export interface StudioCollabWorkbenchProps {
  comparePair: ComparePair;
  availableVersions?: readonly CompareVersion[];
  initialAnchors?: readonly CompareCommentAnchor[];
  initialWorkflow?: ProductionWorkflowState;
  onActivity?: (action: string, detail: string) => void;
}

type WorkbenchTab = "compare" | "workflow" | "sync";

const TABS: ReadonlyArray<{ id: WorkbenchTab; label: string }> = [
  { id: "compare", label: "나란히 비교" },
  { id: "workflow", label: "제작 흐름" },
  { id: "sync", label: "실시간 동기화" },
];

/**
 * 스튜디오 협업 워크벤치: 나란히 비교 검수 + 직군별 제작 흐름 + 가상 피어 동기화 검증.
 * 제품 정의는 '드로잉 툴'이 아니라 '웹툰 제작 전 과정의 협업 업무툴'이며,
 * 핵심 고객은 분업화된 스튜디오·제작팀이다. 다른 협업 허브와 비교할 때
 * ToonStudio는 제작 도구 자체를 내장한 통합 제작 환경이라는 점이 구분점이다.
 */
export function StudioCollabWorkbench({
  comparePair, availableVersions = [], initialAnchors = [], initialWorkflow, onActivity,
}: StudioCollabWorkbenchProps) {
  const [tab, setTab] = useState<WorkbenchTab>("compare");
  const pair: VirtualPeerPair = useMemo(() => createVirtualPeerPair(), []);
  const [, setSyncVersion] = useState(0);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  function addVirtualWork() {
    pair.a.createOp("stroke", `피어 A 작업 ${pair.a.opCount() + 1}`);
    pair.b.createOp("comment", `피어 B 코멘트 ${pair.b.opCount() + 1}`);
    setSyncNote("두 가상 피어가 각자 작업을 만들었습니다. 교환하면 순서가 뒤섞여도 같은 로그에 도달합니다.");
    setSyncVersion((current) => current + 1);
  }

  function exchangeVirtual() {
    pair.exchange();
    setSyncNote(pair.converged()
      ? "수렴 확인: 두 피어의 연산 로그와 다이제스트가 일치합니다."
      : "아직 수렴하지 않았습니다. 다시 교환해 주세요.");
    setSyncVersion((current) => current + 1);
  }

  return (
    <section aria-label="스튜디오 협업 워크벤치" data-testid="studio-collab-workbench" className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="협업 워크벤치" className="flex shrink-0 flex-wrap gap-1.5 border-b border-line bg-card/25 px-3 py-2 sm:px-4">
        {TABS.map((candidate) => (
          <button key={candidate.id} type="button" role="tab" aria-selected={tab === candidate.id}
            onClick={() => setTab(candidate.id)}
            className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${tab === candidate.id ? "bg-panel text-fg shadow-sm" : "text-fg-3 hover:bg-raised"}`}>
            {candidate.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {tab === "compare" ? (
          <StudioSideBySideCompare initialPair={comparePair} availableVersions={availableVersions} initialAnchors={initialAnchors} />
        ) : tab === "workflow" ? (
          <StudioProductionWorkflow initial={initialWorkflow} onActivity={onActivity} />
        ) : (
          <div className="space-y-3" aria-label="가상 피어 동기화 검증">
            <p className="rounded-xl border border-line bg-card/30 px-3 py-3 text-xs leading-relaxed text-fg-2">
              이 패널은 실제 다계정 연결이 아니라 코드 동기화 경로의 수렴 검증입니다.
              두 가상 피어가 작업을 만들고, 순서가 뒤섞인 교환·중복 전달을 거쳐도 같은
              연산 로그에 도달하는지를 보여 줍니다. 실제 다계정 라이브 검증은 전송
              경로와 계정이 필요해 소유자 검증 항목으로 남아 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addVirtualWork}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-4 text-xs font-semibold text-fg-2 hover:bg-raised">
                양쪽 피어에 작업 추가
              </button>
              <button type="button" onClick={exchangeVirtual}
                className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent-hover">
                가상 교환 실행
              </button>
            </div>
            {syncNote ? <p role="status" className="rounded-lg border border-line bg-card/30 px-3 py-2 text-xs leading-relaxed text-fg-2">{syncNote}</p> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { label: "피어 A", peer: pair.a },
                { label: "피어 B", peer: pair.b },
              ] as const).map(({ label, peer }) => (
                <div key={label} className="rounded-xl border border-line bg-card/45 p-3">
                  <p className="text-xs font-bold text-fg">{label} · 연산 {peer.opCount()}건</p>
                  <p className="mt-1 break-all text-[0.68rem] text-fg-3">다이제스트: {peer.digest()}</p>
                  <ol className="mt-2 space-y-1">
                    {peer.orderedOps().map((op) => (
                      <li key={op.id} className="rounded-lg bg-panel px-2.5 py-1.5 text-xs text-fg-2">
                        {op.peerId} · lamport {op.lamport} · {op.kind} · {op.payload}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <p className="text-xs font-semibold text-fg">
              수렴 상태: {pair.converged() ? "일치" : "불일치(교환 필요)"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
