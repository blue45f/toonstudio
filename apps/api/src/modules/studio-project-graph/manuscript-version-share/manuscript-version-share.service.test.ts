import { GoneException, HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  hashVersionSharePassword,
  hashVersionShareToken,
  isVersionShareExpired,
  nextManuscriptSnapshotName,
  verifyVersionSharePassword,
  versionShareExpiresAt,
  versionShareTokenSuffix,
  type VersionShareResolution,
} from "./manuscript-version-share.repository";
import { ManuscriptVersionShareService } from "./manuscript-version-share.service";

describe("버전 공유 토큰 해시", () => {
  it("sha256 hex로 저장하고 원문을 되돌릴 수 없게 한다", () => {
    const hash = hashVersionShareToken("Ab3dEf6hIjKlMnOpQrStUvWx");
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash).not.toContain("Ab3dEf6hIjKlMnOpQrStUvWx");
    expect(hashVersionShareToken("Ab3dEf6hIjKlMnOpQrStUvWx")).toBe(hash);
    expect(hashVersionShareToken("different-token-value")).not.toBe(hash);
  });

  it("표시용 접미사는 끝 4자다", () => {
    expect(versionShareTokenSuffix("Ab3dEf6hIjKlMnOpQrStUvWx")).toBe("UvWx");
  });
});

describe("버전 공유 비밀번호 해시", () => {
  it("scrypt 해시로 저장하고 올바른 비밀번호만 통과한다", async () => {
    const stored = hashVersionSharePassword("moon-1234");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("moon-1234");
    // 검증은 비동기여야 한다: 동기 scrypt 는 요청마다 이벤트 루프를 수십 ms 점유해 서버 전체를 멈춘다.
    await expect(verifyVersionSharePassword("moon-1234", stored)).resolves.toBe(true);
    await expect(verifyVersionSharePassword("moon-9999", stored)).resolves.toBe(false);
  });

  it("같은 비밀번호도 솔트 때문에 해시가 다르고, 깨진 형식은 거부한다", async () => {
    expect(hashVersionSharePassword("same")).not.toBe(hashVersionSharePassword("same"));
    await expect(verifyVersionSharePassword("same", "not-a-hash")).resolves.toBe(false);
    await expect(verifyVersionSharePassword("same", "scrypt$zz$yy")).resolves.toBe(false);
    await expect(verifyVersionSharePassword("same", "")).resolves.toBe(false);
  });
});

describe("공유 만료 계산", () => {
  const createdAt = new Date("2026-10-03T00:00:00.000Z");

  it("0일·null은 무만료다", () => {
    expect(versionShareExpiresAt(createdAt, 0)).toBeNull();
    expect(versionShareExpiresAt(createdAt, null)).toBeNull();
  });

  it("양수 일수는 createdAt에 정확히 더해진다", () => {
    expect(versionShareExpiresAt(createdAt, 7)?.toISOString())
      .toBe("2026-10-10T00:00:00.000Z");
  });

  it("만료 판정은 expiresAt 경과 여부로 한다", () => {
    const now = new Date("2026-10-10T00:00:00.000Z");
    expect(isVersionShareExpired({ expiresAt: null }, now)).toBe(false);
    expect(isVersionShareExpired({ expiresAt: "2026-10-11T00:00:00.000Z" }, now)).toBe(false);
    expect(isVersionShareExpired({ expiresAt: "2026-10-10T00:00:00.000Z" }, now)).toBe(true);
    expect(isVersionShareExpired({ expiresAt: "2026-10-09T00:00:00.000Z" }, now)).toBe(true);
  });
});

describe("스냅샷 자동 이름", () => {
  it("기존 v{n}의 최대값 다음을 만든다", () => {
    expect(nextManuscriptSnapshotName([])).toBe("v1");
    expect(nextManuscriptSnapshotName(["v1", "v2"])).toBe("v3");
    expect(nextManuscriptSnapshotName(["v1", "v9", "검수본", "v3"])).toBe("v10");
  });
});

