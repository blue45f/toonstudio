// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { AnchorLabPage } from "./AnchorLabPage";
import { createFakeDecoder, createFakeExport, stubObjectUrls } from "./anchor-lab-test-kit";

let urls: ReturnType<typeof stubObjectUrls>;
let previousLanguage = "";

beforeEach(() => {
  previousLanguage = useI18n.getState().lang;
  useI18n.setState({ lang: "ko" });
  urls = stubObjectUrls();
});

afterEach(() => {
  cleanup();
  urls.restore();
  useI18n.setState({ lang: previousLanguage });
});

function renderAnchorLab() {
  const decoder = createFakeDecoder();
  const exporter = createFakeExport();
  return render(<AnchorLabPage deps={{ candidates: decoder.deps, export: exporter.deps }} />);
}

describe("AnchorLabPage — REA 캐릭터 앵커 잠금 워크벤치", () => {
  it("벤치마크 배지와 기본 앵글·드리프트 가드·코사인 유사도 상태를 표시한다", () => {
    renderAnchorLab();
    const bar = screen.getByTestId("anchor-lab-rea-identity-lock-bar");
    const advanced = bar.closest("details")!;
    expect(advanced.open).toBe(false);
    fireEvent.click(advanced.querySelector("summary")!);
    expect(advanced.open).toBe(true);
    expect(bar.textContent).toContain("KomikoAI · Dashtoon · Scenario · Midjourney --cref");

    expect(screen.getByTestId("anchor-lab-rea-angle-front-side-back-4view").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("anchor-lab-rea-angle-3quarter-expression-sheet").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("anchor-lab-rea-drift-cosine-094-strict").getAttribute("aria-pressed")).toBe("true");

    const status = screen.getByTestId("anchor-lab-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("front-side-back-4view");
    expect(status.textContent).toContain("cosine-094-strict");
    expect(status.textContent).toContain("cos=0.962");
  });

  it("앵글 시트와 드리프트 가드를 전환하면 aria-pressed 와 실시간 상태가 갱신된다", () => {
    renderAnchorLab();

    fireEvent.click(screen.getByTestId("anchor-lab-rea-angle-3quarter-expression-sheet"));
    expect(screen.getByTestId("anchor-lab-rea-angle-3quarter-expression-sheet").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("anchor-lab-rea-angle-front-side-back-4view").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("anchor-lab-rea-status").textContent).toContain("3quarter-expression-sheet");
    expect(screen.getByTestId("anchor-lab-rea-status").textContent).toContain("cos=0.948");

    fireEvent.click(screen.getByTestId("anchor-lab-rea-angle-dynamic-action-turnaround"));
    expect(screen.getByTestId("anchor-lab-rea-angle-dynamic-action-turnaround").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("anchor-lab-rea-status").textContent).toContain("dynamic-action-turnaround");
    expect(screen.getByTestId("anchor-lab-rea-status").textContent).toContain("cos=0.941");

    fireEvent.click(screen.getByTestId("anchor-lab-rea-drift-costume-palette-lock"));
    expect(screen.getByTestId("anchor-lab-rea-drift-costume-palette-lock").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("anchor-lab-rea-drift-cosine-094-strict").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("anchor-lab-rea-status").textContent).toContain("costume-palette-lock");

    fireEvent.click(screen.getByTestId("anchor-lab-rea-drift-prop-silhouette-pin"));
    expect(screen.getByTestId("anchor-lab-rea-drift-prop-silhouette-pin").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("anchor-lab-rea-status").textContent).toContain("prop-silhouette-pin");
  });

  it("en 로케일에서는 한글이 전혀 포함되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    renderAnchorLab();
    const bar = screen.getByTestId("anchor-lab-rea-identity-lock-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("anchor-lab-rea-status").textContent).toContain("Cosine similarity cos=0.962");
  });
});
