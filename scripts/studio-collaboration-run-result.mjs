import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 실행 전에 봉인한 plan의 범위만 판정한다. 원 영수증·제품·DB·저널은 쓰지 않는다.
 *
 * API: validateStudioCollaborationRunResult({ plan, result, browserReceipt, observed, dbProofs })
 * plan: schema, scope, expectedHead, actors: { owner, editor },
 *   source: { productTrackedDiffSHA, productWorktreeDiffSHA, files: [{ path, sha256 }],
 *     identityHelper: { path, sha256 } },
 *   provenance: { sha256, seedSha256, priorResultSha256: null 또는 SHA256 },
 *   runKey, repositoryRoot, evidenceRoot, browserEntry,
 *   browserGuard: { command: 실제argv, cwd, wrapperSha256 },
 *   artifacts: { result, browserReceipt, sourceIdentity, provenance, dbProofs: { phase: 파일경로 } }.
 * full의 provenance 파일은 { head, seedSha256 }, 후속 범위는 기존 seed-provenance 형식이다.
 * observed는 { head, files, artifactPaths, sourceIdentityReceipt, provenanceSha256, provenance }다.
 * selected files pin은 dirty-only productFiles와 별개다. 정상 clean productFiles는 빈 배열이다.
 * Localouter는 기존 captureSourceIdentity/assertSameSourceIdentity 전체 비교를 수행한 뒤
 * sourceIdentity artifact를 새 파일로 남긴다: schema: toonstudio.collaboration-source-identity.v1,
 * runKey, root, resultPath, browserReceiptPath, helperSha256, identity, comparison.
 * identity는 outer의 마지막 실제 관측이며 comparison.productIdentityMatches는 true여야 한다.
 * 새 스캐너나 캐시 예외는 만들지 않는다. 기존 helper와 해당 helper pin을 그대로 사용한다.
 * Localouter는 CLI 전후에도 기존 전체 source identity 비교를 유지해야 한다.
 *
 * CLI: node scripts/studio-collaboration-run-result.mjs --root 절대저장소경로
 *   --plan 실행전봉인한계획.json --plan-sha256 해당계획SHA256
 * 모든 artifact 경로는 봉인한 plan에서만 선택한다. 상대 경로는 root 기준이다.
 * full의 keep round는 선택 전후 차이인 editorPublishCount: 0도 기록해야 한다.
 * 이전 단계 editor ACK가 PG 증거에 남은 것과 keep 선택의 신규 publish를 구분한다.
 * CLI는 실제 HEAD·개별 소스·provenance 바이트를 다시 읽고 안전한 요약만 출력한다.
 * plan의 실행 전 봉인과 기존 snapshot·기간·프로세스 정리 guard는 부모가 유지한다.
 * 과거 증거의 재판독은 새 브라우저 실행이 아니며 현재 main 검증으로 승격하지 않는다.
 */

