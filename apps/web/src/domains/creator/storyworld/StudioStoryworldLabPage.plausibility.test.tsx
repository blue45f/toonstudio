// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { STORYWORLD_DRAFT_NAMESPACE } from "./draft-store";
import {
  STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE,
  plausibilitySummaryKey,
  resetPlausibilitySummaryStoreForTests,
} from "./plausibility/studio-story-plausibility-summary";
import { StudioStoryworldLabPage } from "./StudioStoryworldLabPage";

const db = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  /** 공용 SQLite의 이름 공간 저장소를 흉내 낸다. 실제 구현은 beforeEach에서 이 객체의 kvGet/kvSet에 잇는다. */
  asAsyncKeyValueStore: (_namespace: string): { readonly get: (key: string) => Promise<string | null>; readonly set: (key: string, value: string) => Promise<void> } => {
    throw new Error("테스트 준비 전입니다.");
  },
}));
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

// 허브는 탭을 처음 열 때 내려받는 지연 로딩 모듈이다. 변환 캐시가 차가운 환경(CI)에서는 첫 변환이
// findBy 기본 대기시간(1초)을 넘길 수 있어, 개별 테스트의 대기시간과 섞이지 않도록 미리 불러 둔다.
beforeAll(async () => {
  await import("./plausibility/StudioStoryPlausibilityHub");
}, 60_000);

beforeEach(() => {
  db.rows.clear();
  window.localStorage.clear();
  db.kvGet.mockReset().mockImplementation(async (namespace: string, id: string) => db.rows.get(`${namespace}:${id}`) ?? null);
  db.kvSet.mockReset().mockImplementation(async (namespace: string, id: string, value: string) => { db.rows.set(`${namespace}:${id}`, value); });
  db.asAsyncKeyValueStore = (namespace: string) => ({
    get: (key: string) => db.kvGet(namespace, key),
    set: (key: string, value: string) => db.kvSet(namespace, key, value),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetPlausibilitySummaryStoreForTests();
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

  it("예시 이야기에서 질문지에 답한 뒤 되돌리면 예시 표시와 원래 내용이 그대로 돌아온다", async () => {
    const savedProject = (): unknown => {
      const envelope = envelopeOf(labKey("work-1"));
      return typeof envelope === "object" && envelope !== null && "project" in envelope ? envelope.project : null;
    };
    render(page("work-1", "plausibility"));
    await screen.findByRole("heading", { name: "점검 범위" });
    fireEvent.click(screen.getByRole("button", { name: /질문지 열기/u }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "인물이 중요한 선택을 하는 장면" }));
    fireEvent.click(screen.getByRole("button", { name: /저장하고 다음/u }));
    await waitFor(() => expect(savedProject()).toMatchObject({ metadata: { toonSpectrumDemoSeed: false } }));
    const [back] = screen.getAllByRole("button", { name: /리포트로 돌아가기/u });
    if (!back) throw new Error("리포트로 돌아가는 버튼이 필요합니다.");
    fireEvent.click(back);
    fireEvent.click(await screen.findByRole("button", { name: /방금 한 일 되돌리기/u }));
    await waitFor(() => expect(savedProject()).toMatchObject({ metadata: { toonSpectrumDemoSeed: true } }));
    expect(JSON.stringify(savedProject())).not.toContain('"roles":["decision"]');
    expect(screen.getByText(/예시 데이터 ·/u)).toBeTruthy();
  });

  it("점검을 마치면 준비도 패널이 읽는 요약이 공용 저장소에 남는다(작품 id가 있을 때만, 브라우저 KV는 쓰지 않는다)", async () => {
    const summaryRow = (id: string) => db.rows.get(`${STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE}:${plausibilitySummaryKey(id)}`);
    render(page("work-1", "plausibility"));
    await screen.findByRole("heading", { name: "점검 범위" });
    await waitFor(() => expect(summaryRow("work-1")).toBeDefined());
    expect(JSON.parse(summaryRow("work-1") ?? "{}")).toMatchObject({ version: 1, errorCount: 1, warningCount: 1, partial: false });
    expect(Object.keys(window.localStorage).filter((key) => key.includes("plausibility"))).toEqual([]);
    cleanup();
    db.rows.clear();
    render(page(null, "plausibility"));
    await screen.findByRole("heading", { name: "점검 범위" });
    await waitFor(() => expect(db.rows.size).toBeGreaterThan(0));
    expect([...db.rows.keys()].filter((key) => key.startsWith(STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE))).toEqual([]);
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
