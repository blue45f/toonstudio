import { randomUUID } from "node:crypto";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerSupportAiService } from "./customer-support-ai.service";
import { CustomerSupportController } from "./customer-support.controller";
import { CustomerSupportService } from "./customer-support.service";
import { adminSupportStatusSchema, createSupportSchema, sendSupportSchema, supportListSchema, supportParamsSchema } from "./customer-support.dto";

import type { SupportConversationDetail, SupportMessage } from "@toonstudio/contracts/customer-support";
import type { CustomerSupportRepository } from "./customer-support.repository";

const ID = randomUUID();
const LEASE = randomUUID();
const INPUT = { content: "저장한 원고를 복구하려면 어떻게 하나요?", clientMessageId: randomUUID() };

function detail(status: "ai" | "waiting" | "open" | "closed" = "ai"): SupportConversationDetail {
  return {
    conversation: { id: ID, subject: "저장 및 복구 문의", status, createdAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T00:00:00.000Z" },
    messages: [{ id: randomUUID(), conversationId: ID, role: "user", content: INPUT.content, createdAt: "2026-10-30T00:00:00.000Z" }],
  };
}

function harness() {
  const current = detail();
  const repository = {
    isOperator: vi.fn(async () => true),
    list: vi.fn(async () => ({ items: [current.conversation], total: 1 })),
    create: vi.fn(async () => current),
    detail: vi.fn(async () => current),
    send: vi.fn(async () => true),
    setStatus: vi.fn(async () => undefined),
    reserveAi: vi.fn<CustomerSupportRepository["reserveAi"]>().mockResolvedValue({ lease: LEASE, messages: current.messages }),
    finishAi: vi.fn(async () => undefined),
  } satisfies CustomerSupportRepository;
  const ai = new CustomerSupportAiService();
  vi.spyOn(ai, "status").mockReturnValue({ available: true, reason: "configured" });
  vi.spyOn(ai, "answer").mockResolvedValue("버전·복구 화면을 확인해 주세요.");
  const service = new CustomerSupportService(repository, ai);
  const controller = new CustomerSupportController(service);
  return { repository, ai, service, controller, current };
}

afterEach(() => vi.restoreAllMocks());

describe("고객상담 인증·입력·권한 경계", () => {
  it("모든 비공개 경로에서 로그인을 요구한다", async () => {
    const { controller, repository } = harness();
    expect(() => controller.status()).toThrow("로그인이 필요");
    const calls = [
      () => controller.list(undefined, {}),
      () => controller.create(undefined, { subject: "문의합니다", mode: "human" }),
      () => controller.detail(undefined, ID),
      () => controller.send(undefined, ID, INPUT),
      () => controller.retry(undefined, ID),
      () => controller.escalate(undefined, ID),
      () => controller.close(undefined, ID),
      () => controller.adminList(undefined, {}),
      () => controller.adminDetail(undefined, ID),
      () => controller.adminSend(undefined, ID, INPUT),
      () => controller.adminStatus(undefined, ID, { status: "open" }),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ status: 401 });
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.send).not.toHaveBeenCalled();
  });

  it("일반 회원이 관리자 목록·열람·답변·상태를 변경할 수 없다", async () => {
    const { controller, repository } = harness();
    repository.isOperator.mockResolvedValue(false);
    for (const call of [
      () => controller.adminList("member", {}),
      () => controller.adminDetail("member", ID),
      () => controller.adminSend("member", ID, INPUT),
      () => controller.adminStatus("member", ID, { status: "closed" }),
    ]) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.detail).not.toHaveBeenCalled();
    expect(repository.send).not.toHaveBeenCalled();
    expect(repository.setStatus).not.toHaveBeenCalled();
  });

  it("소유자 ID를 읽기와 쓰기에 전달하고 다른 회원 문의의 404를 유지한다", async () => {
    const { controller, repository, ai } = harness();
    await controller.list("owner", { limit: "20" });
    expect(repository.list).toHaveBeenCalledWith("owner", undefined, 20, 0);
    repository.detail.mockRejectedValue(new NotFoundException("문의를 찾을 수 없어요."));
    await expect(controller.retry("stranger", ID)).rejects.toMatchObject({ status: 404 });
    expect(repository.detail).toHaveBeenLastCalledWith(ID, "stranger");
    expect(repository.reserveAi).not.toHaveBeenCalled();
    expect(ai.answer).not.toHaveBeenCalled();
  });

  it("운영자 권한 확인 후 관리자 범위로만 저장소를 호출한다", async () => {
    const { controller, repository } = harness();
    await controller.adminDetail("operator", ID);
    expect(repository.detail).toHaveBeenCalledWith(ID, null);
    await controller.adminStatus("operator", ID, { status: "open" });
    expect(repository.setStatus).toHaveBeenCalledWith(ID, null, "open");
  });

  it("빈 입력·잘못된 ID·초과 길이·임의 역할·키·상태·페이지를 거부한다", async () => {
    const { controller, repository } = harness();
    for (const input of [null, {}, { subject: "a", mode: "ai" }, { subject: "a".repeat(121), mode: "ai" }, { subject: "문의", mode: "ai", apiKey: "not-a-key" }]) {
      expect(createSupportSchema.safeParse(input).success).toBe(false);
      await expect(controller.create("owner", input)).rejects.toMatchObject({ status: 400 });
    }
    for (const input of [{ ...INPUT, content: " " }, { ...INPUT, content: "x".repeat(4001) }, { ...INPUT, clientMessageId: "invalid" }, { ...INPUT, role: "admin" }]) expect(sendSupportSchema.safeParse(input).success).toBe(false);
    expect(supportParamsSchema.safeParse({ id: "broken" }).success).toBe(false);
    for (const query of [{ status: "unknown" }, { limit: 0 }, { limit: 101 }, { limit: "NaN" }, { ownerId: "stranger" }]) expect(supportListSchema.safeParse(query).success).toBe(false);
    for (const input of [null, {}, { status: "ai" }, { status: "waiting" }, { status: "open", ownerId: "other" }]) expect(adminSupportStatusSchema.safeParse(input).success).toBe(false);
    await expect(controller.detail("owner", "broken")).rejects.toMatchObject({ status: 400 });
    await expect(controller.send("owner", ID, { ...INPUT, content: "" })).rejects.toMatchObject({ status: 400 });
    await expect(controller.adminStatus("operator", ID, {})).rejects.toMatchObject({ status: 400 });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.send).not.toHaveBeenCalled();
  });

  it("저장소 오류의 SQL·시크릿·접속 원문을 응답에 포함하지 않는다", async () => {
    const { controller, repository } = harness();
    repository.list.mockRejectedValue(new Error("private SQL secret_value customer_support owner identity"));
    const error = await controller.list("owner", {}).catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 503 });
    expect(String(error)).not.toMatch(/secret_value|private SQL|identity/u);
  });
});

