import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const text = (path: string) => readFileSync(join(root, path), "utf8");
const required = (path: string) => expect(existsSync(join(root, path)), path).toBe(true);

describe("Virtual Studio all-pages design closure", () => {
  it("keeps route, market and fortune completeness as executable contracts", () => {
    required("apps/web/src/app/spatial-campus/campus-route-coverage.test.ts");
    required("apps/web/src/domains/fortune/fortune-campus-map.ts");
    const coverage = text("apps/web/src/app/spatial-campus/campus-route-coverage.test.ts");
    expect(coverage).toContain('expect(market).toHaveLength(11)');
    expect(coverage).toContain("explicitly classifies every registered top-level route");
    expect(text("apps/web/src/domains/fortune/fortune-campus-map.ts")).toContain("FORTUNE_EXPERIENCES");
  });

  it("retains durable production workflows instead of treating links as completion", () => {
    for (const path of [
      "apps/web/src/domains/creator/work-session/StudioSessionWorkflowPanel.tsx",
      "apps/web/src/domains/creator/review-task-completion/StudioReviewTaskCompletion.tsx",
      "apps/web/src/domains/creator/handoff-envelope/StudioHandoffEnvelope.tsx",
      "apps/web/src/domains/creator/StudioAssetDecisionPanel.tsx",
      "apps/web/src/domains/creator/work-session/StudioSessionEvidencePanel.tsx",
      "apps/web/src/domains/creator/review-share/StudioPinnedReviewShowcasePage.tsx",
      "apps/web/src/domains/creator/spatial-showcase-placement.ts",
    ]) required(path);
  });

  // 클래식 공간 클라이언트(월드 템플릿·규칙 편집기·프라이빗 룸 컨트롤러)는 fd57fb73c에서 Godot 단일 무대로 수렴하며 제거되어 그 계약은 뺀다.
  it("keeps the short review voice note explicit that it is not call recording", () => {
    const note = text("apps/web/src/domains/creator/virtual-space/StudioReviewVoiceNotes.tsx");
    expect(note).toContain("This is not call recording");
    expect(note).toContain("getUserMedia");
    const migration = text("apps/api/src/platform/database/migrations/0090_studio_review_voice_note.sql");
    expect(migration).toContain("studio_review_voice_note_guard_update");
    expect(migration).toContain("REVOKE ALL ON TABLE studio_review_voice_note FROM PUBLIC");
  });

  it("supersedes the historical gap ledger while keeping environment certification honest", () => {
    const ledger = text("docs/studio/virtual-studio-design-closure-ledger-20260920.md");
    expect(ledger).toContain("Historical status notice (2026-09-24)");
    const closure = text("docs/studio/virtual-studio-all-pages-closure-20260924.md");
    expect(closure).toContain("product-code complete");
    expect(closure).toContain("not software-feature gaps");
    expect(closure).toContain("One-hour interactive spatial session");
    expect(closure).not.toContain("실기기 검증 완료");
  });
});
