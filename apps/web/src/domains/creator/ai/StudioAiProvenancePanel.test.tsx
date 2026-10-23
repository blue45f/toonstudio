// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioAiProvenancePanel } from "./StudioAiProvenancePanel";
import {
  appendStudioAiOperation,
  createEmptyStudioAiProvenanceDocument,
  STUDIO_AI_OPERATION_STATUSES,
  type StudioAiOperationInput,
  type StudioAiProvenanceDocument,
} from "./studio-ai-provenance";

import { useI18n } from "@/shared/lib/i18n";

// 작업 행(OperationRow)이 상태 이름을 번역 함수로 그리는데, 상태 문구를 이관하면서 그 함수에 번역기가 선언되지 않아 행을 그리는
// 순간 ReferenceError 로 패널이 무너졌다(형식 검사는 잡았지만 패널을 그려 보는 시험이 없었다). 상태마다 행을 그려 본다.

const NOW = new Date("2026-07-10T06:00:00.000Z");

function operation(id: string, status: StudioAiOperationInput["status"]): StudioAiOperationInput {
  return {
    id,
    kind: "text",
    task: "scenario",
    provider: "deepseek",
    model: "deepseek-chat",
    transport: "server",
    promptVersion: 1,
    prompt: "비공개 프롬프트",
    createdAt: NOW,
    status,
    // 실패한 작업은 오류 코드가 있어야 기록된다.
    ...(status === "failed" ? { error: { category: "network" as const, code: "TIMEOUT", retriable: true } } : {}),
  };
}

function documentWithEveryStatus(): StudioAiProvenanceDocument {
  return STUDIO_AI_OPERATION_STATUSES.reduce(
    (document, status, index) => appendStudioAiOperation(document, operation(`op-${index}`, status), { now: NOW }),
    createEmptyStudioAiProvenanceDocument(),
  );
}

const noop = () => undefined;

function renderPanel() {
  return render(
    <StudioAiProvenancePanel
      open
      onClose={noop}
      document={documentWithEveryStatus()}
      onExportPublicSummary={noop}
      onClearHistory={noop}
    />,
  );
}

describe("StudioAiProvenancePanel 작업 행", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
  });

  it("모든 상태의 작업 행을 그리고 행마다 그 상태의 이름을 보여 준다", () => {
    renderPanel();
    const rows = Array.from(document.querySelectorAll("article"));
    expect(rows).toHaveLength(STUDIO_AI_OPERATION_STATUSES.length);
    const labels = rows.map((row) => /진행 중|완료|실패|취소됨/u.exec(row.textContent ?? "")?.[0]).sort();
    expect(labels).toEqual(["실패", "완료", "진행 중", "취소됨"].sort());
  });

  it("영어에서도 행을 그리고 상태 이름이 한글로 남지 않는다", () => {
    useI18n.setState({ lang: "en" });
    renderPanel();
    const rows = Array.from(document.querySelectorAll("article"));
    expect(rows).toHaveLength(STUDIO_AI_OPERATION_STATUSES.length);
    for (const row of rows) {
      const statusBadge = row.querySelector("span.rounded-full");
      expect(statusBadge?.textContent ?? "", "상태 이름").toMatch(/\S/u);
      expect(/[가-힣]/u.test(statusBadge?.textContent ?? ""), `상태 이름에 한글 ${statusBadge?.textContent}`).toBe(false);
    }
  });
});
