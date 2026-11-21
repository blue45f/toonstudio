// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeStudioPublishCompliance, validateStudioPublishCompliance } from "../studio-publish-compliance";
import { validateStudioPublishPreflight } from "../studio-publish-preflight";
import { StudioPublishPreflightPanel, type StudioPublishPreflightPanelProps } from "../StudioPublishPreflightPanel";

beforeEach(() => {
  // jsdom has no layout; retain the modal helper's real focus and visibility checks.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    new DOMRect(0, 0, 100, 40),
  ] as unknown as DOMRectList);
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function props(overrides: Partial<StudioPublishPreflightPanelProps> = {}): StudioPublishPreflightPanelProps {
  const compliance = normalizeStudioPublishCompliance(null);
  return {
    open: true,
    onClose: vi.fn(),
    profile: "generic",
    onProfileChange: vi.fn(),
    aiUsage: "none",
    onAiUsageChange: vi.fn(),
    disclosure: "",
    onDisclosureChange: vi.fn(),
    compliance,
    onComplianceChange: vi.fn(),
    complianceResult: validateStudioPublishCompliance(compliance),
    result: validateStudioPublishPreflight({ title: "QA", tags: [], pages: [] }),
    onDownloadReport: vi.fn(),
    ...overrides,
  };
}

describe("StudioPublishPreflightPanel keyboard ownership", () => {
  it("contains focus, isolates the editor and restores the publish trigger on close", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "수정 게시";
    document.body.append(trigger);
    trigger.focus();
    const options = props();
    const view = render(<StudioPublishPreflightPanel {...options} />);
    const dialog = screen.getByRole("dialog", { name: "Publish Pack 사전검사" });
    const first = screen.getByRole("button", { name: "Publish Pack 사전검사 닫기" });
    const last = screen.getByRole("button", { name: "확인" });

    expect(document.activeElement).toBe(first);
    expect(trigger.hasAttribute("inert")).toBe(true);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    trigger.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(options.onClose).toHaveBeenCalledTimes(1);

    view.rerender(<StudioPublishPreflightPanel {...options} open={false} />);
    expect(trigger.hasAttribute("inert")).toBe(false);
    expect(trigger.hasAttribute("aria-hidden")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the active option focused across updates and uses the latest close handler", () => {
    const options = props();
    const view = render(<StudioPublishPreflightPanel {...options} />);
    const profile = screen.getByRole("combobox", { name: /^게시 목적지/ });
    profile.focus();
    const onClose = vi.fn();
    view.rerender(<StudioPublishPreflightPanel {...options} profile="tapas" onClose={onClose} />);
    expect(document.activeElement).toBe(profile);
    fireEvent.keyDown(profile, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(options.onClose).not.toHaveBeenCalled();
  });

  it("returns to the mobile project launcher when its action popover has disappeared", () => {
    const trigger = document.createElement("button");
    trigger.setAttribute("aria-controls", "studio-project-actions-menu");
    const popover = document.createElement("div");
    popover.id = "studio-project-actions-menu";
    const action = document.createElement("button");
    popover.append(action);
    document.body.append(trigger, popover);
    action.focus();
    const options = props();
    const view = render(<StudioPublishPreflightPanel {...options} />);
    popover.remove();
    view.rerender(<StudioPublishPreflightPanel {...options} open={false} />);
    expect(document.activeElement).toBe(trigger);
  });
});

describe("StudioPublishPreflightPanel 원스톱 통합 프리플라이트 센터 (AC-012)", () => {
  it("8개 출고 타깃과 3개 게시 프로필을 통합 전환하고 Rights BOM(NC/GPL)·375px 가독성·스마트컷 실검사를 연동한다", () => {
    const readyCompliance = normalizeStudioPublishCompliance({
      audienceRating: "all",
      contentFlags: { sexualContent: false, violence: false, strongLanguage: false },
      thirdParty: { used: false, licensesConfirmed: false, attributionNotes: "" },
      ownershipRightsConfirmed: true,
      referenceRightsConfirmed: true,
      aiDisclosureConfirmed: true,
      policyReviewConfirmed: true,
    });
    const readyResult = validateStudioPublishPreflight({
      title: "1화 테스트",
      tags: ["판타지"],
      pages: [
        {
          id: "p1",
          reviewStatus: "approved",
          reviewLocked: true,
          images: [{ id: "img1", mimeType: "image/png", width: 800, height: 26_000, byteSize: 500_000 }],
        },
      ],
    });

    render(
      <StudioPublishPreflightPanel
        {...props({
          profile: "webtoon",
          compliance: readyCompliance,
          complianceResult: validateStudioPublishCompliance(readyCompliance, "webtoon"),
          result: readyResult,
          documentWidthPx: 800,
          documentHeightPx: 26_000,
          bubbles: [
            { id: "b1", text: "작은 글자", fontSizePx: 16, topY: 80, bottomY: 140 },
            { id: "b2", text: "경계 대사", fontSizePx: 28, topY: 12_770, bottomY: 12_840 },
          ],
          assets: [
            { assetId: "asset-nc", name: "비상업 소품", licenseCode: "CC-BY-NC" },
            { assetId: "asset-gpl", name: "GPL 셰이더", licenseCode: "GPL-3.0" },
          ],
        })}
      />,
    );

    // 8개 출고 타깃 버튼 존재
    const targetGroup = screen.getByTestId("publish-preflight-target-group");
    expect(targetGroup.querySelectorAll("button")).toHaveLength(8);

    // Rights BOM NC/GPL 차단으로 게시 준비 차단
    expect(screen.getByTestId("publish-preflight-check-rights-bom").textContent).toContain("상업 출고 차단 2건");
    expect(screen.getByTestId("publish-preflight-check-legibility").textContent).toContain("작은 대사 1곳");
    expect(screen.getByTestId("publish-preflight-check-smart-slice").textContent).toContain("여백으로 이동");
    expect(screen.getByTestId("publish-preflight-summary-banner").textContent).toContain("출고 차단 항목 2개");

    // 완전한 백업(archive) 타깃으로 전환하면 개인 백업 모드로 전환되어 상업 차단이 해제된다
    fireEvent.click(screen.getByTestId("publish-preflight-target-archive"));
    expect(screen.getByTestId("publish-preflight-check-rights-bom").textContent).toContain("개인 백업 전용");
    expect(screen.getByTestId("publish-preflight-summary-banner").textContent).toContain("오류 0개");
    expect(screen.getByTestId("publish-preflight-summary-banner").textContent).toContain("375px 모바일 대사 경고");
  });

  it("말풍선 데이터가 없을 때 크기만으로 가짜 완료 문구를 표시하지 않는다", () => {
    const readyCompliance = normalizeStudioPublishCompliance({
      audienceRating: "all",
      contentFlags: { sexualContent: false, violence: false, strongLanguage: false },
      thirdParty: { used: false, licensesConfirmed: false, attributionNotes: "" },
      ownershipRightsConfirmed: true,
      referenceRightsConfirmed: true,
      aiDisclosureConfirmed: true,
      policyReviewConfirmed: true,
    });
    const readyResult = validateStudioPublishPreflight({
      title: "1화 테스트",
      tags: ["일상"],
      pages: [
        {
          id: "p1",
          reviewStatus: "approved",
          reviewLocked: true,
          images: [{ id: "img1", mimeType: "image/png", width: 800, height: 4000, byteSize: 300_000 }],
        },
      ],
    });

    render(
      <StudioPublishPreflightPanel
        {...props({
          compliance: readyCompliance,
          complianceResult: validateStudioPublishCompliance(readyCompliance, "generic"),
          result: readyResult,
          documentWidthPx: 800,
          documentHeightPx: 4000,
          bubbles: [],
          assets: [],
        })}
      />,
    );

    expect(screen.getByTestId("publish-preflight-check-legibility").textContent).toContain("직접 확인 필요");
    expect(screen.getByTestId("publish-preflight-summary-banner").textContent).toContain("375px 모바일 대사 확인이 남아 있어요");
    expect(screen.queryByText(/발견된 문제가 없습니다/u)).toBeNull();
  });
});
