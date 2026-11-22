// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createStudioProjectDocument } from "../studio-project-document-store";
import { createStudioProject } from "../studio-project-library-store";
import { updateStudioProjectWorkspaceState } from "../studio-project-workspace-store";
import { DELIVERY_MANIFEST_PATH, RIGHTS_BOM_CERTIFICATE_PATH } from "./delivery-pack-bundler";
import {
  StudioEpisodeDeliveryPackPanel,
  type DeliveryPackDownloadPayload,
} from "./StudioEpisodeDeliveryPackPanel";

const FIXED_TIME = "2026-11-22T03:30:00.000Z";
const textDecoder = new TextDecoder();

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("StudioEpisodeDeliveryPackPanel", () => {
  it("네이버·카카오·레진·글로벌 플랫폼 프리셋 전환과 ZIP·증명서·매니페스트 다운로드를 동작시킨다", () => {
    createStudioProject(window.localStorage, {
      id: "proj-pack-1",
      title: "별빛 서점",
      kind: "webtoon",
    });
    createStudioProjectDocument(window.localStorage, "proj-pack-1", {
      id: "doc-ep-1",
      title: "1화 개업",
      kind: "webtoon",
      width: 1380,
      height: 6400,
    });

    const downloads: DeliveryPackDownloadPayload[] = [];
    render(
      <StudioEpisodeDeliveryPackPanel
        projectId="proj-pack-1"
        locale="ko"
        generatedAt={FIXED_TIME}
        onDownloadFile={(payload) => downloads.push(payload)}
      />,
    );

    const naverBtn = screen.getByTestId("delivery-platform-naver_webtoon");
    const kakaoBtn = screen.getByTestId("delivery-platform-kakao_page");
    const lezhinBtn = screen.getByTestId("delivery-platform-lezhin");
    const globalBtn = screen.getByTestId("delivery-platform-global_webtoon");

    expect(naverBtn.getAttribute("aria-pressed")).toBe("true");
    expect(naverBtn.className).toContain("min-h-11");
    expect(screen.getByTestId("delivery-pack-gate-badge").textContent).toContain("통과");
    expect(screen.getByTestId("delivery-pack-ready-summary").textContent).toContain("네이버 웹툰");

    // 카카오페이지(720×1280px)로 전환
    fireEvent.click(kakaoBtn);
    expect(kakaoBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("delivery-pack-ready-summary").textContent).toContain("카카오페이지");

    // 레진·글로벌 프리셋도 정상 전환된다
    fireEvent.click(lezhinBtn);
    expect(screen.getByTestId("delivery-pack-ready-summary").textContent).toContain("레진코믹스");
    fireEvent.click(globalBtn);
    expect(screen.getByTestId("delivery-pack-ready-summary").textContent).toContain("글로벌 웹툰");

    // 증명서·매니페스트·ZIP 다운로드
    fireEvent.click(screen.getByTestId("delivery-pack-download-certificate"));
    fireEvent.click(screen.getByTestId("delivery-pack-download-manifest"));
    fireEvent.click(screen.getByTestId("delivery-pack-download-zip"));

    expect(downloads).toHaveLength(3);
    expect(downloads[0]?.fileName).toBe(RIGHTS_BOM_CERTIFICATE_PATH);
    expect(String(downloads[0]?.content)).toContain("별빛 서점");
    expect(downloads[1]?.fileName).toBe(DELIVERY_MANIFEST_PATH);
    expect(JSON.parse(String(downloads[1]?.content)).platform.id).toBe("global_webtoon");

    const zipPayload = downloads[2];
    expect(zipPayload?.fileName).toBe("proj-pack-1-global_webtoon-delivery-pack.zip");
    const unpacked = unzipSync(zipPayload?.content as Uint8Array);
    expect(textDecoder.decode(unpacked[RIGHTS_BOM_CERTIFICATE_PATH])).toContain("글로벌 웹툰");
    expect(JSON.parse(textDecoder.decode(unpacked[DELIVERY_MANIFEST_PATH])).files[2]?.fileName).toBe(
      "EP01_001.jpg",
    );
  });

  it("비상업 전용 소재 등록 또는 출처 표기 누락 시 납품 버튼을 fail-closed 비활성화하고 해결 후 다시 연다", () => {
    const downloads: DeliveryPackDownloadPayload[] = [];
    render(
      <StudioEpisodeDeliveryPackPanel
        projectId="proj-pack-bom"
        locale="ko"
        generatedAt={FIXED_TIME}
        onDownloadFile={(payload) => downloads.push(payload)}
      />,
    );

    // 1) 비상업 전용(non-commercial) 폰트 추가 → 즉시 차단
    fireEvent.change(screen.getByLabelText("소재명"), { target: { value: "개인용 필기체" } });
    fireEvent.change(screen.getByLabelText("상업 라이선스 상태"), {
      target: { value: "non-commercial" },
    });
    fireEvent.change(screen.getByLabelText("라이선스 코드"), { target: { value: "CC-BY-NC-4.0" } });
    fireEvent.click(screen.getByTestId("delivery-bom-add-asset"));

    expect(screen.getByTestId("delivery-pack-blocked-alert")).toBeTruthy();
    expect(screen.getByTestId("delivery-pack-blocked-alert").textContent).toContain("개인용 필기체");
    expect(
      (screen.getByTestId("delivery-pack-download-zip") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("delivery-pack-download-certificate") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("delivery-pack-download-manifest") as HTMLButtonElement).disabled,
    ).toBe(true);

    // 2) 상업+출처 필수로 변경했으나 출처 문구가 비어 있으면 여전히 차단
    fireEvent.change(screen.getByLabelText("개인용 필기체 라이선스 상태"), {
      target: { value: "commercial-attribution" },
    });
    expect(screen.getByTestId("delivery-pack-blocked-alert").textContent).toContain("출처 문구가 누락");
    expect(
      (screen.getByTestId("delivery-pack-download-zip") as HTMLButtonElement).disabled,
    ).toBe(true);

    // 3) 출처 문구를 채우면 차단 해제 및 증명서에 출처가 수록된다
    fireEvent.change(screen.getByLabelText("개인용 필기체 출처 표기"), {
      target: { value: "폰트: 개인용 필기체 상업 라이선스 / StudioFont" },
    });
    expect(screen.queryByTestId("delivery-pack-blocked-alert")).toBeNull();
    expect(
      (screen.getByTestId("delivery-pack-download-zip") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.getByTestId("delivery-pack-certificate-preview").textContent).toContain(
      "폰트: 개인용 필기체 상업 라이선스 / StudioFont",
    );

    fireEvent.click(screen.getByTestId("delivery-pack-download-certificate"));
    expect(downloads).toHaveLength(1);
  });

  it("워크스페이스에 차단된(blocked) 소재가 있으면 초기 렌더링부터 납품을 차단한다", () => {
    updateStudioProjectWorkspaceState(window.localStorage, "proj-pack-ws-blocked", (current) => ({
      ...current,
      assets: [{ id: "bg3d-restricted-campus", status: "blocked" }],
    }));

    render(
      <StudioEpisodeDeliveryPackPanel
        projectId="proj-pack-ws-blocked"
        locale="ko"
        generatedAt={FIXED_TIME}
      />,
    );

    expect(screen.getByTestId("delivery-pack-gate-badge").textContent).toContain("납품 차단");
    expect(screen.getByTestId("delivery-pack-blocked-alert").textContent).toContain(
      "bg3d-restricted-campus",
    );
    expect(
      (screen.getByTestId("delivery-pack-download-zip") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("말풍선 보호 구간을 추가하면 안전 절단선 보정이 미리보기 테이블에 즉시 반영된다", () => {
    render(
      <StudioEpisodeDeliveryPackPanel
        projectId="proj-pack-zone"
        locale="ko"
        generatedAt={FIXED_TIME}
      />,
    );

    fireEvent.change(screen.getByLabelText("원고 가로 (px)"), { target: { value: "690" } });
    fireEvent.change(screen.getByLabelText("원고 세로 (px)"), { target: { value: "3600" } });
    fireEvent.click(screen.getByTestId("delivery-add-protected-zone"));

    expect(screen.getByText(/안전 여백 이동/u)).toBeTruthy();
    expect(screen.getByText("EP01_001.jpg")).toBeTruthy();
  });

  it("프로젝트에 웹툰 화수 문서가 여러 개 있으면 EP01·EP02 일괄 납품 매니페스트를 한 번에 생성한다", () => {
    createStudioProject(window.localStorage, {
      id: "proj-pack-batch",
      title: "연재 합본 테스트",
      kind: "webtoon",
    });
    createStudioProjectDocument(window.localStorage, "proj-pack-batch", {
      id: "doc-batch-1",
      title: "1화 시작",
      kind: "webtoon",
      width: 690,
      height: 3200,
    });
    createStudioProjectDocument(window.localStorage, "proj-pack-batch", {
      id: "doc-batch-2",
      title: "2화 전개",
      kind: "webtoon",
      width: 690,
      height: 1600,
    });

    const downloads: DeliveryPackDownloadPayload[] = [];
    render(
      <StudioEpisodeDeliveryPackPanel
        projectId="proj-pack-batch"
        locale="ko"
        generatedAt={FIXED_TIME}
        onDownloadFile={(payload) => downloads.push(payload)}
      />,
    );

    expect(screen.getByTestId("delivery-pack-ready-summary").textContent).toContain("2화 / 3조각");
    fireEvent.click(screen.getByTestId("delivery-pack-download-manifest"));

    const manifest = JSON.parse(String(downloads[0]?.content));
    const sliceNames = manifest.files
      .filter((entry: { role: string }) => entry.role === "slice")
      .map((entry: { fileName: string }) => entry.fileName);
    expect(sliceNames).toEqual(["EP01_001.jpg", "EP01_002.jpg", "EP02_001.jpg"]);
  });
});
