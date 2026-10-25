import { describe, expect, it } from "vitest";

import { resolveColorizeCandidateApply } from "./studio-ai-candidate-apply";
import {
  addColorizeCandidate,
  createColorizeCandidateSession,
  selectColorizeCandidate,
} from "./studio-ai-colorize-candidates";

const candidate = (id: string) => ({
  id,
  dataUrl: `data:image/png;base64,${id}`,
  prompt: "채색",
  createdAt: 1,
});

describe("studio-ai-candidate-apply", () => {
  it("ready 세션의 선택 후보를 적용 페이로드로 바꾼다", () => {
    let session = createColorizeCandidateSession();
    for (const id of ["c1", "c2"]) {
      const result = addColorizeCandidate(session, candidate(id));
      if (result.ok) session = result.session;
    }
    const picked = selectColorizeCandidate(session, "c2");
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    const applied = resolveColorizeCandidateApply(picked.session);
    expect(applied).toEqual({
      ok: true,
      plan: {
        dataUrl: "data:image/png;base64,c2",
        candidateId: "c2",
        costUnits: 2,
      },
    });
  });

  it("수집 중 세션은 not_ready로 거부한다", () => {
    let session = createColorizeCandidateSession();
    const added = addColorizeCandidate(session, candidate("c1"));
    if (added.ok) session = added.session;
    expect(resolveColorizeCandidateApply(session)).toEqual({
      ok: false,
      reason: "not_ready",
    });
  });
});
