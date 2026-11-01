import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  parseStudioCollaborationResultArguments,
  validateStudioCollaborationRunResult,
} from "./studio-collaboration-run-result.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const HEAD = "1".repeat(40), OTHER_HEAD = "2".repeat(40);
const SOURCE = "a".repeat(64), PROVENANCE = "b".repeat(64), SEED = "c".repeat(64), PRIOR = "d".repeat(64);
const DIGEST = "e".repeat(64), PIXELS = "f".repeat(64), GUARD = "9".repeat(64);
const WIRE_OWNER = "11111111-1111-4111-8111-111111111111";
const WIRE_EDITOR = "22222222-2222-4222-8222-222222222222";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => structuredClone(value);
function capture(label, role, revision = 3) {
  return { label, role, sourceRevision: revision, digest: DIGEST,
    pixels: [{ ordinal: 0, width: 16, height: 16, decodedRgbaSha256: PIXELS }] };
}
function dbProof(requiredActors, revision = 3) {
  const observedUpdates = requiredActors.map((actor, index) => ({ actorId: actor, updateId: actor === "owner" ? WIRE_OWNER : WIRE_EDITOR,
    serverSequence: String(index + 1), payloadHash: SOURCE, payloadBytes: 64, receiptVerified: true,
    retainedUpdateVerified: true, includedInSnapshot: false }));
  return { passed: true, head: HEAD, access: { readOnly: true, isolation: "repeatable read", databaseTarget: "isolated loopback QA" },
    savedWork: { revision, sourceDigest: DIGEST }, frontier: { expectedServerSequence: "2", restoredServerSequence: "2" },
    observedUpdates, receipts: observedUpdates.map(({ actorId, updateId, serverSequence, payloadHash }) =>
      ({ actorId, updateId, serverSequence, payloadHash })),
    updates: observedUpdates.map(({ actorId, updateId, serverSequence, payloadHash, payloadBytes }) =>
      ({ actorId, updateId, sequence: serverSequence, sha256: payloadHash, byteLength: payloadBytes })) };
}
function fixture(scope = "conflict-reapply-local") {
  const productTrackedDiffSHA = sha("");
  const identity = { head: HEAD, productTrackedDiffSHA, productFiles: [] };
  identity.productWorktreeDiffSHA = sha(JSON.stringify({ head: HEAD, productTrackedDiffSHA, files: [] }));
  const sourceSnapshot = () => ({ identity: clone(identity), comparison: { productIdentityMatches: true } });
  const partial = scope === "conflict-reapply-local";
  const plan = { schema: "toonstudio.collaboration-run-plan.v1", scope, expectedHead: HEAD,
    actors: { owner: "owner", editor: "editor" },
    source: { productTrackedDiffSHA, productWorktreeDiffSHA: identity.productWorktreeDiffSHA,
      files: [{ path: "scripts/fixture-worktree-identity.mjs", sha256: SOURCE }],
      identityHelper: { path: "scripts/fixture-worktree-identity.mjs", sha256: SOURCE } },
    provenance: { sha256: PROVENANCE, seedSha256: SEED, priorResultSha256: partial ? PRIOR : null },
    runKey: "fixture-run", repositoryRoot: "/repository", evidenceRoot: "/qa/fixture-run",
    browserEntry: "/qa/fixture-run/canvas-browser.mjs",
    browserGuard: { command: ["node", "/qa/fixture-run/canvas-browser.mjs"], cwd: "/repository", wrapperSha256: GUARD },
    artifacts: { result: "/qa/fixture-run/browser/result.json", browserReceipt: "/guard/fixture-run/receipt.json",
      sourceIdentity: "/qa/fixture-run/source-identity.json" } };
  const result = { head: HEAD, passed: true, phase1Passed: !partial, reconnectPassed: !partial, reloadPassed: !partial,
    sourceAtBrowserStart: sourceSnapshot(), sourceAtBrowserEnd: sourceSnapshot(), sourceAtCleanup: sourceSnapshot(),
    manuscriptFixture: { sha256: SEED }, pageErrors: [], observationErrors: [], captures: [], updates: [],
    conflictUi: { passed: true, rounds: [] },
    historyDurability: { observations: ["owner", "editor"].map((role) =>
      ({ role, warningRetryVisible: false, retryClicked: false, recoveryApproved: false })) } };
  const observed = { head: HEAD, files: clone(plan.source.files), provenanceSha256: PROVENANCE,
    artifactPaths: { result: plan.artifacts.result, browserReceipt: plan.artifacts.browserReceipt, sourceIdentity: plan.artifacts.sourceIdentity },
    sourceIdentityReceipt: { schema: "toonstudio.collaboration-source-identity.v1", runKey: plan.runKey,
      root: plan.repositoryRoot, resultPath: plan.artifacts.result, browserReceiptPath: plan.artifacts.browserReceipt,
      helperSha256: SOURCE, ...sourceSnapshot() },
    provenance: partial ? { priorHead: HEAD, priorResultSha256: PRIOR, seedSha256: SEED } : { head: HEAD, seedSha256: SEED } };
  if (partial) {
    result.remainingGroupOnly = true;
    result.priorCompletedEvidence = { head: HEAD, resultSha256: PRIOR, seedSha256: SEED, notReexecuted: true };
  } else result.initialNativeJournalResolution = { passed: true };
  const browserReceipt = { status: "passed", childExitCode: 0, cleanupObservation: "observed",
    remainingObserved: [], errors: [], forcedCleanup: false, deadlineExceeded: false,
    command: clone(plan.browserGuard.command), cwd: plan.browserGuard.cwd, wrapperSha256: GUARD };
  const dbProofs = {};
  const base = partial ? "baseline" : "reload";
  result.captures.push(capture(base, "owner"), capture(base, "editor"));
  for (const action of partial ? ["reapply-local"] : ["keep-canonical", "reapply-local"]) {
    const transition = { action, operationId: "original-" + action, originalPreserved: true, opfsBodiesVerified: false };
    const round = { action, passed: true, dbProofPassed: true, actualWebSocketClosed: true, transition };
    if (action === "reapply-local") {
      transition.replacementOperationId = "replacement";
      round.reapplyReopen = { passed: true };
      round.replacementReceipt = { state: "server", operationId: "replacement", yjsUpdateId: "replacement", serverSequence: "2" };
    } else {
      transition.additionalOperation = false;
      round.editorPublishCount = 0;
    }
    result.conflictUi.rounds.push(round);
    result.captures.push(capture("conflict-" + action + "-saved", action === "keep-canonical" ? "owner" : "editor"),
      capture("conflict-" + action + "-reload-owner", "owner"), capture("conflict-" + action + "-reload-editor", "editor"));
    dbProofs[action] = dbProof(action === "keep-canonical" ? ["owner"] : ["owner", "editor"]);
    if (action === "reapply-local") {
      const original = { id: transition.operationId, actorId: "editor", targetId: "group", payloadHash: SOURCE };
      const replacement = { ...original, id: "replacement" };
      const journal = { snapshot: { operations: [original, replacement],
        resolutions: { [original.id]: { action: "reapply-local", replacementOperationId: "replacement" } },
        receipts: { replacement: clone(round.replacementReceipt) } } };
      round.afterChoice = clone(journal); round.afterReload = clone(journal); round.reapplyReopen.afterJournal = clone(journal);
      const ack = dbProofs[action].observedUpdates[1];
      result.updates.push({ ...ack, role: "editor", phase: "conflict-reapply-local", time: 10, ackAt: 11 });
    }
  }
  if (!partial) {
    for (const phase of ["online", "reconnect", "reload"]) {
      result[phase] = { causalPassed: true, causalActors: ["owner", "editor"].flatMap((actor) =>
        Array.from({ length: phase === "online" ? 1 : 2 }, (_, index) => ({ id: actor + index, birthActorId: actor }))) };
      if (phase !== "reload") result[phase].dbPassed = true;
      if (phase !== "reload") result.captures.push(capture(phase, "owner"), capture(phase, "editor"));
      dbProofs[phase] = dbProof(["owner", "editor"]);
    }
  }
  return { plan, result, browserReceipt, observed, dbProofs };
}
function rejects(change, expression) {
  const input = fixture();
  change(input);
  assert.throws(() => validateStudioCollaborationRunResult(input), expression);
}

