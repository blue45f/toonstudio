import { describe, expect, it } from "vitest";

import {
  NEST_BOARD_MAX_JSON_BYTES, STATUSES, parseNestBoardDocument, parseNestBoardImport, parseNestBoardMutation,
  type NestBoardDocument, type Task,
} from "./admin-nestjs-quality";

const NOW = Date.parse("2026-11-18T04:00:00Z");
const SHA = "a".repeat(40);
const PR = "https://github.com/blue45f/toonstudio/pull/2801";
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "nest-001", title: "Socket.IO 재연결", category: "검증 시나리오", priority: "P0",
    status: "미확인", kind: "실제 재현 필요", summary: "중단 후 다시 참가하는 흐름을 확인한다.",
    scope: "API·클라이언트", nextAction: "동일 SHA의 두 실행 기록을 비교한다.", owner: "미지정",
    commit: SHA, checkedAt: "2026-11-18T03:00:00Z", verificationDate: "", environment: "격리 환경",
    result: "미확인", steps: ["연결한다.", "망을 중단한 뒤 복구한다."], acceptance: "재참가 후 이벤트가 순서대로 전달된다.",
    beforeEvidence: "미확인", afterEvidence: "미확인", evidenceLinks: [{ label: "코드", url: `https://github.com/blue45f/toonstudio/commit/${SHA}` }],
    notes: "운영 실행 없음", approvalRequired: false, archived: false, revision: 0, ...overrides,
  };
}
function board(): NestBoardDocument {
  return {
    schemaVersion: 1, repository: "blue45f/toonstudio", tasks: [task()], sourceHistory: [],
    snapshot: {
      observedAt: "2026-11-18T03:00:00Z", observedKst: "2026-11-18 12:00 KST", repository: "blue45f/toonstudio",
      mainSha: SHA, mainUrl: `https://github.com/blue45f/toonstudio/commit/${SHA}`,
      mainCiUrl: "https://github.com/blue45f/toonstudio/actions/runs/1", mainCiState: "미확인",
      releaseUrl: "https://github.com/nestjs/nest/releases/tag/v12.5.0", releaseDate: "2026-11-12 22:19:45 KST",
      packages: [{ name: "@nestjs/core", declared: "^12.5.0", locked: "12.5.0", target: "12.5.0", targetNote: "정렬된 버전",
        peerSummary: "실제 동작은 별도 검증", assessment: "선언 확인", scope: "API", links: [], taskId: "nest-001" }],
      prs: [{ number: 2801, title: "core 버전 정렬", state: "main 머지 완료", sha: SHA,
        mergedAt: "2026-11-16 23:57:45 KST", url: PR, note: "실행 검증과 구분" }],
      ci: [{ title: "빌드", scope: SHA, result: "failure", detail: "기존 실패 원인 기록", url: "", counted: false }],
      paths: [{ id: "adapter", title: "어댑터", subtitle: "IoAdapter", detail: "createIOServer 재정의", url: PR, taskId: "nest-001" }],
      exclusions: [{ title: "완료된 정렬", reason: "현재 선언 확인", url: PR }],
      sources: [{ label: "릴리스", url: "https://github.com/nestjs/nest/releases/tag/v12.5.0", type: "공식 문서" }],
      sequence: [{ title: "후속 변경 검토", detail: "실제 변경은 승인 대기로 유지", status: "승인 대기" }],
    },
  };
}
function completed(overrides: Partial<Task> = {}): Task {
  return task({ status: "검증 완료", verificationDate: "2026-11-18", result: "정적 판정 확인",
    beforeEvidence: "WsAdapter 릴리스 제한", afterEvidence: "현재 클래스는 IoAdapter를 확장한다. 실제 실행 증거 없음.", ...overrides });
}

