// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORYWORLD_DRAFT_NAMESPACE } from "./draft-store";
import { plausibilitySummaryStorageKey } from "./plausibility/studio-story-plausibility-summary";
import { StudioStoryworldLabPage } from "./StudioStoryworldLabPage";

const db = vi.hoisted(() => ({ rows: new Map<string, string>(), kvGet: vi.fn(), kvSet: vi.fn() }));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => db }));

const labKey = (id: string) => `toonspectrum:storyworld-lab:v1:work:${id}`;
const row = (key: string) => db.rows.get(`${STORYWORLD_DRAFT_NAMESPACE}:${key}`);

function envelopeOf(key: string): unknown {
  const raw = row(key);
  return raw === undefined ? null : JSON.parse(raw);
}

function page(workId: string | null, initialView?: "plausibility") {
  return (
    <MemoryRouter>
      <StudioStoryworldLabPage initialView={initialView ?? null} remixSourceWorkId={null} workId={workId} />
    </MemoryRouter>
  );
}

const KNOWLEDGE = "아직 모르는 일을 아는 것처럼 행동해요";

beforeEach(() => {
  db.rows.clear();
  window.localStorage.clear();
  db.kvGet.mockReset().mockImplementation(async (namespace: string, id: string) => db.rows.get(`${namespace}:${id}`) ?? null);
  db.kvSet.mockReset().mockImplementation(async (namespace: string, id: string, value: string) => { db.rows.set(`${namespace}:${id}`, value); });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("스토리월드 랩: 개연성 점검 탭", () => {
  it("개연성 점검이 탭 목록의 맨 앞에 있고, 주소에 view가 없으면 대시보드로 시작한다", async () => {
    render(page("work-1"));
    const nav = await screen.findByRole("navigation", { name: "스토리월드 랩 섹션" });
    const labels = within(nav).getAllByRole("button").map((button) => button.textContent ?? "");
    expect(labels[0]).toContain("개연성 점검");
    expect(labels[1]).toContain("대시보드");
    expect(screen.getByRole("heading", { level: 1, name: "대시보드" })).toBeTruthy();
  });

  it("?view=plausibility 로 들어오면 허브가 바로 열린다", async () => {
    render(page("work-1", "plausibility"));
    expect(await screen.findByRole("heading", { level: 1, name: "개연성 점검" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "점검 범위" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "스토리월드 랩 섹션" });
    expect(within(nav).getByRole("button", { name: /개연성 점검/u }).getAttribute("aria-current")).toBe("page");
  });

  it("탭을 눌러 허브를 열면 기본 예시 이야기의 확정 오류를 근거와 함께 보여 준다", async () => {
    render(page("work-1"));
    fireEvent.click(await screen.findByRole("button", { name: /개연성 점검/u }));
    const heading = await screen.findByRole("heading", { level: 3, name: KNOWLEDGE });
    expect(heading).toBeTruthy();
    const detail = screen.getByRole("complementary", { name: "근거 상세" });
    expect(within(detail).getByText("금고 앞의 거짓말")).toBeTruthy();
  });

  it("허브에서 남긴 처리 기록은 모순·위험 탭과 같은 기록으로 저장되어 그쪽에서도 처리된 것으로 보인다", async () => {
    render(page("work-1", "plausibility"));
    await screen.findByRole("heading", { level: 3, name: KNOWLEDGE });
    const detail = screen.getByRole("complementary", { name: "근거 상세" });
    fireEvent.click(within(detail).getByRole("button", { name: "해결함" }));
    fireEvent.change(screen.getByRole("textbox", { name: /사유/u }), { target: { value: "확인했어요" } });
    fireEvent.click(screen.getByRole("button", { name: "‘해결함’으로 기록하기" }));

    const dispositionKey = `toonspectrum:storyworld-issue-dispositions:v1:${labKey("work-1")}`;
    await waitFor(() => expect(row(dispositionKey)).toBeDefined());
    const envelope = envelopeOf(dispositionKey);
    const payload: unknown = typeof envelope === "object" && envelope !== null && "payload" in envelope && typeof envelope.payload === "string"
      ? JSON.parse(envelope.payload)
      : null;
    expect(payload).toMatchObject({ version: 1, dispositions: [{ status: "resolved", note: "확인했어요" }] });

    const nav = screen.getByRole("navigation", { name: "스토리월드 랩 섹션" });
    fireEvent.click(within(nav).getByRole("button", { name: /모순·위험/u }));
    expect((await screen.findAllByText("해결 표시됨")).length).toBeGreaterThan(0);
  });

  it("질문지에 답하면 작품 설정으로 저장되고, 예시 표시가 꺼지며 준비도에 반영된다", async () => {
    render(page("work-1", "plausibility"));
    await screen.findByRole("heading", { name: "점검 범위" });
    fireEvent.click(screen.getByRole("button", { name: /질문지 열기/u }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "인물이 중요한 선택을 하는 장면" }));
    fireEvent.click(screen.getByRole("button", { name: /저장하고 다음/u }));
    await waitFor(() => {
      const envelope = envelopeOf(labKey("work-1"));
      const project: unknown = typeof envelope === "object" && envelope !== null && "project" in envelope ? envelope.project : null;
      expect(JSON.stringify(project)).toContain('"roles":["decision"]');
    });
    const envelope = envelopeOf(labKey("work-1"));
    const project: unknown = typeof envelope === "object" && envelope !== null && "project" in envelope ? envelope.project : null;
    expect(project).toMatchObject({ schemaVersion: 2, metadata: { toonSpectrumDemoSeed: false } });
    await waitFor(() => expect(window.localStorage.getItem("toonstudio:project-diagnostic-source:v1:work-1")).not.toBeNull());
    expect(screen.getByText("‘장면 성격’ 답을 저장했어요.")).toBeTruthy();
  });

  it("점검을 마치면 준비도 패널이 읽는 요약이 남는다(작품 id가 있을 때만)", async () => {
    render(page("work-1", "plausibility"));
    await screen.findByRole("heading", { name: "점검 범위" });
    await waitFor(() => expect(window.localStorage.getItem(plausibilitySummaryStorageKey("work-1"))).not.toBeNull());
    expect(JSON.parse(window.localStorage.getItem(plausibilitySummaryStorageKey("work-1")) ?? "{}")).toMatchObject({ version: 1, errorCount: 1, warningCount: 1, partial: false });
    cleanup();
    window.localStorage.clear();
    render(page(null, "plausibility"));
    await screen.findByRole("heading", { name: "점검 범위" });
    expect(Object.keys(window.localStorage).filter((key) => key.includes("plausibility-summary"))).toEqual([]);
  });

  it("허브의 해결 방법에서 ‘설정에서 열기’를 누르면 설정 관리 탭으로 이동한다", async () => {
    render(page("work-1", "plausibility"));
    await screen.findByRole("heading", { level: 3, name: KNOWLEDGE });
    const detail = screen.getByRole("complementary", { name: "근거 상세" });
    const open = within(detail).queryAllByRole("button").find((button) => /설정에서/u.test(button.textContent ?? ""));
    if (!open) throw new Error("설정으로 이동하는 해결 방법이 필요합니다.");
    fireEvent.click(open);
    expect(await screen.findByRole("heading", { level: 1, name: "설정 관리" })).toBeTruthy();
  });
});
