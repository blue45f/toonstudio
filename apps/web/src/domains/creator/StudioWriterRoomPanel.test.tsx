// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyStudioWriterRoomDocument,
  STUDIO_WRITER_ROOM_LIMITS,
  type StudioWriterRoomDocument,
} from "./studio-writer-room";
import {
  StudioWriterRoomCollectionHeader,
  StudioWriterRoomPanel,
} from "./StudioWriterRoomPanel";

const admitStageMock = vi.hoisted(() => vi.fn());

vi.mock("./studio-writer-room", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-writer-room")>();
  return { ...actual, admitStudioWriterRoomStage: admitStageMock };
});

function renderPanel(document: StudioWriterRoomDocument, onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <StudioWriterRoomPanel
        open
        onClose={vi.fn()}
        document={document}
        onChange={onChange}
        characters={[]}
      />
    ),
  };
}

beforeEach(() => admitStageMock.mockReset());
afterEach(cleanup);

describe("StudioWriterRoomPanel byte admission", () => {
  it("consumes a rejected stage receipt, keeps the document, and exposes the byte error", () => {
    const document = createEmptyStudioWriterRoomDocument();
    admitStageMock.mockImplementation((current: StudioWriterRoomDocument) => ({
      kind: "rejected",
      reason: "byte-budget-exceeded",
      document: current,
      serializedBytes: 100,
      maximumSerializedBytes: STUDIO_WRITER_ROOM_LIMITS.maxSerializedBytes,
    }));
    const { onChange } = renderPanel(document);

    const premise = globalThis.document.getElementById("writer-room-premise-text");
    expect(premise).not.toBeNull();
    fireEvent.change(premise as HTMLTextAreaElement, {
      target: { value: "새 기획" },
    });

    expect(admitStageMock).toHaveBeenCalledWith(document, "premise", {
      text: "새 기획",
      characterIds: [],
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "2,000,000바이트 저장 예산을 초과해 변경하지 않았어요."
    );
  });

  it("shows a count without a finite denominator and keeps add enabled past 500 items", () => {
    render(
      <StudioWriterRoomCollectionHeader
        title="비트"
        description="테스트"
        count={501}
        onAdd={vi.fn()}
        addLabel="비트 추가"
      />
    );

    expect(screen.getByText("501개")).toBeTruthy();
    expect(screen.queryByText("501/500")).toBeNull();
    expect(screen.getByRole("button", { name: "비트 추가" }).hasAttribute("disabled"))
      .toBe(false);
  });
});

describe("StudioWriterRoomPanel 소설에서 가져오기", () => {
  it("소설 텍스트를 변환해 작가실 문서의 장면·대사로 반영한다", () => {
    const document = createEmptyStudioWriterRoomDocument();
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <StudioWriterRoomPanel
          open
          onClose={vi.fn()}
          document={document}
          onChange={onChange}
          characters={[
            {
              id: "char-minjun",
              name: "민준",
              role: "",
              appearance: "",
              costume: "",
              colors: [],
              voice: "",
              goal: "",
              relationships: [],
              props: [],
              lockedFields: [],
            },
          ]}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "소설에서 가져오기" }));
    fireEvent.change(screen.getByLabelText("소설 원고"), {
      target: { value: '민준이 말했다. "오늘은 여기까지 하자."' },
    });
    fireEvent.click(screen.getByRole("button", { name: "글콘티 초안으로 변환" }));
    fireEvent.click(screen.getByRole("button", { name: "작가실에 반영하기" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const applied = onChange.mock.calls[0]?.[0] as StudioWriterRoomDocument;
    expect(applied.stages.scenes.items).toHaveLength(1);
    expect(applied.stages["dialogue-sfx"].dialogue[0]?.characterId).toBe("char-minjun");
  });
});
