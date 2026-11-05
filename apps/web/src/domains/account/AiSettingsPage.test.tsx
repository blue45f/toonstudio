// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

import { AiSettingsPage } from "./AiSettingsPage";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("@/shared/ai/UnifiedAiSettings", () => ({
  UnifiedAiSettings: () => <div data-testid="unified-ai-settings" />,
}));

vi.mock("@/shared/ai/assist/AssistConnectionCard", () => ({
  AssistConnectionCard: () => <div data-testid="claude-connection-card" />,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock("@/shared/components/section", () => ({
  Container: ({ children, ...rest }: { children?: React.ReactNode }) => <div {...rest}>{children}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useI18n.setState({ lang: "ko" });
});

it("renders the bilingual header, back link, and settings surface", () => {
  render(
    <MemoryRouter initialEntries={["/settings/ai"]}>
      <AiSettingsPage />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "AI 설정" })).toBeTruthy();
  expect(screen.getByText(/자동 무료 AI/)).toBeTruthy();
  const backLink = screen.getByRole("link", { name: /설정/ });
  expect(backLink.getAttribute("href")).toBe("/settings");
  expect(screen.getByTestId("unified-ai-settings")).toBeTruthy();
  expect(screen.getByTestId("claude-connection-card")).toBeTruthy();
});

it("labels the back link from the source query param", () => {
  render(
    <MemoryRouter initialEntries={["/settings/ai?source=studio"]}>
      <AiSettingsPage />
    </MemoryRouter>,
  );

  const backLink = screen.getByRole("link", { name: /ToonStudio/ });
  expect(backLink.getAttribute("href")).toBe("/studio");
});

it("switches BYOK routing policy and failover probe mode interactively", () => {
  render(
    <MemoryRouter initialEntries={["/settings/ai"]}>
      <AiSettingsPage />
    </MemoryRouter>,
  );

  expect(screen.getByTestId("ai-settings-rea-byok-failover-bar")).toBeTruthy();
  const defaultPolicyBtn = screen.getByTestId("ai-settings-rea-policy-byok-12key-auto-rotate");
  const localBridgeBtn = screen.getByTestId("ai-settings-rea-policy-comfy-invoke-local-bridge");
  const defaultProbeBtn = screen.getByTestId("ai-settings-rea-probe-realtime-verify");
  const failoverProbeBtn = screen.getByTestId("ai-settings-rea-probe-429-auto-failover");

  expect(defaultPolicyBtn.getAttribute("aria-pressed")).toBe("true");
  expect(localBridgeBtn.getAttribute("aria-pressed")).toBe("false");
  expect(defaultProbeBtn.getAttribute("aria-pressed")).toBe("true");
  expect(failoverProbeBtn.getAttribute("aria-pressed")).toBe("false");

  const status = screen.getByTestId("ai-settings-rea-byok-status");
  expect(status.textContent).toContain("byok-12key-auto-rotate");
  expect(status.textContent).toContain("realtime-verify");
  expect(status.textContent).toContain("Cursor");
  expect(status.textContent).toContain("ComfyUI");

  fireEvent.click(localBridgeBtn);
  fireEvent.click(failoverProbeBtn);

  expect(defaultPolicyBtn.getAttribute("aria-pressed")).toBe("false");
  expect(localBridgeBtn.getAttribute("aria-pressed")).toBe("true");
  expect(defaultProbeBtn.getAttribute("aria-pressed")).toBe("false");
  expect(failoverProbeBtn.getAttribute("aria-pressed")).toBe("true");
  expect(status.textContent).toContain("comfy-invoke-local-bridge");
  expect(status.textContent).toContain("429-auto-failover");
});
