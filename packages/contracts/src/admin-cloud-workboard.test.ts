import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIONS, CLOUD_WORKBOARD_JSON_LIMIT, PROJECTS, STAGES, blankTask, boardSchema, canonicalUrl,
  cloudWorkboardResponseSchema, cloudWorkboardSaveSchema, duplicateNotes, emptyBoard,
  evidenceSchema, formatTime, freshness, inputTime, matchingCI, olderMain,
  restricted, safeUrl, sourceComparison, stampISO, taskError, taskSchema,
  type Board, type Evidence, type Task,
} from "@toonstudio/contracts/admin-cloud-workboard";

const NOW = "2026-11-18T04:00:00.000Z";
const BEFORE = "2026-11-18T03:00:00.000Z";
const OLD = "2026-11-15T04:00:00.000Z";
const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const REPO = "https://github.com/example/project";
const PR = `${REPO}/pull/1`;
const RUN = `${REPO}/actions/runs/1`;
const MUTATION_ID = "00000000-0000-4000-8000-000000000001";

function task(patch: Partial<Task> = {}): Task {
  return { ...blankTask(), id: "test-work", title: "합성 검토 작업", ...patch };
}

function evidence(patch: Partial<Evidence> = {}): Evidence {
  return {
    id: "test-evidence", title: "합성 결과 근거", kind: "GitHub", url: RUN,
    summary: "지정한 커밋의 검사 결과를 확인한 합성 기록입니다.",
    observedAt: NOW, occurredAt: BEFORE, subjectSha: SHA, ...patch,
  };
}

function board(tasks: Task[]): Board {
  return { ...emptyBoard(), tasks };
}

