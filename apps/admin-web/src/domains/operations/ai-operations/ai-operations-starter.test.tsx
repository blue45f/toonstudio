// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { parseAiOperationsSnapshot } from "@toonstudio/contracts/ai-operations";
import { afterEach, describe, expect, it } from "vitest";

import { createAiOperationsStarter } from "./ai-operations-starter";
import { AiItemsTable } from "./AiOperationsViews";

afterEach(cleanup);

describe("공개 시작 자료와 비교 표의 연결", () => {
  it("실제 모델 ID·코드 상태·영향 기능이 비교 열에서 누락되지 않는다", () => {
    const snapshot = parseAiOperationsSnapshot(createAiOperationsStarter());
    const gemma = snapshot.items.find((item) => item.id === "cf-gemma")!;
    render(<AiItemsTable page="models" items={[gemma]} onItem={() => undefined} />);
    const row = screen.getByRole("row", { name: /@cf\/google\/gemma-4-26b-a4b-it/u });
    expect(within(row).getByRole("cell", { name: "@cf/google/gemma-4-26b-a4b-it", exact: true })).toBeTruthy();
    expect(within(row).getByRole("cell", { name: /코드 구성 확인 \/ 실제 운영 활성화 미확인/u })).toBeTruthy();
    expect(within(row).getByRole("cell", { name: "기본 텍스트 모델", exact: true })).toBeTruthy();
  });

  it("가설 분류와 저비용 비교 방법을 보여 주고 미수집 알림을 생성하지 않는다", () => {
    const snapshot = parseAiOperationsSnapshot(createAiOperationsStarter());
    const throughput = snapshot.items.find((item) => item.id === "onpod-throughput")!;
    render(<AiItemsTable page="hypotheses" items={[throughput]} onItem={() => undefined} />);
    expect(screen.getByRole("cell", { name: "처리량", exact: true })).toBeTruthy();
    expect(screen.getByRole("cell", { name: /추가 부하를 만들지 않고 기존/u })).toBeTruthy();
    expect(snapshot.items.some((item) => item.type === "alert")).toBe(false);
    expect(snapshot.items.some((item) => ["검증 완료", "main 반영 완료"].includes(item.status))).toBe(false);
  });
});
