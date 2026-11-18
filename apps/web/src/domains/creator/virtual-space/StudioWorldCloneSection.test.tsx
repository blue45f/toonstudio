// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioWorldCloneSection } from "./StudioWorldCloneSection";
import { buildCloneLink, createSpaceSnapshot } from "./studio-virtual-space-clone";
import { createTileEffect } from "./studio-virtual-space-tile-effects";
import { readStudioTileEffects, writeStudioTileEffects } from "./studio-virtual-space-tile-effects-storage";
import { DEFAULT_STUDIO_WORLD_MANIFEST as initial } from "./studio-virtual-space-world-manifest";
import { readStudioWorldAuthoringDraft, readStudioWorldAuthoringDraftRecord, writeStudioWorldAuthoringDraft } from "./studio-world-draft-storage";

const project = "drawing-room";
const scope = JSON.stringify([project, "floor-1", true]);
const otherScope = JSON.stringify([project, "floor-2", true]);
const nextWorld = { ...initial, id: "restored-floor" };
const result = createTileEffect({ kind: "spawn", id: "entry", name: "입구", tileX: 0, tileY: 0, width: 2, height: 2 });
if (!result.ok) throw new Error("invalid test tile");
const effects = [result.effect];
const incoming = buildCloneLink("https://example.org/", createSpaceSnapshot(nextWorld, { name: "편집실" }, new Date(), { tileEffects: effects }));

function Session({ fragment = incoming }: { fragment?: string }) {
  const [world, setWorld] = useState(() => readStudioWorldAuthoringDraft(project) ?? initial);
  const [tiles, setTiles] = useState(() => readStudioTileEffects(scope));
  return <>
    <span data-testid="world">{world.id}/{tiles.length}</span>
    <StudioWorldCloneSection projectId={project} manifest={world} basePublishedRevisionId="published-2" onChange={setWorld}
      clone={{ scope, effects: tiles, onLoad: setTiles, expanded: true, incoming: fragment }} />
  </>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
describe("공간 복제 세션", () => {
  it("수신한 공간과 타일을 한 번에 저장하고 저장 실패 후 재시도와 새 세션 복원을 지원한다", () => {
    render(<Session />);
    expect(screen.getByRole("button", { name: "이 구성 적용" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new DOMException("quota"); });
    fireEvent.click(screen.getByRole("button", { name: "이 구성 적용" }));
    expect(screen.getByRole("status").textContent).toContain("초안을 저장하지 못했습니다");
    expect(screen.getByTestId("world").textContent).toBe(initial.id + "/0");
    expect(readStudioWorldAuthoringDraft(project)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이 구성 적용" }));
    expect(write).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("world").textContent).toBe("restored-floor/1");
    expect(readStudioWorldAuthoringDraftRecord(project)?.basePublishedRevisionId).toBe("published-2");
    expect(readStudioTileEffects(otherScope)).toEqual([]);
    cleanup();
    render(<Session fragment="" />);
    expect(screen.getByTestId("world").textContent).toBe("restored-floor/1");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(writeStudioWorldAuthoringDraft(project, { ...nextWorld, id: "renamed" }, "published-2")).toBe(true);
    expect(readStudioTileEffects(scope)).toEqual(effects);
    expect(writeStudioTileEffects([], scope)).toBe(true);
    expect(readStudioTileEffects(scope)).toEqual([]);
    expect(readStudioWorldAuthoringDraft(project)?.id).toBe("renamed");
  });

  it("검토 중인 링크를 수정하면 이전 확인을 취소한다", () => {
    render(<Session />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("복제 링크 붙여넣기"), { target: { value: "다른 링크" } });
    expect(screen.queryByRole("button", { name: "이 구성 적용" })).toBeNull();
    expect(readStudioWorldAuthoringDraft(project)).toBeNull();
  });
});