test("r19 형태의 후속 결과는 해당 범위만 통과하고 full 단계를 미실행으로 보존한다", () => {
  const input = fixture(), before = clone(input);
  const value = validateStudioCollaborationRunResult(input);
  assert.equal(value.scopePassed, true);
  assert.equal(value.fullFunctionalPass, false);
  assert.equal(value.evidenceReuseIsNewExecution, false);
  assert.deepEqual(value.stages, { phase1: "not-run", reconnect: "not-run", reload: "not-run",
    conflictKeepCanonical: "not-run", conflictReapplyLocal: "passed" });
  assert.deepEqual(input, before, "원 결과와 계획을 수정하면 안 됩니다.");
  assert.equal(value.cleanupScope, "browser-owned-processes");
  assert.equal(value.directOpfsBodiesVerified, false);
});

test("full은 신규 획·두 actor·양 reload·keep/reapply를 모두 만족해야 통과한다", () => {
  const value = validateStudioCollaborationRunResult(fixture("full"));
  assert.equal(value.fullFunctionalPass, true);
  assert.equal(value.stages.phase1, "passed");
  assert.equal(value.stages.conflictKeepCanonical, "passed");
});

test("알 수 없는 범위와 schema는 결과가 좋아도 거절한다", () => {
  rejects((input) => { input.plan.scope = "guess-from-passed"; }, /실행 범위/u);
  rejects((input) => { input.plan.schema = "legacy"; }, /schema/u);
});

