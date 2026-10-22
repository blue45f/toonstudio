import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * ai·cuttoon-editor·studio-shell·shared/ai 로딩·실패·빈 상태 문구 i18n 키 이관
 * 계약 (A4 잔여 3라운드 배치 c11).
 *
 * 표시 정본은 studio.aiStatus.* (ai/studio-ai-status-i18n 등록 모듈 확장)·
 * studio.editorShellStatus.* (studio-editor-shell-status-i18n-r3c11 등록 모듈)·
 * shared.aiStatus.* (shared/ai/ai-status-i18n 등록 모듈) 키이며, 코드 안의
 * 한국어 원문은 useT 폴백 인자나 생산 시점 해석 헬퍼(aiStatusText·
 * editorShellStatusText·aiSharedStatusText)의 폴백 인자로만 남아야 한다.
 * StudioAiEpisodeProductionModal의 issue.title/description/resolution 렌더는
 * AI T4 진단 채널 별도 과제라 이 배치에서 건드리지 않았다 (빈 상태 문구만 이관).
 * StudioCuttoonEditorHost(단수)는 호스트 별도 과제라 대상이 아니다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf-8");
}

function readSharedSource(relativePath: string): string {
  return readFileSync(new URL(`../../../shared/${relativePath}`, import.meta.url), "utf-8");
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = entry[2] ?? "";
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function expectParity(
  blocks: Record<"ko" | "en", Record<string, string>>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
    expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
    expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    const koPlaceholders = (blocks.ko[key] ?? "").match(/\{[A-Za-z0-9_]+\}/g) ?? [];
    const enPlaceholders = (blocks.en[key] ?? "").match(/\{[A-Za-z0-9_]+\}/g) ?? [];
    expect(enPlaceholders.sort(), `placeholder mismatch: ${key}`).toEqual(koPlaceholders.sort());
  }
}

function expectConsumed(
  consumerSource: string,
  keys: readonly string[],
  registered: Readonly<Record<string, string>>,
  namespacePattern: RegExp,
): void {
  for (const key of keys) {
    expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
  }
  const referenced = new Set(
    [...consumerSource.matchAll(namespacePattern)].map((match) => match[1] ?? ""),
  );
  for (const key of referenced) {
    expect(registered[key], `dangling key reference: ${key}`).toBeTruthy();
  }
}

const AI_STATUS_NEW_KEYS = [
  "studio.aiStatus.gen3d.queued",
  "studio.aiStatus.gen3d.uploading",
  "studio.aiStatus.gen3d.generatingGeometry",
  "studio.aiStatus.gen3d.generatingTexture",
  "studio.aiStatus.gen3d.downloading",
  "studio.aiStatus.gen3d.validating",
  "studio.aiStatus.gen3d.importing",
  "studio.aiStatus.gen3d.ready",
  "studio.aiStatus.gen3d.failed",
  "studio.aiStatus.gen3d.cancelled",
  "studio.aiStatus.gen3d.expired",
  "studio.aiStatus.assistHub.unavailable",
  "studio.aiStatus.assistHub.failurePolicyLabel",
  "studio.aiStatus.copy.copied",
  "studio.aiStatus.copy.failed",
  "studio.aiStatus.episodeProduction.noBlockingIssues",
  "studio.aiStatus.referencePack.emptyCharacter",
  "studio.aiStatus.referencePack.emptyMethod",
  "studio.aiStatus.referencePack.emptyStyle",
  "studio.aiStatus.referencePack.providerLimitReached",
  "studio.aiStatus.referencePack.roleLimitReached",
  "studio.aiStatus.referencePack.sameImageOtherRoles",
  "studio.aiStatus.referencePack.readOnlyNotice",
  "studio.aiStatus.provenance.statusPending",
  "studio.aiStatus.provenance.statusSucceeded",
  "studio.aiStatus.provenance.statusFailed",
  "studio.aiStatus.provenance.statusCancelled",
  "studio.aiStatus.provenance.retriableSuffix",
  "studio.aiStatus.provenance.notRetriableSuffix",
  "studio.aiStatus.strokeProposal.documentChanged",
  "studio.aiStatus.toonBoard.reviewApproved",
  "studio.aiStatus.toonBoard.reviewFailed",
  "studio.aiStatus.toonBoard.reviewStale",
  "studio.aiStatus.toonBoard.reviewUnapproved",
  "studio.aiStatus.toonBoard.reviewNotGenerated",
  "studio.aiStatus.canon.imageReadFailed",
  "studio.aiStatus.canon.imageProcessFailed",
] as const;

