import { describe, expect, it } from "vitest";

import {
  buildStudioExternal3dTripoCliArgs,
  createStubStudioExternal3dProvider,
  planStudioExternal3dIntake,
  resolveStudioExternal3dCredentialSource,
  validateStudioExternal3dIntakeRequest,
  validateStudioExternal3dIntakeResult,
} from "./studio-external-3d-intake";

const NO_CREDENTIAL = { cliTokenPresent: false, apiKeyPresent: false } as const;
const CLI_CREDENTIAL = { cliTokenPresent: true, apiKeyPresent: false } as const;

describe("studio-external-3d-intake", () => {
  it("자격증명 출처는 CLI 토큰을 API 키보다 우선한다", () => {
    expect(resolveStudioExternal3dCredentialSource(CLI_CREDENTIAL)).toBe("cli-token");
    expect(resolveStudioExternal3dCredentialSource({
      cliTokenPresent: false,
      apiKeyPresent: true,
    })).toBe("api-key");
    expect(resolveStudioExternal3dCredentialSource(NO_CREDENTIAL)).toBe("missing");
  });

  it("빈 프롬프트와 1024자 초과 프롬프트는 거부된다", () => {
    expect(validateStudioExternal3dIntakeRequest({ kind: "prop", prompt: "  " }).ok).toBe(false);
    expect(validateStudioExternal3dIntakeRequest({
      kind: "prop",
      prompt: "x".repeat(1025),
    }).ok).toBe(false);
    expect(validateStudioExternal3dIntakeRequest({
      kind: "garment",
      prompt: "plain T-shirt",
    }).ok).toBe(true);
  });

  it("자격증명이 없으면 라이브 호출을 시도하지 않고 blocked다", () => {
    const plan = planStudioExternal3dIntake(
      { kind: "prop", prompt: "wooden chair" },
      NO_CREDENTIAL,
      { ownerConfirmed: true },
    );
    expect(plan.status).toBe("blocked");
    expect(plan.liveCallAllowed).toBe(false);
    expect(plan.cliArgs).toBeNull();
  });

  it("자격증명이 있어도 소유자 확인 없이는 실행되지 않는다", () => {
    const plan = planStudioExternal3dIntake(
      { kind: "prop", prompt: "wooden chair" },
      CLI_CREDENTIAL,
    );
    expect(plan.status).toBe("needs-owner-confirmation");
    expect(plan.liveCallAllowed).toBe(false);
    expect(plan.cliArgs).toBeNull();
  });

  it("소유자 확인 + CLI 자격증명이 있으면 최저 티어 CLI 인자가 나온다", () => {
    const plan = planStudioExternal3dIntake(
      { kind: "garment", prompt: "plain T-shirt" },
      CLI_CREDENTIAL,
      { ownerConfirmed: true },
    );
    expect(plan.status).toBe("ready");
    expect(plan.liveCallAllowed).toBe(true);
    expect(plan.cliArgs).toContain("create-text");
    expect(plan.cliArgs).toContain("Turbo-v1.0-20250506");
    expect(plan.cliArgs).toContain("--no-texture");
    expect(plan.cliArgs).toContain("--no-pbr");
    // 인자에 자격증명 값이 들어가면 안 된다.
    expect(plan.cliArgs?.join(" ")).not.toContain("tcli_");
    expect(buildStudioExternal3dTripoCliArgs({
      kind: "garment",
      prompt: "plain T-shirt",
      texture: true,
      pbr: false,
    })).toContain("--texture");
  });

  it("CC0 결과는 입고되고 Tripo 무료 출력은 보류되며 original로 바꿔 적지 않는다", () => {
    expect(validateStudioExternal3dIntakeResult({
      kind: "garment",
      license: "CC0-1.0",
      triangleCount: 15000,
      fileName: "tee.glb",
    }).admission).toBe("admitted");
    const held = validateStudioExternal3dIntakeResult({
      kind: "garment",
      license: "tripo-free-user-output",
      triangleCount: 15000,
      fileName: "tee.glb",
    });
    expect(held.admission).toBe("held");
    expect(held.reasonsKo.join(" ")).toContain("입고하지 않습니다");
  });

  it("예산 초과·비GLB 결과는 거부된다", () => {
    expect(validateStudioExternal3dIntakeResult({
      kind: "garment",
      license: "CC0-1.0",
      triangleCount: 25001,
      fileName: "tee.glb",
    }).admission).toBe("rejected");
    expect(validateStudioExternal3dIntakeResult({
      kind: "prop",
      license: "CC0-1.0",
      triangleCount: 100,
      fileName: "chair.obj",
    }).admission).toBe("rejected");
  });

  it("스텁 제공자는 ready 계획만 접수하고 결과 게이트를 재현한다", () => {
    const stub = createStubStudioExternal3dProvider();
    const plan = stub.plan(
      { kind: "prop", prompt: "wooden chair" },
      CLI_CREDENTIAL,
      { ownerConfirmed: true },
    );
    const intake = stub.submit(plan);
    expect(intake?.intakeId).toBe("stub-intake-1");
    expect(stub.submit(stub.plan({ kind: "prop", prompt: "x" }, NO_CREDENTIAL))).toBeNull();
    if (!intake) return;
    expect(stub.complete(intake, {
      kind: "prop",
      license: "original",
      triangleCount: 5000,
      fileName: "chair.glb",
    }).admission).toBe("admitted");
  });
});