test("HEAD와 실제 소스 pin·브라우저 전후 source identity를 정확히 대조한다", () => {
  for (const change of [
    (input) => { input.observed.head = OTHER_HEAD; },
    (input) => { input.result.head = OTHER_HEAD; },
    (input) => { input.result.sourceAtCleanup.identity.head = OTHER_HEAD; },
  ]) rejects(change, /HEAD/u);
  rejects((input) => { input.observed.files[0].sha256 = PRIOR; }, /소스 SHA/u);
  rejects((input) => { input.observed.files = []; }, /생략/u);
  rejects((input) => { input.observed.files.push(clone(input.observed.files[0])); }, /중복/u);
  rejects((input) => { input.result.sourceAtBrowserEnd.comparison.productIdentityMatches = false; }, /제품 소스/u);
  rejects((input) => { input.result.sourceAtCleanup.identity.productFiles = [{ path: "changed", kind: "tracked", sha256: SOURCE }]; }, /manifest digest/u);
  rejects((input) => { input.result.sourceAtBrowserEnd.identity.productTrackedDiffSHA = SOURCE; }, /tracked diff/u);
});

test("selected pin과 정상 clean dirty-only manifest는 별도이며 실제 Localouter identity가 필요하다", () => {
  const input = fixture();
  assert.equal(input.plan.source.files.length, 1);
  assert.deepEqual(input.result.sourceAtBrowserStart.identity.productFiles, []);
  assert.equal(validateStudioCollaborationRunResult(input).scopePassed, true);
  delete input.observed.sourceIdentityReceipt;
  assert.throws(() => validateStudioCollaborationRunResult(input), /Localouter/u);
});

test("브라우저 세 시점이 같아도 실제 outer dirty manifest와 다르면 거절한다", () => {
  const input = fixture();
  const files = [{ path: "apps/web/src/changed.ts", kind: "untracked", sha256: SOURCE }];
  const digest = sha(JSON.stringify({ head: HEAD, productTrackedDiffSHA: sha(""), files }));
  input.plan.source.productWorktreeDiffSHA = digest;
  for (const key of ["sourceAtBrowserStart", "sourceAtBrowserEnd", "sourceAtCleanup"]) {
    input.result[key].identity.productFiles = clone(files);
    input.result[key].identity.productWorktreeDiffSHA = digest;
  }
  assert.throws(() => validateStudioCollaborationRunResult(input), /worktree digest/u);
  input.observed.sourceIdentityReceipt.identity.productFiles = clone(files);
  input.observed.sourceIdentityReceipt.identity.productWorktreeDiffSHA = digest;
  assert.equal(validateStudioCollaborationRunResult(input).scopePassed, true);
  input.observed.sourceIdentityReceipt.comparison.productIdentityMatches = false;
  assert.throws(() => validateStudioCollaborationRunResult(input), /제품 소스/u);
});

test("성공한 다른 run의 guard·artifact·source 영수증도 재사용할 수 없다", () => {
  for (const change of [
    (input) => { input.browserReceipt.command = ["node", "/qa/another-run/canvas-browser.mjs"]; },
    (input) => { input.browserReceipt.cwd = "/another-repository"; },
    (input) => { input.browserReceipt.wrapperSha256 = SOURCE; },
    (input) => { input.observed.artifactPaths.result = "/qa/another-run/browser/result.json"; },
    (input) => { input.observed.sourceIdentityReceipt.runKey = "another-run"; },
    (input) => { input.observed.sourceIdentityReceipt.resultPath = "/qa/another-run/browser/result.json"; },
    (input) => { input.observed.sourceIdentityReceipt.browserReceiptPath = "/guard/another-run/receipt.json"; },
    (input) => { input.observed.sourceIdentityReceipt.helperSha256 = PRIOR; },
  ]) rejects(change);
});