const AI_CONSUMERS = [
  "ai/StudioAi3dGenerationPanel.tsx",
  "ai/StudioAiAssistHub.tsx",
  "ai/StudioAiEpisodeProductionModal.tsx",
  "ai/StudioAiImageReferencePackEditor.tsx",
  "ai/StudioAiProvenancePanel.tsx",
  "ai/StudioAiSuperSuiteControls.tsx",
  "ai/StudioStrokeProposalReviewPanel.tsx",
  "ai/StudioToonProductionBoard.tsx",
  "ai/canon/StudioCharacterCanonEditor.tsx",
] as const;

const EDITOR_SHELL_KEYS = [
  "studio.editorShellStatus.dialogs.quickAccessOpening",
  "studio.editorShellStatus.dialogs.quickAssemblyOpening",
  "studio.editorShellStatus.dialogs.snapshotLibraryOpening",
  "studio.editorShellStatus.dialogs.animaticTimelineOpening",
  "studio.editorShellStatus.dialogs.productionBibleOpening",
  "studio.editorShellStatus.dialogs.dccGateCheckingLabel",
  "studio.editorShellStatus.dialogs.dccGateCheckFailedLabel",
  "studio.editorShellStatus.dialogs.dccGateCheckingDetail",
  "studio.editorShellStatus.dialogs.dccGateDeniedDetail",
  "studio.editorShellStatus.dialogs.dccModuleLoadingDetail",
  "studio.editorShellStatus.dialogs.dccModuleLoadingLabel",
  "studio.editorShellStatus.hosts.recoverySaveFailed",
  "studio.editorShellStatus.session.filterTargetMissing",
  "studio.editorShellStatus.session.filterSelectAreaFirst",
  "studio.editorShellStatus.session.filterMaskCreateFailed",
  "studio.editorShellStatus.session.filterLayerApplyFailed",
  "studio.editorShellStatus.workspace.brushLibraryOpening",
  "studio.editorShellStatus.importHandoff.handoffExpired",
  "studio.editorShellStatus.importHandoff.importStartFailed",
  "studio.editorShellStatus.floatingLayout.storageChecking",
] as const;

const EDITOR_SHELL_CONSUMERS = [
  "studio-cuttoon-editor/StudioCuttoonEditorDialogs.tsx",
  "studio-cuttoon-editor/StudioCuttoonEditorHosts.tsx",
  "studio-cuttoon-editor/StudioCuttoonEditorSessionDialogs.tsx",
  "studio-cuttoon-editor/StudioCuttoonEditorWorkspace.tsx",
  "studio-cuttoon-editor/StudioImportHandoffHost.tsx",
  "studio-shell/StudioShellFloatingLayoutManager.tsx",
] as const;

const SHARED_AI_KEYS = [
  "shared.aiStatus.capability.ready",
  "shared.aiStatus.capability.setupRequired",
  "shared.aiStatus.capability.unavailable",
  "shared.aiStatus.capability.checking",
  "shared.aiStatus.capability.local",
  "shared.aiStatus.recovery.loginRequired",
  "shared.aiStatus.recovery.freeExhausted",
  "shared.aiStatus.recovery.notConfigured",
  "shared.aiStatus.recovery.invalidInput",
  "shared.aiStatus.recovery.networkError",
  "shared.aiStatus.recovery.httpError",
  "shared.aiStatus.recovery.parseError",
  "shared.aiStatus.recovery.retry",
  "shared.aiStatus.settings.processFailed",
  "shared.aiStatus.settings.legacyEmpty",
] as const;

