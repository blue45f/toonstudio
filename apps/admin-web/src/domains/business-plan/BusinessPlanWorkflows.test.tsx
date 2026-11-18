// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createEmptyBusinessPlanState, todayKst } from "@toonstudio/contracts/business-plan";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadBusinessPlan, saveBusinessPlan } from "./business-plan-api";
import { BusinessPlanBoard } from "./BusinessPlanBoard";

import type { BusinessPlanState } from "@toonstudio/contracts/business-plan";

vi.mock("./business-plan-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./business-plan-api")>();
  return { ...original, loadBusinessPlan: vi.fn(), saveBusinessPlan: vi.fn() };
});

async function show(board = createEmptyBusinessPlanState()) {
  vi.mocked(loadBusinessPlan).mockResolvedValue({ board, revision: 1, updatedAt: new Date().toISOString() });
  render(<BusinessPlanBoard userIdentity="business-plan-workflow-test" />);
  await screen.findByRole("button", { name: "작업 추가" });
}
function change(label: string, value: string) { fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } }); }
function apply() { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "보드에 반영" })); }
function currentBoard(): BusinessPlanState {
  fireEvent.click(screen.getByRole("button", { name: "JSON 관리" }));
  const board = JSON.parse((screen.getByLabelText("사업계획서 보드 JSON") as HTMLTextAreaElement).value) as BusinessPlanState;
  fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" })); return board;
}
beforeEach(() => {
  vi.mocked(loadBusinessPlan).mockReset(); vi.mocked(saveBusinessPlan).mockReset();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const NativeUrl = URL;
  vi.stubGlobal("URL", class extends NativeUrl { static createObjectURL = vi.fn(() => "blob:workflow-test"); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("사업계획서 근거·문서·최종 점검", () => {
  it("확인되지 않은 수치를 확정 표시하지 않으며 실제 원문 체크와 필수 근거 후 확인한 0을 보존한다", async () => {
    const board = createEmptyBusinessPlanState(); board.claims[4].value = "999999";
    await show(board);
    const row = screen.getByRole("button", { name: "공정별 병목과 재작업 근거 편집" }).closest("tr");
    expect(row?.textContent).toContain("미확인"); expect(row?.textContent).not.toContain("999999");
    fireEvent.click(screen.getByRole("button", { name: "공정별 병목과 재작업 근거 편집" }));
    change("사실 확인 상태", "근거 확인"); change("확인 대상 수치", "0"); change("단위", "건"); change("기준 기간", "테스트 기준 기간"); change("지표·비교 범위와 정의", "테스트 샘플의 재작업 건수");
    apply(); expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/실제 원문 확인 체크/u);
    fireEvent.click(screen.getByRole("checkbox", { name: /실제 원문을 직접 확인/ }));
    apply(); expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/출처|원문/u);
    fireEvent.click(screen.getByRole("button", { name: "원문·검증" }));
    change("원문 링크", "https://example.com/research"); change("원문 제목", "테스트 원문"); change("발행 주체", "공개 테스트 자료"); change("원문 페이지·표·문단 위치", "표 1"); change("원문에서 실제 확인한 내용", "표의 재작업 수가 0으로 기재되어 있음"); change("주장 검증일", todayKst()); change("검증 담당자", "테스트 검토자");
    apply(); expect(screen.queryByRole("dialog")).toBeNull();
    const updatedRow = screen.getByRole("button", { name: "공정별 병목과 재작업 근거 편집" }).closest("tr");
    expect(updatedRow?.textContent).toContain("0 건"); expect(updatedRow?.textContent).toContain("근거 확인");
    expect(currentBoard().claims[4].value).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "공정별 병목과 재작업 근거 편집" }));
    expect((screen.getByRole("checkbox", { name: /실제 원문을 직접 확인/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("시장·매출 전망에서 별도 교차검증·가정·산식이 없으면 확인 완료를 막는다", async () => {
    await show(); fireEvent.click(screen.getByRole("button", { name: "매출 전망의 입력 근거 근거 편집" }));
    change("사실 확인 상태", "근거 확인"); change("확인 대상 수치", "10"); change("단위", "테스트 단위"); change("기준 기간", "테스트 기간"); change("지표·비교 범위와 정의", "테스트 전망 범위");
    fireEvent.click(screen.getByRole("button", { name: "원문·검증" })); change("원문 링크", "https://example.com/source"); change("원문 제목", "테스트 자료"); change("발행 주체", "테스트 기관"); change("원문 페이지·표·문단 위치", "표 2"); change("원문에서 실제 확인한 내용", "테스트 가정 대조"); change("주장 검증일", todayKst()); change("검증 담당자", "테스트 검토자");
    fireEvent.click(screen.getByRole("checkbox", { name: /실제 원문을 직접 확인/ })); apply();
    const message = within(screen.getByRole("dialog")).getByRole("alert").textContent;
    expect(message).toMatch(/교차검증/u); expect(message).toMatch(/가정/u); expect(message).toMatch(/산식/u);
    fireEvent.click(screen.getByRole("button", { name: "교차검증·전망" })); change("교차검증 출처 링크", "https://example.org/independent"); change("교차검증 출처 제목", "독립 테스트 자료"); change("교차검증 기록·출처 독립성", "단위와 기간이 같은 독립 테스트 자료를 확인"); change("매출 전망 가정", "테스트 고객 수 2"); change("매출 전망 산식", "테스트 고객 수 × 단가 5"); apply();
    expect(screen.queryByRole("dialog")).toBeNull();
    const row = screen.getByRole("button", { name: "매출 전망의 입력 근거 근거 편집" }).closest("tr");
    expect(row?.textContent).toContain("가정·산식 검토"); expect(row?.textContent).toContain("실제 매출과 별도 관리");
  });

  it("날짜를 KST로 편집하고 다른 필드 수정 시 기존 검증·발행 시각을 보존한다", async () => {
    const board = createEmptyBusinessPlanState();
    board.claims[0].verifiedAt = "2026-01-02T18:12:37.123Z";
    board.claims[0].publishedAt = "2025-12-01T17:14:42.456Z";
    await show(board); fireEvent.click(screen.getByRole("button", { name: "문제 발생 근거 근거 편집" }));
    change("검증 메모", "원문 재검토 예정"); fireEvent.click(screen.getByRole("button", { name: "원문·검증" }));
    expect((screen.getByLabelText("주장 검증일") as HTMLInputElement).value).toBe("2026-01-03");
    expect((screen.getByLabelText("원문 발행일") as HTMLInputElement).value).toBe("2025-12-02");
    apply(); const result = currentBoard().claims[0];
    expect(result.verifiedAt).toBe(board.claims[0].verifiedAt); expect(result.publishedAt).toBe(board.claims[0].publishedAt);
    const row = screen.getByRole("button", { name: "문제 발생 근거 근거 편집" }).closest("tr");
    expect(row?.textContent).toContain("검증 후 변경");
  });

  it("문서 원문·이전 버전을 비교하고 제출용 사본을 작업 수정과 독립적으로 보존한다", async () => {
    await show(); expect((screen.getByRole("button", { name: "제출용 사본 만들기" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "작업용 편집" })); change("변경 전 원문", "이전 문장\n공통 문장"); change("작업용 원문", "새 문장\n공통 문장"); change("작업용 버전 이름", "작업 v1"); apply();
    fireEvent.click(screen.getByRole("button", { name: "제출용 사본 만들기" })); change("제출용 버전 이름", "제출 후보 v1"); fireEvent.click(screen.getByRole("button", { name: "제출용 사본 반영" }));
    expect(within(screen.getByRole("region", { name: "문서 변경과 제출용 버전" })).getByText("작업용·제출용 내용 일치")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "작업용 편집" })); change("작업용 원문", "재검토한 문장\n공통 문장"); change("작업용 버전 이름", "작업 v2"); apply();
    expect(screen.getByText("제출용에 미반영 변경 있음")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "제출용 ↔ 작업용" }));
    const result = currentBoard().documents[0];
    expect(result.submission?.text).toBe("새 문장\n공통 문장"); expect(result.workingText).toBe("재검토한 문장\n공통 문장"); expect(result.history.some((entry) => entry.type === "작업용" && entry.text === "새 문장\n공통 문장")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "제출용 사본 만들기" })); change("제출용 버전 이름", "제출 후보 v2"); fireEvent.click(screen.getByRole("button", { name: "제출용 사본 반영" }));
    const replaced = currentBoard().documents[0]; expect(replaced.submission?.label).toBe("제출 후보 v2"); expect(replaced.history.some((entry) => entry.type === "제출 후보" && entry.label === "제출 후보 v1")).toBe(true);
    expect(saveBusinessPlan).not.toHaveBeenCalled();
  });

  it("멘토 반영은 문서·위치·근거를 요구하고 수동 점검에는 확인 메모가 필요하다", async () => {
    await show(); fireEvent.click(screen.getByRole("button", { name: "요청 추가" })); change("멘토 요청 제목", "테스트 피드백"); change("멘토 요청 원문", "공정 비교 근거를 보완해 주세요"); fireEvent.click(screen.getByRole("checkbox", { name: "위 근거와 문서 위치에서 반영을 확인했습니다" })); apply();
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/문서|반영|근거/u);
    change("반영 문서", "DOC-01"); change("반영 페이지·문단 위치", "2장 3문단"); change("반영 근거·실제 변경 내용", "테스트 비교 조건을 본문에 추가함"); apply();
    expect(currentBoard().mentor[0]).toMatchObject({ reflected: true, documentId: "DOC-01", location: "2장 3문단" });
    fireEvent.click(screen.getByRole("button", { name: "공식 양식과 제출 안내 원문 대조 수동 점검 편집" })); fireEvent.click(screen.getByRole("checkbox", { name: "항목을 실제 확인했습니다" })); apply();
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/메모|근거/u);
    change("실제 확인한 내용·남은 오류", "테스트 양식의 문항 순서를 대조함"); apply();
    expect(currentBoard().checks[0].checked).toBe(true);
  });

  it("승인 항목은 메모만 수정하고 실행 상태를 가져오기로 우회할 수 없다", async () => {
    await show(); fireEvent.click(screen.getByRole("button", { name: "외부 제출 승인 메모 편집" })); change("승인 검토 메모", "제출 전 담당자 확인 요청"); fireEvent.click(screen.getByRole("button", { name: "승인 메모 반영" }));
    const board = currentBoard(); expect(board.approvals.every((approval) => approval.status === "승인 대기")).toBe(true); expect(board.approvals[1].note).toBe("제출 전 담당자 확인 요청");
    fireEvent.click(screen.getByRole("button", { name: "JSON 관리" }));
    const invalid = JSON.parse(JSON.stringify(board)) as { approvals: { status: string }[] }; invalid.approvals[1].status = "제출 완료";
    change("사업계획서 보드 JSON", JSON.stringify(invalid)); fireEvent.click(screen.getByRole("button", { name: "가져오기 검토" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/승인 대기/u);
    expect(screen.queryByRole("button", { name: "현재 기록 백업 후 가져오기" })).toBeNull(); expect(saveBusinessPlan).not.toHaveBeenCalled();
  });

  it("가져오기를 검토하고 백업한 뒤에만 현재 화면을 교체하며 서버는 별도 저장한다", async () => {
    await show(); fireEvent.click(screen.getByRole("button", { name: "JSON 관리" })); change("사업계획서 보드 JSON", "{broken"); fireEvent.click(screen.getByRole("button", { name: "가져오기 검토" })); expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy();
    const next = createEmptyBusinessPlanState(); next.tasks[0].nextAction = "가져온 후속 조치"; change("사업계획서 보드 JSON", JSON.stringify(next)); fireEvent.click(screen.getByRole("button", { name: "가져오기 검토" }));
    expect(screen.getByText("가져오기 검토 완료")).toBeTruthy(); expect(screen.queryByText(/담당 미지정 · 가져온 후속 조치/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "현재 기록 백업 후 가져오기" })); expect(screen.getByText(/담당 미지정 · 가져온 후속 조치/u)).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1); expect(saveBusinessPlan).not.toHaveBeenCalled();
  });

  it("미확인 일정을 추측하지 않고 KST 일시·공식 출처·메모로 확인 기록을 만든다", async () => {
    await show(); fireEvent.click(screen.getByRole("button", { name: "일정·프로젝트 편집" })); expect((screen.getByLabelText("일정 1 일시 (KST)") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("checkbox", { name: "일정 1을 공식 원문에서 확인했습니다" })); apply(); expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy();
    change("일정 1 일시 (KST)", "2026-12-15T16:30"); change("일정 1 공식 출처", "https://example.com/notice"); change("일정 1 확인 메모", "테스트 공고의 마감 시각 대조"); apply();
    expect(currentBoard().project.deadlines[0]).toMatchObject({ at: "2026-12-15T16:30:00+09:00", verified: true });
  });
});
