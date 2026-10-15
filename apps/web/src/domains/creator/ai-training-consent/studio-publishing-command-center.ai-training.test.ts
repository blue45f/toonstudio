import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../StudioPublishingCommandCenter.tsx", import.meta.url),
  "utf8",
);

describe("Studio publishing command center AI training label wiring", () => {
  it("shows the three-state label in the final review instead of a boolean 허용/비허용", () => {
    expect(source).toContain('import { CreatorAiTrainingBadgeFor } from "./ai-training-consent/CreatorAiTrainingBadge";');
    expect(source).toContain("<CreatorAiTrainingBadgeFor community={communityMetadata}");
    // 값을 밝히지 않은 작품이 '비허용'으로 읽히던 레거시 표기가 다시 들어오지 않게 한다.
    expect(source).not.toMatch(/AI 학습\s*\{communityMetadata\.trainingAllowed/u);
    expect(source).not.toContain("communityMetadata.trainingAllowed");
  });

  it("projects the receipt community block through the contract-aware helper", () => {
    expect(source).toContain(
      'import { projectStudioPublishReceiptCommunity } from "./studio-publish-receipt-data";',
    );
    expect(source).toContain("community: projectStudioPublishReceiptCommunity(communityMetadata)");
  });

  it("tells the rights controls when an already saved work is being edited", () => {
    expect(source).toContain("published={Boolean(workId)}");
  });
});