describe("저장 후 AI 응답·재시도·상담원 전환", () => {
  it("질문을 저장한 다음 서버 문맥만으로 AI를 한 번 호출한다", async () => {
    const { controller, repository, ai } = harness();
    await controller.send("owner", ID, INPUT);
    expect(repository.send).toHaveBeenCalledWith(ID, "owner", INPUT, false);
    expect(repository.send.mock.invocationCallOrder[0]).toBeLessThan(repository.reserveAi.mock.invocationCallOrder[0]);
    expect(ai.answer).toHaveBeenCalledOnce();
    expect(ai.answer).toHaveBeenCalledWith([{ role: "user", content: INPUT.content }]);
    expect(repository.finishAi).toHaveBeenCalledWith(ID, LEASE, "버전·복구 화면을 확인해 주세요.");
  });

  it("같은 clientMessageId의 재전송으로 AI가 다시 실행되지 않는다", async () => {
    const { controller, repository, ai } = harness();
    repository.send.mockResolvedValue(false);
    await controller.send("owner", ID, INPUT);
    expect(repository.reserveAi).not.toHaveBeenCalled();
    expect(ai.answer).not.toHaveBeenCalled();
  });

  it("1:1 문의 메시지와 운영자 답변은 AI를 호출하지 않는다", async () => {
    const { controller, repository, ai } = harness();
    repository.detail.mockResolvedValue(detail("waiting"));
    await controller.send("owner", ID, INPUT);
    await controller.adminSend("operator", ID, INPUT);
    expect(repository.send).toHaveBeenLastCalledWith(ID, "operator", INPUT, true);
    expect(ai.answer).not.toHaveBeenCalled();
  });

  it("저장 실패 뒤에는 유료 AI를 호출하지 않는다", async () => {
    const { controller, repository, ai } = harness();
    repository.send.mockRejectedValue(new Error("db unavailable"));
    await expect(controller.send("owner", ID, INPUT)).rejects.toMatchObject({ status: 503 });
    expect(ai.answer).not.toHaveBeenCalled();
  });

  it("키가 없으면 저장된 질문과 상담원 전환 가능한 오류를 돌려준다", async () => {
    const { controller, repository, ai } = harness();
    vi.mocked(ai.status).mockReturnValue({ available: false, reason: "missing_key" });
    const response = await controller.send("owner", ID, INPUT);
    expect(response.messages[0].content).toBe(INPUT.content);
    expect(response.aiError?.code).toBe("SUPPORT_AI_UNAVAILABLE");
    expect(repository.reserveAi).not.toHaveBeenCalled();
    expect(ai.answer).not.toHaveBeenCalled();
  });

  it("AI 실패는 질문을 보존하고 예약을 해제하며 자동으로 재시도하지 않는다", async () => {
    const { controller, repository, ai } = harness();
    vi.mocked(ai.answer).mockRejectedValue(new Error("provider raw secret"));
    const response = await controller.send("owner", ID, INPUT);
    expect(response.messages[0].content).toBe(INPUT.content);
    expect(response.aiError?.code).toBe("SUPPORT_AI_UNAVAILABLE");
    expect(JSON.stringify(response)).not.toContain("provider raw secret");
    expect(repository.finishAi).toHaveBeenCalledWith(ID, LEASE);
    expect(ai.answer).toHaveBeenCalledOnce();
  });

  it("명시적 재시도는 사용자 메시지를 중복 저장하지 않는다", async () => {
    const { controller, repository, ai } = harness();
    await controller.retry("owner", ID);
    expect(repository.send).not.toHaveBeenCalled();
    expect(ai.answer).toHaveBeenCalledOnce();
  });

  it("일일 한도와 실행 중 예약은 AI 호출 없이 안전한 상태를 반환한다", async () => {
    const { controller, repository, ai } = harness();
    for (const code of ["SUPPORT_AI_LIMIT", "SUPPORT_AI_BUSY"] as const) {
      vi.spyOn(repository, "reserveAi").mockResolvedValue({ error: { code, message: "잠시 후 다시 이용해 주세요." } });
      expect((await controller.retry("owner", ID)).aiError?.code).toBe(code);
    }
    expect(ai.answer).not.toHaveBeenCalled();
  });

  it("장기 대화의 최신 질문을 유지하면서 제공자 문맥은 16000자·20개로 제한한다", async () => {
    const { controller, repository, ai, current } = harness();
    const history: SupportMessage[] = Array.from({ length: 100 }, (_, index) => ({
      ...current.messages[0], id: randomUUID(), role: index % 2 === 0 ? "assistant" : "user", content: `${index}:` + "문".repeat(3000),
    }));
    repository.reserveAi.mockResolvedValue({ lease: LEASE, messages: history });
    await controller.retry("owner", ID);
    const sent = vi.mocked(ai.answer).mock.calls[0][0];
    expect(sent.length).toBeLessThanOrEqual(20);
    expect(sent.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(16000);
    expect(sent[0].role).toBe("user");
    expect(sent.at(-1)?.content).toBe(history.at(-1)?.content);
  });

  it("상담원 전환·종료를 소유자 범위로 전달한다", async () => {
    const { controller, repository } = harness();
    await controller.escalate("owner", ID);
    expect(repository.setStatus).toHaveBeenLastCalledWith(ID, "owner", "waiting");
    await controller.close("owner", ID);
    expect(repository.setStatus).toHaveBeenLastCalledWith(ID, "owner", "closed");
  });
});
