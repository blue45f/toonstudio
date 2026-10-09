import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createProductionDemoProject, PRODUCTION_DEMO_COVER_IMAGE_URL } from "./production-demo";

describe("샘플 프로젝트 표지 데이터", () => {
  it("샘플 aggregate는 실물 표지 경로를 가진다 (이니셜 폴백이 아니다)", () => {
    const aggregate = createProductionDemoProject();
    expect(aggregate.coverImageUrl).toBe(PRODUCTION_DEMO_COVER_IMAGE_URL);
  });

  it("표지 경로가 가리키는 브랜드 아트 파일이 실제로 존재한다", () => {
    const assetPath = fileURLToPath(
      new URL(`../../../../public${PRODUCTION_DEMO_COVER_IMAGE_URL}`, import.meta.url),
    );
    expect(existsSync(assetPath), `${PRODUCTION_DEMO_COVER_IMAGE_URL} 파일이 없다`).toBe(true);
  });
});
