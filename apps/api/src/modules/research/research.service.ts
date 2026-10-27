/**
 * research.service.ts — 리서치 Nest 서비스. 순수 로직(research-logic.ts,
 * research-credit-*.ts)의 얇은 래퍼이며, 오류를 Nest HTTP 예외로만 매핑한다.
 * 특정 검색 프로바이더를 언급하지 않는다. 프로바이더는 SearchProvider
 * 인터페이스로 주입받는다.
 *
 * 처리 순서 (차감 안전):
 *  1. 클라이언트 미설정 시 503으로 거부한다 (키 없으면 기능 비활성화).
 *  2. 예상 사용량만큼 지갑 예약을 잡는다 (게이트 ON·지갑 주입 시에만).
 *  3. 리서치를 실행한다. 성공 시 실제 사용량으로 캡처, 실패 시 해제한다.
 *  4. 사용량은 메모리 장부에도 기록해 운영자가 집계할 수 있게 한다.
 * 게이트 OFF·지갑 미주입이면 차감 없이 미터링만 기록한다 — 이 경우에도
 * 응답의 credits 필드로 비용이 투명하게 보인다.
 */
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

import {
  RESEARCH_SEARCH_PROVIDER,
} from "./search-provider-factory";
import { RESEARCH_SEARCH_PROVIDER_NAME } from "./search-provider-config";
import {
  SearchProviderError,
  type SearchProvider,
} from "./search-provider";
import {
  buildResearchBrief,
  buildTrendDigest,
  checkExistence,
  type ExistenceCheckResult,
  type ResearchBrief,
  type TrendDigest,
} from "./research-logic";
import {
  beginResearchCreditCharge,
  ResearchCreditError,
  settleResearchCreditCharge,
  type ResearchCreditCharge,
  type ResearchCreditWallet,
} from "./research-credit-charge";
import {
  InMemoryResearchCreditLedger,
  researchCreditsForUsage,
  type ResearchCreditPricing,
} from "./research-credit-meter";
import { resolvePaidOperationsEnabled } from "../membership-wallet/paid-operations-gate";
import {
  PAID_OPERATIONS_SETTING_STORE,
  type PaidOperationsSettingStore,
} from "./research-credit-charge";
import { MembershipWalletService } from "../membership-wallet/membership-wallet.service";
import type {
  ExistenceCheckDto,
  ResearchBriefDto,
  TrendDigestDto,
} from "./research.dto";

/** Nest 주입 토큰 — 환경변수에서 해석한 리서치 단가 설정. */
export const RESEARCH_CREDIT_PRICING = Symbol("RESEARCH_CREDIT_PRICING");

export interface ResearchServiceResult<T> {
  readonly result: T;
  /** 이번 요청의 검색 API 성공 호출 수. */
  readonly usage: { readonly searches: number; readonly fetches: number };
  /** 이번 요청의 크레딧 환산량 (지갑 차감 여부와 무관하게 표시). */
  readonly credits: number;
  /** 지갑 차감이 실제로 수행됐는지 여부. */
  readonly charged: boolean;
}

function toHttpException(error: unknown): HttpException {
  if (error instanceof SearchProviderError) {
    return new HttpException(
      { code: error.code, message: error.message },
      error.status,
    );
  }
  if (error instanceof ResearchCreditError) {
    return new HttpException(
      { code: error.code, message: error.message },
      error.status,
    );
  }
  if (error instanceof Error && error.message.includes("1~10건")) {
    return new BadRequestException({
      code: "RESEARCH_INVALID_INPUT",
      message: error.message,
    });
  }
  throw error;
}

@Injectable()
export class ResearchService {
  private readonly ledger = new InMemoryResearchCreditLedger();

  constructor(
    @Inject(RESEARCH_SEARCH_PROVIDER)
    private readonly client: SearchProvider | null,
    @Inject(RESEARCH_CREDIT_PRICING)
    private readonly pricing: ResearchCreditPricing,
    @Optional()
    @Inject(MembershipWalletService)
    private readonly wallet?: MembershipWalletService,
    @Optional()
    @Inject(PAID_OPERATIONS_SETTING_STORE)
    private readonly paidOperations?: PaidOperationsSettingStore,
    @Optional()
    @Inject(RESEARCH_SEARCH_PROVIDER_NAME)
    private readonly providerName?: string,
  ) {}

