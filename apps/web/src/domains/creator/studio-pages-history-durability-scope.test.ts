/**
 * 실행 취소 히스토리의 내구 범위 — 확정 계약 (2026-10-14 실측).
 *
 * 결론부터: **복구 후에는 undo 할 수 없다. 복구 지점이 새 undo 지평(horizon)이다.**
 * 이 파일은 그 범위를 회귀로 고정하는 계약 테스트다. 근거는 세 층이다.
 *
 * 1. 실행 undo 의 실체는 메모리뿐이다.
 *    - 캔버스 undo 는 `pagesHistory: PageState[][]` + `pagesHi`
 *      (`useStudioPageHistorySnapshots`)가, 사이드카(캐릭터 바이블·Writer Room·
 *      애니매틱) undo 는 통합 저널(`useStudioUnifiedHistoryJournal`)이 소유한다.
 *      둘 다 마운트 시 빈 상태로 시작하고 어디에서도 수화(hydrate)되지 않는다.
 * 2. 모든 복구 경로는 지평을 명시적으로 리셋한다.
 *    - 서버 프로젝트 로드(호스트 수화): `setPagesHistoryState([hydratedPages])`,
 *      `setPagesHiState(0)`, 통합 저널 신규 교체, 내구 저널
 *      `rebase({ pages: hydratedPages, historyIndex: 0 })`.
 *    - 자동저장 복구(`restoreStudioAutosaveRecovery`): `setPagesHistory([restoredPages])`,
 *      `setPagesHi(0)`, `resetStudioHistoryJournal()`, 내구 저널 rebase(동일 지평).
 *    - CRDT 조정·소재 수화 조정도 같은 rebase 로 지평을 다시 긋는다.
 *    따라서 새로고침·복구·재진입 직후 `pagesHi === 0` 이고 통합 저널이 비어 있어
 *    ⌘Z 는 닿을 대상이 없다. 복구 전 편집은 **문서 내용으로는 남지만 undo 로는 못 돌아간다.**
 * 3. 내구 저널은 스냅샷 저장소가 아니라 무결성 저널이다.
 *    - SQLite-OPFS → OPFS 저널 → (명시 주입 시에만) IndexedDB → memory-only 순으로
 *      선택되는 복구 백엔드에 `serialize()` 된 명령 저널이 기록되고, 48회 쓰기마다
 *      체크포인트로 압축된다. 체크포인트 스냅샷 자체는 이미 존재한다 — 검토 결과
 *      새로 만들 대상이 아니다.
 *    - 단, 기록되는 것은 스냅샷 **요약**(페이지 id·요소 수·캔버스 높이·콘텐츠
 *      다이제스트)뿐이고 페이지 본문은 절대 들어가지 않는다(아래 테스트 1).
 *      그래서 복원된 저널이 할 수 있는 일은 "자동저장이 불러온 스냅샷이 저널의
 *      마지막 지점과 같은가"(`matchesTarget`)를 검증하는 것까지이며, 어긋나면
 *      그 지점에서 rebase 해 새 지평을 연다. 과거 스냅샷 자체를 되살리는 경로는
 *      구조적으로 존재하지 않는다.
 *    - 미묘한 지점: rebase 를 거치지 않은 복원 저널은 undo **영수증** 기록까지는
 *      이어진다(테스트 3). 그러나 영수증은 기록일 뿐 실행이 아니다 — 실행에 필요한
 *      스냅샷 배열은 복구 경로가 단일 항목으로 리셋하므로, 사용자가 누르는 ⌘Z 는
 *      여전히 빈손이다. 이 둘을 혼동하면 "저널이 복원되니 undo 도 복원된다"는
 *      잘못된 결론이 나온다.
 *
 * 복구 후 undo 를 실제로 지원하려면 페이지 본문을 담는 별도 스냅샷 저장소
 * (체크포인트당 최대 6.46 MiB × 유지 예산 — 현 저널의 128 KiB 레코드/4 MiB 직렬화
 * 상한과 정면으로 충돌)와 그에 대한 소유자 결정이 먼저 필요하다. 이 테스트는
 * 그 결정이 내려지기 전까지의 **현재 계약**을 고정한다: 범위가 바뀌면 테스트가
 * 먼저 깨져서 결정 없이 조용히 달라지지 않게 한다.
 */
