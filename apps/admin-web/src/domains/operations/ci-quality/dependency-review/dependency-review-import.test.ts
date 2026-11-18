import { describe, expect, it } from "vitest";

import { applyDependencyImport, prepareDependencyImport } from "./dependency-review-import";
import { exportDependencyReviewBoard, updateDependencyRecord, validateDependencyReviewBoard } from "./dependency-review-model";
import { createDependencyReviewBoard } from "./dependency-review-seed";

import type { DependencyReviewBoard, ReviewRecord } from "./dependency-review-types";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const ORIGINAL_SHA = "a2cf3525b93d287dd1c6436a04e8c0d10c597511";
const ORIGINAL_TIME = "2026-11-17T00:38:47Z";

function record(board: DependencyReviewBoard, id: string): ReviewRecord {
  const found = board.records.find(item => item.id === id);
  if (!found) throw new Error(`테스트 기록 ${id}를 찾지 못했습니다.`);
  return found;
}

/** Sites의 board.tsx가 내보내는 schemaVersion 없는 실제 envelope를 재현한다. */
function sitesExport() {
  const board = createDependencyReviewBoard(NOW);
  const records = board.records.map(item => {
    const legacy: Record<string, unknown> = { ...item };
    for (const key of ["causeIds", "provenance", "sourceStatus", "sourceResult", "verificationSha", "recordedResult", "revision", "updatedAt", "edited"]) delete legacy[key];
    legacy.snapshotSha = ORIGINAL_SHA;
    legacy.verifiedAt = item.category === "cause" || item.category === "archive" || item.id === "build" || item.id === "core" ? ORIGINAL_TIME : "";
    legacy.evidence = `${ORIGINAL_SHA}에 대한 Sites 원본 기록`;
    if (item.category === "cause") { legacy.status = "main 머지 완료"; legacy.result = "수정 반영"; }
    if (item.id === "build" || item.id === "core") { legacy.status = "검증 완료"; legacy.result = "통과"; }
    return legacy;
  });
  const prs = board.prs.map(item => {
    const legacy: Record<string, unknown> = { ...item };
    for (const key of ["baseSha", "headSha", "checkoutSha", "ciLinks"]) delete legacy[key];
    return legacy;
  });
  return {
    title: "ToonStudio 의존성 및 CI 검증 보드", exportedAt: new Date(NOW - 60_000).toISOString(),
    snapshot: { ...board.snapshot, sha: ORIGINAL_SHA, shortSha: ORIGINAL_SHA.slice(0, 8), checkedAt: ORIGINAL_TIME, checkedAtLabel: "2026.11.17 09:38 KST", commitAt: "2026-11-16T22:21:37Z", commitUrl: `https://github.com/blue45f/toonstudio/commit/${ORIGINAL_SHA}`, ciUrl: "https://github.com/blue45f/toonstudio/actions/runs/43971954681" },
    records, dependencies: board.dependencies, prs, commands: board.commands, history: [],
    policy: "기록만 관리. ToonStudio 코드 수정·푸시·병합·배포 미실행.",
  };
}

function sourceRecord(source: ReturnType<typeof sitesExport>, id: string): Record<string, unknown> {
  const found = source.records.find(item => item.id === id);
  if (!found) throw new Error(`Sites 원본 ${id}를 찾지 못했습니다.`);
  return found;
}