test("provenance 바이트·원고 seed·이전 결과의 pin과 HEAD를 각각 검사한다", () => {
  rejects((input) => { input.observed.provenanceSha256 = PRIOR; }, /provenance 바이트/u);
  rejects((input) => { input.observed.provenance.priorHead = OTHER_HEAD; }, /이전 증거 HEAD/u);
  rejects((input) => { input.observed.provenance.priorResultSha256 = SOURCE; }, /이전 결과 provenance/u);
  rejects((input) => { input.result.priorCompletedEvidence.resultSha256 = SOURCE; }, /이전 결과 SHA/u);
  rejects((input) => { input.result.manuscriptFixture.sha256 = SOURCE; }, /seed SHA/u);
  rejects((input) => { input.result.priorCompletedEvidence.notReexecuted = false; }, /재실행/u);
  rejects((input) => { delete input.result.priorCompletedEvidence; }, /완료 증거/u);
});

test("full 필수 단계 false·누락과 과거 증거 재사용은 거절한다", () => {
  for (const flag of ["phase1Passed", "reconnectPassed", "reloadPassed"]) {
    for (const missing of [false, true]) {
      const input = fixture("full");
      if (missing) delete input.result[flag]; else input.result[flag] = false;
      assert.throws(() => validateStudioCollaborationRunResult(input), /필수 단계/u);
    }
  }
  const input = fixture("full");
  input.result.priorCompletedEvidence = { notReexecuted: true };
  assert.throws(() => validateStudioCollaborationRunResult(input), /부분 재사용/u);
});

test("full은 원래 native 충돌·PG·causal actor·양 PNG 보증도 생략하지 않는다", () => {
  for (const change of [
    (input) => { input.result.initialNativeJournalResolution.passed = false; },
    (input) => { input.result.online.causalPassed = false; },
    (input) => { input.result.reconnect.dbPassed = false; },
    (input) => { input.result.reload.causalActors[0].birthActorId = "editor"; },
    (input) => { input.dbProofs.reload.passed = false; },
    (input) => { input.result.captures.find((value) => value.label === "online" && value.role === "editor").digest = SOURCE; },
  ]) {
    const input = fixture("full"); change(input);
    assert.throws(() => validateStudioCollaborationRunResult(input));
  }
});

test("부분 실행의 full flag를 true로 바꾸거나 생략해도 범위를 추정하지 않는다", () => {
  rejects((input) => { input.result.phase1Passed = true; }, /미실행 단계/u);
  rejects((input) => { delete input.result.reloadPassed; }, /미실행 단계/u);
  rejects((input) => { input.result.remainingGroupOnly = false; }, /후속 전용/u);
});

test("브라우저 0·정리 observed·소유 잔류0·강제정리 없음·오류0을 모두 요구한다", () => {
  const changes = [
    (input) => { input.browserReceipt.childExitCode = 1; },
    (input) => { input.browserReceipt.childExitCode = null; },
    (input) => { input.browserReceipt.status = "failed"; },
    (input) => { input.browserReceipt.cleanupObservation = "unverified"; },
    (input) => { input.browserReceipt.remainingObserved = [{ pid: 1 }]; },
    (input) => { input.browserReceipt.forcedCleanup = true; },
    (input) => { input.browserReceipt.deadlineExceeded = true; },
    (input) => { input.browserReceipt.errors = ["실패"]; },
    (input) => { input.result.passed = false; },
    (input) => { input.result.pageErrors = ["실패"]; },
    (input) => { input.result.observationErrors = ["실패"]; },
    (input) => { input.result.cleanupViteError = "잔류"; },
    (input) => { input.result.sourceIdentityError = "변경"; },
  ];
  for (const change of changes) rejects(change);
});

