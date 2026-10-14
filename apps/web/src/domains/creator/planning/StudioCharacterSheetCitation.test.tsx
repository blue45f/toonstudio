import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import type { StudioStoryBible } from "../studio-story-bible";
import { StudioCharacterSheetCitation } from "./StudioCharacterSheetCitation";
import type { StudioStoryBibleNarrative } from "./studio-character-profile";

const bible: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    { id: "hero", name: "민서", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "newcomer", name: "새 인물", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [],
  facts: [],
};

const narrative: StudioStoryBibleNarrative = {
  profiles: [
    {
      characterId: "hero",
      personality: "",
      speechStyle: "존댓말, 말이 짧다",
      background: "",
      motivation: "",
      signatureLines: ["제가 할게요."],
      appearanceNotes: "후드를 자주 뒤집어쓴다",
    },
  ],
  relations: [],
};

describe("StudioCharacterSheetCitation", () => {
  it("고른 캐릭터의 말투·대표 대사·외형 메모를 인용 표시한다", () => {
    render(
      <StudioCharacterSheetCitation bible={bible} narrative={narrative} characterIds={["hero"]} />,
    );
    expect(screen.getByRole("heading", { name: "민서" })).toBeTruthy();
    expect(screen.getByText(/말투: 존댓말, 말이 짧다/)).toBeTruthy();
    expect(screen.getByText("제가 할게요.")).toBeTruthy();
    expect(screen.getByText(/외형 메모: 후드를 자주 뒤집어쓴다/)).toBeTruthy();
  });

  it("시트가 비어 있는 캐릭터만 있으면 인용 대신 쓰기 유도를 보인다", () => {
    render(
      <StudioCharacterSheetCitation bible={bible} narrative={narrative} characterIds={["newcomer"]} />,
    );
    expect(screen.getByText(/시트가 비어 있어요/)).toBeTruthy();
    expect(screen.queryByText(/말투:/)).toBeNull();
  });

  it("캐릭터가 없거나 전부 모르는 id면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <StudioCharacterSheetCitation bible={bible} narrative={narrative} characterIds={["ghost"]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