describe("공유 링크 해석 상태 매핑", () => {
  function serviceReturning(resolution: VersionShareResolution) {
    const repository = {
      resolveShare: vi.fn(async () => resolution),
    };
    return new ManuscriptVersionShareService(repository as never);
  }

  const okResolution: VersionShareResolution = {
    kind: "ok",
    permission: "view",
    watermark: false,
    workId: "work-1",
    projectId: "project-1",
    artifactId: "artifact-1",
    artifactTitle: "1화 원고",
    workTitle: "달빛 기사",
    snapshot: {
      id: "snap-1",
      artifactId: "artifact-1",
      name: "v3",
      memo: "",
      revisionId: "rev-1",
      rootGraphHash: "a".repeat(64),
      revisionKind: "commit",
      revisionMessage: null,
      createdBy: "user-1",
      createdAt: "2026-10-03T00:00:00.000Z",
    },
    revision: {
      id: "rev-1",
      artifactId: "artifact-1",
      kind: "commit",
      parentIds: [],
      rootGraphHash: "a".repeat(64),
      operationFirst: 1,
      operationLast: 2,
      createdBy: "user-1",
      deviceId: "device-1",
      createdAt: "2026-10-03T00:00:00.000Z",
      message: null,
    },
  };

  it("정상 해석은 그대로 반환한다", async () => {
    const service = serviceReturning(okResolution);
    await expect(service.resolveShare("token-value-123456")).resolves.toBe(okResolution);
  });

  it("없는 링크는 404 코드와 함께 던진다", async () => {
    const service = serviceReturning({ kind: "missing" });
    const error = await service.resolveShare("token-value-123456").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: "version_share_not_found",
    });
  });

  it("회수·만료는 410으로 구분한다", async () => {
    const revoked = await serviceReturning({ kind: "revoked" })
      .resolveShare("token-value-123456").catch((e: unknown) => e);
    expect(revoked).toBeInstanceOf(GoneException);
    expect((revoked as GoneException).getResponse()).toMatchObject({
      code: "version_share_revoked",
    });
    const expired = await serviceReturning({ kind: "expired" })
      .resolveShare("token-value-123456").catch((e: unknown) => e);
    expect(expired).toBeInstanceOf(GoneException);
    expect((expired as GoneException).getResponse()).toMatchObject({
      code: "version_share_expired",
    });
  });

  it("비밀번호 필요·불일치는 401 코드로 구분한다", async () => {
    const required = await serviceReturning({ kind: "password_required" })
      .resolveShare("token-value-123456").catch((e: unknown) => e);
    expect(required).toBeInstanceOf(HttpException);
    expect((required as HttpException).getStatus()).toBe(401);
    expect((required as HttpException).getResponse()).toMatchObject({
      code: "version_share_password_required",
    });
    const invalid = await serviceReturning({ kind: "password_invalid" })
      .resolveShare("token-value-123456", "wrong").catch((e: unknown) => e);
    expect((invalid as HttpException).getResponse()).toMatchObject({
      code: "version_share_password_invalid",
    });
  });

  describe("비밀번호 무차별 대입 방어", () => {
    const TOKEN = "token-value-123456";
    function guarded(rightPassword = "right") {
      const resolveShare = vi.fn(async (_token: string, password?: string): Promise<VersionShareResolution> => {
        if (!password) return { kind: "password_required" };
        return password === rightPassword ? okResolution : { kind: "password_invalid" };
      });
      return { service: new ManuscriptVersionShareService({ resolveShare } as never), resolveShare };
    }
    async function failMany(service: ManuscriptVersionShareService, count: number, token = TOKEN) {
      for (let attempt = 0; attempt < count; attempt += 1) {
        const error = await service.resolveShare(token, `wrong-${attempt}`).catch((e: unknown) => e);
        expect((error as HttpException).getStatus()).toBe(401);
      }
    }

    it("실패가 한도(10회)에 닿으면 올바른 비밀번호도 429 로 막고 저장소를 더 호출하지 않는다", async () => {
      const { service, resolveShare } = guarded();
      await failMany(service, 10);
      expect(resolveShare).toHaveBeenCalledTimes(10);

      const locked = await service.resolveShare(TOKEN, "right").catch((e: unknown) => e);
      expect(locked).toBeInstanceOf(HttpException);
      expect((locked as HttpException).getStatus()).toBe(429);
      expect((locked as HttpException).getResponse()).toMatchObject({
        code: "version_share_password_locked",
      });
      expect(resolveShare).toHaveBeenCalledTimes(10);
    });

    it("잠금은 그 링크에만 적용되고 다른 링크의 해석은 영향받지 않는다", async () => {
      const { service } = guarded();
      await failMany(service, 10);
      await expect(service.resolveShare("another-token-654321", "right")).resolves.toBe(okResolution);
    });

    it("비밀번호를 보내지 않은 요청은 잠금과 무관하게 비밀번호 필요 응답을 받는다", async () => {
      const { service } = guarded();
      await failMany(service, 10);
      const required = await service.resolveShare(TOKEN).catch((e: unknown) => e);
      expect((required as HttpException).getStatus()).toBe(401);
      expect((required as HttpException).getResponse()).toMatchObject({
        code: "version_share_password_required",
      });
    });

    it("성공하면 실패 횟수가 초기화된다", async () => {
      const { service } = guarded();
      await failMany(service, 9);
      await expect(service.resolveShare(TOKEN, "right")).resolves.toBe(okResolution);
      await failMany(service, 9);
      await expect(service.resolveShare(TOKEN, "right")).resolves.toBe(okResolution);
    });

    it("잠금은 창(15분)이 지나면 풀린다", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-10-16T00:00:00.000Z"));
        const { service } = guarded();
        await failMany(service, 10);
        await expect(service.resolveShare(TOKEN, "right")).rejects.toMatchObject({ status: 429 });
        vi.setSystemTime(new Date("2026-10-16T00:15:01.000Z"));
        await expect(service.resolveShare(TOKEN, "right")).resolves.toBe(okResolution);
      } finally {
        vi.useRealTimers();
      }
    });

    describe("동시에 몰린 요청", () => {
      /** 저장소 조회(DB 연결 + scrypt)를 흉내 내는 지연. 확인과 기록 사이에 await 가 끼는 실제 상황이다. */
      function slowGuarded(delayMs = 20) {
        const resolveShare = vi.fn(async (_token: string, password?: string): Promise<VersionShareResolution> => {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (!password) return { kind: "password_required" };
          return password === "right" ? okResolution : { kind: "password_invalid" };
        });
        return { service: new ManuscriptVersionShareService({ resolveShare } as never), resolveShare };
      }
      const statusOf = (result: PromiseSettledResult<unknown>): number | "ok" =>
        result.status === "fulfilled" ? "ok" : (result.reason as HttpException).getStatus();

      it("틀린 비밀번호를 동시에 100건 보내도 저장소(=scrypt 검증)에는 한도(10건)만 도달한다", async () => {
        const { service, resolveShare } = slowGuarded();
        const results = await Promise.allSettled(
          Array.from({ length: 100 }, (_, index) => service.resolveShare(TOKEN, `guess-${index}`)),
        );
        const statuses = results.map(statusOf);

        expect(resolveShare).toHaveBeenCalledTimes(10);
        expect(statuses.filter((status) => status === 401)).toHaveLength(10);
        expect(statuses.filter((status) => status === 429)).toHaveLength(90);
        // 버스트가 끝난 뒤에는 올바른 비밀번호도 잠금이 풀릴 때까지 막힌다.
        await expect(service.resolveShare(TOKEN, "right")).rejects.toMatchObject({ status: 429 });
        expect(resolveShare).toHaveBeenCalledTimes(10);
      });

      it("판정 중인 시도 때문에 막힌 요청에는 창 전체가 아니라 짧은 재시도 안내를 준다", async () => {
        let open!: () => void;
        const gate = new Promise<void>((resolve) => {
          open = resolve;
        });
        const resolveShare = vi.fn(async (): Promise<VersionShareResolution> => {
          await gate;
          return { kind: "password_invalid" };
        });
        const service = new ManuscriptVersionShareService({ resolveShare } as never);
        const inFlight = Array.from({ length: 10 }, (_, index) => service.resolveShare(TOKEN, `guess-${index}`));

        const blocked = await service.resolveShare(TOKEN, "right").catch((e: unknown) => e);
        expect((blocked as HttpException).getStatus()).toBe(429);
        expect((blocked as HttpException).getResponse()).toMatchObject({
          code: "version_share_password_locked",
          retryAfterSeconds: 1,
        });
        expect(resolveShare).toHaveBeenCalledTimes(10);

        open();
        await Promise.allSettled(inFlight);
        // 판정이 끝나 10건이 오답으로 확정되면 이제는 15분 창 전체가 안내된다.
        const locked = await service.resolveShare(TOKEN, "right").catch((e: unknown) => e);
        expect((locked as HttpException).getResponse()).toMatchObject({ retryAfterSeconds: 15 * 60 });
      });

      it("링크 없음·회수·만료·저장소 오류는 오답으로 세지 않아 정상 사용자가 잠기지 않는다", async () => {
        const outcomes: Array<() => Promise<VersionShareResolution>> = [
          async () => ({ kind: "missing" }),
          async () => ({ kind: "revoked" }),
          async () => ({ kind: "expired" }),
          async () => {
            throw new Error("db down");
          },
        ];
        for (const outcome of outcomes) {
          const resolveShare = vi.fn(async (_token: string, password?: string): Promise<VersionShareResolution> =>
            password === "right" ? okResolution : outcome());
          const service = new ManuscriptVersionShareService({ resolveShare } as never);
          // 한도의 두 배를 동시에 보내도(모두 선점됐다가 되돌려진다) 그 링크는 잠기지 않는다.
          await Promise.allSettled(Array.from({ length: 20 }, (_, index) => service.resolveShare(TOKEN, `guess-${index}`)));
          await Promise.allSettled(Array.from({ length: 20 }, (_, index) => service.resolveShare(TOKEN, `again-${index}`)));
          await expect(service.resolveShare(TOKEN, "right")).resolves.toBe(okResolution);
        }
      });

      it("동시 요청과 순차 요청이 섞여도 오답은 정확히 한 번씩만 센다", async () => {
        const { service, resolveShare } = slowGuarded(5);
        await Promise.allSettled(Array.from({ length: 5 }, (_, index) => service.resolveShare(TOKEN, `burst-${index}`)));
        for (let index = 0; index < 4; index += 1) {
          await expect(service.resolveShare(TOKEN, `serial-${index}`)).rejects.toMatchObject({ status: 401 });
        }
        // 오답 9건이 확정됐으니 10번째는 검증까지 가서 401, 11번째부터 429 이다.
        await expect(service.resolveShare(TOKEN, "serial-9")).rejects.toMatchObject({ status: 401 });
        await expect(service.resolveShare(TOKEN, "right")).rejects.toMatchObject({ status: 429 });
        expect(resolveShare).toHaveBeenCalledTimes(10);
      });
    });
  });
});
