import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveStudioSpaceEngine } from "./studio-space-engine";

describe("resolveStudioSpaceEngine (5단계 전환 규칙)", () => {
  it("명시 파라미터가 기본값보다 우선한다", () => {
    expect(
      resolveStudioSpaceEngine("?engine=classic", { signedIn: true, personal: false }),
    ).toBe("classic");
    expect(
      resolveStudioSpaceEngine("?engine=godot", { signedIn: false, personal: false }),
    ).toBe("godot");
    expect(
      resolveStudioSpaceEngine("?engine=classic", { signedIn: false, personal: true }),
    ).toBe("classic");
  });

  it("로그인 사용자는 파라미터가 없으면 Godot가 기본값이다", () => {
    expect(resolveStudioSpaceEngine("", { signedIn: true, personal: false })).toBe("godot");
    expect(resolveStudioSpaceEngine("?place=cafe", { signedIn: true, personal: false })).toBe("godot");
  });

  it("개인 공간은 로그인 여부와 무관하게 Godot가 기본값이다 (솔로 의미 동등)", () => {
    expect(resolveStudioSpaceEngine("", { signedIn: false, personal: true })).toBe("godot");
    expect(resolveStudioSpaceEngine("", { signedIn: true, personal: true })).toBe("godot");
  });

  it("프로젝트 공간의 게스트는 클래식이 기본값이다 (게스트 티켓 발급 불가 — 서버 계약)", () => {
    expect(resolveStudioSpaceEngine("", { signedIn: false, personal: false })).toBe("classic");
    expect(resolveStudioSpaceEngine("?lobby=1", { signedIn: false, personal: false })).toBe("classic");
  });

  it("알 수 없는 파라미터 값은 기본 규칙으로 떨어진다", () => {
    expect(
      resolveStudioSpaceEngine("?engine=webgl", { signedIn: true, personal: false }),
    ).toBe("godot");
    expect(
      resolveStudioSpaceEngine("?engine=", { signedIn: false, personal: false }),
    ).toBe("classic");
  });
});

describe("StudioVirtualSpacePageRoot 배선 (소스 계약)", () => {
  const pageRootSource = readFileSync(
    new URL("./StudioVirtualSpacePageRoot.tsx", import.meta.url),
    "utf8",
  );

  it("엔진 결정은 리졸버를 거치고, 폴백 왕복은 engine 파라미터를 명시한다", () => {
    expect(pageRootSource).toContain("resolveStudioSpaceEngine(");
    // Godot → 클래식: 파라미터를 지우는 대신 classic으로 고정해야
    // 기본값이 Godot인 5단계에서도 폴백이 유지된다.
    expect(pageRootSource).toContain('params.set("engine", "classic")');
    // 클래식 → Godot: 전환 배너가 같은 방식으로 되돌린다.
    expect(pageRootSource).toContain('params.set("engine", "godot")');
    expect(pageRootSource).toContain('data-testid="classic-space-fallback-banner"');
  });

  it("구 방식(?engine=godot 일 때만 Godot) 단언이 남아 있지 않다", () => {
    expect(pageRootSource).not.toContain('get("engine") === "godot"');
  });
});
