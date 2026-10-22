import { describe, expect, it } from "vitest";

import {
  AuthClientIpConfigurationError,
  EDGE_CLIENT_IP_HEADER,
  resolveAuthClientIp,
  resolveAuthClientIpPolicy,
  resolveRequestClientIp,
} from "./auth-client-ip";

describe("AUTH_TRUSTED_PROXY_* 정합성", () => {
  it("직접 모드에서 프록시 설정이 비활성화되면 설정만 유지한다", () => {
    expect(resolveAuthClientIpPolicy({})).toEqual({ mode: "direct" });
    expect(resolveAuthClientIpPolicy({ AUTH_TRUSTED_PROXY_ENABLED: "" })).toEqual({
      mode: "direct",
    });
    expect(resolveAuthClientIpPolicy({ AUTH_TRUSTED_PROXY_ENABLED: "false" })).toEqual({
      mode: "direct",
    });
  });

  it("신뢰 프록시를 명시하면 trusted-proxy 모드를 반환한다", () => {
    expect(
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "10.0.0.1,10.0.0.2",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toEqual({
      mode: "trusted-proxy",
      trustedProxyIps: new Set(["10.0.0.1", "10.0.0.2"]),
      clientIpHeader: "x-forwarded-for",
      maximumForwardedHops: 8,
    });
  });

  it("신뢰 프록시 환경값이 잘못되면 예외를 던진다", () => {
    expect(() => resolveAuthClientIpPolicy({ AUTH_TRUSTED_PROXY_ENABLED: "TRUE" })).toThrow(
      AuthClientIpConfigurationError,
    );
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "not-an-ip",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "203.0.113.0/24",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toThrow(AuthClientIpConfigurationError);
  });

  it("잘못된 헤더/홉 제한 값이 있으면 예외를 던진다", () => {
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "203.0.113.1",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-bad-proxy-header",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "203.0.113.1",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
        AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "0",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "203.0.113.1",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
        AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "33",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "  ",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toThrow(AuthClientIpConfigurationError);
  });
});

describe("클라이언트 IP 신뢰 경계", () => {
  const trustedProxyPolicy = resolveAuthClientIpPolicy({
    AUTH_TRUSTED_PROXY_ENABLED: "true",
    AUTH_TRUSTED_PROXY_IPS: "203.0.113.10,2001:db8::10",
    AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
    AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: "4",
  });
  const directPolicy = resolveAuthClientIpPolicy({});

  it("직접 모드에서 소켓 주소를 그대로 사용한다", () => {
    expect(
      resolveAuthClientIp({
        socket: { remoteAddress: "203.0.113.10" },
        headers: { "x-forwarded-for": "198.51.100.1" },
      },
      directPolicy,
      ),
    ).toBe("203.0.113.10");
  });

  it("직접 모드에서 소켓 주소가 없으면 unknown을 반환한다", () => {
    expect(resolveAuthClientIp({}, directPolicy)).toBe("unknown");
  });

  it("신뢰할 수 있는 프록시가 아니면 헤더를 무시한다", () => {
    const policy = trustedProxyPolicy;
    expect(
      resolveAuthClientIp({
        socket: { remoteAddress: "198.51.100.1" },
        headers: { "x-forwarded-for": "198.51.100.7, 192.0.2.1" },
      },
      policy,
    ),
    ).toBe("198.51.100.1");
  });

  it("신뢰 프록시에서 실제 클라이언트를 역방향 체인에서 찾는다", () => {
    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "203.0.113.10" },
          headers: { "x-forwarded-for": "198.51.100.11, 198.51.100.12, 203.0.113.10" },
        },
        trustedProxyPolicy,
      ),
    ).toBe("198.51.100.12");
  });

  it("x-forwarded-for가 전부 신뢰 프록시면 결정적 첫 값을 사용한다", () => {
    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "203.0.113.10" },
          headers: { "x-forwarded-for": "203.0.113.10, 2001:db8::10" },
        },
        trustedProxyPolicy,
      ),
    ).toBe("203.0.113.10");
  });

  it("헤더 홉 수를 초과하면 소켓 주소를 사용한다", () => {
    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "203.0.113.10" },
          headers: {
            "x-forwarded-for":
              "198.51.100.1,198.51.100.2,198.51.100.3,198.51.100.4,198.51.100.5",
          },
        },
        trustedProxyPolicy,
      ),
    ).toBe("203.0.113.10");
  });

  it("비표준 헤더 모드에서는 단일 값만 신뢰한다", () => {
    const policy = resolveAuthClientIpPolicy({
      AUTH_TRUSTED_PROXY_ENABLED: "true",
      AUTH_TRUSTED_PROXY_IPS: "203.0.113.10",
      AUTH_TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
    });

    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "203.0.113.10" },
          headers: { "x-real-ip": "198.51.100.7" },
        },
        policy,
      ),
    ).toBe("198.51.100.7");
  });

  it("IPv6-mapped IPv4 텍스트도 정규화한다", () => {
    expect(
      resolveAuthClientIp(
        {
          socket: { remoteAddress: "[::ffff:192.0.2.5]" },
          headers: {},
        },
        directPolicy,
      ),
    ).toBe("192.0.2.5");
  });
});

