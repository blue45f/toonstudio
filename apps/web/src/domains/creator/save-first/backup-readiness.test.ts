import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { studioProjectBackupUnavailableReason, type StudioProjectBackupReadiness } from "./backup-readiness";

const ready: StudioProjectBackupReadiness = {
  documentKey: "synthetic-draft", workHydrated: true, autosaveChecked: true, autosaveCheckedDocumentKey: "synthetic-draft", autosaveCheckFailed: false, hasAutosave: false,
};

describe("사용자 프로젝트 백업의 복구 정본 경계", () => {
  it.each([
    { workHydrated: false, autosaveChecked: false, hasAutosave: false },
    { workHydrated: true, autosaveChecked: false, hasAutosave: false },
    { workHydrated: true, autosaveChecked: false, hasAutosave: true },
  ])("정본 확인 전에는 빈 bootstrap을 허용하지 않는다: %j", (pending) => {
    expect(studioProjectBackupUnavailableReason({ ...ready, ...pending })).toContain("확인하는 중");
  });
  it("복구 진행·실패·취소 뒤 미결 후보가 남으면 안내를 유지한다", () => {
    expect(studioProjectBackupUnavailableReason({ ...ready, hasAutosave: true })).toContain("복구 안내");
  });
  it("정본 확인을 마친 새 빈 문서와 복구 완료 문서를 모두 허용한다", () => {
    expect(studioProjectBackupUnavailableReason(ready)).toBeNull();
  });
  it("두 저장소를 확인하지 못한 상태는 빈 문서 성공이나 무한 로딩으로 표시하지 않는다", () => {
    const reason = studioProjectBackupUnavailableReason({ ...ready, autosaveCheckFailed: true });
    expect(reason).toContain("확인하지 못했어요");
    expect(reason).toContain("새로고침");
    expect(reason).not.toContain("확인하는 중");
  });
  it("확인 실패 후 새 확인이 성공하면 정상 빈 문서 백업을 다시 허용한다", () => {
    expect(studioProjectBackupUnavailableReason({ ...ready, autosaveCheckFailed: true })).not.toBeNull();
    expect(studioProjectBackupUnavailableReason(ready)).toBeNull();
  });
  it("이전 문서의 확인 완료 플래그를 새 문서에서 재사용하지 않는다", () => {
    expect(studioProjectBackupUnavailableReason({ ...ready, documentKey: "other-draft" })).toContain("확인하는 중");
  });
  it("비동기 준비 중 문서가 바뀌면 새 문서의 준비 완료로 옛 export를 승인하지 않는다", () => {
    expect(studioProjectBackupUnavailableReason({ ...ready, documentKey: "other-draft" }, ready.documentKey)).toContain("열린 그림이 바뀌어");
  });
});


describe("사용자 백업 경계와 자동복구·자동저장 분리", () => {
  const host = readFileSync(new URL("../StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../studio-project-archive-orchestration-runtime.ts", import.meta.url), "utf8");
  it("자동복구 checkpoint가 쓰는 공통 가드를 새 사용자 백업 가드로 막지 않는다", () => {
    const start = host.indexOf("function ensureSharedDocumentAvailableForExport()");
    const end = host.indexOf("const elements =", start);
    expect(host.slice(start, end)).not.toContain("ensureProjectBackupAvailable");
    expect(host.slice(start, end)).not.toContain("hasAutosave");
    expect(host).toContain('preserveCurrentDocument: () => saveNamedCheckpoint("이어서 그리기 전 자동 보관")');
  });
  it("자동저장 리스너의 기존 guards와 저장 절차에 사용자 백업 상태를 넣지 않는다", () => {
    const start = host.indexOf("// 오토세이브 임시저장 리스너");
    const end = host.indexOf("// 서버 자동저장", start);
    const autosave = host.slice(start, end);
    expect(autosave).toContain("if (!autosaveChecked) return;");
    expect(autosave).toContain("if (hasAutosave) return;");
    expect(autosave).not.toContain("autosaveCheckedDocumentKey");
    expect(autosave).not.toContain("autosaveCheckFailed");
    expect(autosave).not.toContain("ensureProjectBackupAvailable");
  });
  it("archive의 마지막 비동기 빌드 뒤 세대 검사와 백업 가드가 다운로드보다 먼저 실행된다", () => {
    const start = runtime.indexOf("async function handleExportProjectArchive()");
    const end = runtime.indexOf("async function handleImportProject(", start);
    const archive = runtime.slice(start, end);
    const built = archive.indexOf("const result = await buildStudioProjectArchiveWithVerifiedBg3dModels");
    const generation = archive.indexOf("revisionProjectGenerationRef.current !== exportGeneration", built);
    const ready = archive.indexOf("if (!ensureProjectBackupAvailable()) return;", generation);
    const download = archive.indexOf("downloadBlob(result.blob, fileName)");
    expect(built).toBeGreaterThan(-1);
    expect(generation).toBeGreaterThan(built);
    expect(ready).toBeGreaterThan(generation);
    expect(download).toBeGreaterThan(ready);
    expect(archive.slice(ready, download)).not.toContain("await ");
  });
});