test("잘못된 action·round 누락·중복·예상 밖 PG 증거는 거절한다", () => {
  rejects((input) => { input.result.conflictUi.rounds = []; }, /action 순서와 수/u);
  rejects((input) => { input.result.conflictUi.rounds[0].action = "keep-canonical"; }, /action 순서와 수/u);
  rejects((input) => { input.result.conflictUi.rounds.push(clone(input.result.conflictUi.rounds[0])); }, /action 순서와 수/u);
  rejects((input) => { input.dbProofs.extra = dbProof(["owner"]); }, /정확한 PG/u);
  rejects((input) => { delete input.dbProofs["reapply-local"]; }, /정확한 PG/u);
});

test("재적용 UI·DB·단절·원본 보존·replacement receipt·재열기 모두 검사한다", () => {
  for (const change of [
    (input) => { input.result.conflictUi.rounds[0].passed = false; },
    (input) => { input.result.conflictUi.rounds[0].dbProofPassed = false; },
    (input) => { input.result.conflictUi.rounds[0].actualWebSocketClosed = false; },
    (input) => { input.result.conflictUi.rounds[0].transition.originalPreserved = false; },
    (input) => { input.result.conflictUi.rounds[0].reapplyReopen.passed = false; },
    (input) => { input.result.conflictUi.rounds[0].replacementReceipt.state = "device"; },
    (input) => { input.result.conflictUi.rounds[0].replacementReceipt.operationId = "other-operation"; },
    (input) => { input.result.conflictUi.rounds[0].replacementReceipt.yjsUpdateId = "other-update"; },
    (input) => { input.dbProofs["reapply-local"].receipts[1].actorId = "owner"; },
    (input) => { input.dbProofs["reapply-local"].observedUpdates.pop(); },
    (input) => { input.dbProofs["reapply-local"].receipts.pop(); },
    (input) => { input.dbProofs["reapply-local"].observedUpdates[0].receiptVerified = false; },
  ]) rejects(change);
});

test("예전 editor ACK와 새 replacement receipt만 섞은 결과를 거절한다", () => {
  const input = fixture();
  input.result.updates[0].serverSequence = "1";
  input.result.updates[0].updateId = "33333333-3333-4333-8333-333333333333";
  assert.throws(() => validateStudioCollaborationRunResult(input), /실제 editor wire ACK/u);
  const another = fixture();
  another.dbProofs["reapply-local"].observedUpdates[1].updateId = "33333333-3333-4333-8333-333333333333";
  another.dbProofs["reapply-local"].receipts[1].updateId = "33333333-3333-4333-8333-333333333333";
  assert.throws(() => validateStudioCollaborationRunResult(another), /재적용 PG 관측 ACK/u);
});

test("replacement 저널ID·wire UUID·actor·순번·SHA·바이트·PG payload 연결을 각각 검사한다", () => {
  for (const change of [
    (input) => { input.result.conflictUi.rounds[0].afterReload.snapshot.operations[1].id = "other-replacement"; },
    (input) => { input.result.conflictUi.rounds[0].afterReload.snapshot.operations[1].payloadHash = PRIOR; },
    (input) => { input.result.conflictUi.rounds[0].afterChoice.snapshot.receipts.replacement.serverSequence = "1"; },
    (input) => { input.result.updates[0].actorId = "owner"; },
    (input) => { input.result.updates[0].payloadHash = PRIOR; },
    (input) => { input.result.updates[0].payloadBytes = 63; },
    (input) => { input.result.updates[0].ackAt = 9; },
    (input) => { input.dbProofs["reapply-local"].updates[1].sha256 = PRIOR; },
    (input) => { input.dbProofs["reapply-local"].updates[1].byteLength = 63; },
    (input) => { input.dbProofs["reapply-local"].updates[1].sequence = "1"; },
    (input) => { input.dbProofs["reapply-local"].updates = []; },
  ]) rejects(change);
});

test("한 계정 reload 누락·다른 원고·다른 pixels와 PG revision·digest·frontier 차이는 거절한다", () => {
  for (const change of [
    (input) => { input.result.captures = input.result.captures.filter((value) => value.label !== "conflict-reapply-local-reload-editor"); },
    (input) => { input.result.captures.at(-1).sourceRevision = 4; },
    (input) => { input.result.captures.at(-1).digest = SOURCE; },
    (input) => { input.result.captures.at(-1).pixels[0].decodedRgbaSha256 = SOURCE; },
    (input) => { input.dbProofs["reapply-local"].savedWork.revision = 4; },
    (input) => { input.dbProofs["reapply-local"].savedWork.sourceDigest = SOURCE; },
    (input) => { input.dbProofs["reapply-local"].frontier.restoredServerSequence = "3"; },
    (input) => { input.dbProofs["reapply-local"].access.readOnly = false; },
  ]) rejects(change);
});

