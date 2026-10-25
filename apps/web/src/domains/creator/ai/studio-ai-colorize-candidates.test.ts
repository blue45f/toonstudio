import { describe, expect, it } from "vitest";

import {
  addColorizeCandidate,
  colorizeCandidateCostUnits,
  createColorizeCandidateSession,
  selectColorizeCandidate,
  selectedColorizeCandidate,
} from "./studio-ai-colorize-candidates";

const candidate = (id: string) => ({
  id,
  dataUrl: `data:image/png;base64,${id}`,
  prompt: "채색",
  createdAt: 1,
});

describe("studio-ai-colorize-candidates", () => {
  it("후보를 모으고 처음 후보를 자동 선택한다", () => {
    const first = addColorizeCandidate(
      createColorizeCandidateSession(),
      candidate("c1"),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.session.selectedId).toBe("c1");
    expect(first.session.status).toBe("collecting");
  });

  it("상한을 넘기면 cap_reached로 거부한다", () => {
    let session = createColorizeCandidateSession(2);
    for (const id of ["c1", "c2"]) {
      const result = addColorizeCandidate(session, candidate(id));
      expect(result.ok).toBe(true);
      if (result.ok) session = result.session;
    }
    expect(addColorizeCandidate(session, candidate("c3"))).toEqual({
      ok: false,
      reason: "cap_reached",
    });
  });

  it("후보를 고르면 선택이 바뀌고 과금 단위는 후보 수와 같다", () => {
    let session = createColorizeCandidateSession();
    for (const id of ["c1", "c2"]) {
      const result = addColorizeCandidate(session, candidate(id));
      if (result.ok) session = result.session;
    }
    const picked = selectColorizeCandidate(session, "c2");
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    expect(selectedColorizeCandidate(picked.session)?.id).toBe("c2");
    expect(picked.session.status).toBe("ready");
    expect(colorizeCandidateCostUnits(picked.session)).toBe(2);
  });

  it("없는 후보 선택과 빈 결과는 거부한다", () => {
    const session = createColorizeCandidateSession();
    expect(selectColorizeCandidate(session, "nope")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      addColorizeCandidate(session, { ...candidate("c1"), dataUrl: "" }),
    ).toEqual({ ok: false, reason: "empty_result" });
  });
});
