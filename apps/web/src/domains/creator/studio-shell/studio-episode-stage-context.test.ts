import { describe, expect, it } from "vitest";

import { readStudioEpisodeStageContext } from "./studio-episode-stage-context";

describe("readStudioEpisodeStageContext (S2-5 editor header context)", () => {
  it("reads the context only when both identities are present and valid", () => {
    expect(
      readStudioEpisodeStageContext("?productionProjectId=proj-1&episodeId=ep-7&workspace=comic"),
    ).toEqual({ productionProjectId: "proj-1", episodeId: "ep-7" });
    expect(
      readStudioEpisodeStageContext(new URLSearchParams("productionProjectId=p&episodeId=e")),
    ).toEqual({ productionProjectId: "p", episodeId: "e" });
  });

  it("returns null when either identity is missing instead of guessing the other half", () => {
    expect(readStudioEpisodeStageContext("?productionProjectId=proj-1")).toBeNull();
    expect(readStudioEpisodeStageContext("?episodeId=ep-7")).toBeNull();
    expect(readStudioEpisodeStageContext("")).toBeNull();
    expect(readStudioEpisodeStageContext("?workspace=draw")).toBeNull();
  });

  it("rejects identities the studio router itself would reject", () => {
    expect(readStudioEpisodeStageContext("?productionProjectId=%20&episodeId=ep-7")).toBeNull();
    expect(readStudioEpisodeStageContext("?productionProjectId=..&episodeId=ep-7")).toBeNull();
    expect(readStudioEpisodeStageContext("?productionProjectId=a%5Cb&episodeId=ep-7")).toBeNull();
    expect(
      readStudioEpisodeStageContext(`?productionProjectId=${"x".repeat(161)}&episodeId=ep-7`),
    ).toBeNull();
  });
});
