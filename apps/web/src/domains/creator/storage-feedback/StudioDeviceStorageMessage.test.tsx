// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioDeviceStorageMessage } from "./StudioDeviceStorageMessage";
import { creatorStorageDetail, creatorStorageText } from "./studio-device-storage-copy";
import { panelStatusText } from "../studio-panel-status-i18n-r3c06";
import { frozenStatus3Text } from "../studio-frozen3-status-i18n";
import { vrmGenerateStatusText } from "../status-i18n/studio-vrm-generate-status-i18n";
import { frozenStatus6Text } from "../status-i18n/studio-frozen6-status-i18n";

afterEach(() => { cleanup(); useI18n.setState({ lang: "ko" }); });

describe("창작 패널의 기기 저장 안내", () => {
  it("복구 행동과 현재 탭 한계를 먼저 보이고 생산자가 분리한 원인만 접는다", () => {
    useI18n.setState({ lang: "ko" });
    const message = creatorStorageDetail("저장에 실패했습니다. 현재 탭에만 유지되니 새로고침하지 말고 다시 시도해 주세요.", new Error("OPFS quota unavailable"));
    const { container } = render(<div role="alert"><StudioDeviceStorageMessage message={message} /></div>);
    const summary = container.querySelector("div[role=alert] > span");
    expect(summary?.textContent).toContain("현재 탭에만 유지");
    expect(summary?.textContent).toContain("다시 시도");
    expect(summary?.textContent).not.toMatch(/OPFS|SQLite/u);
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    expect(screen.getByText("문제 세부 정보")).toBeTruthy();
    expect(details?.textContent).toContain("OPFS quota unavailable");
    expect(container.querySelector("p details, span details")).toBeNull();
  });

  it("임의 줄바꿈 뒤의 복구 안내는 숨기지 않는다", () => {
    const { container } = render(<StudioDeviceStorageMessage message={"저장되지 않았습니다.\n이 탭을 유지하고 연결을 확인하세요."} />);
    expect(container.textContent).toContain("이 탭을 유지하고 연결을 확인하세요.");
    expect(container.querySelector("details")).toBeNull();
  });

  it("영어 기본 안내와 기술 상세도 분리하며 실제 locale 등록값을 사용한다", () => {
    useI18n.setState({ lang: "en" });
    const text = creatorStorageText("현재 탭에만 유지됩니다.", "Kept in this tab only.");
    render(<StudioDeviceStorageMessage message={creatorStorageDetail(text, "SQLite unavailable")} />);
    expect(screen.getByText("Kept in this tab only.")).toBeTruthy();
    expect(screen.getByText("Problem details")).toBeTruthy();
    expect(panelStatusText("studio.panelStatus.brandKit.storageChecking", "OLD SQLite fallback")).toBe("Checking brand kits on this device");
    expect(frozenStatus3Text("studio.frozenStatus3.cont.reviewSaved", "OLD OPFS fallback")).toBe("Review records: saved on this device");
    expect(vrmGenerateStatusText("studio.vrmGenerateStatus.profileMemoryOnly", "OLD SQLite fallback")).toContain("this screen only");
    expect(frozenStatus6Text("studio.frozenStatus6.vrmRuntimeE.memoryOnlyVrm", "OLD SQLite fallback")).toContain("It will be lost on refresh");
  });
});
