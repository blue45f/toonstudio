/**
 * research.service.test.ts — 리서치 서비스 단위 테스트.
 * 가짜 클라이언트·지갑·게이트 스토어로 차감 흐름을 검증한다.
 */
import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { InMemoryPaidOperationsSettingStore } from "../membership-wallet/paid-operations-gate";
import { DeepSeekSearchError } from "./deepseek-search-client";
import { ResearchService } from "./research.service";

import type { DeepSeekSearchClient } from "./deepseek-search-client";
import type { MembershipWalletService } from "../membership-wallet/membership-wallet.service";
import type { PaidOperationsSettingStore } from "../membership-wallet/paid-operations-gate";

function clientHarness() {
  const search = vi.fn(async () => ({
    results: [{
      title: "첫째",
      url: "https://example.com/1",
      snippet: "요약",
      summary: "요약문",
      content: "",
      siteName: "example",
      rerankScore: 2,
      authority: 3,
    }],
  }));
  const fetchPage = vi.fn(async () => ({ title: "첫째 원문", content: "본문" }));
  const client = { search, fetchPage } as unknown as DeepSeekSearchClient;
  return { client, search, fetchPage };
}

function walletHarness() {
  const reserveStudioCredits = vi.fn(async () => ({ id: "res-1", status: "reserved" }));
  const captureCreditReservation = vi.fn(async () => ({}));
  const releaseCreditReservation = vi.fn(async () => ({}));
  const wallet = {
    reserveStudioCredits,
    captureCreditReservation,
    releaseCreditReservation,
  } as unknown as MembershipWalletService;
  return { wallet, reserveStudioCredits, captureCreditReservation, releaseCreditReservation };
}

function serviceHarness(options: {
  client?: DeepSeekSearchClient | null;
  gateEnabled?: boolean;
  withWallet?: boolean;
} = {}) {
  const { client } = clientHarness();
  const { wallet, ...walletFns } = walletHarness();
  const store: PaidOperationsSettingStore =
    new InMemoryPaidOperationsSettingStore(options.gateEnabled ?? true);
  const service = new ResearchService(
    options.client === undefined ? client : options.client,
    { creditsPerSearch: 1, creditsPerFetch: 1 },
    options.withWallet === false ? undefined : wallet,
    store,
  );
  return { service, walletFns, store };
}

describe("ResearchService status", () => {
  it("키가 있으면 configured=true, 없으면 false를 반환한다", () => {
    const { service } = serviceHarness();
    expect(service.status().configured).toBe(true);
    const { service: disabled } = serviceHarness({ client: null });
    expect(disabled.status().configured).toBe(false);
  });
});

describe("ResearchService brief 차감", () => {
  it("게이트 ON이면 예약 후 실제 사용량으로 캡처한다", async () => {
    const { service, walletFns } = serviceHarness();
    const response = await service.brief("user-1", {
      question: "조선시대 시장",
      fetchSources: true,
      maxFetchSources: 1,
    } as never, "idem-1");
    expect(response.result.question).toBe("조선시대 시장");
    expect(response.usage).toEqual({ searches: 1, fetches: 1 });
    expect(response.credits).toBe(2);
    expect(response.charged).toBe(true);
    expect(walletFns.reserveStudioCredits).toHaveBeenCalledTimes(1);
    expect(walletFns.captureCreditReservation).toHaveBeenCalledWith("res-1", 2);
    expect(walletFns.releaseCreditReservation).not.toHaveBeenCalled();
  });

  it("게이트 OFF면 차감 없이 미터링만 하고 요청은 처리한다", async () => {
    const { service, walletFns } = serviceHarness({ gateEnabled: false });
    const response = await service.brief("user-1", {
      question: "조선시대 시장",
    } as never, "idem-1");
    expect(response.charged).toBe(false);
    expect(response.credits).toBe(1);
    expect(walletFns.reserveStudioCredits).not.toHaveBeenCalled();
  });

  it("클라이언트 미설정 시 503을 반환한다", async () => {
    const { service } = serviceHarness({ client: null });
    const error = await service.brief("user-1", {
      question: "질의",
    } as never, "idem-1").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
  });

  it("리서치 실패 시 예약을 해제하고 상류 오류를 매핑한다", async () => {
    const { client } = clientHarness();
    (client as unknown as { search: ReturnType<typeof vi.fn> }).search =
      vi.fn(async () => {
        throw new DeepSeekSearchError("DEEPSEEK_RATE_LIMITED", 429, "한도 초과");
      });
    const { wallet, ...walletFns } = walletHarness();
    const store = new InMemoryPaidOperationsSettingStore(true);
    const service = new ResearchService(
      client,
      { creditsPerSearch: 1, creditsPerFetch: 1 },
      wallet,
      store,
    );
    const error = await service.brief("user-1", {
      question: "질의",
    } as never, "idem-1").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(walletFns.releaseCreditReservation).toHaveBeenCalledWith("res-1");
    expect(walletFns.captureCreditReservation).not.toHaveBeenCalled();
  });
});

describe("ResearchService trendDigest", () => {
  it("질의 수에 비례해 예약 단위를 잡는다", async () => {
    const { service, walletFns } = serviceHarness();
    const response = await service.trendDigest("user-1", {
      queries: ["판타지", "로맨스"],
      fetchSources: true,
    } as never, "idem-1");
    expect(response.usage).toEqual({ searches: 2, fetches: 2 });
    expect(response.credits).toBe(4);
    const reserveInput = walletFns.reserveStudioCredits.mock.calls[0][0];
    expect(reserveInput.units).toBe(4);
  });
});