export const STUDIO_COLLABORATION_RESULT_SCOPES = Object.freeze(["full", "conflict-reapply-local"]);
const PLAN_SCHEMA = "toonstudio.collaboration-run-plan.v1";
const RESULT_SCHEMA = "toonstudio.collaboration-run-assessment.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const ACTIONS = Object.freeze(["keep-canonical", "reapply-local"]);
const FULL_PHASES = Object.freeze(["online", "reconnect", "reload"]);
const FULL_FLAGS = Object.freeze(["phase1Passed", "reconnectPassed", "reloadPassed"]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function object(value, label) {
  assert(plain(value), label + " 객체가 필요합니다.");
  return value;
}
function text(value, label) {
  assert(typeof value === "string" && value.length > 0, label + " 문자열이 필요합니다.");
  return value;
}
function sha(value, label) {
  assert(typeof value === "string" && SHA256.test(value), label + " SHA256 형식이 다릅니다.");
  return value;
}
function array(value, label) {
  assert(Array.isArray(value), label + " 배열이 필요합니다.");
  return value;
}
function empty(value, label) {
  assert.deepEqual(array(value, label), [], label + "가 비어 있지 않습니다.");
}
function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, label + " 양의 정수가 필요합니다.");
  return value;
}
function sequence(value, label) {
  assert(typeof value === "string" && /^[1-9][0-9]{0,18}$/u.test(value), label + " 서버 순번이 필요합니다.");
  const parsed = BigInt(value);
  assert(parsed <= 9_223_372_036_854_775_807n, label + " 서버 순번 범위를 초과했습니다.");
  return parsed;
}
function one(values, predicate, label) {
  const matches = array(values, label).filter(predicate);
  assert.equal(matches.length, 1, label + "는 정확히 한 개여야 합니다.");
  return matches[0];
}
function sourceFiles(value, label) {
  const files = array(value, label);
  assert(files.length > 0, label + "를 생략할 수 없습니다.");
  const names = new Set();
  return files.map((entry) => {
    object(entry, label);
    const path = text(entry.path, label + " 경로");
    assert(!isAbsolute(path) && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === ".."),
      label + "는 정규 상대 경로여야 합니다.");
    assert(!/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$/iu.test(path), "비밀 파일은 소스 증거로 읽지 않습니다.");
    assert(!names.has(path), label + " 경로가 중복됐습니다.");
    names.add(path);
    return { path, sha256: sha(entry.sha256, label) };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}
function dirtyManifest(value, label) {
  const names = new Set();
  return array(value, label).map((entry) => {
    object(entry, label);
    const path = text(entry.path, label + " 경로");
    assert(!isAbsolute(path) && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === ".."),
      label + "는 정규 상대 경로여야 합니다.");
    assert(["tracked", "untracked", "deleted"].includes(entry.kind), label + " 파일 종류가 다릅니다.");
    assert(!names.has(path), label + " 경로가 중복됐습니다.");
    names.add(path);
    if (entry.kind === "deleted") assert.equal(entry.sha256, null, label + " 삭제 파일의 SHA는 null이어야 합니다.");
    else sha(entry.sha256, label);
    return { path, kind: entry.kind, sha256: entry.sha256 };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}
function assertSource(plan, result, observed) {
  assert.equal(observed.head, plan.expectedHead, "현재 HEAD가 봉인한 HEAD와 다릅니다.");
  assert.equal(result.head, plan.expectedHead, "브라우저 결과 HEAD가 다릅니다.");
  const expected = object(plan.source, "plan.source");
  sha(expected.productTrackedDiffSHA, "제품 tracked diff");
  sha(expected.productWorktreeDiffSHA, "제품 worktree diff");
  const selected = sourceFiles(expected.files, "봉인한 소스 SHA");
  assert.deepEqual(sourceFiles(observed.files, "실제 소스 SHA"), selected, "실제 소스 SHA가 봉인한 입력과 다릅니다.");
  const helper = object(expected.identityHelper, "기존 source identity helper");
  assert(selected.some((entry) => entry.path === helper.path && entry.sha256 === helper.sha256),
    "기존 source identity helper도 선택한 소스 pin에 포함해야 합니다.");
  const outer = object(observed.sourceIdentityReceipt, "Localouter source identity 영수증");
  assert.equal(outer.schema, "toonstudio.collaboration-source-identity.v1", "source identity 영수증 schema가 다릅니다.");
  assert.equal(outer.runKey, plan.runKey, "source identity 영수증의 runKey가 다릅니다.");
  assert.equal(outer.root, plan.repositoryRoot, "source identity 영수증의 root가 다릅니다.");
  assert.equal(outer.resultPath, plan.artifacts.result, "source identity 영수증의 결과 artifact가 다릅니다.");
  assert.equal(outer.browserReceiptPath, plan.artifacts.browserReceipt, "source identity 영수증의 guard artifact가 다릅니다.");
  assert.equal(outer.helperSha256, sha(helper.sha256, "기존 identity helper"), "source identity helper SHA가 다릅니다.");
  const snapshots = [object(outer, "Localouter")];
  for (const name of ["sourceAtBrowserStart", "sourceAtBrowserEnd", "sourceAtCleanup"]) {
    snapshots.push(object(result[name], name));
  }
  let actualManifest;
  for (const snapshot of snapshots) {
    assert.equal(object(snapshot.comparison, "source comparison").productIdentityMatches, true,
      "제품 소스 비교에 실패했습니다.");
    const identity = object(snapshot.identity, "source identity");
    assert.equal(identity.head, plan.expectedHead, "source identity HEAD가 다릅니다.");
    assert.equal(identity.productTrackedDiffSHA, expected.productTrackedDiffSHA, "source identity tracked diff가 다릅니다.");
    const files = dirtyManifest(identity.productFiles, "dirty-only 제품 파일");
    const computed = hash(JSON.stringify({ head: identity.head, productTrackedDiffSHA: identity.productTrackedDiffSHA, files }));
    assert.equal(computed, identity.productWorktreeDiffSHA, "제품 소스 manifest digest가 다릅니다.");
    assert.equal(computed, expected.productWorktreeDiffSHA, "제품 worktree digest가 봉인한 입력과 다릅니다.");
    if (actualManifest) assert.deepEqual(files, actualManifest, "Localouter 실제 dirty manifest와 브라우저 source identity가 다릅니다.");
    actualManifest = files;
  }
}
function assertRunBinding(plan, observed, receipt) {
  text(plan.runKey, "고정 runKey");
  for (const key of ["repositoryRoot", "evidenceRoot", "browserEntry"]) {
    assert(typeof plan[key] === "string" && isAbsolute(plan[key]) && resolve(plan[key]) === plan[key],
      "봉인한 실행 경로는 정규 절대 경로여야 합니다.");
  }
  assert.equal(basename(plan.evidenceRoot), plan.runKey, "runKey가 evidence root와 다릅니다.");
  const insideEvidence = (path) => path.startsWith(plan.evidenceRoot + sep);
  assert(insideEvidence(plan.browserEntry), "브라우저 진입 파일이 고정 run의 evidence root 밖입니다.");
  const artifacts = object(plan.artifacts, "고정 artifact 경로");
  const actual = object(observed.artifactPaths, "실제로 읽은 artifact 경로");
  for (const key of ["result", "browserReceipt", "sourceIdentity"]) {
    assert(typeof artifacts[key] === "string" && isAbsolute(artifacts[key]) && resolve(artifacts[key]) === artifacts[key],
      "봉인한 artifact는 정규 절대 경로여야 합니다.");
    assert.equal(actual[key], artifacts[key], "다른 run의 artifact 경로가 선택됐습니다.");
  }
  assert(insideEvidence(artifacts.result) && insideEvidence(artifacts.sourceIdentity),
    "결과와 source identity는 고정 run의 evidence root에 있어야 합니다.");
  const guard = object(plan.browserGuard, "봉인한 브라우저 guard");
  const command = array(guard.command, "봉인한 guard command");
  assert(command.length > 0 && command.every((value) => typeof value === "string" && value.length > 0),
    "실제 guard argv가 필요합니다.");
  assert.equal(command.filter((value) => value === plan.browserEntry).length, 1,
    "guard command는 같은 run의 브라우저 진입 파일을 정확히 한 번 실행해야 합니다.");
  assert.equal(guard.cwd, plan.repositoryRoot, "봉인한 guard cwd가 다릅니다.");
  assert.deepEqual(receipt.command, command, "다른 run의 브라우저 guard command입니다.");
  assert.equal(receipt.cwd, guard.cwd, "다른 run의 브라우저 guard cwd입니다.");
  assert.equal(receipt.wrapperSha256, sha(guard.wrapperSha256, "봉인한 guard wrapper"), "브라우저 guard wrapper SHA가 다릅니다.");
}

function assertProvenance(plan, result, observed) {
  const expected = object(plan.provenance, "plan.provenance");
  assert.equal(sha(observed.provenanceSha256, "실제 provenance"), sha(expected.sha256, "봉인한 provenance"),
    "provenance 바이트 SHA가 다릅니다.");
  const provenance = object(observed.provenance, "실제 provenance");
  const seed = sha(expected.seedSha256, "봉인한 seed");
  assert.equal(provenance.seedSha256, seed, "provenance seed SHA가 다릅니다.");
  assert.equal(object(result.manuscriptFixture, "원고 fixture").sha256, seed, "브라우저 원고 seed SHA가 다릅니다.");
  if (plan.scope === "full") {
    assert.equal(expected.priorResultSha256, null, "전체 실행은 이전 결과를 이번 실행으로 재사용할 수 없습니다.");
    assert.equal(provenance.head, plan.expectedHead, "전체 입력 provenance HEAD가 다릅니다.");
    assert.equal(result.priorCompletedEvidence, undefined, "전체 실행 결과에 부분 재사용 표식이 있습니다.");
  } else {
    const prior = object(result.priorCompletedEvidence, "별도 완료 증거");
    assert.equal(provenance.priorHead, plan.expectedHead, "이전 증거 HEAD가 다릅니다.");
    assert.equal(prior.head, plan.expectedHead, "브라우저가 기록한 이전 HEAD가 다릅니다.");
    const digest = sha(expected.priorResultSha256, "봉인한 이전 결과");
    assert.equal(provenance.priorResultSha256, digest, "이전 결과 provenance SHA가 다릅니다.");
    assert.equal(prior.resultSha256, digest, "브라우저가 기록한 이전 결과 SHA가 다릅니다.");
    assert.equal(prior.seedSha256, seed, "이전 증거의 seed SHA가 다릅니다.");
    assert.equal(prior.notReexecuted, true, "재실행하지 않은 증거를 새 통과로 세면 안 됩니다.");
  }
}
function assertBrowserReceipt(receipt) {
  object(receipt, "브라우저 guard 영수증");
  assert.equal(receipt.status, "passed", "브라우저 guard가 통과하지 않았습니다.");
  assert.equal(receipt.childExitCode, 0, "브라우저 실제 종료 코드가 0이 아닙니다.");
  assert.equal(receipt.cleanupObservation, "observed", "브라우저 정리의 실제 관측이 필요합니다.");
  empty(receipt.remainingObserved, "브라우저 소유 프로세스 잔류");
  empty(receipt.errors, "브라우저 guard 오류");
  assert.equal(receipt.forcedCleanup, false, "강제 정리된 실행은 정상 통과가 아닙니다.");
  assert.equal(receipt.deadlineExceeded, false, "마감 초과 실행은 정상 통과가 아닙니다.");
}
function assertPixels(capture, label) {
  const pixels = array(capture.pixels, label + " PNG");
  assert(pixels.length > 0, label + " 실제 decoded PNG가 필요합니다.");
  const ordinals = new Set();
  return pixels.map((value) => {
    object(value, label + " PNG");
    assert(Number.isSafeInteger(value.ordinal) && value.ordinal >= 0 && !ordinals.has(value.ordinal),
      label + " PNG 페이지가 중복되거나 잘못됐습니다.");
    ordinals.add(value.ordinal);
    return { ordinal: value.ordinal, width: positiveInteger(value.width, label + " 폭"),
      height: positiveInteger(value.height, label + " 높이"), decodedRgbaSha256: sha(value.decodedRgbaSha256, label + " pixels") };
  });
}
function captureAt(result, label, role) {
  const capture = one(result.captures, (value) => value.label === label && value.role === role, label + " " + role + " capture");
  positiveInteger(capture.sourceRevision, label + " revision");
  sha(capture.digest, label + " 원고 digest");
  assertPixels(capture, label);
  return capture;
}
function assertDbProof(proof, plan, requiredActors, saved, label) {
  object(proof, label + " PG 증명");
  assert.equal(proof.passed, true, label + " PG 증명이 통과하지 않았습니다.");
  assert.equal(proof.head, plan.expectedHead, label + " PG HEAD가 다릅니다.");
  assert.equal(object(proof.access, label + " PG 접근").readOnly, true, label + " PG 증명은 읽기 전용이어야 합니다.");
  assert.equal(proof.access.isolation, "repeatable read", label + " PG 일관된 snapshot이 필요합니다.");
  assert.equal(proof.access.databaseTarget, "isolated loopback QA", label + " 격리 QA DB 증거가 필요합니다.");
  const work = object(proof.savedWork, label + " PG 저장 원고");
  assert.equal(work.revision, saved.sourceRevision, label + " PG와 UI 저장 revision이 다릅니다.");
  assert.equal(work.sourceDigest, saved.digest, label + " PG와 UI 저장 digest가 다릅니다.");
  const frontier = object(proof.frontier, label + " PG frontier");
  const last = sequence(frontier.restoredServerSequence, label);
  assert.equal(frontier.expectedServerSequence, frontier.restoredServerSequence, label + " PG frontier가 다릅니다.");
  const receipts = array(proof.receipts, label + " PG receipts");
  const observed = array(proof.observedUpdates, label + " 관찰한 ACK");
  assert(observed.length > 0, label + " 실제 mutation ACK가 필요합니다.");
  const ids = new Set();
  for (const update of observed) {
    text(update.updateId, label + " updateId");
    assert(!ids.has(update.updateId), label + " 관찰 ACK가 중복됐습니다.");
    ids.add(update.updateId);
    assert([plan.actors.owner, plan.actors.editor].includes(update.actorId), label + " 알 수 없는 mutation actor입니다.");
    assert(sequence(update.serverSequence, label) <= last, label + " ACK가 복원 frontier 이후입니다.");
    sha(update.payloadHash, label + " ACK payload");
    positiveInteger(update.payloadBytes, label + " ACK 바이트");
    assert.equal(update.receiptVerified, true, label + " 실제 ACK의 durable receipt 대조가 필요합니다.");
    const receipt = one(receipts, (value) => value.updateId === update.updateId, label + " durable receipt");
    for (const key of ["actorId", "serverSequence", "payloadHash"]) {
      assert.equal(receipt[key], update[key], label + " ACK와 PG receipt가 다릅니다.");
    }
  }
  for (const actor of requiredActors) assert(observed.some((value) => value.actorId === actor), label + " 필수 actor의 ACK가 없습니다.");
  return proof;
}
function assertRound(result, plan, action, proof) {
  const round = one(result.conflictUi.rounds, (value) => value.action === action, action + " round");
  assert.equal(round.passed, true, action + " 실제 UI round가 통과하지 않았습니다.");
  assert.equal(round.dbProofPassed, true, action + " DB 검증이 통과하지 않았습니다.");
  assert.equal(round.actualWebSocketClosed, true, action + " 실제 단절이 확인되지 않았습니다.");
  const transition = object(round.transition, action + " 전이");
  assert.equal(transition.action, action, action + " 전이 종류가 다릅니다.");
  assert.equal(transition.originalPreserved, true, action + " 원본 보존이 확인되지 않았습니다.");
  text(transition.operationId, action + " 원래 operation");
  const saved = captureAt(result, "conflict-" + action + "-saved", action === "keep-canonical" ? "owner" : "editor");
  const required = action === "keep-canonical" ? [plan.actors.owner] : [plan.actors.owner, plan.actors.editor];
  assertDbProof(proof, plan, required, saved, action);
  const baseLabel = plan.scope === "full" ? "reload" : "baseline";
  const baseline = captureAt(result, baseLabel, "owner");
  const beforePixels = assertPixels(baseline, action + " 이전");
  for (const role of ["owner", "editor"]) {
    const after = captureAt(result, "conflict-" + action + "-reload-" + role, role);
    assert.equal(after.sourceRevision, saved.sourceRevision, action + " 양 계정 reload revision이 다릅니다.");
    assert.equal(after.digest, saved.digest, action + " 양 계정 reload 원고가 다릅니다.");
    assert.deepEqual(assertPixels(after, action + " " + role), beforePixels, action + " 이전 작화 pixels가 바뀌었습니다.");
  }
  if (action === "reapply-local") {
    assert.equal(object(round.reapplyReopen, "재적용 재열기").passed, true, "재적용 저장 전 정상 재열기가 필요합니다.");
    const replacementId = text(transition.replacementOperationId, "재적용 replacement operation");
    assert.notEqual(replacementId, transition.operationId, "원래 operation을 replacement로 덮으면 안 됩니다.");
    const receipt = object(round.replacementReceipt, "재적용 replacement receipt");
    assert.equal(receipt.state, "server", "재적용은 실제 서버 receipt여야 합니다.");
    assert.equal(receipt.operationId, replacementId, "재적용 receipt의 operation이 다릅니다.");
    assert.equal(receipt.yjsUpdateId, replacementId, "재적용 receipt의 updateId가 다릅니다.");
    const seq = sequence(receipt.serverSequence, "재적용 receipt");
    assert(seq <= sequence(proof.frontier.restoredServerSequence, "재적용 frontier"), "재적용 receipt가 frontier 이후입니다.");
    // 저널 yjsUpdateId는 operation ID다. 실제 wire/PG의 UUID updateId와 혼동하지 않는다.
    const journals = [round.afterChoice, object(round.reapplyReopen, "재적용 재열기").afterJournal, round.afterReload];
    let original, replacement;
    for (const journal of journals) {
      const snapshot = object(object(journal, "재적용 저널").snapshot, "재적용 저널 snapshot");
      const old = one(snapshot.operations, (entry) => entry.id === transition.operationId, "원래 operation");
      const next = one(snapshot.operations, (entry) => entry.id === replacementId, "replacement operation");
      if (original) assert.deepEqual(old, original, "재적용 뒤 원래 operation이 바뀌었습니다.");
      if (replacement) assert.deepEqual(next, replacement, "재적용 재열기 뒤 replacement가 바뀌었습니다.");
      original = old; replacement = next;
      assert.equal(next.actorId, plan.actors.editor, "replacement actor가 다릅니다.");
      const resolution = object(snapshot.resolutions?.[transition.operationId], "원래 operation 해결");
      assert.equal(resolution.action, "reapply-local", "재적용 해결 종류가 다릅니다.");
      assert.equal(resolution.replacementOperationId, replacementId, "재적용 해결과 replacement ID가 다릅니다.");
      assert.deepEqual(snapshot.receipts?.[replacementId], receipt, "replacement의 저널 서버 receipt가 보존되지 않았습니다.");
    }
    const wires = array(result.updates, "실제 wire ACK").filter((entry) => entry.role === "editor"
      && entry.phase === "conflict-reapply-local" && entry.serverSequence === receipt.serverSequence);
    assert(wires.length > 0, "정확한 replacement 서버 순번의 실제 editor wire ACK가 없습니다.");
    const wire = wires[0];
    assert.equal(wire.actorId, plan.actors.editor, "재적용 wire actor가 다릅니다.");
    assert(typeof wire.updateId === "string" && /^[a-f0-9-]{36}$/iu.test(wire.updateId), "재적용 wire UUID가 필요합니다.");
    sha(wire.payloadHash, "재적용 wire payload"); positiveInteger(wire.payloadBytes, "재적용 wire 바이트");
    for (const entry of wires) {
      for (const key of ["actorId", "updateId", "serverSequence", "payloadHash", "payloadBytes"]) {
        assert.equal(entry[key], wire[key], "동일한 재적용 순번의 wire ACK가 서로 다릅니다.");
      }
      assert(Number.isFinite(entry.time) && Number.isFinite(entry.ackAt) && entry.time > 0 && entry.ackAt >= entry.time,
        "재적용 실제 wire 송신과 ACK 시각이 필요합니다.");
    }
    const ack = one(proof.observedUpdates, (entry) => entry.updateId === wire.updateId, "재적용 PG 관측 ACK");
    for (const key of ["actorId", "serverSequence", "payloadHash", "payloadBytes"]) {
      assert.equal(ack[key], wire[key], "replacement wire와 PG 관측 ACK의 actor·순번·SHA·바이트가 다릅니다.");
    }
    const pgReceipt = one(proof.receipts, (entry) => entry.updateId === wire.updateId, "정확한 재적용 PG receipt");
    for (const key of ["actorId", "serverSequence", "payloadHash"]) {
      assert.equal(pgReceipt[key], wire[key], "replacement wire와 정확한 PG receipt가 다릅니다.");
    }
    const retained = array(proof.updates, "PG 보존 update").filter((entry) => entry.updateId === wire.updateId);
    if (retained.length > 0) {
      assert.equal(retained.length, 1, "replacement PG update가 중복됐습니다.");
      assert.equal(retained[0].actorId, wire.actorId, "replacement PG payload actor가 다릅니다.");
      assert.equal(retained[0].sequence, wire.serverSequence, "replacement PG payload 순번이 다릅니다.");
      assert.equal(retained[0].sha256, wire.payloadHash, "replacement PG payload SHA가 다릅니다.");
      assert.equal(retained[0].byteLength, wire.payloadBytes, "replacement PG payload 바이트가 다릅니다.");
      assert.equal(ack.retainedUpdateVerified, true, "보존된 replacement payload 대조가 필요합니다.");
    } else {
      assert.equal(ack.includedInSnapshot, true, "압축된 replacement의 snapshot 포함 증거가 필요합니다.");
      assert.equal(ack.retainedUpdateVerified, false, "압축된 replacement를 보존 update로 가장하면 안 됩니다.");
      assert(sequence(proof.frontier.compactedSequence, "압축 frontier") >= seq, "replacement가 압축 frontier 이후입니다.");
      sha(object(proof.frontier.snapshot, "압축 snapshot").sha256, "압축 snapshot");
      positiveInteger(proof.frontier.snapshot.byteLength, "압축 snapshot 바이트");
    }
  } else {
    assert.equal(transition.additionalOperation, false, "공유본 유지는 추가 operation을 만들 수 없습니다.");
    assert.equal(round.editorPublishCount, 0, "공유본 유지 선택에서 editor mutation을 새로 publish했습니다.");
  }
}
function assertFullPhases(plan, result, dbProofs) {
  const actors = [plan.actors.owner, plan.actors.editor];
  for (const phase of FULL_PHASES) {
    const stage = object(result[phase], phase + " 단계");
    assert.equal(stage.causalPassed, true, phase + " 인과 검증이 필요합니다.");
    if (phase !== "reload") assert.equal(stage.dbPassed, true, phase + " DB 검증이 필요합니다.");
    const strokes = array(stage.causalActors, phase + " 신규 획");
    const count = phase === "online" ? 2 : 4;
    assert.equal(strokes.length, count, phase + " 신규 획 수가 다릅니다.");
    assert.equal(new Set(strokes.map((entry) => entry.id)).size, count, phase + " 신규 획 ID가 중복됐습니다.");
    for (const actor of actors) assert.equal(strokes.filter((entry) => entry.birthActorId === actor).length, count / 2,
      phase + " 두 계정의 신규 획 수가 다릅니다.");
    const owner = captureAt(result, phase, "owner"), editor = captureAt(result, phase, "editor");
    assert.equal(owner.sourceRevision, editor.sourceRevision, phase + " 양 계정 revision이 다릅니다.");
    assert.equal(owner.digest, editor.digest, phase + " 양 계정 원고가 다릅니다.");
    assert.deepEqual(assertPixels(owner, phase), assertPixels(editor, phase), phase + " 양 계정 pixels가 다릅니다.");
    assertDbProof(dbProofs[phase], plan, actors, owner, phase);
  }
}
function historyAssessment(result) {
  const observations = result.historyDurability?.observations;
  if (observations === undefined) return { status: "unverified", recoveryApproved: false };
  assert.equal(array(observations, "편집이력 관측").length, 2, "두 계정의 편집이력 관측이 필요합니다.");
  for (const role of ["owner", "editor"]) {
    const value = one(observations, (entry) => entry.role === role, "편집이력 " + role);
    for (const key of ["warningRetryVisible", "retryClicked", "recoveryApproved"]) assert.equal(typeof value[key], "boolean",
      "편집이력 관측은 명시적 boolean이어야 합니다.");
    if (!value.warningRetryVisible) {
      assert.equal(value.retryClicked, false, "보이지 않은 복구 버튼을 클릭했다고 기록할 수 없습니다.");
      assert.equal(value.recoveryApproved, false, "미재현 경고를 복구 성공으로 승격할 수 없습니다.");
    }
  }
  // 버튼이 숨겨진 관측만으로 durable 재저장·재열기 성공까지 보증하지 않는다.
  return { status: observations.some((entry) => entry.warningRetryVisible) ? "recovery-unverified" : "not-reproduced",
    recoveryApproved: false };
}

/** 전달된 원본을 변경하지 않고, 실행 범위와 미실행 단계를 분리한 새 요약을 반환한다. */
export function validateStudioCollaborationRunResult({ plan, result, browserReceipt, observed, dbProofs }) {
  object(plan, "실행 전 plan");
  assert.equal(plan.schema, PLAN_SCHEMA, "지원하지 않는 plan schema입니다.");
  assert(STUDIO_COLLABORATION_RESULT_SCOPES.includes(plan.scope), "알 수 없는 실행 범위입니다.");
  assert(typeof plan.expectedHead === "string" && HEAD.test(plan.expectedHead), "정확한 40자리 HEAD가 필요합니다.");
  object(plan.actors, "두 계정");
  text(plan.actors.owner, "owner actor"); text(plan.actors.editor, "editor actor");
  assert.notEqual(plan.actors.owner, plan.actors.editor, "두 독립 계정이 필요합니다.");
  object(result, "브라우저 결과"); object(observed, "실제 입력 관측"); object(dbProofs, "PG 증거");
  object(browserReceipt, "브라우저 guard 영수증");
  assertRunBinding(plan, observed, browserReceipt);
  assertSource(plan, result, observed);
  assertProvenance(plan, result, observed);
  assertBrowserReceipt(browserReceipt);
  assert.equal(result.passed, true, "브라우저 범위가 통과하지 않았습니다.");
  for (const key of ["pageErrors", "observationErrors"]) empty(result[key], key);
  for (const key of ["error", "cleanupBrowserError", "cleanupViteError", "sourceIdentityError"]) {
    assert.equal(result[key], undefined, key + "가 남아 있습니다.");
  }
  assert.equal(object(result.conflictUi, "충돌 UI").passed, true, "충돌 UI가 통과하지 않았습니다.");
  const actions = array(result.conflictUi.rounds, "충돌 rounds").map((entry) => entry.action);
  const expectedActions = plan.scope === "full" ? [...ACTIONS] : ["reapply-local"];
  assert.deepEqual(actions, expectedActions, "선택 범위의 정확한 충돌 action 순서와 수가 다릅니다.");
  assert.deepEqual(Object.keys(dbProofs).sort(), [...expectedActions, ...(plan.scope === "full" ? FULL_PHASES : [])].sort(),
    "선택 범위의 정확한 PG 증거만 필요합니다.");
  if (plan.scope === "full") {
    assert.notEqual(result.remainingGroupOnly, true, "후속 전용 결과를 전체 통과로 바꿀 수 없습니다.");
    for (const flag of FULL_FLAGS) assert.equal(result[flag], true, flag + " 전체 필수 단계가 통과하지 않았습니다.");
    assert.equal(object(result.initialNativeJournalResolution, "원래 native 충돌").passed, true,
      "원래 native journal 충돌 선택 보존 검증이 필요합니다.");
    assertFullPhases(plan, result, dbProofs);
  } else {
    assert.equal(result.remainingGroupOnly, true, "후속 전용 실행 표식이 필요합니다.");
    for (const flag of FULL_FLAGS) assert.equal(result[flag], false, "후속 실행의 미실행 단계를 새 통과로 기록할 수 없습니다.");
  }
  for (const action of expectedActions) assertRound(result, plan, action, dbProofs[action]);
  return { schema: RESULT_SCHEMA, head: plan.expectedHead, scope: plan.scope, scopePassed: true,
    fullFunctionalPass: plan.scope === "full", evidenceReuseIsNewExecution: false,
    stages: { phase1: plan.scope === "full" ? "passed" : "not-run",
      reconnect: plan.scope === "full" ? "passed" : "not-run", reload: plan.scope === "full" ? "passed" : "not-run",
      conflictKeepCanonical: plan.scope === "full" ? "passed" : "not-run", conflictReapplyLocal: "passed" },
    historyDurability: historyAssessment(result), directOpfsBodiesVerified: false,
    cleanupScope: "browser-owned-processes", productionDeployment: false };
}

export function parseStudioCollaborationResultArguments(argv) {
  assert(Array.isArray(argv) && argv.length === 6, "필수 인자 --root --plan --plan-sha256만 지정하세요.");
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    assert(["--root", "--plan", "--plan-sha256"].includes(key) && !Object.hasOwn(values, key), "알 수 없거나 중복된 CLI 인자입니다.");
    values[key] = text(argv[index + 1], "CLI 인자");
  }
  assert(isAbsolute(values["--root"] ?? ""), "--root는 절대 경로여야 합니다.");
  sha(values["--plan-sha256"], "봉인한 plan");
  return { root: values["--root"], plan: values["--plan"], planSha256: values["--plan-sha256"] };
}
function readOrdinaryFile(path, label) {
  let fd;
  try {
    assert(!/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$|(?:^|\/)(?:qa-config|runtime-secrets|db-config|browser-private-values)\.json$/iu.test(path),
      "비밀 파일은 증거로 읽지 않습니다.");
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    assert(fstatSync(fd).isFile(), label + "는 일반 파일이어야 합니다.");
    return readFileSync(fd);
  } catch { throw new Error(label + " 일반 파일을 안전하게 읽지 못했습니다."); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function jsonBytes(bytes, label) {
  try { return object(JSON.parse(bytes.toString("utf8")), label); }
  catch { throw new Error(label + " JSON 객체를 읽지 못했습니다."); }
}

/** 부모가 봉인한 경로만 읽는다. DB·브라우저·네트워크·소스 변경은 실행하지 않는다. */
export function runStudioCollaborationResultCli(argv) {
  const options = parseStudioCollaborationResultArguments(argv);
  const root = realpathSync(options.root), planPath = resolve(root, options.plan);
  const bytes = readOrdinaryFile(planPath, "봉인한 plan");
  assert.equal(hash(bytes), options.planSha256, "plan 바이트가 실행 전 봉인한 SHA와 다릅니다.");
  const plan = jsonBytes(bytes, "봉인한 plan"), artifacts = object(plan.artifacts, "plan.artifacts");
  const load = (path, label) => jsonBytes(readOrdinaryFile(resolve(root, text(path, label)), label), label);
  const provenanceBytes = readOrdinaryFile(resolve(root, text(artifacts.provenance, "provenance 경로")), "provenance");
  const observeSourceFiles = () => sourceFiles(object(plan.source, "plan.source").files, "봉인한 소스 SHA").map((entry) => {
    const path = resolve(root, entry.path), real = realpathSync(path), rel = relative(root, real);
    assert(rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep), "소스 SHA가 저장소 밖을 가리킵니다.");
    return { path: entry.path, sha256: hash(readOrdinaryFile(path, "소스 SHA")) };
  });
  const gitEnv = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };
  const observeHead = () => execFileSync("git", ["--no-optional-locks", "rev-parse", "HEAD"], {
    cwd: root, env: gitEnv, encoding: "utf8", timeout: 5_000, maxBuffer: 1_024, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  assert.equal(root, plan.repositoryRoot, "CLI root가 봉인한 저장소 root와 다릅니다.");
  const head = observeHead(), files = observeSourceFiles();
  const artifactPaths = Object.fromEntries(["result", "browserReceipt", "sourceIdentity"]
    .map((key) => [key, resolve(root, text(artifacts[key], key + " 경로"))]));
  const sourceIdentityBytes = readOrdinaryFile(artifactPaths.sourceIdentity, "Localouter source identity");
  const sourceIdentityReceipt = jsonBytes(sourceIdentityBytes, "Localouter source identity");
  const dbProofs = Object.fromEntries(Object.entries(object(artifacts.dbProofs, "PG 증거 경로"))
    .map(([phase, path]) => [phase, load(path, phase + " PG 증거")]));
  const assessment = validateStudioCollaborationRunResult({ plan,
    result: load(artifacts.result, "브라우저 결과"), browserReceipt: load(artifacts.browserReceipt, "브라우저 guard"),
    observed: { head, files, artifactPaths, sourceIdentityReceipt,
      provenanceSha256: hash(provenanceBytes), provenance: jsonBytes(provenanceBytes, "provenance") }, dbProofs });
  assert.equal(hash(readOrdinaryFile(artifactPaths.sourceIdentity, "마지막 Localouter source identity")), hash(sourceIdentityBytes),
    "검증 중 Localouter source identity 영수증이 바뀌었습니다.");
  assert.equal(observeHead(), head, "결과 검증 중 HEAD가 바뀌었습니다.");
  assert.deepEqual(observeSourceFiles(), files, "결과 검증 중 소스 SHA가 바뀌었습니다.");
  assert.equal(hash(readOrdinaryFile(planPath, "마지막 plan")), options.planSha256, "검증 중 plan이 바뀌었습니다.");
  return assessment;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(runStudioCollaborationResultCli(process.argv.slice(2)), null, 2) + "\n"); }
  catch (error) {
    // JSON 원문·원고·토큰·외부 명령 stderr를 출력하지 않는다.
    process.stderr.write("협업 실행 범위 검증 실패: " + (error instanceof assert.AssertionError ? error.message.split("\n")[0] : "입력 또는 읽기 전용 관측을 확인하세요.") + "\n");
    process.exitCode = 1;
  }
}
