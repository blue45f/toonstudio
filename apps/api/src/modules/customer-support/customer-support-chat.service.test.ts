import { BadRequestException, HttpException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFreeAiZeroBillRouter } from "../studio-ai/studio-free-ai-zero-bill-router";

import { CustomerSupportAiService } from "./customer-support-ai.service";
import {
  CustomerSupportChatService,
  SUPPORT_CHAT_QUICK_PROMPTS,
  classifySupportTopic,
  maskSensitiveSupportText,
  type SupportChatTopicId,
} from "./customer-support-chat.service";
import { CustomerSupportController } from "./customer-support.controller";
import { CustomerSupportService } from "./customer-support.service";

import type { CustomerSupportRepository } from "./customer-support.repository";

function createService(options?: {
  env?: Record<string, string | undefined>;
  router?: StudioFreeAiZeroBillRouter;
  guestMaxPerMinute?: number;
  userMaxPerMinute?: number;
  nowMs?: () => number;
}) {
  return new CustomerSupportChatService(options?.router, {
    env: options?.env ?? {},
    guestMaxPerMinute: options?.guestMaxPerMinute,
    userMaxPerMinute: options?.userMaxPerMinute,
    nowMs: options?.nowMs,
  });
}

function createControllerHarness(chatService?: CustomerSupportChatService) {
  const repository = {
    isOperator: vi.fn(async () => false),
    list: vi.fn(async () => ({ items: [], total: 0 })),
    create: vi.fn(),
    detail: vi.fn(),
    send: vi.fn(async () => true),
    setStatus: vi.fn(async () => undefined),
    reserveAi: vi.fn(),
    finishAi: vi.fn(async () => undefined),
  } as unknown as CustomerSupportRepository;
  const ai = new CustomerSupportAiService();
  const supportService = new CustomerSupportService(repository, ai);
  const chat = chatService ?? createService();
  const controller = new CustomerSupportController(supportService, chat);
  return { controller, chat, supportService };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("1:1 AI 고객센터 세션 및 8개 도메인 지식 베이스", () => {
  it("startSession은 세션 ID, 6종 빠른 질문 칩, ₩0 과금 차단 상태를 반환한다", () => {
    const service = createService();
    const started = service.startSession({ currentPath: "/studio/bg3d" }, { forwardedFor: "127.0.0.1" });

    expect(started.sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(started.costKrw).toBe(0);
    expect(started.paidBillingBlocked).toBe(true);
    expect(started.greeting.role).toBe("assistant");
    expect(started.greeting.content).toContain("/studio/bg3d");
    expect(started.quickPrompts).toHaveLength(6);
    expect(started.quickPrompts.map((item) => item.label)).toEqual([
      "작업 파일 복구",
      "3D 배경·캐릭터 합성",
      "느림/성능 개선",
      "무료 AI 한도 안내",
      "분업 잠금 해제",
      "내보내기 오류",
    ]);
  });

  it.each<[SupportChatTopicId, string, string]>([
    ["local-backup-opfs", "작업하던 파일이 사라졌어요. OPFS 로컬 백업 복구가 가능할까요?", "/studio/recovery"],
    ["wasm-webgpu-perf", "브러시가 느려요. WebGPU랑 Wasm64 성능 점검을 하고 싶어요.", "/studio/environment"],
    ["bg3d-vrm-composite", "3D 배경과 VRM 캐릭터 포즈를 자연스럽게 합성하고 싶어요.", "/studio/bg3d"],
    ["photoshop-pro-lab", "포토샵 PSD 레이어 마스크와 브러시 랩 필압이 이상해요.", "/studio/import"],
    ["collab-os-locks", "분업 OS에서 컷 슬라이스 잠금이 안 풀려서 편집이 막혔어요.", "/production"],
    ["free-ai-zero-bill", "무료 AI ₩0 한도가 90% 넘으면 자동으로 유료 결제되나요?", "/settings/ai?source=studio"],
    ["rights-bom-license", "상업 연재 전에 Rights BOM 라이선스와 폰트 출처를 확인하고 싶어요.", "/studio/engines"],
    ["export-billing", "웹툰 세로 이미지와 PDF 내보내기 오류가 나고 결제 확인도 필요해요.", "/studio/pdf-workbench"],
  ])("%s 주제를 정확히 분류하고 검증된 원클릭 액션 링크(%s)를 반환한다", async (expectedTopic, prompt, expectedLink) => {
    const service = createService();
    const reply = await service.sendMessage({ message: prompt }, { forwardedFor: "10.0.0.2" });

    expect(reply.topicId).toBe(expectedTopic);
    expect(reply.mode).toBe("deterministic-kb");
    expect(reply.costKrw).toBe(0);
    expect(reply.paidBillingBlocked).toBe(true);
    expect(reply.steps.length).toBeGreaterThanOrEqual(2);
    expect(reply.actionLinks.some((action) => action.to === expectedLink)).toBe(true);
    expect(reply.assistantTurn.content.length).toBeGreaterThan(20);
  });

  it("멀티턴 대화에서 후속 질문('그래도 안 돼요')이 이전 주제를 유지하고 담당자 연결을 제안한다", async () => {
    const service = createService();
    const first = await service.sendMessage(
      { message: "OPFS에서 작업 파일 복구하는 법 알려주세요." },
      { userId: "creator-1" },
    );
    expect(first.topicId).toBe("local-backup-opfs");
    expect(first.turnCount).toBe(1);

    const second = await service.sendMessage(
      { sessionId: first.sessionId, message: "그래도 안 돼요. 계속 안 보여요." },
      { userId: "creator-1" },
    );
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.topicId).toBe("local-backup-opfs");
    expect(second.turnCount).toBe(2);
    expect(second.suggestEscalation).toBe(true);
    expect(second.assistantTurn.content).toContain("담당자 연결");
  });

  it("메모리에 없는 세션 ID라도 클라이언트가 전달한 history로 대화 맥락을 복원한다", async () => {
    const service = createService();
    const reply = await service.sendMessage(
      {
        sessionId: "restored-session-1234",
        message: "여전히 안 풀려요",
        history: [
          { role: "user", content: "분업 OS 컷 잠금 해제 방법을 알려주세요.", topicId: "collab-os-locks" },
          { role: "assistant", content: "프로덕션 허브에서 점유자를 확인해 주세요.", topicId: "collab-os-locks" },
        ],
      },
      { forwardedFor: "10.0.0.8" },
    );

    expect(reply.topicId).toBe("collab-os-locks");
    expect(reply.suggestEscalation).toBe(true);
    expect(reply.actionLinks.some((item) => item.to === "/production")).toBe(true);
  });

  it("환불·결제 취소·계정 삭제 요청에는 담당자 연결을 우선 제안하고 긴급도를 high로 분류한다", () => {
    const result = classifySupportTopic("결제 취소하고 환불받고 싶어요");
    expect(result.topicId).toBe("export-billing");
    expect(result.needsHumanEscalation).toBe(true);
    expect(result.urgency).toBe("high");
  });
});

describe("개인정보·비밀키 자동 마스킹과 ₩0 무료 AI 라우터 연계", () => {
  it("API 키·인증토큰·이메일·전화번호·주민번호·카드번호·비밀번호를 자동 마스킹한다", () => {
    const sampleKey = ["sk", "proj", "demoToken1234567890abcdef"].join("-");
    const sampleBearer = ["Bearer ", "sampleTokenValue_9876543210"].join("");
    const sampleEmail = ["creator", "example.test"].join("@");
    const samplePhone = ["010", "4567", "8901"].join("-");
    const sampleRrn = ["900101", "1234567"].join("-");
    const sampleCard = ["4111", "2222", "3333", "4444"].join("-");
    const samplePw = ["password", "superPass99!"].join("=");

    const raw = `키=${sampleKey} 토큰=${sampleBearer} 메일=${sampleEmail} 번호=${samplePhone} 주민=${sampleRrn} 카드=${sampleCard} ${samplePw}`;
    const result = maskSensitiveSupportText(raw);

    expect(result.piiMasked).toBe(true);
    expect(result.maskedKinds).toEqual(
      expect.arrayContaining(["api_key", "auth_token", "email", "phone", "resident_id", "card_number", "password"]),
    );
    expect(result.masked).not.toContain(sampleKey);
    expect(result.masked).not.toContain("sampleTokenValue_9876543210");
    expect(result.masked).not.toContain(sampleEmail);
    expect(result.masked).not.toContain(samplePhone);
    expect(result.masked).not.toContain(sampleRrn);
    expect(result.masked).not.toContain(sampleCard);
    expect(result.masked).not.toContain("superPass99!");
  });

  it("클라우드 무료 AI 활성 시 마스킹된 텍스트만 StudioFreeAiZeroBillRouter에 전달하고 ₩0으로 응답한다", async () => {
    const router = new StudioFreeAiZeroBillRouter();
    vi.spyOn(router, "getFreeQuotaStatus").mockReturnValue({
      guaranteedZeroCostUsd: 0,
      guaranteedZeroCostLabel: "$0.00",
      guaranteedZeroCostKrwLabel: "₩0",
      paidBillingBlocked: true,
      failClosedOnCutoff: true,
      safetyCutoffRatio: 0.9,
      utcDay: "2026-11-21",
      nextResetUtcIso: "2026-11-22T00:00:00.000Z",
      summary: {
        totalProviders: 9,
        configuredCloudCount: 1,
        activeCloudCount: 1,
        blockedCloudCount: 0,
        localFallbackReady: true,
        activePriorityOrder: ["gemini-free", "local-zero-cost-fallback"],
      },
      providers: [],
    });
    const cascadeSpy = vi.spyOn(router, "executeCascade").mockResolvedValue({
      ok: true,
      providerId: "gemini-free",
      providerTier: "cloud-free",
      model: "gemini-2.5-flash",
      content: "복구 화면에서 최근 자동 저장 스냅샷을 먼저 확인해 보세요.",
      costGuaranteedZeroUsd: 0,
      paidBillingBlocked: true,
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      attempts: [],
    });

    const service = createService({ router });
    const secretSample = ["sk", "ant", "maskTarget1234567890abcd"].join("-");
    const reply = await service.sendMessage(
      { message: `작업 파일 복구가 필요해요. 제 키는 ${secretSample} 입니다.` },
      { userId: "creator-zero-bill" },
    );

    expect(reply.mode).toBe("zero-bill-free-ai");
    expect(reply.costKrw).toBe(0);
    expect(reply.paidBillingBlocked).toBe(true);
    expect(reply.piiMasked).toBe(true);
    expect(reply.userTurn.content).not.toContain(secretSample);
    expect(reply.actionLinks.some((link) => link.to === "/studio/recovery")).toBe(true);

    const passedPrompt = cascadeSpy.mock.calls[0]?.[0]?.userPrompt ?? "";
    expect(passedPrompt).not.toContain(secretSample);
    expect(passedPrompt).toContain("[비밀키 마스킹됨]");
  });

  it("클라우드 무료 AI가 로컬 폴백으로 떨어져도 무중단으로 결정론적 안내를 반환한다", async () => {
    const router = new StudioFreeAiZeroBillRouter();
    vi.spyOn(router, "getFreeQuotaStatus").mockReturnValue({
      guaranteedZeroCostUsd: 0,
      guaranteedZeroCostLabel: "$0.00",
      guaranteedZeroCostKrwLabel: "₩0",
      paidBillingBlocked: true,
      failClosedOnCutoff: true,
      safetyCutoffRatio: 0.9,
      utcDay: "2026-11-21",
      nextResetUtcIso: "2026-11-22T00:00:00.000Z",
      summary: {
        totalProviders: 9,
        configuredCloudCount: 1,
        activeCloudCount: 1,
        blockedCloudCount: 0,
        localFallbackReady: true,
        activePriorityOrder: ["gemini-free", "local-zero-cost-fallback"],
      },
      providers: [],
    });
    vi.spyOn(router, "executeCascade").mockResolvedValue({
      ok: true,
      providerId: "local-zero-cost-fallback",
      providerTier: "local-fallback",
      model: "local-deterministic-v1",
      content: "로컬 폴백 응답",
      costGuaranteedZeroUsd: 0,
      paidBillingBlocked: true,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      attempts: [],
    });

    const service = createService({ router });
    const reply = await service.sendMessage({ message: "브러시가 느려요 WebGPU 확인하고 싶어요" });
    expect(reply.mode).toBe("deterministic-kb");
    expect(reply.topicId).toBe("wasm-webgpu-perf");
    expect(reply.costKrw).toBe(0);
  });
});

describe("티켓 자동 채우기, 속도제한, 입력 검증, 컨트롤러 엔드포인트", () => {
  it("담당자 이관 시 '문의 한 줄' 1개만 입력해도 분류·긴급도·요약·진단 체크리스트를 자동 채운다", () => {
    const service = createService();
    const emailSample = ["help", "studio.test"].join("@");
    const filled = service.suggestTicketAutofill(
      {
        oneLineIssue: `내보내기 PDF가 계속 멈춰요 (${emailSample})`,
        currentPath: "/studio/support",
      },
      { forwardedFor: "10.0.0.5" },
    );

    expect(filled.requiredFieldCount).toBe(1);
    expect(filled.requiredFieldLabelKo).toBe("문의 한 줄");
    expect(filled.category).toBe("export-billing");
    expect(filled.urgency).toBe("high");
    expect(filled.piiMasked).toBe(true);
    expect(filled.oneLineIssue).not.toContain(emailSample);
    expect(filled.summary).not.toContain(emailSample);
    expect(filled.summary).toContain("[AI 자동 분류]");
    expect(filled.diagnosticChecklist.length).toBeGreaterThanOrEqual(3);
    expect(filled.costKrw).toBe(0);
  });

  it("세션 대화 내역만으로 문의 한 줄과 진단 체크리스트를 자동 추출한다", async () => {
    const service = createService();
    const reply = await service.sendMessage(
      { message: "3D 배경과 VRM 캐릭터 합성이 바닥에서 떠 보여요" },
      { userId: "creator-3d" },
    );
    const filled = service.suggestTicketAutofill({ sessionId: reply.sessionId }, { userId: "creator-3d" });

    expect(filled.sessionId).toBe(reply.sessionId);
    expect(filled.category).toBe("bg3d-vrm-composite");
    expect(filled.creatorSupportCategory).toBe("production");
    expect(filled.oneLineIssue).toContain("3D 배경");
    expect(filled.diagnosticChecklist.length).toBeGreaterThanOrEqual(3);
  });

  it("게스트와 로그인 사용자 모두 속도제한(429)을 안전하게 적용한다", async () => {
    let now = 1_700_000_000_000;
    const service = createService({
      guestMaxPerMinute: 2,
      userMaxPerMinute: 3,
      nowMs: () => now,
    });

    await service.sendMessage({ message: "무료 AI 한도 알려줘" }, { forwardedFor: "198.51.100.10" });
    await service.sendMessage({ message: "작업 파일 복구 알려줘" }, { forwardedFor: "198.51.100.10" });
    await expect(
      service.sendMessage({ message: "세 번째 요청" }, { forwardedFor: "198.51.100.10" }),
    ).rejects.toMatchObject({ status: 429 });

    // 로그인 사용자는 독립 버킷과 별도 한도를 가진다
    await service.sendMessage({ message: "첫 요청" }, { userId: "member-1" });
    await service.sendMessage({ message: "둘째 요청" }, { userId: "member-1" });
    await service.sendMessage({ message: "셋째 요청" }, { userId: "member-1" });
    await expect(
      service.sendMessage({ message: "넷째 요청" }, { userId: "member-1" }),
    ).rejects.toBeInstanceOf(HttpException);

    // 61초가 지나면 슬라이딩 윈도우가 열려 다시 정상 응답한다
    now += 61_000;
    const recovered = await service.sendMessage({ message: "다시 질문해요" }, { forwardedFor: "198.51.100.10" });
    expect(recovered.costKrw).toBe(0);
  });

  it("빈 메시지·초과 길이·미지원 필드·빈 자동채움 입력은 400으로 거부한다", async () => {
    const service = createService();
    await expect(service.handleChatRequest({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.handleChatRequest({ message: "   " })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.handleChatRequest({ message: "가".repeat(2_001) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.handleChatRequest({ message: "정상 질문", unexpectedField: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(() => service.suggestTicketAutofill({})).toThrow(BadRequestException);
  });

  it("컨트롤러 aiChat과 aiChatAutofillTicket은 게스트와 로그인 사용자 모두 정상 응답한다", async () => {
    const { controller } = createControllerHarness();
    const guestStart = await controller.aiChat(undefined, "203.0.113.7", { action: "start" });
    expect("greeting" in guestStart).toBe(true);

    const guestReply = await controller.aiChat(undefined, "203.0.113.7", {
      message: SUPPORT_CHAT_QUICK_PROMPTS[0].prompt,
    });
    expect("assistantTurn" in guestReply && guestReply.topicId === "local-backup-opfs").toBe(true);

    const autofill = controller.aiChatAutofillTicket("signed-in-user", undefined, {
      oneLineIssue: "분업 OS 컷 잠금이 안 풀려요",
    });
    expect(autofill.category).toBe("collab-os-locks");
    expect(autofill.requiredFieldCount).toBe(1);
  });
});