describe("resolveRequestClientIp (환경 설정 기반 단일 진입점)", () => {
  const spoofed = {
    headers: {
      "x-forwarded-for": "203.0.113.50",
      "x-real-ip": "203.0.113.51",
      "cf-connecting-ip": "203.0.113.52",
    },
    socket: { remoteAddress: "198.51.100.7" },
  };

  it("신뢰 프록시를 설정하지 않으면 전달 헤더를 무시하고 소켓 주소만 쓴다", () => {
    expect(resolveRequestClientIp(spoofed, {})).toBe("198.51.100.7");
    expect(resolveRequestClientIp(spoofed, { AUTH_TRUSTED_PROXY_ENABLED: "false" })).toBe(
      "198.51.100.7",
    );
  });

  it("신뢰 프록시로 등록된 피어가 보낸 헤더만 신뢰한다", () => {
    const environment = {
      AUTH_TRUSTED_PROXY_ENABLED: "true",
      AUTH_TRUSTED_PROXY_IPS: "198.51.100.7",
      AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
    };
    expect(resolveRequestClientIp(spoofed, environment)).toBe("203.0.113.50");
    expect(
      resolveRequestClientIp(
        { ...spoofed, socket: { remoteAddress: "192.0.2.99" } },
        environment,
      ),
    ).toBe("192.0.2.99");
  });

  it("환경 설정이 잘못되면 헤더를 신뢰하지 않고 소켓 주소로 되돌린다", () => {
    expect(
      resolveRequestClientIp(spoofed, {
        AUTH_TRUSTED_PROXY_ENABLED: "true",
        AUTH_TRUSTED_PROXY_IPS: "not-an-ip",
        AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      }),
    ).toBe("198.51.100.7");
  });

  it("소켓 정보가 없는 요청은 unknown 으로 수렴한다", () => {
    expect(resolveRequestClientIp({}, {})).toBe("unknown");
  });
});

