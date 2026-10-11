import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const entrySource = readFileSync(new URL("./StudioVirtualSpaceEntryLobby.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./StudioVirtualSpacePage.tsx", import.meta.url), "utf8");
const pageRootSource = readFileSync(new URL("./StudioVirtualSpacePageRoot.tsx", import.meta.url), "utf8");

// 클래식 제거(DESIGN.md §15)로 HUD·모바일 도크·NPC 표면 계약은 대상과
// 함께 정리됐다. 남은 계약은 생존 표면(로비·페이지 셸)의 닉네임 규칙뿐이다.
describe("Virtual Studio identity contract", () => {
  it("requires a public nickname and never falls back to an email address", () => {
    expect(entrySource).toContain("studio-virtual-nickname");
    expect(entrySource).toContain("이메일은 공개되지 않아요");
    // 닉네임 산출은 페이지 셸 분리(43c2bcda) 이후 StudioVirtualSpacePageRoot가 소유한다.
    expect(pageRootSource).toContain("studioVirtualSpaceNicknameFromAccount");
    expect(pageRootSource).not.toMatch(/displayName:\s*session\.data\?\.user\.email/u);
    expect(pageSource).not.toMatch(/displayName:\s*session\.data\?\.user\.email/u);
  });
});
