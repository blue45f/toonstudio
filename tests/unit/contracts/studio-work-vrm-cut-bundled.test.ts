// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { workVrmCutBundledDigest } from "@toonstudio/contracts/studio-work-vrm-cut-bundled";
import { describe, expect, it } from "vitest";

import { BUNDLED_VRM_RIGHTS_BLOCKS, SAMPLE_VRMS, selectableSampleVrmUrl } from "../../../apps/web/src/domains/creator/vrm/vrm-library";

describe("팀 컷의 번들 모델 원본", () => {
  it("편집기에 등록된 모델 해시가 배포하는 실제 파일과 일치한다", async () => {
    for (const { id } of SAMPLE_VRMS) {
      const url = selectableSampleVrmUrl(id);
      if (!url) {
        expect(workVrmCutBundledDigest(id)).toBeNull();
        continue;
      }
      const bytes = await readFile(new URL(`../../../apps/web/public${url}`, import.meta.url));
      expect(workVrmCutBundledDigest(id), id).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });
  it("배포를 중지했거나 등록되지 않은 ID가 다른 모델로 연결되지 않는다", () => {
    for (const id of [...BUNDLED_VRM_RIGHTS_BLOCKS.map(item => item.id), "constructor", "unregistered-vrm"]) {
      expect(workVrmCutBundledDigest(id), id).toBeNull();
    }
  });
});
