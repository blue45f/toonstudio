// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketResourceDetailArticle } from "./MarketResourceDetailArticle";
import { MarketDetailPackageInspector } from "./MarketDetailPackageInspector";
import { MarketDetailLicenseAdvisor } from "./MarketDetailLicenseAdvisor";
import { useI18n } from "@/shared/lib/i18n";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

import {
  CREATOR_MARKETPLACE_INSTALL_RECEIPT_STORAGE_KEY,
  writeCreatorMarketplaceInstallReceipt,
} from "@/shared/lib/creator-marketplace-install-receipt";
import {
  SessionContext,
  type SessionContextValue,
} from "@/domains/auth/public/session/auth-session-store";
import { subscribeAuthModalRequests } from "@/domains/auth/public/session/auth-modal-intent";
import { MARKET_GUEST_LOGIN_NOTICE_ID } from "../models/market-guest-login-notice";
import { creatorMarketplaceStudioPackId } from "@/shared/lib/creator-marketplace-package-identity";

vi.mock("./MarketResourceReleaseHistory", () => ({
  MarketResourceReleaseHistory: ({ resourceId }: { resourceId: string }) => (
    <div data-testid="release-history" data-resource-id={resourceId} />
  ),
}));

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
  localStorage.removeItem(CREATOR_MARKETPLACE_INSTALL_RECEIPT_STORAGE_KEY);
  vi.restoreAllMocks();
  if (originalClipboardDescriptor) Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

function marketRecord(kind: Extract<
  CreatorMarketplaceResourceKind,
  "asset" | "brush" | "template" | "3d-preset"
>): CreatorMarketplaceResourceRecord {
  const runtimeRef = kind === "asset"
    ? "studio-asset:starter-prop"
    : kind === "template"
      ? "studio-scene-template:vertical-story"
      : kind === "3d-preset"
        ? "toonstudio-bg3d-procedural-starter-v1"
        : "studio-brush:starter-ink";
  return {
    schemaVersion: 1,
    packageId: `original/${kind}/starter`,
    name: kind === "asset"
      ? "스타터 소품"
      : kind === "template"
        ? "세로 스토리 템플릿"
        : kind === "3d-preset"
          ? "절차형 3D 배경"
          : "스타터 잉크 브러시",
    description: "마켓 상세 접근성 테스트 리소스",
    kind,
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: ["스타터", "테스트"],
    license: "toonspectrum-standard",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: `${kind}/starter`,
      kind,
      name: "스타터 항목",
      delivery: {
        mode: "builtin-ref",
        runtimeRef,
        byteSize: 0,
        sha256: "a".repeat(64),
      },
    }],
    id: kind === "asset"
      ? "123e4567-e89b-42d3-a456-426614174000"
      : kind === "template"
        ? "223e4567-e89b-42d3-a456-426614174000"
        : kind === "3d-preset"
          ? "523e4567-e89b-42d3-a456-426614174000"
          : "423e4567-e89b-42d3-a456-426614174000",
    manifestHash: "b".repeat(64),
    manifestByteSize: 512,
    publisher: {
      id: "323e4567-e89b-42d3-a456-426614174000",
      name: "마켓 작가",
      avatar: null,
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    isOwner: false,
    access: "free",
  };
}

