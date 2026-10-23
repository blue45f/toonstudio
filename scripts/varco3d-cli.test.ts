import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  encodeMultipartFormData,
  executeVarco3dCli,
  loadVarco3dConfig,
  parseCliArguments,
  validatePolygonCount,
  VARCO3D_DEFAULT_API_BASE,
  VARCO3D_DEFAULT_MCP_URL,
} from "./varco3d-cli.mts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "varco3d-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("varco3d-cli", () => {
  it("환경변수 및 로컬 env 파일에서 API 키를 로드하되 출력에는 비밀값을 노출하지 않는다", async () => {
    const dir = createTempDir();
    const fakeSecret = "varco_live_secret_do_not_print_12345";
    writeFileSync(
      join(dir, ".env.infrastructure.local"),
      `# local infra\nVARCO_3D_API_KEY="${fakeSecret}"\n`,
      "utf8",
    );

    const cfg = loadVarco3dConfig({
      env: {},
      cwd: dir,
      repoRoot: dir,
      homeDir: dir,
    });
    expect(cfg.apiKeyConfigured).toBe(true);
    expect(cfg.apiKeySource).toBe("file:.env.infrastructure.local:VARCO_3D_API_KEY");

    const fetchStub: typeof fetch = async () =>
      new Response(JSON.stringify({ status: "ok" }), { status: 200 });

    const res = await executeVarco3dCli(["doctor", "--check"], {
      env: {},
      cwd: dir,
      repoRoot: dir,
      homeDir: dir,
      fetchImpl: fetchStub,
    });

    expect(res.exitCode).toBe(0);
    const serialized = JSON.stringify(res.output);
    expect(serialized).not.toContain(fakeSecret);
    expect(res.output.apiKeyConfigured).toBe(true);
    expect(res.output.mode).toBe("check");
  });

  it("mcp-setup --target antigravity --write 실행 시 mcp_config.json에 varco-3d 엔드포인트를 기록한다", async () => {
    const home = createTempDir();
    const writeRes = await executeVarco3dCli(
      ["mcp-setup", "--target", "antigravity", "--write"],
      {
        env: {},
        cwd: home,
        repoRoot: home,
        homeDir: home,
      },
    );

    expect(writeRes.exitCode).toBe(0);
    expect(writeRes.output.updated).toBe(true);

    const configPath = join(home, ".gemini/config/mcp_config.json");
    const saved = JSON.parse(readFileSync(configPath, "utf8")) as {
      mcpServers: Record<string, { url: string }>;
    };
    expect(saved.mcpServers["varco-3d"]?.url).toBe(VARCO3D_DEFAULT_MCP_URL);
  });

  it("유료 생성 명령(generate, ai-rig, animate)은 --confirm이 없으면 네트워크 호출 없이 dry-run 계획을 반환한다", async () => {
    const dir = createTempDir();
    const imgPath = join(dir, "character.png");
    writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    let networkCalled = false;
    const fetchStub: typeof fetch = async () => {
      networkCalled = true;
      return new Response("{}", { status: 200 });
    };

    const genRes = await executeVarco3dCli(
      ["generate", "--image", imgPath, "--use-alpha", "--polygon-count", "250000"],
      {
        env: {},
        cwd: dir,
        repoRoot: dir,
        homeDir: dir,
        fetchImpl: fetchStub,
      },
    );

    expect(genRes.exitCode).toBe(0);
    expect(genRes.output.dryRun).toBe(true);
    expect(genRes.output.url).toBe(`${VARCO3D_DEFAULT_API_BASE}/v2/generate`);
    expect(genRes.output.fields).toEqual({
      useAlpha: "true",
      polygonCount: "250000",
    });
    expect(networkCalled).toBe(false);

    const rigRes = await executeVarco3dCli(
      ["ai-rig", "--source-task-id", "0195f7d2-0000-7000-8000-000000000001"],
      {
        env: {},
        cwd: dir,
        repoRoot: dir,
        homeDir: dir,
        fetchImpl: fetchStub,
      },
    );
    expect(rigRes.exitCode).toBe(0);
    expect(rigRes.output.dryRun).toBe(true);

    const animRes = await executeVarco3dCli(
      [
        "animate",
        "--source-task-id",
        "0195f7d2-0000-7000-8000-000000000002",
        "--animation",
        "dance",
        "--in-place",
      ],
      {
        env: {},
        cwd: dir,
        repoRoot: dir,
        homeDir: dir,
        fetchImpl: fetchStub,
      },
    );
    expect(animRes.exitCode).toBe(0);
    expect(animRes.output.dryRun).toBe(true);
    expect(animRes.output.body).toEqual({
      sourceTaskId: "0195f7d2-0000-7000-8000-000000000002",
      animation: "dance",
      inPlaceAnimation: true,
    });
    expect(networkCalled).toBe(false);
  });

  it("generate --confirm 및 status/wait/download-glb 전체 파이프라인이 API 명세대로 동작한다", async () => {
    const dir = createTempDir();
    const imgPath = join(dir, "input.png");
    const outGlbPath = join(dir, "output/model.glb");
    writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const taskId = "0195f7d2-1111-7000-8000-000000000099";
    let pollCount = 0;

    const fetchStub: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v2/generate")) {
        expect(init?.method).toBe("POST");
        const headers = init?.headers as Record<string, string>;
        expect(headers["x-api-key"]).toBe("test-key");
        expect(headers["Content-Type"]).toContain("multipart/form-data; boundary=");
        return new Response(
          JSON.stringify({
            taskId,
            type: "GENERATE_TEXTURED_MESH",
            status: "PENDING",
          }),
          { status: 200 },
        );
      }
      if (url.endsWith(`/v2/tasks/${taskId}`)) {
        pollCount += 1;
        const status = pollCount < 2 ? "IN_PROGRESS" : "COMPLETED";
        return new Response(
          JSON.stringify({
            taskId,
            type: "GENERATE_TEXTURED_MESH",
            status,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith(`/v2/tasks/${taskId}/download-glb`)) {
        return new Response(
          JSON.stringify({
            taskId,
            glbUrl: "https://cdn.3d.varco.ai/mock/model.glb",
          }),
          { status: 200 },
        );
      }
      if (url === "https://cdn.3d.varco.ai/mock/model.glb") {
        return new Response(Buffer.from("glTF-mock-binary"), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    };

    const env = { VARCO_3D_API_KEY: "test-key" };

    const genRes = await executeVarco3dCli(
      ["generate", "--image", imgPath, "--confirm"],
      { env, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(genRes.exitCode).toBe(0);
    expect(genRes.output.taskId).toBe(taskId);

    const waitRes = await executeVarco3dCli(
      ["wait", taskId, "--interval", "100", "--timeout", "2000"],
      {
        env,
        cwd: dir,
        repoRoot: dir,
        homeDir: dir,
        fetchImpl: fetchStub,
        sleepMs: async () => {},
      },
    );
    expect(waitRes.exitCode).toBe(0);
    expect(waitRes.output.status).toBe("COMPLETED");
    expect(pollCount).toBe(2);

    const dlRes = await executeVarco3dCli(
      ["download-glb", taskId, "--output", outGlbPath],
      { env, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(dlRes.exitCode).toBe(0);
    expect(dlRes.output.savedPath).toBe(outGlbPath);
    expect(readFileSync(outGlbPath, "utf8")).toBe("glTF-mock-binary");
  });

  it("입력 검증 함수가 잘못된 polygonCount와 인자를 명확한 한글 오류로 거부한다", () => {
    expect(() => validatePolygonCount("500")).toThrow(/polygonCount/);
    expect(() => validatePolygonCount("2000000")).toThrow(/polygonCount/);
    expect(validatePolygonCount("500000")).toBe(500_000);

    const parsed = parseCliArguments([
      "--",
      "generate",
      "--image=hero.png",
      "--use-alpha",
      "--confirm",
    ]);
    expect(parsed.command).toBe("generate");
    expect(parsed.options.get("image")).toBe("hero.png");
    expect(parsed.flags.has("use-alpha")).toBe(true);
    expect(parsed.flags.has("confirm")).toBe(true);

    const dir = createTempDir();
    const sample = join(dir, "sample.webp");
    writeFileSync(sample, Buffer.from("RIFF....WEBP"));
    const multipart = encodeMultipartFormData(
      { useAlpha: "false" },
      { image: sample },
      "fixedseed",
    );
    expect(multipart.contentType).toBe(
      "multipart/form-data; boundary=----Varco3DFormBoundaryfixedseed",
    );
    expect(multipart.body.toString("utf8")).toContain("Content-Type: image/webp");
  });
});
