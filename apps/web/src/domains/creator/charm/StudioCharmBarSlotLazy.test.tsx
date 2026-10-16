// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import lazySource from "./StudioCharmBarSlotLazy.tsx?raw";

import type { StudioCharmBarSlotProps } from "./StudioCharmBarSlot";

const SESSION = { isMobile: false } as unknown as StudioCharmBarSlotProps["session"];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.doUnmock("./StudioCharmBarSlot");
  vi.restoreAllMocks();
});

describe("StudioCharmBarSlotLazy — 슬롯째 지연 로드", () => {
  it("슬롯 청크를 받은 뒤에 슬롯을 그리고 세션을 그대로 넘긴다", async () => {
    const seen: unknown[] = [];
    vi.doMock("./StudioCharmBarSlot", () => ({
      StudioCharmBarSlot: ({ session }: { session: unknown }) => {
        seen.push(session);
        return <div data-testid="charm-slot" />;
      },
    }));
    const { StudioCharmBarSlotLazy } = await import("./StudioCharmBarSlotLazy");

    render(<StudioCharmBarSlotLazy session={SESSION} />);

    expect(await screen.findByTestId("charm-slot")).toBeTruthy();
    expect(seen[0]).toBe(SESSION);
  });

  it("슬롯 청크를 받지 못해도 편집기를 깨뜨리지 않고 아무것도 그리지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("./StudioCharmBarSlot", () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const { StudioCharmBarSlotLazy } = await import("./StudioCharmBarSlotLazy");

    const view = render(
      <div data-testid="editor">
        <StudioCharmBarSlotLazy session={SESSION} />
      </div>,
    );

    await waitFor(() => expect(view.getByTestId("editor").childElementCount).toBe(0));
    expect(screen.getByTestId("editor")).toBeTruthy();
  });

  it("이 모듈은 슬롯을 타입으로만 가져온다 — 정적 import 가 되살아나면 번들 래칫이 깨진다", () => {
    expect(lazySource).toMatch(/import type \{ StudioCharmBarSlotProps \} from "\.\/StudioCharmBarSlot"/u);
    expect(lazySource.match(/^import (?!type)[^\n]*StudioCharmBarSlot"/gmu)).toBeNull();
  });
});
