import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { evaluateUiUxV2Contracts } from "./verify-ui-ux-v2-contracts.mjs";

describe("verify-ui-ux-v2-contracts", () => {
  it("실제 저장소가 데스크톱(시안 A~P)·모바일(시안 M1~M4)·OKLCH·무스피너·27대 허브 정본 경로·44px 계약을 통과한다", () => {
    const result = evaluateUiUxV2Contracts();
    assert.equal(result.ok, true, `위반 발견:\n${result.issues.join("\n")}`);
  });

  it("모바일 셸에 회전 스피너가 다시 들어오면 즉시 실패를 보고한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui-ux-v2-gate-"));
    try {
      fs.mkdirSync(path.join(tmp, "apps/mobile/shell"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "apps/mobile/shell/index.html"), '<div class="spinner"></div>');
      fs.writeFileSync(path.join(tmp, "apps/mobile/shell/mobile.css"), "@keyframes spin {}");
      const result = evaluateUiUxV2Contracts(tmp);
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((msg) => msg.includes("회전 스피너")));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("UI/UX v2.3 핵심 허브(CommunityPage·RankingPage·CharacterChatPage 등)에 레거시 별칭 경로(/shaper, /studio/brush-lab)나 44px 미만 높이(min-h-8..10)가 유입되면 즉시 차단한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui-ux-v2-inline-"));
    try {
      const communityDir = path.join(tmp, "apps/web/src/domains/community");
      const chatDir = path.join(tmp, "apps/web/src/domains/character-chat");
      fs.mkdirSync(communityDir, { recursive: true });
      fs.mkdirSync(chatDir, { recursive: true });
      fs.writeFileSync(
        path.join(communityDir, "CommunityPage.tsx"),
        'export const X = () => <a href="/studio/brush-lab" className="min-h-8">legacy</a>;',
      );
      fs.writeFileSync(
        path.join(chatDir, "CharacterChatPage.tsx"),
        'export const Y = () => <a href="/shaper" className="min-h-10">legacy</a>;',
      );
      const result = evaluateUiUxV2Contracts(tmp);
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((msg) => msg.includes("CommunityPage.tsx") && msg.includes("레거시 리다이렉트 별칭 경로")));
      assert.ok(result.issues.some((msg) => msg.includes("CharacterChatPage.tsx") && msg.includes("44px 미만 Tailwind 최소 높이")));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
