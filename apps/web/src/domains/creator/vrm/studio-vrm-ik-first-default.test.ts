import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stateSource = readFileSync(new URL("./useStudioVrmPoserState.ts", import.meta.url), "utf8");
const jointHandlesSource = readFileSync(new URL("./StudioVrmJointHandles.tsx", import.meta.url), "utf8");
const rigAssistSource = readFileSync(new URL("./StudioVrmRigAssistPanel.tsx", import.meta.url), "utf8");

describe("셰이퍼 1단계 — IK 우선 기본 동선", () => {
  it("opens the poser with full-body IK assistance and foot planting on by default", () => {
    expect(stateSource).toContain("const [fullBodyIkEnabled, setFullBodyIkEnabled] = useState(true);");
    expect(stateSource).toContain("const [footPlantEnabled, setFootPlantEnabled] = useState(true);");
  });

  it("keeps the rig joint profile default pinned to neutral", () => {
    expect(stateSource).toContain(
      "const [rigJointProfile, setRigJointProfile] = useState<StudioVrmRigProfileId>(\"neutral\");",
    );
  });

  it("demotes FK rotation handles to fine-tuning labels instead of primary rotation", () => {
    expect(jointHandlesSource).toContain("미세 조정");
    expect(jointHandlesSource).not.toContain("\"직접 회전\"");
    expect(jointHandlesSource).not.toContain("끌어서 회전");
  });

  it("exposes the IK-first toggles in the rig assist panel so users can turn them off", () => {
    expect(rigAssistSource).toContain("전신 IK 보조");
    expect(rigAssistSource).toContain("양발 바닥 고정");
    expect(rigAssistSource).toContain("손·발 편집 중 두 발을 동시 제약");
  });
});