describe("Sites 의존성 검토 가져오기의 신뢰 경계", () => {
  it("실제 Sites envelope를 검토하고 완료 주장을 원본과 재검토 상태로 분리한다", async () => {
    const board = createDependencyReviewBoard(NOW);
    const original = JSON.stringify(board);
    const source = sitesExport();
    sourceRecord(source, "build").owner = "원본에서 입력한 담당자 문자열";
    const input = JSON.stringify(source);
    const plan = await prepareDependencyImport(input, board, NOW);

    expect(plan).toMatchObject({ kind: "sites", identical: false, originalRecordCount: 12, snapshotSha: ORIGINAL_SHA });
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.parse(plan.sourceJson)).toEqual(source);
    expect(JSON.stringify(board)).toBe(original);

    const merged = applyDependencyImport(board, plan, [], NOW);
    expect(merged.records).toHaveLength(12);
    expect(record(merged, "build")).toMatchObject({
      status: "검토 필요", result: "미확인", sourceStatus: "검증 완료", sourceResult: "통과",
      provenance: "sites-import", snapshotSha: ORIGINAL_SHA, verifiedAt: ORIGINAL_TIME,
      verificationSha: "", recordedResult: "미확인", owner: "원본에서 입력한 담당자 문자열",
    });
    expect(record(merged, "remotion")).toMatchObject({ status: "검토 필요", result: "미확인", sourceStatus: "main 머지 완료", sourceResult: "수정 반영" });
    expect(record(merged, "player").causeIds).toEqual(["remotion"]);
    expect(record(merged, "core").causeIds).toEqual(["deepmerge"]);
    expect(merged.records.filter(item => item.category === "approval").map(item => item.status)).toEqual(Array(4).fill("승인 대기"));
    expect(record(merged, "archive2789")).toMatchObject({ category: "archive", status: "main 머지 완료", causeIds: [] });
    expect(merged.snapshot).toEqual(board.snapshot);
    expect(merged.dependencies).toEqual(board.dependencies);
    expect(merged.prs).toEqual(board.prs);
    expect(merged.imports).toHaveLength(1);
    expect(merged.imports[0]).toMatchObject({ fingerprint: plan.fingerprint, importedAt: new Date(NOW).toISOString(), snapshotSha: ORIGINAL_SHA, exportedAt: source.exportedAt });
    expect(JSON.parse(merged.imports[0].sourceJson)).toEqual(source);
    expect(JSON.stringify(board)).toBe(original);
    expect(() => validateDependencyReviewBoard(merged, NOW)).not.toThrow();
  });

  it("native 백업의 출처·완료 필드도 외부 주장으로 취급하며 로컬 검증을 승계하지 않는다", async () => {
    const source = createDependencyReviewBoard(NOW);
    const build = record(source, "build");
    Object.assign(build, { status: "검증 완료", result: "통과", provenance: "repository-snapshot", verifiedAt: ORIGINAL_TIME, evidence: `${source.snapshot.sha} 원본에서 주장한 검증`, verificationSha: source.snapshot.sha, recordedResult: "통과" });
    const board = createDependencyReviewBoard(NOW);
    const plan = await prepareDependencyImport(exportDependencyReviewBoard(source, NOW), board, NOW);
    const restored = applyDependencyImport(board, plan, [], NOW);

    expect(plan.kind).toBe("native");
    expect(record(restored, "build")).toMatchObject({ status: "검토 필요", result: "미확인", provenance: "sites-import", sourceStatus: "검증 완료", sourceResult: "수동 기록: 통과 / 원본: 통과", verificationSha: "", recordedResult: "미확인" });
    expect(record(restored, "archive2789").status).toBe("main 머지 완료");

    const freshDestination = createDependencyReviewBoard(NOW);
    const secondPlan = await prepareDependencyImport(exportDependencyReviewBoard(restored, NOW + 1_000), freshDestination, NOW + 1_000);
    const recoveredAgain = applyDependencyImport(freshDestination, secondPlan, [], NOW + 1_000);
    expect(record(recoveredAgain, "build")).toMatchObject({ status: "검토 필요", provenance: "sites-import", sourceStatus: record(restored, "build").sourceStatus, sourceResult: record(restored, "build").sourceResult });
  });

  it("동일 fingerprint의 재가져오기는 로컬 수정·이력·원본 영수증을 중복시키지 않는다", async () => {
    const board = createDependencyReviewBoard(NOW);
    const input = JSON.stringify(sitesExport());
    const firstPlan = await prepareDependencyImport(input, board, NOW);
    const imported = applyDependencyImport(board, firstPlan, [], NOW);
    const edited = updateDependencyRecord(imported, { ...record(imported, "build"), notes: "가져오기 후 관리자 메모" }, NOW + 1_000);
    expect(record(edited, "build")).toMatchObject({ provenance: "sites-import", verifiedAt: ORIGINAL_TIME, verificationSha: "", result: "미확인" });
    const repeat = await prepareDependencyImport(input, edited, NOW + 2_000);
    const original = JSON.stringify(edited);

    expect(repeat.identical).toBe(true);
    expect(applyDependencyImport(edited, repeat, [], NOW + 2_000)).toEqual(edited);
    const exportedAgain = sitesExport();
    exportedAgain.exportedAt = new Date(NOW + 2_000).toISOString();
    const timestampOnly = await prepareDependencyImport(JSON.stringify(exportedAgain), edited, NOW + 3_000);
    expect(timestampOnly.fingerprint).toBe(firstPlan.fingerprint);
    expect(timestampOnly.identical).toBe(true);
    expect(JSON.stringify(edited)).toBe(original);
    expect(edited.imports).toHaveLength(1);
    expect(edited.records).toHaveLength(12);
  });

  it("다른 원본을 가져올 때 로컬 수정 충돌은 기본 보존하고 선택한 항목만 교체한다", async () => {
    const board = createDependencyReviewBoard(NOW);
    const source = sitesExport();
    const firstPlan = await prepareDependencyImport(JSON.stringify(source), board, NOW);
    const imported = applyDependencyImport(board, firstPlan, [], NOW);
    const edited = updateDependencyRecord(imported, { ...record(imported, "build"), notes: "로컬에서 추가한 검토" }, NOW + 1_000);
    sourceRecord(source, "build").notes = "Sites에서 새로 내보낸 메모";
    source.exportedAt = new Date(NOW + 2_000).toISOString();
    const plan = await prepareDependencyImport(JSON.stringify(source), edited, NOW + 3_000);

    expect(plan.changes.find(item => item.id === "build")).toMatchObject({ conflict: true });
    const preserved = applyDependencyImport(edited, plan, [], NOW + 3_000);
    expect(record(preserved, "build")).toEqual(record(edited, "build"));
    const replaced = applyDependencyImport(edited, plan, ["build"], NOW + 3_000);
    expect(record(replaced, "build")).toMatchObject({ notes: "Sites에서 새로 내보낸 메모", status: "검토 필요", result: "미확인", provenance: "sites-import" });
    expect(replaced.records).toHaveLength(12);
    expect(replaced.imports).toHaveLength(2);
    expect(record(edited, "build").notes).toBe("로컬에서 추가한 검토");
  });

  it("미리보기 후 생긴 로컬 수정도 교체 선택 없이 덮어쓰지 않는다", async () => {
    const board = createDependencyReviewBoard(NOW);
    const plan = await prepareDependencyImport(JSON.stringify(sitesExport()), board, NOW);
    const edited = updateDependencyRecord(board, { ...record(board, "build"), notes: "미리보기 이후 수정" }, NOW + 1_000);
    const original = JSON.stringify(edited);
    expect(() => applyDependencyImport(edited, plan, [], NOW + 2_000)).toThrow(/변경|다시 검토/u);
    expect(JSON.stringify(edited)).toBe(original);
  });

  it("고정 레코드의 누락·중복·유형 변경과 식별할 수 없는 export를 거부한다", async () => {
    const board = createDependencyReviewBoard(NOW);
    const missing = sitesExport();
    missing.records.pop();
    const duplicate = sitesExport();
    duplicate.records[1] = duplicate.records[0];
    const category = sitesExport();
    sourceRecord(category, "build").category = "cause";
    for (const input of [missing, duplicate, category, { title: "임의의 보드", records: [] }]) {
      await expect(prepareDependencyImport(JSON.stringify(input), board, NOW)).rejects.toThrow();
    }
    expect(board.imports).toHaveLength(0);
  });

  it("원본의 위험 URL·중첩 키·미래 시각과 UTF-8 초과 입력을 차단한다", async () => {
    const board = createDependencyReviewBoard(NOW);
    const badUrl = sitesExport();
    sourceRecord(badUrl, "build").ciLinks = "javascript:alert(1)";
    const future = sitesExport();
    future.exportedAt = new Date(NOW + 600_000).toISOString();
    const poisoned = JSON.stringify(sitesExport()).replace('"records":', '"extra":{"constructor":{"trusted":true}},"records":');
    for (const input of [JSON.stringify(badUrl), JSON.stringify(future), poisoned]) {
      await expect(prepareDependencyImport(input, board, NOW)).rejects.toThrow();
    }
    const oversized = sitesExport();
    oversized.policy = "가".repeat(700_000);
    await expect(prepareDependencyImport(JSON.stringify(oversized), board, NOW)).rejects.toThrow(/2MB/u);
  });

  it("원본 입력은 2MB 미만이어도 병합 후 내보내기가 초과하면 기존 보드를 보존한다", async () => {
    const board = createDependencyReviewBoard(NOW);
    for (const item of board.records) {
      for (const key of ["summary", "notes", "hypothesis", "patchDraft"] as const) item[key] = "가".repeat(8_000);
      item.edited = true;
    }
    const source = sitesExport();
    for (const item of source.records) {
      for (const key of ["summary", "notes", "hypothesis", "patchDraft", "lockInterpretation"]) item[key] = "나".repeat(6_000);
    }
    const input = JSON.stringify(source);
    expect(new TextEncoder().encode(input).byteLength).toBeLessThan(2_000_000);
    expect(new TextEncoder().encode(exportDependencyReviewBoard(board, NOW)).byteLength).toBeLessThan(2_000_000);
    const original = JSON.stringify(board);
    const plan = await prepareDependencyImport(input, board, NOW);

    expect(() => applyDependencyImport(board, plan, [], NOW)).toThrow(/2MB/u);
    expect(JSON.stringify(board)).toBe(original);
    expect(board.imports).toHaveLength(0);
  });
});