describe("AUTH_EDGE_CLIENT_IP_ENABLED 전용 헤더 정책", () => {
  const secret = "edge-origin-secret-with-at-least-thirty-two-bytes";
  const enabled = {
    AUTH_EDGE_CLIENT_IP_ENABLED: "true",
    CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
  };

  it("꺼져 있거나 비어 있으면 정책에 edgeClientIp 가 없다", () => {
    for (const value of [undefined, "", "false"]) {
      const policy = resolveAuthClientIpPolicy({
        AUTH_EDGE_CLIENT_IP_ENABLED: value,
        CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
      });
      expect(policy).toEqual({ mode: "direct" });
      expect("edgeClientIp" in policy).toBe(false);
    }
  });

  it("켜면 에지 출처 비밀과 전용 헤더 이름을 정책에 담는다", () => {
    const policy = resolveAuthClientIpPolicy(enabled);
    expect(policy.mode).toBe("direct");
    expect(policy.edgeClientIp?.header).toBe(EDGE_CLIENT_IP_HEADER);
    expect(EDGE_CLIENT_IP_HEADER).toBe("x-toonstudio-client-ip");
    expect(policy.edgeClientIp?.secret.equals(Buffer.from(secret, "utf8"))).toBe(true);
  });

  it("신뢰 프록시 정책과 함께 켜도 둘 다 유지한다", () => {
    const policy = resolveAuthClientIpPolicy({
      ...enabled,
      AUTH_TRUSTED_PROXY_ENABLED: "true",
      AUTH_TRUSTED_PROXY_IPS: "203.0.113.10",
      AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
    });
    expect(policy.mode).toBe("trusted-proxy");
    expect(policy.edgeClientIp).toBeDefined();
  });

  it("잘못된 값이나 증명 수단(비밀) 누락은 부팅 오류다", () => {
    expect(() =>
      resolveAuthClientIpPolicy({ ...enabled, AUTH_EDGE_CLIENT_IP_ENABLED: "TRUE" }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({ AUTH_EDGE_CLIENT_IP_ENABLED: "true" }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_EDGE_CLIENT_IP_ENABLED: "true",
        CLOUDFLARE_EDGE_ORIGIN_SECRET: "too-short",
      }),
    ).toThrow(AuthClientIpConfigurationError);
    expect(() =>
      resolveAuthClientIpPolicy({
        AUTH_EDGE_CLIENT_IP_ENABLED: "true",
        CLOUDFLARE_EDGE_ORIGIN_SECRET: ` ${secret}`,
      }),
    ).toThrow(AuthClientIpConfigurationError);
  });

  it("전용 헤더를 켜지 않아도 기존 프록시 설정 오류는 그대로 예외다", () => {
    expect(() =>
      resolveAuthClientIpPolicy({ AUTH_TRUSTED_PROXY_ENABLED: "true" }),
    ).toThrow(AuthClientIpConfigurationError);
  });
});

