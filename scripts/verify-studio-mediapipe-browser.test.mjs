import assert from "node:assert/strict";

import { verifyMediaPipeNetworkEvidence } from "./verify-studio-mediapipe-browser.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const METRICS = "https://odml.pa.googleapis.com";
const ALLOWED = ["https://studio.test", "https://storage.googleapis.com"];
function blocked() {
  return {
    requests: [{ url: METRICS + "/v1/log", origin: METRICS, method: "POST",
      responseStatus: null, failure: "net::ERR_FAILED", finished: false }],
    cdpRequests: [{ url: METRICS + "/v1/log", origin: METRICS, method: "POST",
      responseStatus: null, blockedReason: "csp", failure: "net::ERR_FAILED" }],
    violations: [{ origin: METRICS, directive: "connect-src", disposition: "enforce" }],
  };
}

describe("MediaPipe 실제 브라우저 egress 증거 판정", () => {
  it("같은 출처·공식 모델 요청과 실제 CSP 차단을 허용한다", () => {
    const evidence = blocked();
    evidence.requests.push({
      url: ALLOWED[1] + "/mediapipe-models/model.task", origin: ALLOWED[1], method: "GET",
      responseStatus: 200, failure: null, finished: true,
    });
    assert.doesNotThrow(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED));
    assert.doesNotThrow(() => verifyMediaPipeNetworkEvidence({ requests: [], cdpRequests: [], violations: [] }, ALLOWED));
  });

  it("응답 없이 끝난 네트워크 실패는 CSP 이벤트가 있어도 거부한다", () => {
    const evidence = blocked();
    evidence.cdpRequests[0].blockedReason = null;
    assert.throws(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED), /네트워크 실패/u);
  });

  it("같은 URL의 다른 CSP 차단이 실제 전송 실패를 가릴 수 없다", () => {
    const evidence = blocked();
    evidence.cdpRequests.push({ ...evidence.cdpRequests[0], blockedReason: null });
    assert.throws(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED), /네트워크 실패/u);
  });

  it("성공·리디렉션 응답을 어느 관찰자가 보든 거부한다", () => {
    for (const source of ["requests", "cdpRequests"]) {
      for (const status of [200, 302, 503]) {
        const evidence = blocked();
        evidence[source][0].responseStatus = status;
        assert.throws(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED), /응답|전송/u);
      }
    }
  });

  it("아직 진행 중인 요청은 차단으로 세지 않는다", () => {
    const evidence = blocked();
    evidence.requests[0].failure = null;
    assert.throws(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED), /진행 중/u);
  });

  it("report-only 또는 누락된 위반 이벤트는 실제 차단으로 세지 않는다", () => {
    for (const violations of [[], [{ origin: METRICS, directive: "connect-src", disposition: "report" }]]) {
      const evidence = blocked();
      evidence.violations = violations;
      assert.throws(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED), /CSP 위반 이벤트/u);
    }
  });

  it("격리된 Worker 실행은 문서 CSP 차단과 같은 관찰값도 허용하지 않는다", () => {
    const evidence = blocked();
    // Dedicated Worker 요청도 부모 frame에 귀속될 수 있으므로 owner 추정으로 허용하지 않는다.
    assert.throws(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED,
      { requireNoDeniedRequests: true }), /Worker/u);
    evidence.requests = [];
    assert.throws(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED,
      { requireNoDeniedRequests: true }), /Worker/u);
  });

  it("격리된 Worker의 공식 모델 요청과 외부 요청 없는 실행은 허용한다", () => {
    const evidence = {
      requests: [{ url: ALLOWED[1] + "/model.task", origin: ALLOWED[1], method: "GET",
        responseStatus: 200, failure: null, finished: true }],
      cdpRequests: [], violations: [],
    };
    assert.doesNotThrow(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED,
      { requireNoDeniedRequests: true }));
    evidence.requests = [];
    assert.doesNotThrow(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED,
      { requireNoDeniedRequests: true }));
  });

  it("CDP 증거가 없거나 다른 URL·메서드에 속하면 거부한다", () => {
    for (const mismatch of ["missing", "url", "method"]) {
      const evidence = blocked();
      if (mismatch === "missing") evidence.cdpRequests = [];
      if (mismatch === "url") evidence.cdpRequests[0].url = METRICS + "/other";
      if (mismatch === "method") evidence.cdpRequests[0].method = "GET";
      assert.throws(() => verifyMediaPipeNetworkEvidence(evidence, ALLOWED), /Network.loadingFailed/u);
    }
  });
});