import { describe, expect, it } from "vitest";

import {
  createStudioPagesHistoryCommandJournal,
  restoreStudioPagesHistoryCommandJournal,
} from "./studio-pages-history-command-journal";

const PAYLOAD_MARKER = "durability-scope-marker-7f3a";

function pages(elementCount: number, text = "hello") {
  return [
    {
      id: "page-1",
      elements: Array.from({ length: elementCount }, (_, index) => ({
        id: `element-${index}`,
        text: index === 0 ? text : `t-${index}`,
      })),
      canvasH: 2_000,
    },
  ];
}

/** Two accepted edits in "session A", returned with the durable payload they produced. */
function recordedSession() {
  const journal = createStudioPagesHistoryCommandJournal();
  journal.recordTransition({
    mutationKind: "elements.commit",
    previousPages: pages(1, PAYLOAD_MARKER),
    nextPages: pages(2, PAYLOAD_MARKER),
    previousHistoryIndex: 0,
    nextHistoryIndex: 1,
  });
  journal.recordTransition({
    mutationKind: "elements.commit",
    previousPages: pages(2, PAYLOAD_MARKER),
    nextPages: pages(3, PAYLOAD_MARKER),
    previousHistoryIndex: 1,
    nextHistoryIndex: 2,
  });
  return { journal, serialized: journal.serialize() };
}

describe("Studio pages history durability scope", () => {
  it("persists digests only — the durable payload never contains page payloads", () => {
    const { serialized } = recordedSession();

    // Element text and element ids are hashed into the content digest, never stored.
    // Without page payloads in the journal, no recovery path can rebuild past snapshots,
    // which is the structural half of "no undo after recovery".
    expect(serialized).not.toContain(PAYLOAD_MARKER);
    expect(serialized).not.toContain("element-0");
  });

  it("restores the journal frontier only when it matches the autosave-loaded snapshot", () => {
    const { serialized } = recordedSession();
    const restored = restoreStudioPagesHistoryCommandJournal(serialized);

    expect(restored.matchesTarget({ pages: pages(3, PAYLOAD_MARKER), historyIndex: 2 })).toBe(true);
    expect(restored.matchesTarget({ pages: pages(9, PAYLOAD_MARKER), historyIndex: 2 })).toBe(false);
  });

  it("keeps journal-level undo receipts after a matching restore — receipts, not execution", () => {
    const { serialized } = recordedSession();
    const restored = restoreStudioPagesHistoryCommandJournal(serialized);

    // The integrity layer continues its undo/redo receipt chain across a reload.
    // The editor still cannot execute that undo: recovery reset pagesHistory to a
    // single snapshot at index 0, so there is no snapshot to navigate back to.
    expect(restored.recordUndo({ pages: pages(2, PAYLOAD_MARKER), historyIndex: 1 })).toBe("recorded");
  });

  it("closes the undo horizon at the recovery rebase the load/restore paths apply", () => {
    const { serialized } = recordedSession();
    const restored = restoreStudioPagesHistoryCommandJournal(serialized);

    // Exactly what project load and autosave restore do with the durable journal:
    // rebase onto the recovered snapshot at historyIndex 0 (a checkpoint write).
    restored.rebase({ pages: pages(3, PAYLOAD_MARKER), historyIndex: 0 });

    const plan = restored.replayPlan();
    expect(plan.batches).toHaveLength(0);
    expect(plan.checkpoint).toMatchObject({
      state: { historyIndex: 0, pageCount: 1, elementCount: 3 },
    });
    // No undo group crosses the recovery horizon.
    expect(restored.recordUndo({ pages: pages(3, PAYLOAD_MARKER), historyIndex: 0 })).toBe("rebased");
  });
});
