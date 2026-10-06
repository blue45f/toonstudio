import { describe, expect, it } from "vitest";
import { STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES } from "@toonstudio/studio-project-model/recording-booth-asset";
import { STUDIO_RECORDING_BOOTH_ASSET_UPLOAD_LIMITS } from "./studio-recording-booth-asset.controller";

describe("recording booth asset multipart limits", () => {
  it("allows exactly one bounded audio file and one metadata field", () => {
    expect(STUDIO_RECORDING_BOOTH_ASSET_UPLOAD_LIMITS).toEqual({
      fileSize: STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES,
      files: 1,
      fields: 1,
      fieldSize: 16_384,
      fieldNameSize: 64,
      parts: 3,
    });
  });
});