function renderDetail(record: CreatorMarketplaceResourceRecord) {
  return render(
    <MemoryRouter>
      <MarketResourceDetailArticle
        record={record}
        relatedItems={[]}
        staleSavedAt={null}
        onRetry={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe("MarketResourceDetailArticle actions and metadata", () => {
  it.each(["ko", "en"] as const)("%s 이용 조건 제목을 읽고 바로 초점을 옮길 수 있다", (locale) => {
    useI18n.getState().setLang(locale);
    render(<MarketDetailLicenseAdvisor record={marketRecord("asset")} />);
    const heading = screen.getByRole("heading", {
      name: locale === "ko" ? "이용 조건과 호환성" : "Usage terms and compatibility",
    });
    expect(heading.id).toBe("market-trust-guarantee-heading");
    heading.focus();
    expect(document.activeElement).toBe(heading);
    const region = screen.getByRole("region", {
      name: locale === "ko" ? "이용 조건과 호환성" : "Usage terms and compatibility",
    });
    expect(region.textContent).toContain(locale === "ko" ? "제공자가 안내한" : "provided by the publisher");
    expect(screen.getByTestId("market-license-permission-matrix")).toBeTruthy();
  });

  it("describes asset insertion and connects publisher profile, catalog, and license routes", () => {
    const record = marketRecord("asset");
    const { container } = renderDetail(record);

    const studioHref = new URL(
      screen.getByRole("link", { name: "스튜디오 캔버스에 에셋 삽입" }).getAttribute("href")!,
      "https://example.test",
    );
    expect(studioHref.pathname).toBe("/studio");
    expect(studioHref.searchParams.get("installMarketResource")).toBe(record.id);
    expect(studioHref.searchParams.get("assetMarket")).toBe("community");
    expect(studioHref.searchParams.get("marketReturn")).toBe(`/market/resource/${record.id}`);
    expect(screen.getAllByText(/지원되는 첫 에셋을 현재 캔버스에 삽입/u).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "마켓 작가" }).getAttribute("href"))
      .toBe(`/u/${record.publisher.id}`);
    expect(screen.getByRole("link", { name: "이 배급자의 마켓 리소스" }).getAttribute("href"))
      .toBe(`/market/browse?publisher=${record.publisher.id}`);
    expect(screen.getByRole("link", { name: "같은 종류의 리소스 더 보기" }).getAttribute("href"))
      .toBe("/market/browse?kind=asset");
    expect(screen.getByRole("link", { name: "ToonStudio 표준 사용권" }).getAttribute("href"))
      .toBe("/terms");
    expect(screen.getByRole("heading", { name: "이용 조건과 호환성" }))
      .toBeTruthy();
    fireEvent.click(screen.getByText("기술 정보 · 패키지와 파일"));
    expect(screen.getByRole("button", { name: "메타데이터 스냅샷 다운로드" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "세션 확인 중" })).toBeTruthy();
    expect(screen.getByTestId("release-history").getAttribute("data-resource-id"))
      .toBe(record.id);
    expect(screen.getByRole("heading", { name: /에셋 적용 정보 · 스타터 항목/u })).toBeTruthy();
    expect(screen.getByText("studio-asset:starter-prop")).toBeTruthy();
    expect(container.innerHTML).toContain("var(--color-card)");
    expect(container.innerHTML).not.toContain("text-white");
    expect(container.innerHTML).not.toContain("bg-black");
  });

  it("opens the template catalog without promising installation or canvas insertion", () => {
    renderDetail(marketRecord("template"));

    expect(screen.getByRole("link", { name: "장면 템플릿 카탈로그 열기" })).toBeTruthy();
    expect(screen.getAllByText(/장면 카드를 선택해야 현재 컷에 적용/u).length).toBeGreaterThan(0);
    expect(screen.queryByText("스튜디오에 리소스 팩 설치")).toBeNull();
    expect(screen.queryByText(/1클릭으로 설치 및 캔버스 삽입/u)).toBeNull();
  });

  it("opens the 3D background catalog without claiming that an asset was inserted", () => {
    renderDetail(marketRecord("3d-preset"));

    expect(screen.getByRole("link", { name: "3D 배경 카탈로그 열기" })).toBeTruthy();
    expect(screen.getAllByText(/항목을 선택해야 현재 장면에 추가/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/3D.*삽입/u)).toBeNull();
  });

  it("describes installable brush resources as local tool-library packs", () => {
    renderDetail(marketRecord("brush"));

    expect(screen.getByRole("link", { name: "스튜디오에 브러시 팩 설치" })).toBeTruthy();
    expect(screen.getAllByText(/로컬 도구 라이브러리에 설치/u).length).toBeGreaterThan(0);
    expect(screen.getByText("이 기기·브라우저에서 확인된 설치 영수증 없음"))
      .toBeTruthy();
    expect(screen.getByText(/계정 소장·클라우드 확인 이력과는 별개입니다/u))
      .toBeTruthy();
    expect(screen.getByRole("heading", { name: "실제 다운로드·설치 흐름" }))
      .toBeTruthy();
    expect(document.querySelector('[data-market-install-step="download"]')
      ?.getAttribute("data-market-install-step-state")).toBe("active");
    expect(document.querySelector('[data-market-install-step="activate"]')
      ?.textContent).toContain("기기 Studio 라이브러리에 설치");
  });

  it("labels an exact local receipt as installed and an older release receipt as updateable", () => {
    const current = marketRecord("brush");
    const logicalPackId = creatorMarketplaceStudioPackId(current);
    expect(writeCreatorMarketplaceInstallReceipt({
      logicalPackId,
      packageVersion: current.resourceVersion,
      packageFingerprint: current.manifestHash,
      kind: "brush",
      installedAt: Date.now(),
    })).toBe(true);
    renderDetail(current);

    expect(screen.getByText(`이 기기·브라우저에 v${current.resourceVersion} 설치 확인됨`))
      .toBeTruthy();
    expect(screen.getByRole("link", { name: "Studio에서 설치 관리" }))
      .toBeTruthy();
    expect(document.querySelector('[data-market-install-step="download"]')
      ?.getAttribute("data-market-install-step-state")).toBe("complete");
    expect(document.querySelector('[data-market-install-step="activate"]')
      ?.getAttribute("data-market-install-step-state")).toBe("complete");

    cleanup();
    const nextRelease = {
      ...current,
      id: "623e4567-e89b-42d3-a456-426614174000",
      resourceVersion: "2.0.0",
      manifestHash: "c".repeat(64),
    } satisfies CreatorMarketplaceResourceRecord;
    renderDetail(nextRelease);

    expect(screen.getByText("업데이트 가능 · 설치 v1.0.0 → 마켓 v2.0.0"))
      .toBeTruthy();
    expect(screen.getByRole("link", { name: "Studio에서 v2.0.0 업데이트" }))
      .toBeTruthy();
  });

  it("refreshes the same-device label for custom and cross-tab storage events", async () => {
    const record = marketRecord("brush");
    const logicalPackId = creatorMarketplaceStudioPackId(record);
    renderDetail(record);
    expect(screen.getByText("이 기기·브라우저에서 확인된 설치 영수증 없음"))
      .toBeTruthy();

    writeCreatorMarketplaceInstallReceipt({
      logicalPackId,
      packageVersion: record.resourceVersion,
      packageFingerprint: record.manifestHash,
      kind: "brush",
      installedAt: Date.now(),
    });
    await waitFor(() => {
      expect(screen.getByText("이 기기·브라우저에 v1.0.0 설치 확인됨"))
        .toBeTruthy();
    });

    localStorage.removeItem(CREATOR_MARKETPLACE_INSTALL_RECEIPT_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", {
      key: CREATOR_MARKETPLACE_INSTALL_RECEIPT_STORAGE_KEY,
    }));
    await waitFor(() => {
      expect(screen.getByText("이 기기·브라우저에서 확인된 설치 영수증 없음"))
        .toBeTruthy();
    });
  });

  it("wraps a maximum-width package ID inside the mobile metadata column", () => {
    const packageId = `original/asset/${"very-long-package-segment-".repeat(6)}`
      .slice(0, 160);
    renderDetail({ ...marketRecord("asset"), packageId });

    const packageValue = screen.getByText(packageId);
    expect(packageValue.className).toContain("break-all");
    expect(packageValue.className).toContain("max-w-full");
    expect(packageValue.closest("dd")?.className).toContain("min-w-0");
  });

  it("lets artists inspect every previewable entry instead of hiding entries after the first", () => {
    const first = marketRecord("template");
    const record: CreatorMarketplaceResourceRecord = {
      ...first,
      entries: [
        first.entries[0],
        {
          ...first.entries[0],
          id: "template/second",
          name: "두 번째 4컷 템플릿",
          delivery: {
            mode: "builtin-ref",
            runtimeRef: "studio-scene-template:4cut-story",
            byteSize: 0,
            sha256: "c".repeat(64),
          },
        },
      ],
    };
    renderDetail(record);

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: /스타터 항목/u })).toBeTruthy();

    const firstTab = screen.getByRole("tab", { name: "스타터 항목" });
    firstTab.focus();
    fireEvent.keyDown(firstTab, { key: "ArrowRight" });

    expect(screen.getByRole("heading", { name: /두 번째 4컷 템플릿/u })).toBeTruthy();
    expect(screen.getByText("ID: studio-scene-template:4cut-story")).toBeTruthy();
    expect(screen.getByText(/선택은 상세 미리보기만 바꾸며/u)).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "두 번째 4컷 템플릿" }),
    );
  });

  it("shows guests the login requirement next to the acquire button before any click, and routes the click to login instead of the failing acquisition modal", () => {
    const guestSession: SessionContextValue = {
      data: null,
      ready: true,
      status: "unauthenticated",
      update: async () => null,
    };
    const receive = vi.fn();
    const stop = subscribeAuthModalRequests(receive);
    try {
      render(
        <MemoryRouter>
          <SessionContext.Provider value={guestSession}>
            <MarketResourceDetailArticle
              record={marketRecord("brush")}
              relatedItems={[]}
              staleSavedAt={null}
              onRetry={() => undefined}
            />
          </SessionContext.Provider>
        </MemoryRouter>,
      );

      // 누르기 전 사전 고지: 제목·이유·고정 id가 획득 버튼 근처에 이미 있다.
      expect(screen.getByText("이 에셋을 받으려면 로그인이 필요해요")).toBeTruthy();
      expect(document.getElementById(MARKET_GUEST_LOGIN_NOTICE_ID)).toBeTruthy();
      const acquireButton = screen.getByRole("button", { name: /내 에셋에 추가하기/ });
      expect(acquireButton.getAttribute("aria-describedby")).toBe(MARKET_GUEST_LOGIN_NOTICE_ID);

      // 클릭해도 실패할 획득 모달이 열리지 않고 로그인 절차가 시작된다.
      fireEvent.click(acquireButton);
      expect(receive).toHaveBeenCalledTimes(1);
      expect(receive).toHaveBeenLastCalledWith({
        reason: "protected-action",
        source: "market-resource-library",
        mode: "login",
      });
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      stop();
    }
  });

  it("shows no guest notice and no describedby reference for a signed-in user", () => {
    const signedInSession: SessionContextValue = {
      data: { user: { id: "user-1", name: "작가" }, token: null },
      ready: true,
      status: "authenticated",
      update: async () => null,
    };
    render(
      <MemoryRouter>
        <SessionContext.Provider value={signedInSession}>
          <MarketResourceDetailArticle
            record={marketRecord("brush")}
            relatedItems={[]}
            staleSavedAt={null}
            onRetry={() => undefined}
          />
        </SessionContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.queryByText("이 에셋을 받으려면 로그인이 필요해요")).toBeNull();
    expect(document.getElementById(MARKET_GUEST_LOGIN_NOTICE_ID)).toBeNull();
    const acquireButton = screen.getByRole("button", { name: /내 에셋에 추가하기/ });
    expect(acquireButton.getAttribute("aria-describedby")).toBeNull();
  });

  it("opens the unified share dialog with resource-specific metadata", async () => {
    const record = marketRecord("asset");
    renderDetail(record);

    fireEvent.click(screen.getByRole("button", { name: `리소스 공유: ${record.name}` }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(record.name)).toBeTruthy();
    expect(within(dialog).getByText(record.description)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /링크 복사/u })).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /네이버/u }).getAttribute("href"))
      .toContain(encodeURIComponent(`/market/resource/${record.id}`));
  });

  it("exposes creator storefront link, follow toggle, SHA-256 spec audit, and license team-seat simulator", () => {
    const record = marketRecord("asset");
    renderDetail(record);

    expect(screen.getByRole("link", { name: "배급자 스토어 열기" }).getAttribute("href"))
      .toBe(`/market/creator/${record.publisher.id}`);

    const followButton = screen.getByRole("button", { name: "배급자 팔로우" });
    expect(followButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(followButton);
    expect(screen.getByRole("button", { name: "배급자 팔로우 중" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByText("기술 정보 · 패키지와 파일"));
    expect(screen.getByTestId("market-detail-spec-audit")).toBeTruthy();
    expect(screen.getByRole("button", { name: "패키지 manifest SHA-256 해시 복사" })).toBeTruthy();
    expect(screen.getByTestId("market-license-permission-matrix")).toBeTruthy();
    expect(screen.getByRole("button", { name: "출처 표기문 복사" })).toBeTruthy();

    const seatsInput = screen.getByLabelText("동시 작업 인원");
    fireEvent.change(seatsInput, { target: { value: "3" } });
    expect(screen.getByText(/선택된 라이선스의 허용 인원/u)).toBeTruthy();
  });
});


describe("마켓 상세 정보 우선순위와 복사 복구", () => {
  it.each(["ko", "en"] as const)("%s 구성 이름은 바로 보이고 기술 정보와 다운로드는 이름 있는 영역에서 다시 찾는다", (locale) => {
    useI18n.getState().setLang(locale);
    const record = marketRecord("asset");
    const download = vi.fn();
    render(<MarketDetailPackageInspector record={record} onDownloadMetadata={download} />);
    const summary = screen.getByText(locale === "ko" ? "기술 정보 · 패키지와 파일" : "Technical details · package and files");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    expect(within(screen.getByRole("list", { name: locale === "ko" ? "구성 항목" : "Included items" })).getByText("스타터 항목")).toBeTruthy();
    expect(screen.getByText(record.packageId).closest("details")).toBe(details);
    const downloadName = locale === "ko" ? "메타데이터 스냅샷 다운로드" : "Download metadata snapshot";
    // DOM 테스트 환경은 닫힌 details의 하위 role도 반환한다. 실제 비노출·키보드 활성화는 브라우저에서 검증한다.
    const downloadButton = screen.getByRole("button", { name: downloadName, hidden: true });
    expect(summary.tagName).toBe("SUMMARY");
    expect(details?.firstElementChild).toBe(summary);
    expect(downloadButton.closest("details")).toBe(details);
    expect(details?.hasAttribute("open")).toBe(false);
    expect(download).not.toHaveBeenCalled();
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: downloadName }));
    expect(download).toHaveBeenCalledTimes(1);
    fireEvent.click(summary);
    expect(details?.open).toBe(false);
    summary.focus();
    expect(document.activeElement).toBe(summary);
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(screen.getByRole("button", { name: downloadName })).toBe(downloadButton);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("이름 목록과 기술 정보에서 같은 검색 조건을 유지하고 빈 결과를 구분한다", () => {
    const original = marketRecord("asset");
    const first = original.entries.at(0);
    if (!first) throw new Error("테스트 구성 항목이 필요합니다.");
    const record = { ...original, entries: [first, { ...first, id: "prop/desk", name: "책상" }, { ...first, id: "prop/lamp", name: "조명" }] };
    render(<MarketDetailPackageInspector record={record} onDownloadMetadata={vi.fn()} />);
    const search = screen.getByRole("searchbox", { name: "패키지 구성 항목 검색" });
    fireEvent.change(search, { target: { value: "prop/lamp" } });
    const names = within(screen.getByRole("list", { name: "구성 항목" }));
    expect(names.getByText("조명")).toBeTruthy();
    expect(names.queryByText("책상")).toBeNull();
    fireEvent.click(screen.getByText("기술 정보 · 패키지와 파일"));
    expect(screen.getByRole("button", { name: "조명 SHA-256 해시 복사" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "책상 SHA-256 해시 복사" })).toBeNull();
    fireEvent.change(search, { target: { value: "없는 항목" } });
    expect(screen.getByRole("status").textContent).toContain("일치하는 구성 항목이 없어요");
  });

  it.each(["hash", "credit"] as const)("%s 클립보드 API가 없을 때도 원문 선택과 실패 안내를 제공한다", async (target) => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    if (target === "hash") {
      render(<MarketDetailPackageInspector record={marketRecord("asset")} onDownloadMetadata={vi.fn()} />);
      fireEvent.click(screen.getByText("기술 정보 · 패키지와 파일"));
    } else {
      render(<MarketDetailLicenseAdvisor record={marketRecord("asset")} />);
    }
    fireEvent.click(screen.getByRole("button", { name: target === "hash" ? "패키지 manifest SHA-256 해시 복사" : "출처 표기문 복사" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox", { name: target === "hash" ? "복사할 해시 원문" : "출처 표기문 원문" })).toBeTruthy();
    expect(screen.queryByText("해시를 복사했어요.")).toBeNull();
    expect(screen.queryByRole("button", { name: "복사 완료" })).toBeNull();
  });

  it("기술 정보를 접어도 필수 권리와 출처 안내는 유지한다", () => {
    const record = { ...marketRecord("asset"), attributionText: "원작자 이름을 표시하세요" };
    renderDetail(record);
    expect(screen.getByRole("heading", { name: "이용 조건과 호환성" }).closest("details")).toBeNull();
    expect(screen.getByRole("link", { name: "ToonStudio 표준 사용권" }).closest("details")).toBeNull();
    expect(screen.getByText(record.attributionText).closest("details")).toBeNull();
    expect(screen.getByText("배급자가 직접 만든 리소스입니다.").closest("details")).toBeNull();
  });

  it.each(["manifest", "entry"] as const)("%s 해시 복사 거부 시 완료를 표시하지 않고 원문과 재시도를 보존한다", async (target) => {
    const record = marketRecord("asset");
    const writeText = vi.fn().mockRejectedValueOnce(new Error("clipboard denied")).mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MarketDetailPackageInspector record={record} onDownloadMetadata={vi.fn()} />);
    fireEvent.click(screen.getByText("기술 정보 · 패키지와 파일"));
    const name = target === "manifest" ? "패키지 manifest SHA-256 해시 복사" : "스타터 항목 SHA-256 해시 복사";
    const entry = record.entries.at(0);
    if (!entry) throw new Error("테스트 구성 항목이 필요합니다.");
    const expected = target === "manifest" ? record.manifestHash : entry.delivery.sha256;
    fireEvent.click(screen.getByRole("button", { name }));
    await screen.findByRole("alert");
    expect(screen.queryByText("해시를 복사했어요.")).toBeNull();
    const original = screen.getByRole("textbox", { name: "복사할 해시 원문" }) as HTMLTextAreaElement;
    expect(original.value).toBe(expected);
    fireEvent.focus(original);
    expect(original.selectionEnd - original.selectionStart).toBe(expected.length);
    fireEvent.click(screen.getByRole("button", { name }));
    await screen.findByText("해시를 복사했어요.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(writeText).toHaveBeenNthCalledWith(1, expected);
    expect(writeText).toHaveBeenNthCalledWith(2, expected);
  });

  it("출처 표기문 복사 거부 시 원문을 유지하고 실제 재시도 성공 후에만 완료를 표시한다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("clipboard denied")).mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MarketDetailLicenseAdvisor record={marketRecord("asset")} />);
    const original = screen.getByRole("textbox", { name: "출처 표기문 원문" }) as HTMLTextAreaElement;
    const credit = original.value;
    fireEvent.click(screen.getByRole("button", { name: "출처 표기문 복사" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "복사 완료" })).toBeNull();
    expect(original.value).toBe(credit);
    fireEvent.focus(original);
    expect(original.selectionEnd - original.selectionStart).toBe(credit.length);
    fireEvent.click(screen.getByRole("button", { name: "출처 표기문 복사" }));
    await screen.findByRole("button", { name: "복사 완료" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(writeText).toHaveBeenNthCalledWith(1, credit);
    expect(writeText).toHaveBeenNthCalledWith(2, credit);
  });
});