describe("전용 헤더 기반 클라이언트 IP 해석", () => {
  const secret = "edge-origin-secret-with-at-least-thirty-two-bytes";
  const environment = {
    AUTH_EDGE_CLIENT_IP_ENABLED: "true",
    CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
  };
  const policy = resolveAuthClientIpPolicy(environment);
  const socket = { remoteAddress: "172.18.0.2" };
  const proven = (headers: Record<string, string | string[]>) => ({
    socket,
    headers: { "x-toonstudio-origin-secret": secret, ...headers },
  });

  it("비밀을 증명한 요청의 전용 헤더 IP 를 소켓 주소보다 우선한다", () => {
    expect(
      resolveAuthClientIp(proven({ "x-toonstudio-client-ip": "198.51.100.23" }), policy),
    ).toBe("198.51.100.23");
  });

  it("표준 전달 헤더가 앞단 주소로 덮여 있어도 전용 헤더가 접속자를 가리킨다", () => {
    expect(
      resolveAuthClientIp(
        proven({
          "x-forwarded-for": "2a06:98c0:3600::103, 172.18.0.2",
          "x-real-ip": "2a06:98c0:3600::103",
          "cf-connecting-ip": "2a06:98c0:3600::103",
          "x-toonstudio-client-ip": "203.0.113.77",
        }),
        policy,
      ),
    ).toBe("203.0.113.77");
  });

  it("비밀이 다르거나 없거나 중복이면 전용 헤더를 무시하고 소켓 주소를 쓴다", () => {
    const spoofedIp = { "x-toonstudio-client-ip": "198.51.100.23" };
    expect(
      resolveAuthClientIp(
        { socket, headers: { ...spoofedIp, "x-toonstudio-origin-secret": "wrong-secret" } },
        policy,
      ),
    ).toBe("172.18.0.2");
    expect(resolveAuthClientIp({ socket, headers: spoofedIp }, policy)).toBe("172.18.0.2");
    expect(
      resolveAuthClientIp(
        { socket, headers: { ...spoofedIp, "x-toonstudio-origin-secret": [secret, secret] } },
        policy,
      ),
    ).toBe("172.18.0.2");
  });

  it("전용 헤더가 없거나 IP 가 아니거나 목록이면 소켓 주소를 쓴다", () => {
    expect(resolveAuthClientIp(proven({}), policy)).toBe("172.18.0.2");
    for (const value of ["not-an-ip", "", "198.51.100.1, 198.51.100.2", "198.51.100.1/32"]) {
      expect(
        resolveAuthClientIp(proven({ "x-toonstudio-client-ip": value }), policy),
      ).toBe("172.18.0.2");
    }
    expect(
      resolveAuthClientIp(
        proven({ "x-toonstudio-client-ip": ["198.51.100.1", "198.51.100.2"] }),
        policy,
      ),
    ).toBe("172.18.0.2");
  });

  it("IPv6 와 IPv4 매핑 표기를 정규화한다", () => {
    expect(
      resolveAuthClientIp(proven({ "x-toonstudio-client-ip": "[2001:DB8::1]" }), policy),
    ).toBe("2001:db8::1");
    expect(
      resolveAuthClientIp(proven({ "x-toonstudio-client-ip": "::ffff:203.0.113.5" }), policy),
    ).toBe("203.0.113.5");
  });

  it("소켓 정보가 없어도 증명된 전용 헤더가 있으면 그 IP 를 쓴다", () => {
    expect(
      resolveAuthClientIp(
        {
          headers: {
            "x-toonstudio-origin-secret": secret,
            "x-toonstudio-client-ip": "198.51.100.23",
          },
        },
        policy,
      ),
    ).toBe("198.51.100.23");
  });

  it("신뢰 프록시와 함께 쓰면 증명된 전용 헤더가 먼저, 아니면 프록시 체인으로 되돌아간다", () => {
    const combined = resolveAuthClientIpPolicy({
      ...environment,
      AUTH_TRUSTED_PROXY_ENABLED: "true",
      AUTH_TRUSTED_PROXY_IPS: "172.18.0.2",
      AUTH_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
    });
    const forwarded = { "x-forwarded-for": "198.51.100.40, 172.18.0.2" };
    expect(
      resolveAuthClientIp(
        proven({ ...forwarded, "x-toonstudio-client-ip": "203.0.113.77" }),
        combined,
      ),
    ).toBe("203.0.113.77");
    expect(
      resolveAuthClientIp(
        { socket, headers: { ...forwarded, "x-toonstudio-client-ip": "203.0.113.77" } },
        combined,
      ),
    ).toBe("198.51.100.40");
  });

  it("켜지 않으면 비밀을 보내도 전용 헤더를 신뢰하지 않는다", () => {
    expect(
      resolveAuthClientIp(
        proven({ "x-toonstudio-client-ip": "198.51.100.23" }),
        resolveAuthClientIpPolicy({}),
      ),
    ).toBe("172.18.0.2");
  });

  it("환경 기반 단일 진입점도 같은 경계를 쓰고 비밀이 바뀌면 정책을 다시 만든다", () => {
    const request = proven({ "x-toonstudio-client-ip": "198.51.100.23" });
    expect(resolveRequestClientIp(request, environment)).toBe("198.51.100.23");
    expect(
      resolveRequestClientIp(request, {
        ...environment,
        CLOUDFLARE_EDGE_ORIGIN_SECRET: "another-edge-origin-secret-with-thirty-two-bytes",
      }),
    ).toBe("172.18.0.2");
  });

  it("설정이 잘못되면 헤더를 신뢰하지 않고 소켓 주소로 되돌린다", () => {
    expect(
      resolveRequestClientIp(proven({ "x-toonstudio-client-ip": "198.51.100.23" }), {
        AUTH_EDGE_CLIENT_IP_ENABLED: "true",
      }),
    ).toBe("172.18.0.2");
  });
});
