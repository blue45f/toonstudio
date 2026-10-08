import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { STUDIO_BOOT_MAX_MS, STUDIO_BOOT_STALL_MS } from "./experience/studio-visible-boot-deadline";

const canvas = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./studio-virtual-space.css", import.meta.url), "utf8");

describe("월드 부팅의 느린 회선 대응", () => {
  it("파일당 내려받기 제한은 느린 회선에서 큰 파일이 잘리지 않을 만큼 길다(전에는 15초라 1.5Mbps에서 월드가 열리지 않았다)", () => {
    const match = /loader:\s*\{\s*timeout:\s*([\d_]+)\s*,/u.exec(canvas);
    expect(match, "게임 설정에 loader.timeout이 있어야 한다").not.toBeNull();
    expect(Number((match?.[1] ?? "0").replaceAll("_", ""))).toBeGreaterThanOrEqual(60_000);
  });

  it("부팅 제한은 고정 시간이 아니라 진행이 멈춘 시간으로 판정하고, 내려받기 진행 신호가 제한을 늘린다", () => {
    expect(STUDIO_BOOT_STALL_MS, "멈춤 예산은 큰 파일 하나가 받아지는 시간보다 길어야 한다").toBeGreaterThanOrEqual(30_000);
    expect(STUDIO_BOOT_MAX_MS).toBeGreaterThan(STUDIO_BOOT_STALL_MS);
    expect(canvas).toMatch(/studioVisibleBootDeadline\(document,[\s\S]*?,\s*STUDIO_BOOT_STALL_MS,\s*STUDIO_BOOT_MAX_MS\);/u);
    expect(canvas, "진행 신호 처리가 부팅 제한을 늘려야 한다").toMatch(/const noteLoadProgress = \(\) => \{\s*bootDeadline\.touch\(\);/u);
    for (const event of ["fileprogress", "filecomplete", "progress"]) {
      expect(canvas, `${event} 이벤트가 진행 신호 처리에 연결돼야 한다`).toMatch(new RegExp(`loader\\.on\\("${event}"[\\s\\S]{0,40}noteLoadProgress`, "u"));
    }
  });

  it("로딩 화면은 진행 막대와 느린 연결 안내를 보이고, 막대는 스크린 리더에 중복으로 읽히지 않게 숨긴다", () => {
    expect(canvas).toMatch(/<progress className="studio-vspace-engine-progress"[^>]*aria-hidden="true"/u);
    expect(canvas).toContain("studio-vspace-engine-slow");
    expect(css).toContain(".studio-vspace-engine-progress");
    expect(css).toContain(".studio-vspace-engine-slow");
  });
});