const SHARED_AI_CONSUMERS = [
  "ai/AiCapabilityStatusBoard.tsx",
  "ai/AiRecoveryNotice.tsx",
  "ai/UnifiedAiAdvancedSettings.tsx",
] as const;

describe("studio ai/editor-shell/shared-ai status i18n r3c11", () => {
  it("studio.aiStatus 확장 키가 ko/en 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("ai/studio-ai-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expectParity(blocks, AI_STATUS_NEW_KEYS);
    expect(blocks.ko["studio.aiStatus.gen3d.failed"]).toBe("생성 실패");
    expect(blocks.ko["studio.aiStatus.referencePack.roleLimitReached"]).toBe(
      "{role} 역할은 최대 {max}개까지 연결할 수 있습니다.",
    );
    expect(blocks.ko["studio.aiStatus.canon.imageReadFailed"]).toBe(
      "이미지를 읽지 못했습니다. 다른 파일로 올려 주세요.",
    );
  });

  it("studio.aiStatus 확장 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const blocks = parseRegisterModule(readSource("ai/studio-ai-status-i18n.ts"));
    const consumerSource = AI_CONSUMERS.map((file) => readSource(file)).join("\n");
    expectConsumed(
      consumerSource,
      AI_STATUS_NEW_KEYS,
      blocks.ko,
      /"(studio\.aiStatus\.[A-Za-z0-9.]+)"/g,
    );
  });

  it("studio.editorShellStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSource("status-i18n/studio-editor-shell-status-i18n-r3c11.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(EDITOR_SHELL_KEYS.length);
    expectParity(blocks, EDITOR_SHELL_KEYS);
    expect(blocks.ko["studio.editorShellStatus.dialogs.dccGateCheckFailedLabel"]).toBe(
      "3D 편집 권한을 확인하지 못했습니다.",
    );
    expect(blocks.ko["studio.editorShellStatus.workspace.brushLibraryOpening"]).toBe(
      "브러시 라이브러리를 여는 중…",
    );
  });

  it("studio.editorShellStatus 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const blocks = parseRegisterModule(readSource("status-i18n/studio-editor-shell-status-i18n-r3c11.ts"));
    const consumerSource = EDITOR_SHELL_CONSUMERS.map((file) => readSource(file)).join("\n");
    expectConsumed(
      consumerSource,
      EDITOR_SHELL_KEYS,
      blocks.ko,
      /"(studio\.editorShellStatus\.[A-Za-z0-9.]+)"/g,
    );
  });

  it("shared.aiStatus 등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    const blocks = parseRegisterModule(readSharedSource("ai/ai-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(SHARED_AI_KEYS.length);
    expectParity(blocks, SHARED_AI_KEYS);
    expect(blocks.ko["shared.aiStatus.recovery.httpError"]).toBe("AI 요청을 완료하지 못했어요");
    expect(blocks.ko["shared.aiStatus.capability.checking"]).toBe("확인 중");
  });

  it("shared.aiStatus 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const blocks = parseRegisterModule(readSharedSource("ai/ai-status-i18n.ts"));
    const consumerSource = SHARED_AI_CONSUMERS.map((file) => readSharedSource(file)).join("\n");
    expectConsumed(
      consumerSource,
      SHARED_AI_KEYS,
      blocks.ko,
      /"(shared\.aiStatus\.[A-Za-z0-9.]+)"/g,
    );
  });

  it("이관한 소비 파일에 하드코딩된 로딩·실패 상태 문구가 남지 않는다", () => {
    for (const file of AI_CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
    // LoRA 패널은 기존 text()(translateCurrentStaticSourceText) 형태로 이관했다.
    const loraViolations = scanHardcodedStatusStrings(
      readSource("ai/StudioAiLoraTrainingPanel.tsx"),
    );
    expect(loraViolations, `lora: ${JSON.stringify(loraViolations)}`).toEqual([]);
    for (const file of EDITOR_SHELL_CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
    for (const file of SHARED_AI_CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSharedSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });
});
