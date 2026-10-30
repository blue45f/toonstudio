import {
  BadRequestException, ForbiddenException, HttpException, Inject, Injectable,
  ServiceUnavailableException, UnauthorizedException,
} from "@nestjs/common";

import { CustomerSupportAiService } from "./customer-support-ai.service";
import { customerSupportAiContext } from "./customer-support-ai-context";
import { CUSTOMER_SUPPORT_REPOSITORY } from "./customer-support.repository";
import { adminSupportStatusSchema, createSupportSchema, sendSupportSchema, supportListSchema, supportParamsSchema } from "./customer-support.dto";

import type { CustomerSupportRepository } from "./customer-support.repository";
import type { SupportConversationDetail, SupportConversationStatus } from "@toonstudio/contracts/customer-support";
import type { z } from "zod";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException("문의 입력 내용을 확인해 주세요.");
  return result.data;
}

@Injectable()
export class CustomerSupportService {
  constructor(
    @Inject(CUSTOMER_SUPPORT_REPOSITORY) private readonly repository: CustomerSupportRepository,
    @Inject(CustomerSupportAiService) private readonly ai: CustomerSupportAiService,
  ) {}

  private user(userId: string | undefined): string {
    if (!userId?.trim()) throw new UnauthorizedException("로그인이 필요해요.");
    return userId;
  }

  private async safe<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      // PostgreSQL 문장·접속 정보·사용자 내용이 응답에 포함되지 않도록 고정 오류만 보낸다.
      throw new ServiceUnavailableException({ code: "SUPPORT_UNAVAILABLE", message: "문의를 불러오거나 저장할 수 없어요. 잠시 후 다시 시도해 주세요." });
    }
  }

  private async operator(userId: string | undefined): Promise<string> {
    const id = this.user(userId);
    if (!(await this.repository.isOperator(id))) throw new ForbiddenException("운영자 권한이 필요해요.");
    return id;
  }

  status(userId?: string) {
    this.user(userId);
    return { ai: this.ai.status() };
  }

  list(userId: string | undefined, input: unknown, admin = false) {
    return this.safe(async () => {
      const actor = admin ? await this.operator(userId) : this.user(userId);
      const query = parse(supportListSchema, input);
      return this.repository.list(admin ? null : actor, query.status, query.limit, query.offset);
    });
  }

  create(userId: string | undefined, input: unknown) {
    return this.safe(async () => {
      const actor = this.user(userId);
      return this.repository.create(actor, parse(createSupportSchema, input));
    });
  }

  detail(userId: string | undefined, conversationId: string, admin = false) {
    return this.safe(async () => {
      const actor = admin ? await this.operator(userId) : this.user(userId);
      const { id } = parse(supportParamsSchema, { id: conversationId });
      return this.repository.detail(id, admin ? null : actor);
    });
  }

  send(userId: string | undefined, conversationId: string, input: unknown, admin = false) {
    return this.safe(async () => {
      const actor = admin ? await this.operator(userId) : this.user(userId);
      const { id } = parse(supportParamsSchema, { id: conversationId });
      const inserted = await this.repository.send(id, actor, parse(sendSupportSchema, input), admin);
      const detail = await this.repository.detail(id, admin ? null : actor);
      if (!admin && inserted && detail.conversation.status === "ai") return this.answer(id, actor);
      return detail;
    });
  }

  retry(userId: string | undefined, conversationId: string) {
    return this.safe(async () => {
      const actor = this.user(userId);
      const { id } = parse(supportParamsSchema, { id: conversationId });
      // 제공자 설정을 확인하기 전에 반드시 소유권부터 검증한다.
      await this.repository.detail(id, actor);
      return this.answer(id, actor);
    });
  }

  setStatus(userId: string | undefined, conversationId: string, status: SupportConversationStatus, admin = false) {
    return this.safe(async () => {
      const actor = admin ? await this.operator(userId) : this.user(userId);
      const { id } = parse(supportParamsSchema, { id: conversationId });
      if (admin) parse(adminSupportStatusSchema, { status });
      else if (status !== "waiting" && status !== "closed") throw new BadRequestException("문의 상태를 확인해 주세요.");
      await this.repository.setStatus(id, admin ? null : actor, status);
      return this.repository.detail(id, admin ? null : actor);
    });
  }

  setAdminStatus(userId: string | undefined, conversationId: string, input: unknown) {
    return this.safe(async () => {
      await this.operator(userId);
      const { status } = parse(adminSupportStatusSchema, input);
      return this.setStatus(userId, conversationId, status, true);
    });
  }

  private async answer(id: string, actor: string): Promise<SupportConversationDetail> {
    if (!this.ai.status().available) {
      const detail = await this.repository.detail(id, actor);
      return { ...detail, aiError: { code: "SUPPORT_AI_UNAVAILABLE", message: "AI 상담을 지금 이용할 수 없어요. 1:1 문의로 전환해 주세요." } };
    }
    const reservation = await this.repository.reserveAi(id, actor);
    if (reservation.error || !reservation.lease || !reservation.messages) {
      return { ...await this.repository.detail(id, actor), ...(reservation.error ? { aiError: reservation.error } : {}) };
    }
    const { lease, messages } = reservation;
    let content: string;
    try { content = await this.ai.answer(customerSupportAiContext(messages)); }
    catch {
      await this.repository.finishAi(id, lease);
      const detail = await this.repository.detail(id, actor);
      return detail.conversation.status === "ai"
        ? { ...detail, aiError: { code: "SUPPORT_AI_UNAVAILABLE", message: "질문은 저장했지만 AI 답변을 받지 못했어요. 답변을 다시 요청하거나 1:1 문의로 전환해 주세요." } }
        : detail;
    }
    await this.repository.finishAi(id, lease, content);
    return this.repository.detail(id, actor);
  }
}
