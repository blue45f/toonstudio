import { describe, expect, it } from "vitest";

import { liftStudioImageTo3dGlb, STUDIO_LIFT3D_PRESETS } from "./studio-lift3d-pipeline";
import {
  buildStudioLift3dSampleDecodedFile,
  STUDIO_LIFT3D_SAMPLE_PRESETS,
} from "./studio-lift3d-sample-presets";

describe("studio-lift3d-sample-presets", () => {
  it.each(STUDIO_LIFT3D_SAMPLE_PRESETS)(
    "내장 샘플 $id ($subject)이 유효한 PNG 시그니처와 실제 GLB 변환 결과를 생성한다",
    (sample) => {
      const decoded = buildStudioLift3dSampleDecodedFile(sample.id);
      expect(decoded.naturalWidth).toBe(64);
      expect(decoded.naturalHeight).toBe(64);
      expect(decoded.mimeType).toBe("image/png");
      expect(Array.from(decoded.bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

      const preset = STUDIO_LIFT3D_PRESETS[sample.subject];
      const lifted = liftStudioImageTo3dGlb(
        decoded.source,
        {
          subject: sample.subject,
          resolution: preset.resolution,
          depthScale: preset.depthScale,
          smoothing: preset.smoothing,
          invertRelief: false,
          frontRatio: preset.frontRatio,
          layerBands: 1,
        },
        {
          name: decoded.fileName,
          texture: decoded.texture,
          unlit: true,
        },
      );
      expect(lifted.ok).toBe(true);
      if (!lifted.ok) return;
      expect(lifted.value.lift.metrics.triangleCount).toBeGreaterThan(20);
      expect(new TextDecoder().decode(lifted.value.glb.bytes.subarray(0, 4))).toBe("glTF");
    },
  );
});
