/**
 * 툰스튜디오 패널 편집 Undo/Redo 명령 엔진 자동 테스트 스위트 (총 32개 테스트 케이스).
 *
 * Node.js 내장 `node:test` 및 `node:assert/strict` 표준 라이브러리만 사용하여 실행된다.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_HISTORY_CAPACITY,
  ToonCommandHistoryError,
  ToonPanelCommandHistoryEngine,
  applyPanelEditCommand,
  createVirtualPanelBoard,
} from "../src/index.ts";

import type {
  VirtualPanelBoardSeedInput,
  VirtualPanelBoardState,
} from "../src/index.ts";

function createSampleSeed(): VirtualPanelBoardSeedInput {
  return {
    boardId: "board-ep01",
    episodeCode: "ep-001",
    revision: 0,
    panels: [
      {
        id: "panel-1",
        kind: "setup",
        text: {
          title: "1컷: 새벽의 옥상",
          dialogue: "드디어 도착했군.",
          caption: "서울 북부, 오전 5시",
          notes: "광각 하이앵글",
        },
        characterTags: ["char-aria", "char-jin"],
        estimatedHeightPx: 820,
      },
      {
        id: "panel-2",
        kind: "dialogue",
        text: {
          title: "2컷: 대면",
          dialogue: "늦지 않아서 다행이야.",
          caption: "",
          notes: "바스트 샷",
        },
        characterTags: ["char-aria"],
        estimatedHeightPx: 680,
      },
      {
        id: "panel-3",
        kind: "action",
        text: {
          title: "3컷: 도약",
          dialogue: "지금 간다!",
          caption: "바람이 몰아친다",
          notes: "집중선 연출",
        },
        characterTags: ["char-jin"],
        estimatedHeightPx: 920,
      },
    ],
  };
}

function createSampleEngine(
  maxHistoryCapacity?: number,
): {
  readonly initialBoard: VirtualPanelBoardState;
  readonly engine: ToonPanelCommandHistoryEngine;
} {
  const initialBoard = createVirtualPanelBoard(createSampleSeed());
  const engine = new ToonPanelCommandHistoryEngine(
    initialBoard,
    maxHistoryCapacity !== undefined ? { maxHistoryCapacity } : {},
  );
  return { initialBoard, engine };
}

describe("툰스튜디오 가상 패널 Undo/Redo 명령 히스토리 엔진 (toon-command-history)", () => {
  it("01. 초기 가상 패널 보드 생성 시 연속된 order(0..n-1)와 기본 메타데이터를 정확히 설정한다", () => {
    const board = createVirtualPanelBoard(createSampleSeed());
    assert.equal(board.boardId, "board-ep01");
    assert.equal(board.episodeCode, "ep-001");
    assert.equal(board.revision, 0);
    assert.equal(board.panels.length, 3);
    assert.deepEqual(
      board.panels.map((p) => [p.id, p.order]),
      [
        ["panel-1", 0],
        ["panel-2", 1],
        ["panel-3", 2],
      ],
    );
    assert.equal(DEFAULT_HISTORY_CAPACITY, 100);
  });

  it("02. [불변 원본 보장] 초기 시드 입력 객체나 배열을 외부에서 변조해도 생성된 보드와 엔진 초기 상태는 변하지 않는다", () => {
    const mutableTags = ["char-aria", "char-jin"];
    const mutableText = {
      title: "원본 제목",
      dialogue: "원본 대사",
      caption: "원본 캡션",
      notes: "원본 노트",
    };
    const mutablePanels = [
      {
        id: "panel-a",
        kind: "setup" as const,
        text: mutableText,
        characterTags: mutableTags,
        estimatedHeightPx: 700,
      },
    ];
    const seed: VirtualPanelBoardSeedInput = {
      boardId: "board-immutable",
      episodeCode: "ep-immutable",
      panels: mutablePanels,
    };

    const board = createVirtualPanelBoard(seed);
    const engine = new ToonPanelCommandHistoryEngine(board);

    // 외부 원본 객체 변조 시도
    mutableTags.push("char-hacker");
    mutableText.dialogue = "변조된 대사";
    mutablePanels.push({
      id: "panel-b",
      kind: "action",
      text: { title: "추가", dialogue: "", caption: "", notes: "" },
    });

    assert.equal(engine.getState().panels.length, 1);
    assert.equal(engine.getState().panels[0]?.text.dialogue, "원본 대사");
    assert.deepEqual(engine.getState().panels[0]?.characterTags, [
      "char-aria",
      "char-jin",
    ]);
  });

  it("03. [불변 원본 보장] 엔진에서 반환된 상태 객체나 내부 패널 속성을 직접 수정하려고 하면 Object.freeze 에 의해 TypeError 가 발생한다", () => {
    const { engine } = createSampleEngine();
    const state = engine.getState();

    assert.throws(() => {
      (state as { revision: number }).revision = 999;
    }, TypeError);

    assert.throws(() => {
      (state.panels as unknown[]).push({});
    }, TypeError);

    assert.throws(() => {
      (state.panels[0]!.text as { dialogue: string }).dialogue = "강제 덮어쓰기";
    }, TypeError);

    assert.throws(() => {
      (state.panels[0]!.characterTags as string[]).push("mutated");
    }, TypeError);
  });

  it("04. [추가 가역 명령] 맨 끝에 패널을 추가하고 undo/redo 하면 상태와 revision 이 정확히 가역 복원된다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const afterAdd = engine.addPanel({
      id: "panel-4",
      kind: "reveal",
      text: {
        title: "4컷: 정체 공개",
        dialogue: "네가 바로 그 사람이었군!",
      },
      characterTags: ["char-aria"],
      estimatedHeightPx: 880,
    });

    assert.equal(afterAdd.revision, 1);
    assert.equal(afterAdd.panels.length, 4);
    assert.equal(afterAdd.panels[3]?.id, "panel-4");
    assert.equal(afterAdd.panels[3]?.order, 3);
    assert.equal(engine.canUndo(), true);
    assert.equal(engine.canRedo(), false);

    const undoRes = engine.undo();
    assert.equal(undoRes.changed, true);
    assert.deepEqual(undoRes.state, initialBoard);
    assert.equal(engine.canUndo(), false);
    assert.equal(engine.canRedo(), true);

    const redoRes = engine.redo();
    assert.equal(redoRes.changed, true);
    assert.deepEqual(redoRes.state, afterAdd);
  });

  it("05. [추가 가역 명령] 중간 인덱스(index=1)에 패널 삽입 시 뒤쪽 패널들의 order 가 밀리고 undo 시 원래대로 당겨진다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const afterInsert = engine.addPanel(
      {
        id: "panel-mid",
        kind: "transition",
        text: { title: "중간 전환 컷", caption: "잠시 후" },
      },
      { index: 1, label: "중간 컷 삽입" },
    );

    assert.deepEqual(
      afterInsert.panels.map((p) => [p.id, p.order]),
      [
        ["panel-1", 0],
        ["panel-mid", 1],
        ["panel-2", 2],
        ["panel-3", 3],
      ],
    );

    const undone = engine.undo();
    assert.deepEqual(undone.state, initialBoard);

    const redone = engine.redo();
    assert.deepEqual(redone.state, afterInsert);
  });

  it("06. [삭제 가역 명령] 중간 패널을 삭제한 뒤 undo 하면 원래 인덱스(index=1)와 모든 텍스트·태그·높이 속성이 손실 없이 복원된다", () => {
    const { initialBoard, engine } = createSampleEngine();
    const removedOriginal = initialBoard.panels[1]!;

    const afterRemove = engine.removePanel("panel-2", { label: "2컷 삭제" });
    assert.equal(afterRemove.panels.length, 2);
    assert.deepEqual(
      afterRemove.panels.map((p) => [p.id, p.order]),
      [
        ["panel-1", 0],
        ["panel-3", 1],
      ],
    );

    const undone = engine.undo();
    assert.deepEqual(undone.state, initialBoard);
    assert.deepEqual(undone.state.panels[1], removedOriginal);

    const redone = engine.redo();
    assert.deepEqual(redone.state, afterRemove);
  });

  it("07. [삭제 가역 명령] 첫 번째 및 마지막 패널을 연속 삭제한 뒤 역순으로 undo 하면 각 단계가 정확히 복구된다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const step1 = engine.removePanel("panel-1");
    assert.deepEqual(
      step1.panels.map((p) => [p.id, p.order]),
      [
        ["panel-2", 0],
        ["panel-3", 1],
      ],
    );

    const step2 = engine.removePanel("panel-3");
    assert.deepEqual(
      step2.panels.map((p) => [p.id, p.order]),
      [["panel-2", 0]],
    );

    assert.deepEqual(engine.undo().state, step1);
    assert.deepEqual(engine.undo().state, initialBoard);
  });

  it("08. [재정렬 가역 명령 - move-index] 앞에서 뒤로(0 -> 2) 패널 이동 후 undo/redo 시 순서와 order 인덱스가 정확히 복원된다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const movedState = engine.movePanel(0, 2, { label: "1컷을 맨 끝으로 이동" });
    assert.deepEqual(
      movedState.panels.map((p) => [p.id, p.order]),
      [
        ["panel-2", 0],
        ["panel-3", 1],
        ["panel-1", 2],
      ],
    );

    assert.deepEqual(engine.undo().state, initialBoard);
    assert.deepEqual(engine.redo().state, movedState);
  });

  it("09. [재정렬 가역 명령 - move-index] 뒤에서 앞으로(2 -> 0) 패널 이동 후 undo/redo 시 순서가 정확히 복원된다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const movedState = engine.movePanel(2, 0);
    assert.deepEqual(
      movedState.panels.map((p) => [p.id, p.order]),
      [
        ["panel-3", 0],
        ["panel-1", 1],
        ["panel-2", 2],
      ],
    );

    assert.deepEqual(engine.undo().state, initialBoard);
    assert.deepEqual(engine.redo().state, movedState);
  });

  it("10. [재정렬 가역 명령 - permutation] 전체 패널 ID 순열 재정렬 후 undo/redo 시 원래 순열로 정확히 복원된다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const permutedState = engine.reorderPanels(
      ["panel-3", "panel-2", "panel-1"],
      { label: "역순 재배치" },
    );

    assert.deepEqual(
      permutedState.panels.map((p) => [p.id, p.order]),
      [
        ["panel-3", 0],
        ["panel-2", 1],
        ["panel-1", 2],
      ],
    );

    assert.deepEqual(engine.undo().state, initialBoard);
    assert.deepEqual(engine.redo().state, permutedState);
  });

  it("11. [텍스트 수정 가역 명령 - 단일 필드] 특정 패널의 dialogue 단일 필드를 수정하고 undo/redo 하면 나머지 필드는 보존된 채 정확히 복원된다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const editedState = engine.editPanelText(
      "panel-2",
      "dialogue",
      "기다리고 있었어, 아리아.",
      { label: "2컷 대사 수정" },
    );

    assert.equal(editedState.panels[1]?.text.dialogue, "기다리고 있었어, 아리아.");
    assert.equal(editedState.panels[1]?.text.title, "2컷: 대면");
    assert.equal(editedState.panels[1]?.text.notes, "바스트 샷");

    assert.deepEqual(engine.undo().state, initialBoard);
    assert.deepEqual(engine.redo().state, editedState);
  });

  it("12. [텍스트 수정 가역 명령 - 다중 필드 패치] title, dialogue, caption, notes 여러 필드를 한 번에 패치하고 undo/redo 할 수 있다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const patchedState = engine.editPanelText(
      "panel-1",
      {
        title: "1컷: 폭풍 전야",
        dialogue: "모두 준비됐나?",
        caption: "서울 상공, 오전 5시 10분",
        notes: "초광각 버즈아이 뷰",
      },
      { label: "1컷 텍스트 전체 개고" },
    );

    assert.deepEqual(patchedState.panels[0]?.text, {
      title: "1컷: 폭풍 전야",
      dialogue: "모두 준비됐나?",
      caption: "서울 상공, 오전 5시 10분",
      notes: "초광각 버즈아이 뷰",
    });

    assert.deepEqual(engine.undo().state, initialBoard);
    assert.deepEqual(engine.redo().state, patchedState);
  });

  it("13. [Redo 초기화] Undo 수행 후 새로운 단일 명령을 실행하면 기존 Redo 스택이 즉시 초기화된다", () => {
    const { engine } = createSampleEngine();

    engine.editPanelText("panel-1", "dialogue", "첫 번째 수정");
    engine.editPanelText("panel-2", "dialogue", "두 번째 수정");
    engine.addPanel({ id: "panel-4", kind: "action" });

    assert.equal(engine.getUndoCount(), 3);
    assert.equal(engine.getRedoCount(), 0);

    // 2번 Undo -> Redo 스택에 2개 적재
    engine.undo();
    engine.undo();
    assert.equal(engine.getUndoCount(), 1);
    assert.equal(engine.getRedoCount(), 2);
    assert.equal(engine.canRedo(), true);

    // 새로운 편집 수행 -> Redo 스택이 0으로 초기화되어야 함
    engine.editPanelText("panel-3", "caption", "새로운 분기 캡션");
    assert.equal(engine.getUndoCount(), 2);
    assert.equal(engine.getRedoCount(), 0);
    assert.equal(engine.canRedo(), false);

    // Redo 호출 시 아무 변화도 없어야 함
    const noopRedo = engine.redo();
    assert.equal(noopRedo.changed, false);
  });

  it("14. [Redo 초기화] Undo 수행 후 새 트랜잭션을 커밋하면 기존 Redo 스택이 즉시 초기화된다", () => {
    const { engine } = createSampleEngine();

    engine.addPanel({ id: "panel-4", kind: "reveal" });
    engine.undo();
    assert.equal(engine.getRedoCount(), 1);

    engine.runTransaction("새 트랜잭션 분기", (tx) => {
      tx.editPanelText("panel-1", "title", "트랜잭션 내 제목 변경");
      tx.movePanel(0, 2);
    });

    assert.equal(engine.getUndoCount(), 1);
    assert.equal(engine.getRedoCount(), 0);
    assert.equal(engine.canRedo(), false);
  });

  it("15. [트랜잭션 그룹핑] 여러 명령(추가 + 텍스트 수정 + 재정렬 + 삭제)을 트랜잭션으로 묶으면 단 한 번의 undo/redo 로 전체가 원자적으로 전이된다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const summary = engine.runTransaction("장면 재구성 묶음 편집", (tx) => {
      tx.addPanel({
        id: "panel-4",
        kind: "reaction",
        text: { title: "4컷: 놀람", dialogue: "설마!" },
      });
      tx.editPanelText("panel-1", "dialogue", "트랜잭션 수정 대사");
      tx.movePanel(3, 1);
      tx.removePanel("panel-2");
    });

    assert.notEqual(summary, null);
    assert.equal(summary?.kind, "transaction");
    assert.equal(summary?.stepCount, 4);
    assert.equal(engine.getUndoCount(), 1);

    const committedState = engine.getState();
    assert.deepEqual(
      committedState.panels.map((p) => [p.id, p.order]),
      [
        ["panel-1", 0],
        ["panel-4", 1],
        ["panel-3", 2],
      ],
    );
    assert.equal(committedState.panels[0]?.text.dialogue, "트랜잭션 수정 대사");

    // 단일 Undo 로 4단계가 역순 실행되어 초기 보드로 정확히 복원되어야 함
    const undoResult = engine.undo();
    assert.equal(undoResult.changed, true);
    assert.deepEqual(undoResult.state, initialBoard);
    assert.equal(engine.getUndoCount(), 0);
    assert.equal(engine.getRedoCount(), 1);

    // 단일 Redo 로 4단계가 정방향 재실행되어 커밋 상태로 복원되어야 함
    const redoResult = engine.redo();
    assert.equal(redoResult.changed, true);
    assert.deepEqual(redoResult.state, committedState);
  });

  it("16. [트랜잭션 그룹핑 - 수동 롤백] beginTransaction 후 여러 편집을 수행하다가 rollbackTransaction 호출 시 시작 전 상태와 Redo 스택이 그대로 보존된다", () => {
    const { engine } = createSampleEngine();

    engine.editPanelText("panel-1", "dialogue", "사전 커밋 대사");
    engine.editPanelText("panel-2", "dialogue", "되돌릴 대사");
    engine.undo(); // undoCount=1, redoCount=1

    const stateBeforeTx = engine.getState();

    engine.beginTransaction("취소될 작업");
    engine.addPanel({ id: "panel-temp", kind: "setup" });
    engine.removePanel("panel-1");
    assert.equal(engine.getState().panels.some((p) => p.id === "panel-temp"), true);

    const rolledBack = engine.rollbackTransaction();
    assert.deepEqual(rolledBack, stateBeforeTx);
    assert.equal(engine.isTransactionActive(), false);
    assert.equal(engine.getUndoCount(), 1);
    assert.equal(engine.getRedoCount(), 1);
  });

  it("17. [트랜잭션 그룹핑 - 예외 발생 시 자동 롤백] runTransaction 도중 잘못된 명령이 실행되면 앞선 단계까지 모두 원자적으로 롤백된다", () => {
    const { initialBoard, engine } = createSampleEngine();

    assert.throws(
      () => {
        engine.runTransaction("실패할 복합 명령", (tx) => {
          tx.addPanel({ id: "panel-4", kind: "action" });
          tx.editPanelText("panel-1", "dialogue", "성공했던 앞 단계");
          // 존재하지 않는 패널 삭제 시도 -> 예외 발생
          tx.removePanel("panel-non-existent");
        });
      },
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "PANEL_NOT_FOUND",
    );

    assert.equal(engine.isTransactionActive(), false);
    assert.deepEqual(engine.getState(), initialBoard);
    assert.equal(engine.getUndoCount(), 0);
    assert.equal(engine.getRedoCount(), 0);
  });

  it("18. [트랜잭션 그룹핑 - 빈 트랜잭션] 명령 없이 commitTransaction 호출 시 히스토리 엔트리를 추가하지 않고 Redo 스택도 유지한다", () => {
    const { engine } = createSampleEngine();

    engine.addPanel({ id: "panel-4" });
    engine.undo();
    assert.equal(engine.getRedoCount(), 1);

    engine.beginTransaction("빈 트랜잭션");
    const summary = engine.commitTransaction();

    assert.equal(summary, null);
    assert.equal(engine.getUndoCount(), 0);
    assert.equal(engine.getRedoCount(), 1);
  });

  it("19. [히스토리 용량 제한] maxHistoryCapacity 초과 시 가장 오래된 Undo 엔트리부터 FIFO 로 퇴출되고 evictedCount 가 증가한다", () => {
    const { engine } = createSampleEngine(3);

    engine.editPanelText("panel-1", "dialogue", "편집 1");
    engine.editPanelText("panel-1", "dialogue", "편집 2");
    engine.editPanelText("panel-1", "dialogue", "편집 3");
    assert.equal(engine.getUndoCount(), 3);
    assert.equal(engine.getEvictedCount(), 0);

    engine.editPanelText("panel-1", "dialogue", "편집 4");
    engine.editPanelText("panel-1", "dialogue", "편집 5");

    assert.equal(engine.getUndoCount(), 3);
    assert.equal(engine.getEvictedCount(), 2);

    // 최대 3번만 Undo 가능하며 도달 상태는 "편집 2"가 적용된 상태여야 함
    engine.undo(); // -> 편집 4
    engine.undo(); // -> 편집 3
    const oldestAvailable = engine.undo(); // -> 편집 2
    assert.equal(oldestAvailable.state.panels[0]?.text.dialogue, "편집 2");
    assert.equal(engine.canUndo(), false);
  });

  it("20. [히스토리 용량 제한 - 동적 축소] setCapacity 로 용량을 줄이면 초과된 오래된 히스토리가 즉시 정리된다", () => {
    const { engine } = createSampleEngine(5);

    for (let i = 1; i <= 5; i += 1) {
      engine.editPanelText("panel-2", "caption", `캡션 ${i}`);
    }
    assert.equal(engine.getUndoCount(), 5);

    engine.setCapacity(2);
    assert.equal(engine.getCapacity(), 2);
    assert.equal(engine.getUndoCount(), 2);
    assert.equal(engine.getEvictedCount(), 3);

    engine.undo(); // -> 캡션 4
    const floorState = engine.undo(); // -> 캡션 3
    assert.equal(floorState.state.panels[1]?.text.caption, "캡션 3");
    assert.equal(engine.canUndo(), false);
  });

  it("21. [잘못된 명령 방어 - 중복 ID 및 잘못된 ID] 이미 존재하는 패널 ID 추가나 공백/특수문자 ID 사용 시 거부하고 기존 상태와 Redo 스택을 보호한다", () => {
    const { engine } = createSampleEngine();
    engine.editPanelText("panel-1", "title", "유효 편집");
    engine.undo();
    const snapshotBeforeError = engine.getState();
    assert.equal(engine.getRedoCount(), 1);

    // 중복 ID 추가 시도
    assert.throws(
      () => engine.addPanel({ id: "panel-1" }),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "DUPLICATE_PANEL_ID",
    );

    // 잘못된 ID 형식 추가 시도
    assert.throws(
      () => engine.addPanel({ id: "  invalid id! " }),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INVALID_PANEL_ID",
    );

    assert.deepEqual(engine.getState(), snapshotBeforeError);
    assert.equal(engine.getRedoCount(), 1);
  });

  it("22. [잘못된 명령 방어 - 추가 인덱스 범위 초과] 음수, 소수, 배열 길이 초과 인덱스로 패널 추가 시 INDEX_OUT_OF_RANGE 로 방어한다", () => {
    const { initialBoard, engine } = createSampleEngine();

    for (const badIndex of [-1, 4, 99, 1.5, Number.NaN]) {
      assert.throws(
        () => engine.addPanel({ id: "panel-new" }, { index: badIndex }),
        (err: unknown) =>
          err instanceof ToonCommandHistoryError && err.code === "INDEX_OUT_OF_RANGE",
      );
    }

    assert.deepEqual(engine.getState(), initialBoard);
    assert.equal(engine.getUndoCount(), 0);
  });

  it("23. [잘못된 명령 방어 - 없는 패널 삭제] 존재하지 않는 패널 ID 삭제 시 PANEL_NOT_FOUND 에러를 던지고 상태를 유지한다", () => {
    const { initialBoard, engine } = createSampleEngine();

    assert.throws(
      () => engine.removePanel("panel-ghost"),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "PANEL_NOT_FOUND",
    );

    assert.deepEqual(engine.getState(), initialBoard);
  });

  it("24. [잘못된 명령 방어 - 재정렬 인덱스 및 순열 오류] 범위를 벗어난 movePanel 이나 누락/중복/외부 ID가 포함된 reorderPanels 를 방어한다", () => {
    const { initialBoard, engine } = createSampleEngine();

    assert.throws(
      () => engine.movePanel(-1, 1),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INDEX_OUT_OF_RANGE",
    );
    assert.throws(
      () => engine.movePanel(0, 3),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INDEX_OUT_OF_RANGE",
    );

    // 중복 ID가 있는 잘못된 순열
    assert.throws(
      () => engine.reorderPanels(["panel-1", "panel-1", "panel-2"]),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "INVALID_REORDER_PERMUTATION",
    );

    // 개수가 맞지 않는 순열
    assert.throws(
      () => engine.reorderPanels(["panel-1", "panel-2"]),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "INVALID_REORDER_PERMUTATION",
    );

    // 알 수 없는 패널 ID가 섞인 순열
    assert.throws(
      () => engine.reorderPanels(["panel-1", "panel-2", "panel-unknown"]),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "INVALID_REORDER_PERMUTATION",
    );

    assert.deepEqual(engine.getState(), initialBoard);
  });

  it("25. [잘못된 명령 방어 - 텍스트 수정 오류] 없는 패널, 허용되지 않은 텍스트 필드, 빈 패치 객체, 비문자열 값을 모두 방어한다", () => {
    const { initialBoard, engine } = createSampleEngine();

    // 없는 패널 텍스트 수정
    assert.throws(
      () => engine.editPanelText("panel-missing", "dialogue", "안녕"),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "PANEL_NOT_FOUND",
    );

    // 빈 패치 객체
    assert.throws(
      () => engine.editPanelText("panel-1", {}),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INVALID_TEXT_FIELD",
    );

    // 잘못된 필드 이름 런타임 주입
    assert.throws(
      () =>
        engine.execute({
          type: "panel.edit-text",
          panelId: "panel-1",
          field: "unknownField" as "dialogue",
          nextValue: "값",
        }),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INVALID_TEXT_FIELD",
    );

    // 비문자열 값 런타임 주입
    assert.throws(
      () =>
        engine.execute({
          type: "panel.edit-text",
          panelId: "panel-1",
          field: "dialogue",
          nextValue: 12345 as unknown as string,
        }),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INVALID_TEXT_VALUE",
    );

    assert.deepEqual(engine.getState(), initialBoard);
  });

  it("26. [잘못된 명령 방어 - 알 수 없는 명령 및 잘못된 패널 속성] 정의되지 않은 명령 type 이나 잘못된 높이/태그 입력을 방어한다", () => {
    const { initialBoard, engine } = createSampleEngine();

    assert.throws(
      () =>
        engine.execute({
          type: "panel.explode" as "panel.remove",
          panelId: "panel-1",
        }),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INVALID_COMMAND_SHAPE",
    );

    assert.throws(
      () =>
        engine.addPanel({
          id: "panel-bad-height",
          estimatedHeightPx: -200,
        }),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INVALID_PANEL_DRAFT",
    );

    assert.throws(
      () =>
        engine.addPanel({
          id: "panel-bad-kind",
          kind: "invalid-kind" as "action",
        }),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INVALID_PANEL_DRAFT",
    );

    assert.deepEqual(engine.getState(), initialBoard);
  });

  it("27. [트랜잭션 상태 방어] 중첩 beginTransaction, 비활성 상태의 commit/rollback, 트랜잭션 중 undo/redo/clearHistory 호출을 모두 차단한다", () => {
    const { engine } = createSampleEngine();

    // 트랜잭션이 없을 때 commit / rollback 호출 차단
    assert.throws(
      () => engine.commitTransaction(),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "TRANSACTION_NOT_ACTIVE",
    );
    assert.throws(
      () => engine.rollbackTransaction(),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "TRANSACTION_NOT_ACTIVE",
    );

    engine.beginTransaction("진행 중 트랜잭션");

    // 중첩 트랜잭션 시작 차단
    assert.throws(
      () => engine.beginTransaction("중첩 트랜잭션"),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "TRANSACTION_ALREADY_ACTIVE",
    );

    // 트랜잭션 중 undo / redo / clearHistory 차단
    assert.throws(
      () => engine.undo(),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "TRANSACTION_ALREADY_ACTIVE",
    );
    assert.throws(
      () => engine.redo(),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "TRANSACTION_ALREADY_ACTIVE",
    );
    assert.throws(
      () => engine.clearHistory(),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError &&
        err.code === "TRANSACTION_ALREADY_ACTIVE",
    );

    engine.rollbackTransaction();
    assert.equal(engine.isTransactionActive(), false);
  });

  it("28. [빈 스택 경계 동작] 히스토리가 비어 있을 때 undo() 와 redo() 는 예외 없이 changed=false 와 현재 불변 상태를 반환한다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const u = engine.undo();
    assert.equal(u.changed, false);
    assert.equal(u.entry, null);
    assert.deepEqual(u.state, initialBoard);

    const r = engine.redo();
    assert.equal(r.changed, false);
    assert.equal(r.entry, null);
    assert.deepEqual(r.state, initialBoard);
  });

  it("29. [용량 설정 방어] 0 이하이거나 정수가 아닌 maxHistoryCapacity 는 생성자 및 setCapacity 에서 INVALID_CAPACITY 에러로 거부한다", () => {
    const board = createVirtualPanelBoard(createSampleSeed());

    for (const badCap of [0, -5, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => new ToonPanelCommandHistoryEngine(board, { maxHistoryCapacity: badCap }),
        (err: unknown) =>
          err instanceof ToonCommandHistoryError && err.code === "INVALID_CAPACITY",
      );
    }

    const engine = new ToonPanelCommandHistoryEngine(board, { maxHistoryCapacity: 10 });
    assert.throws(
      () => engine.setCapacity(0),
      (err: unknown) =>
        err instanceof ToonCommandHistoryError && err.code === "INVALID_CAPACITY",
    );
    assert.equal(engine.getCapacity(), 10);
  });

  it("30. [히스토리 메타데이터 요약 및 불변성] getUndoHistory 및 getRedoHistory 가 정확한 명령 요약과 불변 스냅샷을 반환한다", () => {
    const { engine } = createSampleEngine();

    engine.addPanel({ id: "panel-4", kind: "reveal" }, { label: "4컷 추가" });
    engine.runTransaction("2·3컷 대사 일괄 정비", (tx) => {
      tx.editPanelText("panel-2", "dialogue", "수정 대사 2");
      tx.editPanelText("panel-3", "dialogue", "수정 대사 3");
    });

    const undoList = engine.getUndoHistory();
    assert.equal(undoList.length, 2);
    assert.equal(undoList[0]?.kind, "atomic");
    assert.equal(undoList[0]?.label, "4컷 추가");
    assert.deepEqual(undoList[0]?.targetPanelIds, ["panel-4"]);

    assert.equal(undoList[1]?.kind, "transaction");
    assert.equal(undoList[1]?.label, "2·3컷 대사 일괄 정비");
    assert.equal(undoList[1]?.stepCount, 2);
    assert.deepEqual(undoList[1]?.targetPanelIds, ["panel-2", "panel-3"]);

    // 반환된 히스토리 배열 변조 시 TypeError 발생 확인
    assert.throws(() => {
      (undoList as unknown[]).pop();
    }, TypeError);

    engine.undo();
    const redoList = engine.getRedoHistory();
    assert.equal(redoList.length, 1);
    assert.equal(redoList[0]?.label, "2·3컷 대사 일괄 정비");
  });

  it("31. [순수 명령 실행기 및 clearHistory 검증] applyPanelEditCommand 직접 호출과 clearHistory 호출이 의도대로 작동한다", () => {
    const { initialBoard, engine } = createSampleEngine();

    const directResult = applyPanelEditCommand(initialBoard, {
      type: "panel.edit-text",
      panelId: "panel-1",
      field: "caption",
      nextValue: "직접 호출 캡션",
    });

    assert.equal(directResult.nextState.panels[0]?.text.caption, "직접 호출 캡션");
    assert.equal(initialBoard.panels[0]?.text.caption, "서울 북부, 오전 5시");

    engine.editPanelText("panel-1", "caption", "엔진 캡션");
    assert.equal(engine.getUndoCount(), 1);
    engine.clearHistory();
    assert.equal(engine.getUndoCount(), 0);
    assert.equal(engine.getRedoCount(), 0);
    assert.equal(engine.getState().panels[0]?.text.caption, "엔진 캡션");
  });

  it("32. [복합 다단계 시나리오 왕복 검증] 10단계의 연속 편집·트랜잭션 수행 후 전 구간 Undo 및 전 구간 Redo 시 모든 중간 상태가 100% 일치한다", () => {
    const { initialBoard, engine } = createSampleEngine();
    const checkpoints: VirtualPanelBoardState[] = [initialBoard];

    checkpoints.push(
      engine.addPanel({
        id: "panel-4",
        kind: "reaction",
        text: { title: "4컷", dialogue: "반응 1" },
      }),
    );
    checkpoints.push(engine.editPanelText("panel-1", "dialogue", "대사 변경 A"));
    checkpoints.push(engine.movePanel(3, 0));

    engine.runTransaction("복합 편집 T1", (tx) => {
      tx.addPanel({ id: "panel-5", kind: "reveal" }, { index: 2 });
      tx.editPanelText("panel-2", {
        dialogue: "복합 대사",
        notes: "복합 연출 노트",
      });
      tx.reorderPanels(["panel-2", "panel-5", "panel-4", "panel-1", "panel-3"]);
    });
    checkpoints.push(engine.getState());

    checkpoints.push(engine.removePanel("panel-3"));
    checkpoints.push(engine.editPanelText("panel-5", "caption", "마지막 강조"));

    assert.equal(engine.getUndoCount(), 6);

    // 역순으로 끝까지 Undo 하며 모든 체크포인트와 정확히 일치하는지 검증
    for (let idx = checkpoints.length - 2; idx >= 0; idx -= 1) {
      const res = engine.undo();
      assert.equal(res.changed, true);
      assert.deepEqual(res.state, checkpoints[idx]);
    }
    assert.deepEqual(engine.getState(), engine.getInitialState());

    // 정방향으로 끝까지 Redo 하며 모든 체크포인트와 정확히 일치하는지 검증
    for (let idx = 1; idx < checkpoints.length; idx += 1) {
      const res = engine.redo();
      assert.equal(res.changed, true);
      assert.deepEqual(res.state, checkpoints[idx]);
    }
  });
});
