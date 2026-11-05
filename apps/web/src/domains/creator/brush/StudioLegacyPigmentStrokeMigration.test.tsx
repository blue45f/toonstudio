// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioLegacyPigmentStrokeMigration, type StudioLegacyPigmentStrokeMigrationProps } from "./StudioLegacyPigmentStrokeMigration";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "../brush-lab/brush-studio-v6-material-receipt";
import { requiresLegacyMixboxStrokeMigration } from "../brush-lab/brush-studio-v6-legacy-pigment";
import { downloadBlob } from "../export/studio-export";
import type { DrawEl, El } from "../studio-element-model";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { PageState } from "../studio-page-state";
import { restoreLegacyPigmentArchivedStroke } from "./studio-legacy-pigment-stroke-migration";

vi.mock("../export/studio-export", () => ({ downloadBlob: vi.fn() }));

function fixture() {
  const program = { ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full" as const };
  const material = createBrushStudioV6MaterialReceipt(program);
  const source: DrawEl = { id: "original", type: "draw", points: [10, 20, 50, 60], stroke: "#ffff00", strokeWidth: 20,
    brushEnginePrograms: { version: 1, material: { ...material, runtime: { ...material.runtime, bindings: material.runtime.bindings.map((binding) => binding.nodeIds.includes("pigment-mixbox")
      ? { providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial", execution: "native", nodeIds: ["pigment-mixbox"] } : binding) } } } };
  const captureTicket = vi.fn(() => ({ authScopeKey: "owner", workId: "work", accessGeneration: 1, documentGeneration: 2 }));
  const canApply = vi.fn((_ticket: StudioEditorMutationTicket) => true);
  const commit = vi.fn((_elements: El[], _extraPatch: Pick<PageState, "groups" | "animTimeline">, _pageId: string) => true);
  const props: StudioLegacyPigmentStrokeMigrationProps = { elements: [source], groups: [], pageId: "page", historyIndex: 3,
    currentPageIdRef: { current: "page" }, pagesHiRef: { current: 3 }, blocked: false, captureTicket, canApply, commit };
  return { props, source, captureTicket, canApply, commit };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("원고의 이전 혼색 사본 UI", () => {
  it("원래 활성 ID의 타임라인과 보관 그룹을 획 전환과 같은 commit에 보존한다", () => {
    const f = fixture(); const animTimeline = { fps: 12, frameCount: 24, tracks: { [f.source.id]: [] } };
    const before = structuredClone(animTimeline);
    render(<StudioLegacyPigmentStrokeMigration {...f.props} animTimeline={animTimeline} />);
    fireEvent.click(screen.getByRole("button", { name: "원본 보존·자체 혼색 사본 만들기" }));
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.commit.mock.calls[0]?.[1].animTimeline).toBe(animTimeline);
    expect(animTimeline).toEqual(before);
    expect(f.commit.mock.calls[0]?.[0].filter((element) => !element.hidden).map((element) => element.id)).toEqual([f.source.id]);
  });

  it("확인 전에는 쓰지 않고 명시 선택 후 원본 숨김·새 사본을 한 commit으로 저장한다", () => {
    const f = fixture(); const raw = JSON.stringify(f.source);
    render(<StudioLegacyPigmentStrokeMigration {...f.props} />);
    expect(screen.getByRole("region", { name: "이전 혼색 획 확인" })).toBeTruthy();
    expect(screen.getByText(/색이 달라질 수 있습니다/u)).toBeTruthy();
    expect(screen.getByText(/레이어 위치·클리핑·애니메이션은 유지/u)).toBeTruthy();
    expect(f.commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "원본 보존·자체 혼색 사본 만들기" }));
    expect(f.commit).toHaveBeenCalledTimes(1);
    const elements = f.commit.mock.calls[0]?.[0];
    const archive = elements?.[0];
    if (archive?.type !== "draw") throw new Error("원본 보관본이 없습니다.");
    expect(restoreLegacyPigmentArchivedStroke(archive)).toEqual({ element: f.source, sourceIndex: 0 });
    const copy = elements?.[1];
    expect(copy?.id).toBe(f.source.id);
    if (copy?.type !== "draw") throw new Error("자체 획 사본이 없습니다.");
    expect(requiresLegacyMixboxStrokeMigration(copy.brushEnginePrograms?.material)).toBe(false);
    expect(f.commit.mock.calls[0]?.[1].groups?.find((group) => group.id === archive.groupId)).toMatchObject({ hidden: true });
    expect(JSON.stringify(f.source)).toBe(raw);
  });

  it.each(["page", "history", "authority", "recheck", "commit", "locked"] as const)("%s 변경·거부는 원본을 덮어쓰지 않는다", (changed) => {
    const f = fixture();
    const props = changed === "locked" ? { ...f.props, blocked: true } : f.props;
    render(<StudioLegacyPigmentStrokeMigration {...props} />);
    if (changed === "page") f.props.currentPageIdRef.current = "other-page";
    if (changed === "history") f.props.pagesHiRef.current = 4;
    if (changed === "authority") f.canApply.mockReturnValue(false);
    if (changed === "recheck") f.canApply.mockReturnValueOnce(true).mockReturnValueOnce(false);
    if (changed === "commit") f.commit.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "원본 보존·자체 혼색 사본 만들기" }));
    if (changed !== "commit") expect(f.commit).not.toHaveBeenCalled();
    expect(f.source.hidden).toBeUndefined();
    expect(requiresLegacyMixboxStrokeMigration(f.source.brushEnginePrograms?.material)).toBe(true);
    if (changed !== "locked") expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("표시 뒤 원격 revision이 바뀌면 표시 당시 ticket으로 검사한다", () => {
    const f = fixture();
    render(<StudioLegacyPigmentStrokeMigration {...f.props} />);
    f.captureTicket.mockReturnValue({ authScopeKey: "owner", workId: "work", accessGeneration: 1, documentGeneration: 3 });
    f.canApply.mockImplementation((ticket) => ticket.documentGeneration === 3);
    fireEvent.click(screen.getByRole("button", { name: "원본 보존·자체 혼색 사본 만들기" }));
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.canApply).not.toHaveBeenCalled();
  });

  it("계정·문서 세대가 달라지면 화면에 남은 예전 원본을 다운로드하지 않는다", () => {
    const f = fixture();
    vi.mocked(downloadBlob).mockClear();
    render(<StudioLegacyPigmentStrokeMigration {...f.props} />);
    f.captureTicket.mockReturnValue({ authScopeKey: "other-user", workId: "work", accessGeneration: 2, documentGeneration: 2 });
    fireEvent.click(screen.getByRole("button", { name: "원본 파일 내려받기" }));
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("현재 읽기 전용 페이지에서도 원본 파일만 받을 수 있고 원고를 쓰지 않는다", () => {
    const f = fixture();
    vi.mocked(downloadBlob).mockClear();
    render(<StudioLegacyPigmentStrokeMigration {...f.props} blocked />);
    fireEvent.click(screen.getByRole("button", { name: "원본 파일 내려받기" }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "toonstudio-original-pigment-strokes.json");
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("마스터 원본은 먼저 마스터 편집으로 안내하며 페이지에 적용하지 않는다", () => {
    const f = fixture(); const openMaster = vi.fn();
    render(<StudioLegacyPigmentStrokeMigration {...f.props} masterConfirmationRequired onReviewMaster={openMaster} />);
    expect(screen.queryByRole("button", { name: "원본 보존·자체 혼색 사본 만들기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "마스터 편집에서 확인" }));
    expect(openMaster).toHaveBeenCalledTimes(1);
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("마스터 편집의 기존 히스토리 제한을 페이지 undo처럼 설명하지 않는다", () => {
    const f = fixture();
    render(<StudioLegacyPigmentStrokeMigration {...f.props} masterEditMode />);
    expect(screen.getByText(/마스터 변경은 실행 취소 기록에 포함되지 않으며/u)).toBeTruthy();
    expect(screen.queryByText(/한 번의 실행 취소로 전환 전체를/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "원본 보존·자체 혼색 사본 만들기" }));
    expect(f.commit.mock.calls[0]?.[1].groups).toEqual([]);
    expect(f.commit.mock.calls[0]?.[0][0]).toMatchObject({ hidden: true });
    expect(Object.hasOwn(f.commit.mock.calls[0]?.[0][0] ?? {}, "groupId")).toBe(false);
  });
});