  status(): {
    configured: boolean;
    provider: string;
    maxQueryLength: number;
    creditsPerSearch: number;
    creditsPerFetch: number;
  } {
    return {
      configured: this.client !== null,
      provider: this.providerName ?? this.client?.providerName ?? "unconfigured",
      maxQueryLength: 128,
      creditsPerSearch: this.pricing.creditsPerSearch,
      creditsPerFetch: this.pricing.creditsPerFetch,
    };
  }

  /** 지갑 차감 대상일 때만 예약을 잡는다. 그 외에는 미터링만 한다. */
  private async beginCharge(
    userId: string,
    estimatedUnits: number,
    idempotencyKey: string,
    operation: string,
  ): Promise<ResearchCreditCharge> {
    if (!this.wallet) return { charged: false };
    if (!(await resolvePaidOperationsEnabled(this.paidOperations))) {
      return { charged: false };
    }
    const wallet = this.wallet as unknown as ResearchCreditWallet;
    return beginResearchCreditCharge(
      wallet,
      { userId, estimatedUnits, idempotencyKey, operation },
      this.paidOperations,
    );
  }

  private async runCharged<T>(
    userId: string,
    operation: string,
    estimatedUnits: number,
    idempotencyKey: string | undefined,
    task: (client: SearchProvider) => Promise<{
      result: T;
      usage: { searches: number; fetches: number };
    }>,
  ): Promise<ResearchServiceResult<T>> {
    if (!this.client) {
      throw new ServiceUnavailableException({
        code: "RESEARCH_NOT_CONFIGURED",
        message: "검색 API 키가 설정되지 않아 리서치 기능을 사용할 수 없습니다.",
      });
    }
    const key = idempotencyKey ?? randomUUID();
    const charge = await this.beginCharge(userId, estimatedUnits, key, operation);
    const wallet = this.wallet as unknown as ResearchCreditWallet | undefined;
    try {
      const { result, usage } = await task(this.client);
      const credits = researchCreditsForUsage(usage, this.pricing);
      await settleResearchCreditCharge(wallet, charge, "success", credits);
      this.ledger.record(userId, usage, this.pricing);
      return { result, usage, credits, charged: charge.charged };
    } catch (error) {
      await settleResearchCreditCharge(wallet, charge, "failure").catch(
        () => {},
      );
      throw toHttpException(error);
    }
  }

  async brief(
    userId: string,
    body: ResearchBriefDto,
    idempotencyKey?: string,
  ): Promise<ResearchServiceResult<ResearchBrief>> {
    const fetchCount = body.fetchSources ? (body.maxFetchSources ?? 2) : 0;
    return this.runCharged(
      userId,
      "brief",
      1 + fetchCount,
      idempotencyKey,
      async (client) => {
        const result = await buildResearchBrief(client, {
          question: body.question,
          fetchSources: body.fetchSources,
          maxFetchSources: body.maxFetchSources,
        });
        return { result, usage: result.usage };
      },
    );
  }

  async existenceCheck(
    userId: string,
    body: ExistenceCheckDto,
    idempotencyKey?: string,
  ): Promise<ResearchServiceResult<ExistenceCheckResult>> {
    return this.runCharged(
      userId,
      "existence-check",
      1,
      idempotencyKey,
      async (client) => {
        const result = await checkExistence(client, {
          title: body.title,
          maxResults: body.maxResults,
        });
        return { result, usage: result.usage };
      },
    );
  }

  async trendDigest(
    userId: string,
    body: TrendDigestDto,
    idempotencyKey?: string,
  ): Promise<ResearchServiceResult<TrendDigest>> {
    const estimated = body.queries.length * (body.fetchSources ? 2 : 1);
    return this.runCharged(
      userId,
      "trend-digest",
      estimated,
      idempotencyKey,
      async (client) => {
        const result = await buildTrendDigest(client, {
          queries: body.queries,
          fetchSources: body.fetchSources,
        });
        return { result, usage: result.usage };
      },
    );
  }
}