test("동일 replacement의 재전송 ACK는 같은 UUID·payload일 때만 허용한다", () => {
  const input = fixture();
  input.result.updates.push(clone(input.result.updates[0]));
  assert.equal(validateStudioCollaborationRunResult(input).scopePassed, true);
  input.result.updates[1].payloadBytes = 1;
  assert.throws(() => validateStudioCollaborationRunResult(input), /wire ACK가 서로/u);
});

test("압축된 replacement는 같은 wire·receipt와 명시적 snapshot frontier가 모두 필요하다", () => {
  const input = fixture(), proof = input.dbProofs["reapply-local"];
  proof.updates = proof.updates.filter((entry) => entry.updateId !== WIRE_EDITOR);
  proof.observedUpdates[1].retainedUpdateVerified = false;
  proof.observedUpdates[1].includedInSnapshot = true;
  proof.frontier.compactedSequence = "2";
  proof.frontier.snapshot = { sha256: SOURCE, byteLength: 128 };
  assert.equal(validateStudioCollaborationRunResult(input).scopePassed, true);
  proof.frontier.compactedSequence = "1";
  assert.throws(() => validateStudioCollaborationRunResult(input), /압축 frontier/u);
  proof.frontier.compactedSequence = "2";
  proof.frontier.snapshot.byteLength = 0;
  assert.throws(() => validateStudioCollaborationRunResult(input), /양의 정수/u);
});

test("공유본 유지는 editor publish0·추가 operation0 보증을 유지한다", () => {
  const input = fixture("full");
  input.result.conflictUi.rounds[0].editorPublishCount = 1;
  assert.throws(() => validateStudioCollaborationRunResult(input), /editor mutation/u);
  const another = fixture("full");
  another.result.conflictUi.rounds[0].transition.additionalOperation = true;
  assert.throws(() => validateStudioCollaborationRunResult(another), /추가 operation/u);
});

test("full의 이전 단계 editor ACK는 keep 선택의 신규 publish와 혼동하지 않는다", () => {
  const input = fixture("full");
  input.dbProofs["keep-canonical"] = dbProof(["owner", "editor"]);
  assert.equal(validateStudioCollaborationRunResult(input).fullFunctionalPass, true);
  delete input.result.conflictUi.rounds[0].editorPublishCount;
  assert.throws(() => validateStudioCollaborationRunResult(input), /editor mutation/u);
});

test("경고 미재현이나 버튼 숨김을 durable 복구 승인으로 승격하지 않는다", () => {
  const input = fixture();
  assert.deepEqual(validateStudioCollaborationRunResult(input).historyDurability,
    { status: "not-reproduced", recoveryApproved: false });
  input.result.historyDurability.observations[0] = {
    role: "owner", warningRetryVisible: true, retryClicked: true, recoveryApproved: true,
  };
  assert.deepEqual(validateStudioCollaborationRunResult(input).historyDurability,
    { status: "recovery-unverified", recoveryApproved: false });
  input.result.historyDurability.observations[1].recoveryApproved = true;
  assert.throws(() => validateStudioCollaborationRunResult(input), /미재현 경고/u);
  delete input.result.historyDurability;
  assert.deepEqual(validateStudioCollaborationRunResult(input).historyDurability,
    { status: "unverified", recoveryApproved: false });
});

test("얇은 CLI는 root·plan·봉인 SHA만 받고 범위나 artifact 덮어쓰기를 거절한다", () => {
  const args = ["--root", "/tmp/fixture-repository", "--plan", "sealed.json", "--plan-sha256", SOURCE];
  assert.deepEqual(parseStudioCollaborationResultArguments(args),
    { root: "/tmp/fixture-repository", plan: "sealed.json", planSha256: SOURCE });
  for (const invalid of [[], [...args, "--scope", "full"], ["--root", "relative", ...args.slice(2)],
    ["--root", "/tmp/root", "--root", "/tmp/other", "--plan-sha256", SOURCE],
    ["--root", "/tmp/root", "--result", "result.json", "--plan-sha256", SOURCE],
    ["--root", "/tmp/root", "--plan", "sealed.json", "--plan-sha256", "not-sha"]]) {
    assert.throws(() => parseStudioCollaborationResultArguments(invalid));
  }
});