describe("클라우드 작업 보드 공통 계약", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  it("빈 보드는 개인 프로젝트와 과거 작업을 포함하지 않으며 호출마다 독립적이다", () => {
    const first = emptyBoard();
    first.tasks.push(task());
    expect(emptyBoard()).toEqual({ schemaVersion: 1, snapshotAt: "", tasks: [], audit: [] });
    expect(PROJECTS).toEqual(["ToonStudio"]);
    expect(boardSchema.parse(emptyBoard())).toEqual(emptyBoard());
    expect(STAGES).toEqual(["미확인", "진행 중", "검토 필요", "승인 대기", "검증 완료", "main 머지 완료"]);
    expect(blankTask().id).not.toBe(blankTask().id);
  });

  it("기본 항목의 외부 사실은 미확인이고 새 프로젝트명은 기록에서 가져올 수 있다", () => {
    const created = task({ project: "사용자가 추가한 프로젝트" });
    expect(taskSchema.parse(created)).toEqual(created);
    expect(created.risks).toEqual({ conflict: "미확인", regression: "미확인", ciFailure: "미확인", deployBlock: "미확인" });
    expect(created.ciStatus).toBe("미확인");
    expect(created.deployStatus).toBe("미확인");
    expect(created.dirtyFiles).toBeNull();
    expect(freshness(created)).toBe("미확인");
  });

  it("UTF-8 들여쓰기 JSON이 공통 바이트 상한과 같으면 저장하고 한 바이트 초과하면 거부한다", () => {
    const candidate = board(Array.from({ length: 300 }, (_, index) => task({ id: `budget-${index}` })));
    candidate.tasks[0]!.notes = "한";
    const bytes = () => new TextEncoder().encode(JSON.stringify(candidate, null, 2)).byteLength;
    let remaining = CLOUD_WORKBOARD_JSON_LIMIT - bytes();
    for (const item of candidate.tasks) {
      const padding = Math.min(6000 - item.notes.length, remaining);
      item.notes += "x".repeat(padding);
      remaining -= padding;
    }
    expect(remaining).toBe(0);
    expect(bytes()).toBe(CLOUD_WORKBOARD_JSON_LIMIT);
    expect(boardSchema.safeParse(candidate).success).toBe(true);
    expect(cloudWorkboardSaveSchema.safeParse({ board: candidate, expectedRevision: 0, mutationId: MUTATION_ID }).success).toBe(true);
    candidate.tasks[0]!.assignment = "x";
    expect(bytes()).toBe(CLOUD_WORKBOARD_JSON_LIMIT + 1);
    expect(boardSchema.safeParse(candidate).success).toBe(false);
    expect(cloudWorkboardSaveSchema.safeParse({ board: candidate, expectedRevision: 0, mutationId: MUTATION_ID }).success).toBe(false);
  });

  it.each(ACTIONS.filter((action) => action !== "조사·검토" && action !== "완료 이력"))(
    "%s 작업은 승인 대기 외 단계로 저장하지 않는다", (action) => {
      expect(restricted(task({ action }))).toBe(true);
      for (const stage of STAGES) {
        expect(taskSchema.safeParse(task({ action, stage })).success).toBe(stage === "승인 대기");
      }
    },
  );

  it("단건 저장과 전체 가져오기가 동일한 증빙 불변식을 검사한다", () => {
    const unverified = task({ stage: "검증 완료" });
    expect(taskSchema.safeParse(unverified).success).toBe(false);
    expect(boardSchema.safeParse(board([unverified])).success).toBe(false);
    const checked = task({ stage: "검증 완료", verifiedAt: NOW, evidence: [evidence()] });
    expect(taskSchema.parse(checked)).toEqual(checked);
  });

  it("과거 대화와 공백 요약은 현재 검증을 대신할 수 없다", () => {
    for (const proof of [evidence({ kind: "과거 대화" }), evidence({ summary: "   " }), evidence({ observedAt: "" })]) {
      expect(taskSchema.safeParse(task({ stage: "검증 완료", verifiedAt: NOW, evidence: [proof] })).success).toBe(false);
    }
  });

  it("저장이나 편집만으로 증빙 확인 시각을 최신으로 만들지 않는다", () => {
    const historical = task({ verifiedAt: OLD, updatedAt: NOW, evidence: [evidence({ observedAt: OLD, occurredAt: OLD })] });
    expect(taskSchema.parse(historical).verifiedAt).toBe(OLD);
    expect(freshness(historical)).toBe("재확인 필요");
    expect(taskSchema.safeParse({ ...historical, verifiedAt: NOW }).success).toBe(false);
    expect(freshness(task({ verifiedAt: "invalid", evidence: [evidence()] }))).toBe("미확인");
  });

  it.each(["1", "2026-02-30T04:00:00Z", "2026-11-18T04:00:00", "2026-11-18T04:06:00Z"])(
    "모호하거나 유효하지 않은 확인 시각 %s를 거부한다", (verifiedAt) => {
      expect(taskSchema.safeParse(task({ updatedAt: verifiedAt })).success).toBe(false);
    },
  );

  it("사건 전의 조회를 사건 증거로 기록하지 않는다", () => {
    expect(evidenceSchema.safeParse(evidence({ observedAt: OLD, occurredAt: BEFORE })).success).toBe(false);
    expect(evidenceSchema.safeParse(evidence({ observedAt: "2026-11-18T13:00:00+09:00" })).success).toBe(true);
  });

  it("중복 작업·증빙·이력 ID를 거부하되 같은 증거를 여러 작업에서 참조할 수 있다", () => {
    const a = task({ evidence: [evidence()] });
    expect(boardSchema.safeParse(board([a, a])).success).toBe(false);
    expect(taskSchema.safeParse({ ...a, evidence: [evidence(), evidence()] }).success).toBe(false);
    expect(boardSchema.safeParse(board([a, { ...a, id: "another-task" }])).success).toBe(true);
    const entry = { id: "audit-1", at: NOW, taskId: a.id, title: "합성 변경", detail: "서버에서 생성하는 이력 형식" };
    expect(boardSchema.safeParse({ ...board([a]), audit: [entry, entry] }).success).toBe(false);
  });

  it.each([
    "javascript:alert(1)", "data:text/html,invalid", "file:///tmp/file", "http://example.invalid/path",
    "https://name:password@example.invalid/path", "https://example.invalid/\npath", "https://example.invalid\\path",
  ])("안전하지 않은 링크 %s를 저장하거나 열지 않는다", (value) => {
    expect(safeUrl(value)).toBeNull();
    expect(taskSchema.safeParse(task({ repo: value })).success).toBe(false);
    expect(canonicalUrl(value)).toBe("");
  });

  it("원문 텍스트는 값으로 유지하며 숨은 실행 필드를 거부한다", () => {
    const title = "<script>합성 데이터</script>";
    expect(taskSchema.parse(task({ title })).title).toBe(title);
    expect(taskSchema.safeParse({ ...task(), execute: true }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task(), logLinks: [{ title: "로그", url: RUN, command: "run" }] }).success).toBe(false);
    const prototypeInput = JSON.parse(JSON.stringify(board([task()])).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{"execute":true}'));
    expect(boardSchema.safeParse(prototypeInput).success).toBe(false);
  });

  it("CI 통과 증빙은 실제 대상 SHA와 링크에 묶고 현재 HEAD와의 비교는 별도로 한다", () => {
    const checked = task({ ciStatus: "통과", ciSha: SHA, ciLink: RUN, remoteSha: SHA, verifiedAt: NOW, evidence: [evidence()] });
    expect(taskError(checked)).toBeNull();
    expect(matchingCI(checked)).toBe(true);
    expect(taskSchema.safeParse({ ...checked, evidence: [evidence({ subjectSha: OTHER_SHA })] }).success).toBe(false);
    expect(taskSchema.safeParse({ ...checked, evidence: [evidence({ url: `${RUN}2` })] }).success).toBe(false);
    expect(taskSchema.safeParse({ ...checked, evidence: [evidence({ subjectSha: "" })] }).success).toBe(false);
    const olderHead = { ...checked, remoteSha: OTHER_SHA };
    expect(taskSchema.safeParse(olderHead).success).toBe(true);
    expect(matchingCI(olderHead)).toBe(false);
    expect(matchingCI({ ...checked, ciSha: SHA.toUpperCase() })).toBe(true);
  });

  it("최근의 다른 근거를 추가해도 이전 CI 성공 이력은 최신 통과가 되지 않는다", () => {
    const historical = task({
      ciStatus: "통과", ciSha: SHA, ciLink: RUN, remoteSha: SHA, verifiedAt: NOW,
      evidence: [
        evidence({ observedAt: OLD, occurredAt: OLD }),
        evidence({ id: "other-source", url: `${REPO}/issues/2`, subjectSha: "" }),
      ],
    });
    expect(taskSchema.safeParse(historical).success).toBe(true);
    expect(freshness(historical)).toBe("재확인 필요");
  });

  it("main 포함 판정에는 해당 main SHA의 비교 근거가 필요하다", () => {
    const link = `${REPO}/compare/${OTHER_SHA}...${SHA}`;
    const checked = task({ mainInclusion: "현재 내용 확인", mainSha: SHA, comparisonLink: link, verifiedAt: NOW, evidence: [evidence({ url: link })] });
    expect(taskSchema.safeParse(checked).success).toBe(true);
    expect(taskSchema.safeParse({ ...checked, evidence: [evidence({ url: link, subjectSha: OTHER_SHA })] }).success).toBe(false);
    expect(taskSchema.safeParse({ ...checked, evidence: [] }).success).toBe(false);
  });

  it("병합 완료 이력은 검증하되 현재 main 적용이나 배포 완료로 바꾸지 않는다", () => {
    const merged = task({ action: "완료 이력", stage: "main 머지 완료", pr: PR, prState: "병합됨", mergedAt: BEFORE, verifiedAt: NOW, evidence: [evidence({ url: PR })] });
    const result = taskSchema.parse(merged);
    expect(result.mainInclusion).toBe("미확인");
    expect(result.deployStatus).toBe("미확인");
    expect(result.migrationStatus).toBe("미확인");
    expect(taskSchema.safeParse({ ...merged, prState: "닫힘" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...merged, evidence: [evidence({ url: RUN })] }).success).toBe(false);
    expect(taskSchema.safeParse({ ...merged, verifiedAt: OLD, evidence: [evidence({ url: PR, observedAt: OLD, occurredAt: OLD })] }).success).toBe(false);
  });

  it("배포 확인에는 동일 아티팩트 SHA·환경·배포 링크의 근거가 필요하다", () => {
    const deployed = task({ deployStatus: "성공 이력", deploySha: SHA, deployEnvironment: "staging", deployLink: RUN, verifiedAt: NOW, evidence: [evidence()] });
    expect(taskSchema.safeParse(deployed).success).toBe(true);
    expect(taskSchema.safeParse({ ...deployed, deployEnvironment: "   " }).success).toBe(false);
    expect(taskSchema.safeParse({ ...deployed, evidence: [evidence({ subjectSha: OTHER_SHA })] }).success).toBe(false);
    expect(taskSchema.safeParse({ ...deployed, deployLink: "" }).success).toBe(false);
  });

  it.each(["migration", "account", "infra"] as const)("%s 상태 확인은 운영 근거와 범위를 요구한다", (key) => {
    const checked = task({ [`${key}Status`]: "현재 확인", [`${key}Note`]: "합성 환경의 설정 상태", verifiedAt: NOW, evidence: [evidence({ kind: "운영 기록" })] });
    expect(taskSchema.safeParse(checked).success).toBe(true);
    expect(taskSchema.safeParse({ ...checked, [`${key}Note`]: "" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...checked, evidence: [evidence({ kind: "과거 대화" })] }).success).toBe(false);
    expect(taskSchema.safeParse({ ...checked, evidence: [evidence({ kind: "운영 기록", url: "" })] }).success).toBe(false);
  });

  it("커밋 일치와 미커밋 변경은 서로 다른 사실이다", () => {
    const sameHead = task({ localSha: SHA, remoteSha: SHA });
    expect(sourceComparison({ ...sameHead, dirtyFiles: 0 })).toBe("HEAD 일치");
    expect(sourceComparison({ ...sameHead, dirtyFiles: 1 })).toContain("로컬 변경 있음");
    expect(sourceComparison(sameHead)).toContain("작업 파일 미확인");
    expect(sourceComparison(task())).toBe("원격 대조 미확인");
    expect(sourceComparison({ ...sameHead, remoteSha: OTHER_SHA })).toContain("내용 대조 필요");
  });

  it("저장소 표기 차이와 저장소가 비어 있는 동일 PR도 중복 검토 대상으로 묶는다", () => {
    const a = task({ repo: REPO, changeKey: "same-change", pr: PR });
    const b = task({ id: "second", repo: `${REPO.toUpperCase()}.git/?tab=code#readme`, changeKey: "same-change" });
    expect(duplicateNotes(a, [a, b]).some((note) => note.includes("변경 그룹"))).toBe(true);
    const c = task({ id: "third", pr: `${PR}#discussion` });
    expect(duplicateNotes(a, [a, c])).toContain("동일 PR을 참조하는 작업 있음");
    expect(duplicateNotes(a, [a])).toEqual([]);
  });

  it("동일 환경·SHA의 성공 배포만 중복 배포 이력으로 안내한다", () => {
    const a = task({ repo: REPO, deploySha: SHA, deployEnvironment: "production" });
    const b = task({ id: "second", repo: REPO, deploySha: SHA, deployEnvironment: "staging", deployStatus: "성공 이력" });
    expect(duplicateNotes(a, [a, b])).toEqual([]);
    expect(duplicateNotes(a, [a, { ...b, deployEnvironment: "production" }])).toContain("같은 환경·버전의 배포 이력 있음");
    expect(duplicateNotes(a, [a, { ...b, deployEnvironment: "production", deployStatus: "미확인" }])).toEqual([]);
    expect(duplicateNotes(a, [a, { ...b, deployEnvironment: "production", repo: `${REPO}-other` }])).toEqual([]);
  });

  it("더 최신 main 근거가 있으면 표시하고 같은 시각의 상충 근거는 단정하지 않는다", () => {
    const a = task({ repo: REPO, mainSha: SHA });
    const b = task({ id: "second", repo: REPO, evidence: [evidence({ title: "원격 main 조회", subjectSha: OTHER_SHA })] });
    expect(olderMain(a, [a, b])).toBe(true);
    expect(olderMain(a, [a, { ...b, repo: `${REPO}-other` }])).toBe(false);
    const sameTime = { ...b, id: "third", evidence: [evidence({ title: "원격 main 조회" })] };
    expect(olderMain(a, [a, b, sameTime])).toBe(false);
  });

  it("KST 입력과 표시를 일관되게 유지하며 알 수 없는 시각은 빈 값으로 둔다", () => {
    expect(inputTime(NOW)).toBe("2026-11-18T13:00");
    expect(stampISO("2026-11-18T13:00")).toBe(NOW);
    expect(stampISO("2026-11-18T13:00:00")).toBe(NOW);
    expect(inputTime("invalid")).toBe("");
    expect(stampISO("")).toBe("");
    expect(formatTime("")).toBe("미확인");
    expect(formatTime(NOW)).toContain("13:00");
    expect(() => stampISO("2026-02-30T13:00")).toThrow(RangeError);
  });

  it("API 저장 계약은 revision·UUID를 요구하고 실행·행위자 값을 받지 않는다", () => {
    const input = { board: board([task()]), expectedRevision: 0, mutationId: MUTATION_ID };
    expect(cloudWorkboardSaveSchema.parse(input)).toEqual(input);
    expect(cloudWorkboardSaveSchema.safeParse({ ...input, mutationId: "not-a-uuid" }).success).toBe(false);
    expect(cloudWorkboardSaveSchema.safeParse({ ...input, execute: true }).success).toBe(false);
    expect(cloudWorkboardSaveSchema.safeParse({ ...input, actorUserId: "other-user" }).success).toBe(false);
    for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(cloudWorkboardSaveSchema.safeParse({ ...input, expectedRevision }).success).toBe(false);
    }
  });

  it("응답은 최초 null 저장시각과 이후 ISO 저장시각을 구분한다", () => {
    expect(cloudWorkboardResponseSchema.parse({ board: emptyBoard(), revision: 0, storedAt: null }).storedAt).toBeNull();
    expect(cloudWorkboardResponseSchema.parse({ board: board([task()]), revision: 1, storedAt: NOW }).storedAt).toBe(NOW);
    expect(cloudWorkboardResponseSchema.safeParse({ board: emptyBoard(), revision: 0, storedAt: "" }).success).toBe(false);
    expect(cloudWorkboardResponseSchema.safeParse({ board: emptyBoard(), revision: -1, storedAt: null }).success).toBe(false);
  });
});
