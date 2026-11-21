// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/platform/api";

import { StudioAiSupportCenterChat } from "../StudioAiSupportCenterChat";
import {
  SUPPORT_AI_QUICK_PROMPTS,
  SUPPORT_HANDOFF_STORAGE_KEY,
  buildLocalSupportGreeting,
  buildLocalTicketAutofill,
  generateLocalSupportReply,
  maskSensitiveSupportInput,
  requestSupportTicketAutofill,
  sendSupportAiChatMessage,
} from "../support-ai-chat-client";

const readSupportChatFile = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

function renderChat(props?: {
  onApplyToBrief?: (payload: { category: string; summary: string; contact: string }) => void;
  initialPath?: string;
}) {
  return render(
    <MemoryRouter initialEntries={[props?.initialPath ?? "/studio/support"]}>
      <StudioAiSupportCenterChat
        onApplyToBrief={props?.onApplyToBrief}
        initialPath={props?.initialPath}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(api, "post").mockRejectedValue(new Error("offline-in-unit-test"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("support-ai-chat-client · 결정론적 로컬 엔진·PII 마스킹·API 폴백", () => {
  it("민감 정보(API 키·Bearer 토큰·이메일·전화번호·주민번호·카드번호·비밀번호)를 자동 마스킹한다", () => {
    const keyVal = ["sk", "proj", "sampleMaskKey1234567890"].join("-");
    const bearerVal = ["Bearer ", "tokSample_9876543210abcd"].join("");
    const emailVal = ["author", "toonstudio.test"].join("@");
    const phoneVal = ["010", "9876", "5432"].join("-");
    const rrnVal = ["920304", "2345678"].join("-");
    const cardVal = ["4242", "1111", "2222", "3333"].join("-");
    const pwVal = ["비밀번호", "secretPass77"].join(":");

    const res = maskSensitiveSupportInput(
      `키 ${keyVal} / ${bearerVal} / ${emailVal} / ${phoneVal} / ${rrnVal} / ${cardVal} / ${pwVal}`,
    );

    expect(res.piiMasked).toBe(true);
    expect(res.maskedKinds).toEqual(
      expect.arrayContaining(["api_key", "auth_token", "email", "phone", "resident_id", "card_number", "password"]),
    );
    expect(res.masked).not.toContain(keyVal);
    expect(res.masked).not.toContain("tokSample_9876543210abcd");
    expect(res.masked).not.toContain(emailVal);
    expect(res.masked).not.toContain(phoneVal);
    expect(res.masked).not.toContain(rrnVal);
    expect(res.masked).not.toContain(cardVal);
    expect(res.masked).not.toContain("secretPass77");
  });

  it("8개 ToonStudio 도메인 질문에 맞는 분류와 검증된 원클릭 액션 링크를 반환한다", () => {
    const cases: readonly [string, string, string][] = [
      ["OPFS 로컬 백업 복구가 필요해요", "local-backup-opfs", "/studio/recovery"],
      ["Wasm64와 WebGPU 성능이 느려요", "wasm-webgpu-perf", "/studio/environment"],
      ["3D 배경과 VRM 캐릭터 합성이 어색해요", "bg3d-vrm-composite", "/studio/bg3d"],
      ["포토샵 PSD 레이어랑 브러시 랩 필압 문의", "photoshop-pro-lab", "/studio/import"],
      ["분업 OS에서 컷 슬라이스 잠금이 걸렸어요", "collab-os-locks", "/production"],
      ["무료 AI ₩0 한도 90% 차단 정책 알려주세요", "free-ai-zero-bill", "/settings/ai?source=studio"],
      ["Rights BOM 라이선스 출처 확인하고 싶어요", "rights-bom-license", "/studio/engines"],
      ["PDF 내보내기 오류와 멤버십 결제 문의", "export-billing", "/studio/pdf-workbench"],
    ];

    for (const [message, expectedTopic, expectedHref] of cases) {
      const reply = generateLocalSupportReply({ message });
      expect(reply.topicId).toBe(expectedTopic);
      expect(reply.costKrw).toBe(0);
      expect(reply.paidBillingBlocked).toBe(true);
      expect(reply.actionLinks.some((link) => link.to === expectedHref)).toBe(true);
      expect(reply.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("멀티턴 후속 질문('그래도 안 돼요')에서 직전 주제를 유지하고 담당자 연결을 권한다", () => {
    const first = generateLocalSupportReply({
      message: "작업 파일 복구 방법 알려주세요",
      history: [buildLocalSupportGreeting()],
    });
    const second = generateLocalSupportReply({
      sessionId: first.sessionId,
      message: "그래도 안 돼요",
      history: [buildLocalSupportGreeting(), first.userMessage, first.assistantMessage],
    });

    expect(second.topicId).toBe("local-backup-opfs");
    expect(second.suggestEscalation).toBe(true);
    expect(second.assistantMessage.content).toContain("담당자 연결");
  });

  it("원격 API가 정상 응답하면 API 결과를 그대로 사용하고 ₩0과 마스킹 상태를 보존한다", async () => {
    const secretKey = ["sk", "ant", "remoteMaskKey1234567890"].join("-");
    vi.mocked(api.post).mockResolvedValueOnce({
      sessionId: "remote-session-0001",
      userTurn: {
        id: "u1",
        role: "user",
        content: "작업 파일 복구 [비밀키 마스킹됨]",
        createdAt: "2026-11-21T00:00:00.000Z",
        topicId: "local-backup-opfs",
      },
      assistantTurn: {
        id: "a1",
        role: "assistant",
        content: "서버 무료 AI가 복구 경로를 안내해 드려요.",
        createdAt: "2026-11-21T00:00:00.000Z",
        topicId: "local-backup-opfs",
        topicLabelKo: "로컬 백업·OPFS 복구",
        steps: ["복구 화면을 확인하세요."],
        actionLinks: [{ id: "act-rec", label: "복구 화면 열기", to: "/studio/recovery", kind: "primary" }],
      },
      topicId: "local-backup-opfs",
      topicLabelKo: "로컬 백업·OPFS 복구",
      mode: "zero-bill-free-ai",
      costKrw: 0,
      paidBillingBlocked: true,
      piiMasked: true,
      maskedKinds: ["api_key"],
      actionLinks: [{ id: "act-rec", label: "복구 화면 열기", to: "/studio/recovery", kind: "primary" }],
      steps: ["복구 화면을 확인하세요."],
      followUpPrompts: [],
      suggestEscalation: false,
    });

    const reply = await sendSupportAiChatMessage({
      message: `작업 파일 복구 ${secretKey}`,
      history: [],
      currentPath: "/studio/support",
    });

    expect(reply.mode).toBe("zero-bill-free-ai");
    expect(reply.costKrw).toBe(0);
    expect(reply.piiMasked).toBe(true);
    expect(reply.sessionId).toBe("remote-session-0001");
    // 클라이언트가 전송 전에도 비밀키를 이미 마스킹해 서버로 보내지 않는다
    const sentPayload = vi.mocked(api.post).mock.calls[0]?.[1] as { message?: string };
    expect(sentPayload?.message).not.toContain(secretKey);
    expect(sentPayload?.message).toContain("[비밀키 마스킹됨]");
  });

  it("브라우저 오프라인(navigator.onLine=false) 시 API 호출 없이 즉시 로컬 결정론적 상담으로 폴백한다", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const reply = await sendSupportAiChatMessage({
      message: "무료 AI 한도 알려줘",
      history: [],
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(reply.mode).toBe("local-fallback");
    expect(reply.topicId).toBe("free-ai-zero-bill");
    expect(reply.costKrw).toBe(0);
  });

  it("API 오류 시 티켓 자동 채우기도 로컬 폴백으로 분류·긴급도·체크리스트를 채운다", async () => {
    const first = generateLocalSupportReply({ message: "분업 OS 컷 슬라이스 잠금이 안 풀려요" });
    const autofill = await requestSupportTicketAutofill({
      sessionId: first.sessionId,
      messages: [first.userMessage, first.assistantMessage],
      currentPath: "/production",
    });

    expect(autofill.sourceMode).toBe("local-fallback");
    expect(autofill.requiredFieldCount).toBe(1);
    expect(autofill.category).toBe("collab-os-locks");
    expect(autofill.urgency).toBe("high");
    expect(autofill.summary).toContain("[AI 자동 분류]");
    expect(autofill.diagnosticChecklist.length).toBeGreaterThanOrEqual(3);
  });

  it("로컬 티켓 자동 채우기는 민감 정보를 요약과 문의 한 줄에서 모두 제거한다", () => {
    const phoneSample = ["010", "3333", "4444"].join("-");
    const filled = buildLocalTicketAutofill({
      oneLineIssue: `내보내기 오류 해결 부탁해요 (${phoneSample})`,
      messages: [],
    });

    expect(filled.piiMasked).toBe(true);
    expect(filled.oneLineIssue).not.toContain(phoneSample);
    expect(filled.summary).not.toContain(phoneSample);
    expect(filled.category).toBe("export-billing");
  });
});

describe("StudioAiSupportCenterChat UI · 멀티턴·빠른 칩·티켓 자동채움·접근성", () => {
  it("상단 6종 원클릭 빠른 질문 칩과 초기 환영 메시지를 렌더링한다", () => {
    renderChat();

    expect(screen.getByRole("heading", { name: /AI 고객센터 · 1:1 실시간 채팅상담/ })).toBeTruthy();
    for (const chip of SUPPORT_AI_QUICK_PROMPTS) {
      expect(screen.getByRole("button", { name: chip.label })).toBeTruthy();
    }
    const log = screen.getByRole("log", { name: "1:1 AI 채팅상담 대화 내역" });
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.className).toContain("overscroll-contain");
  });

  it("빠른 질문 칩('작업 파일 복구') 클릭 시 즉시 답변과 원클릭 해결 링크('/studio/recovery')를 표시한다", async () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "작업 파일 복구" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /복구 화면 열기/ })).toBeTruthy();
    });
    const recoveryLink = screen.getByRole("link", { name: /복구 화면 열기/ });
    expect(recoveryLink.getAttribute("href")).toBe("/studio/recovery");
    expect(recoveryLink.className).toContain("min-h-11");
  });

  it("3D 배경·캐릭터 합성 칩 클릭 시 3D 작업실과 포즈 스튜디오 바로가기 링크를 제공한다", async () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "3D 배경·캐릭터 합성" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /3D 배경 작업실/ })).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: /3D 배경 작업실/ }).getAttribute("href")).toBe("/studio/bg3d");
    expect(screen.getByRole("link", { name: /포즈 스튜디오 열기/ }).getAttribute("href")).toBe("/studio/poser");
  });

  it("느림/성능 개선·무료 AI 한도·분업 잠금·내보내기 오류 칩이 각각의 검증된 해결 경로를 반환한다", async () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "느림/성능 개선" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /환경·GPU 진단 실행/ }).getAttribute("href")).toBe("/studio/environment");
    });

    fireEvent.click(screen.getByRole("button", { name: "무료 AI 한도 안내" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /AI 설정·한도 확인/ }).getAttribute("href")).toBe("/settings/ai?source=studio");
    });

    fireEvent.click(screen.getByRole("button", { name: "분업 잠금 해제" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /분업·프로덕션 허브/ }).getAttribute("href")).toBe("/production");
    });

    fireEvent.click(screen.getByRole("button", { name: "내보내기 오류" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /PDF 워크벤치 열기/ }).getAttribute("href")).toBe("/studio/pdf-workbench");
    });
  });

  it("직접 입력 멀티턴 대화를 수행하고 Enter 키로 전송하며 Shift+Enter는 전송하지 않는다", async () => {
    renderChat();

    const input = screen.getByRole("textbox", { name: "AI 상담 메시지 입력" });
    fireEvent.change(input, { target: { value: "포토샵 PSD 레이어 마스크가 이상해요" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.queryByRole("link", { name: /PSD·원고 가져오기/ })).toBeNull();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /PSD·원고 가져오기/ })).toBeTruthy();
    });

    // 후속 질문 멀티턴
    fireEvent.change(input, { target: { value: "그래도 안 돼요" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() => {
      expect(screen.getByText(/스마트 오브젝트나 CMYK PSD/)).toBeTruthy();
    });
  });

  it("메시지에 비밀키·이메일을 입력해도 화면 말풍선에 원문을 노출하지 않고 마스킹 안내를 띄운다", async () => {
    renderChat();

    const sampleKey = ["sk", "live", "uiMaskSecret1234567890"].join("-");
    const sampleEmail = ["writer", "studio.test"].join("@");
    const input = screen.getByRole("textbox", { name: "AI 상담 메시지 입력" });
    fireEvent.change(input, {
      target: { value: `저장 복구 도와주세요 ${sampleKey} ${sampleEmail}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));

    await waitFor(() => {
      expect(screen.getByText(/자동으로 마스킹했어요/)).toBeTruthy();
    });
    expect(screen.queryByText(new RegExp(sampleKey))).toBeNull();
    expect(screen.queryByText(new RegExp(sampleEmail))).toBeNull();
  });

  it("답변의 '해결됐어요' 피드백을 누르면 해결 상태를 표시하고 해결 카운터를 갱신한다", async () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "무료 AI 한도 안내" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "해결됐어요" })).toBeTruthy();
    });

    const resolvedButton = screen.getByRole("button", { name: "해결됐어요" });
    expect(resolvedButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(resolvedButton);

    expect(resolvedButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/도움이 되어 다행이에요/)).toBeTruthy();
    expect(screen.getByText(/해결됨 1건/)).toBeTruthy();
  });

  it("담당자 연결 전환 시 필수 입력은 '문의 한 줄' 1칸만 요구하고 AI 자동 채움 항목을 <details>에 담는다", async () => {
    const onApplyToBrief = vi.fn();
    renderChat({ onApplyToBrief });

    fireEvent.click(screen.getByRole("button", { name: "내보내기 오류" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /PDF 워크벤치 열기/ })).toBeTruthy();
    });

    // 메시지 내 담당자 연결 버튼 클릭
    const escalateButtons = screen.getAllByRole("button", { name: "담당자 연결" });
    fireEvent.click(escalateButtons[0]!);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "담당자 문의로 넘기기" })).toBeTruthy();
    });

    const oneLineInput = screen.getByRole("textbox", { name: "문의 한 줄 (필수)" }) as HTMLInputElement;
    expect(oneLineInput.required).toBe(true);
    expect(oneLineInput.value.length).toBeGreaterThan(0);

    // <details> 안에 AI 자동 채움 항목(분류·긴급도·요약·체크리스트)이 배치돼 있다
    const detailsSummary = screen.getByText(/AI 자동 채움 항목 보기 \(선택\)/);
    expect(detailsSummary.closest("details")).not.toBeNull();
    const categorySelect = screen.getByRole("combobox", { name: "AI 자동 분류" }) as HTMLSelectElement;
    expect(categorySelect.value).toBe("export-billing");

    // 필수 한 줄을 비우면 제출 버튼이 비활성화된다
    fireEvent.change(oneLineInput, { target: { value: "   " } });
    const submitBtn = screen.getByRole("button", { name: "문의 준비 완료·브리프 반영" });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);

    // 필수 한 줄만 채우면 나머지 <details>를 열지 않아도 즉시 제출 가능하다
    fireEvent.change(oneLineInput, { target: { value: "4화 PDF 내보내기 실패" } });
    expect(submitBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(submitBtn);

    expect(onApplyToBrief).toHaveBeenCalledOnce();
    expect(onApplyToBrief.mock.calls[0]?.[0]).toMatchObject({
      category: "production",
    });
    expect(screen.getByText(/담당자 전달용 문의 요약이 준비됐어요/)).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(SUPPORT_HANDOFF_STORAGE_KEY) ?? "{}") as {
      oneLineIssue?: string;
    };
    expect(saved.oneLineIssue).toBe("4화 PDF 내보내기 실패");
  });

  it("'새 상담' 버튼으로 대화와 담당자 이관 패널을 초기화할 수 있다", async () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "작업 파일 복구" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /복구 화면 열기/ })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "새 상담" }));
    expect(screen.queryByRole("link", { name: /복구 화면 열기/ })).toBeNull();
    expect(screen.getByText(/안녕하세요! ToonStudio AI 고객센터예요/)).toBeTruthy();
  });

  it("소스 코드 정적 계약: 원시 HEX·any·transition-all·금지 모션 0건 및 OKLCH 토큰·min-h-11·keep-all을 준수한다", () => {
    const componentSource = readSupportChatFile("../StudioAiSupportCenterChat.tsx");
    const clientSource = readSupportChatFile("../support-ai-chat-client.ts");
    const kbSource = readSupportChatFile("../support-ai-chat-kb.ts");

    for (const source of [componentSource, clientSource, kbSource]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(source).not.toMatch(/:\s*any\b|\bas\s+any\b/u);
      expect(source).not.toContain("transition-all");
      expect(source).not.toMatch(/animate-(?:bounce|ping|pulse)\b/u);
    }

    expect(componentSource).toContain("min-h-11");
    expect(componentSource).toContain("overscroll-contain");
    expect(componentSource).toContain("[word-break:keep-all]");
    expect(componentSource).toContain('role="log"');
    expect(componentSource).toContain('aria-live="polite"');
  });

  it("StudioCreatorSupportPage는 AI 채팅상담실을 React.lazy로만 지연 마운트하고 정적 import하지 않는다", () => {
    const pageSource = readSupportChatFile("../../studio-shell/StudioCreatorSupportPage.tsx");
    expect(pageSource).toMatch(/React\.lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\.\/support-chat-ai\/StudioAiSupportCenterChat["']\s*\)/u);
    expect(pageSource).not.toMatch(/^\s*import\s+.*from\s+["'][^"']*support-chat-ai/mu);
  });

  it("답변 말풍선 안의 후속 추천 질문 버튼을 클릭하면 자동으로 다음 턴 상담이 이어진다", async () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "작업 파일 복구" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "휴지통에도 없는데 복구할 수 있나요?" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "휴지통에도 없는데 복구할 수 있나요?" }));
    await waitFor(() => {
      expect(screen.getByText(/다른 브라우저 프로필이나 시크릿 창 여부/)).toBeTruthy();
    });
  });

  it("원격 티켓 자동 채우기 API가 정상 응답하면 sourceMode=api 결과를 그대로 반영한다", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      sessionId: "remote-autofill-session",
      oneLineIssue: "Rights BOM 폰트 경고 확인 요청",
      requiredFieldCount: 1,
      requiredFieldLabelKo: "문의 한 줄",
      category: "rights-bom-license",
      categoryLabelKo: "라이선스·Rights BOM·권리",
      creatorSupportCategory: "rights",
      urgency: "normal",
      urgencyLabelKo: "보통 (기능·성능 점검)",
      summary: "[문의 한 줄] Rights BOM 폰트 경고 확인 요청",
      diagnosticChecklist: ["폰트 라이선스 문서 확인"],
      actionLinks: [{ id: "act-lic", label: "설치·라이선스 확인", to: "/studio/engines", kind: "primary" }],
      piiMasked: false,
      maskedKinds: [],
      costKrw: 0,
      paidBillingBlocked: true,
    });

    const filled = await requestSupportTicketAutofill({
      sessionId: "remote-autofill-session",
      oneLineIssue: "Rights BOM 폰트 경고 확인 요청",
      messages: [],
    });

    expect(filled.sourceMode).toBe("api");
    expect(filled.category).toBe("rights-bom-license");
    expect(filled.creatorSupportCategory).toBe("rights");
    expect(filled.costKrw).toBe(0);
  });

  it("진단 체크리스트 항목을 체크하고 제출하면 선택 상태([x])가 브리프 요약에 반영된다", async () => {
    const onApplyToBrief = vi.fn();
    renderChat({ onApplyToBrief });

    fireEvent.click(screen.getByRole("button", { name: "분업 잠금 해제" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /분업·프로덕션 허브/ })).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "담당자 연결" })[0]!);
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "문의 한 줄 (필수)" })).toBeTruthy();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(screen.getByRole("button", { name: "문의 준비 완료·브리프 반영" }));

    expect(onApplyToBrief).toHaveBeenCalledOnce();
    const submitted = onApplyToBrief.mock.calls[0]?.[0] as { summary: string; category: string };
    expect(submitted.category).toBe("staffing");
    expect(submitted.summary).toContain("- [x] ");
  });

  it("브라우저 저장소가 차단된 환경에서도 담당자 문의 준비가 실패하지 않고 사실대로 안내한다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage-blocked");
    });
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "담당자 연결" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "문의 한 줄 (필수)" })).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("textbox", { name: "문의 한 줄 (필수)" }), {
      target: { value: "저장소 차단 상태에서도 문의 전달 테스트" },
    });
    fireEvent.click(screen.getByRole("button", { name: "문의 준비 완료·브리프 반영" }));

    expect(screen.getByText(/브라우저 저장이 제한돼 있어/)).toBeTruthy();
  });

  it("모든 빠른 질문 칩과 주요 대화 버튼이 44px 터치 타깃(min-h-11) 계약을 만족한다", () => {
    renderChat();

    for (const chip of SUPPORT_AI_QUICK_PROMPTS) {
      const btn = screen.getByRole("button", { name: chip.label });
      expect(btn.className).toContain("min-h-11");
    }
    expect(screen.getByRole("button", { name: "질문 보내기" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "새 상담" }).className).toContain("min-h-11");
  });
});
