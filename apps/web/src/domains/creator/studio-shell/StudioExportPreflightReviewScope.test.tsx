// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { exportPreflightReviewScope, formatExportPreflightReview } from "@/shared/ai/export-preflight-review-scope";
import { runFreeAiZeroBillAssist } from "@/shared/ai/free-ai-zero-bill-cascade";
import { useI18n } from "@/shared/lib/i18n";

import { StudioFreeAiAssistWorkbench } from "./StudioFreeAiAssistWorkbench";
import { StudioOpenAiAssistResultCard } from "./StudioOpenAiAssistResultCard";

const mode = "export-preflight-coach";
const data = {
  readinessSummary: "공연 날짜가 바뀐 이유를 두 번째 컷에 밝혀 주세요.",
  episodeBlurbSuggestion: "막이 오르기 한 시간 전, 빈 객석에 편지가 도착한다.",
  checks: [
    { category: "날짜", severity: "fix" as const, detail: "시간표와 대사를 맞춰 주세요." },
    { category: "소개", severity: "pass" as const, detail: "첫 컷의 사건만 공개합니다." },
  ],
};
const scope = exportPreflightReviewScope.ko;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useI18n.setState({ lang: "ko" });
});

describe("마감·소개글 점검의 텍스트 검토 범위", () => {
  it("규격을 넣어도 파일 본문을 검사했다고 표시하지 않으며 범위와 편집 제안을 함께 복사한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => init?.method === "POST"
      ? Response.json({ provider: "github-models-free", providerTier: "cloud-free", result: { mode, data } })
      : new Response(null, { status: 503 }));
    render(<StudioFreeAiAssistWorkbench initialMode={mode} fetchImpl={fetchImpl} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "내보내기 이미지: 1080 × 2700 px · 34112 B" } });
    fireEvent.click(screen.getByRole("button", { name: "₩0 무료 AI 실행" }));
    const result = await screen.findByTestId("studio-free-ai-workbench-result");
    expect(result.textContent).toContain(scope);
    expect(result.textContent).toContain(data.readinessSummary);
    expect(result.textContent).toContain(data.episodeBlurbSuggestion);
    const generation = fetchImpl.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(generation?.[1]?.body));
    expect(body.inputText).toContain("1080 × 2700 px");
    expect(body).not.toHaveProperty("file");
    fireEvent.click(within(result).getByRole("button", { name: "결과 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain(`${scope}\n${data.readinessSummary}`);
  });

  it.each(["ko", "en"] as const)("기존 응답을 %s 프로젝트 카드에서 열어도 안내는 한 번만 표시되고 소개글만 복사한다", async (lang) => {
    useI18n.setState({ lang });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    render(<StudioOpenAiAssistResultCard response={{
      provider: "openai", model: "test-model", result: { mode, data },
      privacy: { storeData: false, piiRedactedCount: 0 }, quota: { remainingDaily: 1, dailyLimit: 1 },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }} />);
    const card = screen.getByTestId("openai-assist-result-card");
    expect(card.textContent?.split(exportPreflightReviewScope[lang])).toHaveLength(2);
    fireEvent.click(within(card).getByRole("button", { name: lang === "ko" ? "소개글 복사" : "Copy blurb" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(data.episodeBlurbSuggestion));
  });

  it("서버 미연결·이전 형식·빈 응답에서도 정상 안내와 기존 원고 정보를 보존한다", async () => {
    const input = { mode, inputText: "막공 두 시간 전의 대사를 확인해 주세요." } as const;
    const offline = await runFreeAiZeroBillAssist(input, {
      fetchImpl: async () => new Response(null, { status: 503 }),
    });
    expect(offline.headlineKo).toContain(scope);
    expect(offline.providerTier).toBe("local-fallback");
    expect(offline.bulletsKo.length).toBeGreaterThan(0);
    const legacy = await runFreeAiZeroBillAssist(input, {
      fetchImpl: async () => Response.json({ provider: "github-models-free", providerTier: "cloud-free",
        result: { mode, data: { readinessSummary: data.readinessSummary, notes: ["낡은 시계는 마지막 컷에 둔다."] } } }),
    });
    expect(legacy.headlineKo).toBe(`${scope}\n${data.readinessSummary}`);
    expect(legacy.bulletsKo).toContain("낡은 시계는 마지막 컷에 둔다.");
    expect(formatExportPreflightReview("  ")).toBe(scope);
    expect(formatExportPreflightReview(legacy.headlineKo)).toBe(legacy.headlineKo);
  });
});