describe("NestJS 관리자 검증 보드 계약", () => {
  it("모든 비교·실행 경로·전후 증거 필드를 보존한 새 문서를 만든다", () => {
    const original = board();
    const parsed = parseNestBoardDocument(original, NOW);
    expect(parsed).toEqual(original);
    expect(parsed).not.toBe(original);
    expect(parsed.tasks[0]).not.toBe(original.tasks[0]);
    expect(parsed.snapshot.ci[0].result).toBe("failure");
    expect(parsed.tasks[0].status).toBe("미확인");
  });

  it.each(STATUSES)("작업 상태 %s의 의미를 축약하지 않는다", status => {
    const document = board();
    document.tasks[0] = completed({ status, evidenceLinks: [{ label: "병합 PR", url: PR }] });
    expect(parseNestBoardDocument(document, NOW).tasks[0].status).toBe(status);
  });

  it("Sites 원본 JSON의 외부 작성자·시각·변경 내용과 모든 전후 증거를 보존한다", () => {
    const original = board();
    const history = [{ id: "external-1", taskId: "nest-001", taskTitle: "재연결", changedAt: "2026-11-18T03:30:00Z",
      actor: "sites-owner", changes: ["변경 후 증거 보완"] }];
    original.tasks[0] = completed();
    const parsed = parseNestBoardImport(JSON.stringify({ schemaVersion: 1, exportedAt: "2026-11-18T03:40:00Z",
      snapshot: original.snapshot, tasks: original.tasks, history }), NOW);
    expect(parsed).toEqual({ ...original, sourceHistory: history });
    expect(parsed).not.toHaveProperty("canEdit");
    expect(parsed).not.toHaveProperty("actorId");
  });

  it("네이티브 내보내기의 서버 권한·revision 메타데이터를 가져오기 권한으로 신뢰하지 않는다", () => {
    const document = board();
    expect(parseNestBoardImport({ document, revision: 999, canEdit: true, history: [] }, NOW)).toEqual(document);
    expect(parseNestBoardImport(document, NOW)).toEqual(document);
  });

  it.each([
    { verificationDate: "" }, { verificationDate: "미확인" }, { result: "미확인 · 실행 증거 없음" },
    { afterEvidence: "미확인" }, { afterEvidence: "실행 증거 없음" }, { evidenceLinks: [] },
  ])("근거가 없는 완료 표시를 거부한다: %j", invalid => {
    const document = board(); document.tasks[0] = completed(invalid);
    expect(() => parseNestBoardDocument(document, NOW)).toThrow("완료 상태에는");
  });

  it("정적 판정 완료를 허용하면서 런타임 미검증 문구를 그대로 보존한다", () => {
    const document = board(); document.tasks[0] = completed();
    expect(parseNestBoardDocument(document, NOW).tasks[0].afterEvidence).toContain("실제 실행 증거 없음");
  });

  it.each([
    "https://github.com.evil.test/blue45f/toonstudio/pull/2801",
    "https://github.com/elsewhere/toonstudio/pull/2801",
    "https://example.test/?url=https://github.com/blue45f/toonstudio/pull/2801",
    "https://github.com/blue45f/toonstudio/pull/2801/files",
  ])("main 병합 증거로 위장한 PR 링크를 거부한다: %s", url => {
    const document = board(); document.tasks[0] = completed({ status: "main 머지 완료", evidenceLinks: [{ label: "PR", url }] });
    expect(() => parseNestBoardDocument(document, NOW)).toThrow("ToonStudio PR 링크");
  });

  it("병합 기록에는 유효한 SHA가 필요하며 검증 상태와 별도로 남는다", () => {
    const document = board(); document.tasks[0] = completed({ status: "main 머지 완료", commit: "미확인", evidenceLinks: [{ label: "PR", url: PR }] });
    expect(() => parseNestBoardDocument(document, NOW)).toThrow("커밋 SHA");
  });

  it.each(STATUSES.filter(value => value !== "승인 대기"))("실행 승인 항목을 %s로 변경할 수 없다", status => {
    const document = board(); document.tasks[0] = completed({ approvalRequired: true, status });
    expect(() => parseNestBoardDocument(document, NOW)).toThrow("승인 대기");
  });

  it("승인 대기 항목의 검토 메모와 다음 조치는 보존한다", () => {
    const document = board(); document.tasks[0] = task({ approvalRequired: true, status: "승인 대기", notes: "검토자 의견", nextAction: "영향 범위 확인" });
    expect(parseNestBoardDocument(document, NOW).tasks[0]).toEqual(document.tasks[0]);
  });

  it("중복 ID와 끊어진 패키지·실행 경로 참조를 거부한다", () => {
    const duplicate = board(); duplicate.tasks.push(task());
    expect(() => parseNestBoardDocument(duplicate, NOW)).toThrow("중복");
    const broken = board(); broken.snapshot.paths[0].taskId = "absent";
    expect(() => parseNestBoardDocument(broken, NOW)).toThrow("참조하는 작업");
    const packages = board(); packages.snapshot.packages.push({ ...packages.snapshot.packages[0] });
    expect(() => parseNestBoardDocument(packages, NOW)).toThrow("중복");
  });

  it.each(["2026-02-30", "2026-11-19", "2026-11-18T04:06:00Z", "2026-11-18T03:00:00", "2026-11-18T24:00:00Z"])("잘못된 날짜·미래 검증을 거부한다: %s", verificationDate => {
    const document = board(); document.tasks[0].verificationDate = verificationDate;
    expect(() => parseNestBoardDocument(document, NOW)).toThrow();
  });

  it("한국 날짜 입력과 5분 이내의 서버 시계 오차를 허용한다", () => {
    const document = board(); document.tasks[0].verificationDate = "2026-11-18T04:04:00Z";
    expect(parseNestBoardDocument(document, NOW).tasks[0].verificationDate).toBe("2026-11-18T04:04:00Z");
    document.tasks[0].verificationDate = "2026-11-18";
    document.tasks[0].checkedAt = "2026-11-17T15:30:00Z";
    document.snapshot.observedAt = "2026-11-17T15:30:00Z";
    document.snapshot.observedKst = "2026-11-18 00:30 KST";
    expect(parseNestBoardDocument(document, Date.parse("2026-11-17T16:00:00Z")).tasks[0].verificationDate).toBe("2026-11-18");
  });

  it.each(["javascript:alert(1)", "data:text/html,hello", "file:///tmp/log", "https://user:password@example.test/log"])("실행 코드나 인증 정보가 포함된 링크를 거부한다: %s", unsafeUrl => {
    const document = board(); document.tasks[0].evidenceLinks[0].url = unsafeUrl;
    expect(() => parseNestBoardDocument(document, NOW)).toThrow("HTTP(S)");
  });

  it("원본 PR 번호와 실제 URL의 PR 번호가 일치해야 한다", () => {
    const document = board(); document.snapshot.prs[0].number = 999;
    expect(() => parseNestBoardDocument(document, NOW)).toThrow("PR 번호");
  });

  it("순환·프로토타입 오염·NaN과 접근자 객체를 허용하지 않는다", () => {
    const cyclic: Record<string, unknown> = { document: board() }; cyclic.loop = cyclic;
    expect(() => parseNestBoardImport(cyclic, NOW)).toThrow("순환");
    expect(() => parseNestBoardImport('{"__proto__":{"polluted":true}}', NOW)).toThrow("허용하지 않는 속성");
    const invalidNumber = board(); invalidNumber.tasks[0].revision = Number.NaN;
    expect(() => parseNestBoardDocument(invalidNumber, NOW)).toThrow("JSON 값");
    let invoked = false;
    const getter = Object.defineProperty({}, "document", { get() { invoked = true; return board(); } });
    expect(() => parseNestBoardImport(getter, NOW)).toThrow("허용하지 않는 속성");
    expect(invoked).toBe(false);
    expect(() => parseNestBoardImport(new Date(), NOW)).toThrow("일반 JSON 객체");
  });

  it("크기·배열·문자열 한도를 저장 전 제한한다", () => {
    expect(() => parseNestBoardImport(" ".repeat(NEST_BOARD_MAX_JSON_BYTES + 1), NOW)).toThrow("2MB");
    expect(() => parseNestBoardImport({ document: board(), padding: "한".repeat(700_000) }, NOW)).toThrow("2MB");
    const steps = board(); steps.tasks[0].steps = Array.from({ length: 101 }, () => "단계");
    expect(() => parseNestBoardDocument(steps, NOW)).toThrow("최대 100개");
    const title = board(); title.tasks[0].title = "a".repeat(301);
    expect(() => parseNestBoardDocument(title, NOW)).toThrow("작업 제목");
  });

  it.each(["\u0000", "\uD800", "\uDC00", "😀\uD800"])("PostgreSQL에 저장할 수 없는 문자열을 값·키·JSON 가져오기에서 거부한다: %j", invalid => {
    const document = board(); document.tasks[0].notes = invalid;
    const request = { expectedRevision: 0, mutationId: "save-12345678", document, reason: "근거 추가" };
    expect(() => parseNestBoardMutation(request, NOW)).toThrow("유니코드");
    expect(() => parseNestBoardImport(JSON.stringify(document), NOW)).toThrow("유니코드");
    expect(() => parseNestBoardImport({ document: board(), [invalid]: "외부 메타데이터" }, NOW)).toThrow("유니코드");
  });

  it("정상 surrogate pair와 한글·emoji·줄바꿈을 변경하지 않고 보존한다", () => {
    const content = "한글 😀 🧑🏽‍💻 𐐷\n다음 기록\t🚀";
    const document = board(); document.tasks[0].notes = content;
    const request = { expectedRevision: 0, mutationId: "Save_ABC.12:-3", document, reason: content };
    expect(parseNestBoardMutation(request, NOW)).toEqual(request);
    expect(parseNestBoardImport(JSON.stringify(document), NOW).tasks[0].notes).toBe(content);
  });

  it.each(["K1234567", "ſ1234567"])("Unicode case folding으로 ASCII 요청 ID 범위를 우회할 수 없다: %s", mutationId => {
    expect(() => parseNestBoardMutation({ expectedRevision: 0, mutationId, document: board(), reason: "근거 추가" }, NOW)).toThrow("요청 ID");
  });

  it("다른 저장소·버전·빈 작업 목록은 가져오지 않는다", () => {
    expect(() => parseNestBoardImport({ ...board(), repository: "different/repo" }, NOW)).toThrow("schemaVersion 1");
    expect(() => parseNestBoardImport({ ...board(), schemaVersion: 2 }, NOW)).toThrow("schemaVersion 1");
    expect(() => parseNestBoardImport({ ...board(), tasks: [] }, NOW)).toThrow("최소 한 개");
  });

  it("수정 번호와 재시도 ID·변경 사유를 검증한 저장 요청만 반환한다", () => {
    const request = { expectedRevision: 4, mutationId: "save-12345678", document: board(), reason: "재연결 로그 추가" };
    expect(parseNestBoardMutation(request, NOW)).toEqual(request);
    for (const invalid of [{ expectedRevision: -1 }, { expectedRevision: 1.5 }, { mutationId: "tiny" }, { reason: " " }]) {
      expect(() => parseNestBoardMutation({ ...request, ...invalid }, NOW)).toThrow();
    }
  });
});
