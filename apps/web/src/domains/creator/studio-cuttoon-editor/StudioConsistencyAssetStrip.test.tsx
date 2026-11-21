// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioConsistencyAssetStrip,
  type ConsistencyAssetSlot,
  type ExternalProjectAssetCatalog,
} from "./StudioConsistencyAssetStrip";

afterEach(() => cleanup());

const INITIAL_SLOTS: readonly ConsistencyAssetSlot[] = [
  {
    id: "slot-char-1",
    category: "character",
    name: "서연",
    imageRef: "data:image/png;base64,AAA",
    pinnedCutIds: ["cut-1"],
  },
  {
    id: "slot-bg-1",
    category: "background",
    name: "학교 옥상",
    imageRef: undefined,
    pinnedCutIds: [],
  },
  {
    id: "slot-prop-1",
    category: "prop",
    name: "빨간 우산",
    imageRef: undefined,
    pinnedCutIds: [],
  },
];

const EXTERNAL_PROJECTS: readonly ExternalProjectAssetCatalog[] = [
  {
    projectId: "proj-prev",
    projectTitle: "1화 파일럿",
    slots: [
      {
        id: "ext-1",
        category: "character",
        name: "서연",
        imageRef: "data:image/png;base64,EXT_SEOYEON",
        pinnedCutIds: [],
      },
      {
        id: "ext-2",
        category: "background",
        name: "학교  옥상",
        imageRef: "data:image/png;base64,EXT_ROOFTOP",
        styleNotes: "노을빛 역광",
        pinnedCutIds: [],
      },
      {
        id: "ext-3",
        category: "prop",
        name: "빨간우산",
        imageRef: "data:image/png;base64,EXT_UMBRELLA",
        pinnedCutIds: [],
      },
    ],
  },
];

function StatefulStrip({
  initial = INITIAL_SLOTS,
  onRequestImagePick,
}: {
  readonly initial?: readonly ConsistencyAssetSlot[];
  readonly onRequestImagePick?: (slotId: string) => void;
}): ReactElement {
  const [slots, setSlots] = useState<readonly ConsistencyAssetSlot[]>(initial);
  return (
    <StudioConsistencyAssetStrip
      slots={slots}
      activeCutId="cut-1"
      externalProjects={EXTERNAL_PROJECTS}
      onChangeSlots={setSlots}
      onRequestImagePick={onRequestImagePick}
    />
  );
}

describe("StudioConsistencyAssetStrip", () => {
  it("3분류(인물/배경/소품) 필터와 컷 참조 토글 및 새 슬롯 추가를 지원한다", () => {
    render(<StatefulStrip />);

    expect(screen.getByText("소재 1 참조")).toBeTruthy();

    // 배경 탭 필터
    fireEvent.click(screen.getByRole("tab", { name: /배경/ }));
    expect(screen.getByText("학교 옥상")).toBeTruthy();
    expect(screen.queryByText("서연")).toBeNull();

    // 현재 컷 참조 토글
    fireEvent.click(screen.getByRole("button", { name: "이 컷에 참조" }));
    expect(screen.getByText("소재 2 참조")).toBeTruthy();

    // 새 슬롯 추가
    fireEvent.click(screen.getByRole("tab", { name: /전체/ }));
    fireEvent.change(screen.getByLabelText("새 소재 이름"), {
      target: { value: "도서관 복도" },
    });
    fireEvent.click(screen.getByRole("button", { name: "슬롯 추가" }));
    expect(screen.getByText("도서관 복도")).toBeTruthy();
  });

  it("2단계 X 삭제: 1차 클릭은 이미지만 비워 빈 슬롯(+)으로 전환하고, 2차 클릭은 슬롯을 삭제하며 Undo로 복구한다", () => {
    const onRequestImagePick = vi.fn();
    render(<StatefulStrip onRequestImagePick={onRequestImagePick} />);

    // 1차 X: 채워진 슬롯 '서연'의 이미지만 제거
    const clearBtn = screen.getByRole("button", { name: "서연 이미지 비우기" });
    expect(clearBtn.getAttribute("data-remove-stage")).toBe("clear-image");
    fireEvent.click(clearBtn);

    // 슬롯은 살아있고 빈 슬롯(+) 채우기 버튼으로 바뀐다.
    expect(screen.getByText("서연")).toBeTruthy();
    const fillBtn = screen.getByRole("button", { name: "서연 이미지 채우기" });
    fireEvent.click(fillBtn);
    expect(onRequestImagePick).toHaveBeenCalledWith("slot-char-1");

    // 2차 X: 빈 슬롯 자체를 삭제
    const deleteBtn = screen.getByRole("button", { name: "서연 슬롯 삭제" });
    expect(deleteBtn.getAttribute("data-remove-stage")).toBe("delete-slot");
    fireEvent.click(deleteBtn);

    expect(screen.queryByText("서연")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("슬롯을 삭제했어요");

    // 되돌리기(Undo)로 삭제 직전 상태 복구
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(screen.getByText("서연")).toBeTruthy();
  });

  it("타 프로젝트 이름 기준 자동 매칭 가져오기 시 공백을 정규화해 빈 슬롯을 우선 채우고 Undo를 지원한다", () => {
    render(<StatefulStrip />);

    fireEvent.click(screen.getByRole("button", { name: "타 프로젝트 매칭 가져오기" }));

    // '서연'은 이미 채워져 있어 기본(비파괴) 모드에서는 빈 슬롯 2개('학교 옥상', '빨간 우산')만 매칭
    const importBtn = screen.getByRole("button", { name: "이름 일치 2건 가져오기" });
    fireEvent.click(importBtn);

    expect(screen.getByAltText("학교 옥상 참조 이미지").getAttribute("src")).toBe(
      "data:image/png;base64,EXT_ROOFTOP",
    );
    expect(screen.getByAltText("빨간 우산 참조 이미지").getAttribute("src")).toBe(
      "data:image/png;base64,EXT_UMBRELLA",
    );
    // 기존 '서연' 이미지는 보존됨
    expect(screen.getByAltText("서연 참조 이미지").getAttribute("src")).toBe(
      "data:image/png;base64,AAA",
    );

    // Undo로 일괄 가져오기 되돌리기
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(screen.queryByAltText("학교 옥상 참조 이미지")).toBeNull();
  });
});
