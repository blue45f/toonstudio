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
  VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE,
  VARCO3D_DEFAULT_API_BASE,
  VARCO3D_DEFAULT_MCP_URL,
  VARCO3D_DEFAULT_NC_OPENAPI_BASE,
  VARCO3D_MCP_FLOW_TOOLS,
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
    expect(res.output.ncOpenApiBase).toBe(VARCO3D_DEFAULT_NC_OPENAPI_BASE);
    expect(res.output.mode).toBe("check");
  });

  it("auth-check 명령이 NC AI OpenAPI 게이트웨이(OPENAPI_KEY 헤더) 인증 여부를 정확히 판별한다", async () => {
    const dir = createTempDir();
    const validFetchStub: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toBe(
        `${VARCO3D_DEFAULT_NC_OPENAPI_BASE}/inference/result/00000000-0000-0000-0000-000000000000`,
      );
      const headers = init?.headers as Record<string, string>;
      expect(headers.OPENAPI_KEY).toBe("valid-nc-key");
      return new Response(
        JSON.stringify({ status: "error", error: "requestId not found" }),
        { status: 404 },
      );
    };

    const okRes = await executeVarco3dCli(["auth-check"], {
      env: { VARCO_3D_API_KEY: "valid-nc-key" },
      cwd: dir,
      repoRoot: dir,
      homeDir: dir,
      fetchImpl: validFetchStub,
    });
    expect(okRes.exitCode).toBe(0);
    expect(okRes.output.authenticated).toBe(true);
    expect(okRes.output.probeStatusCode).toBe(404);

    const unauthFetchStub: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });

    const failRes = await executeVarco3dCli(["auth-check"], {
      env: { VARCO_3D_API_KEY: "bad-key" },
      cwd: dir,
      repoRoot: dir,
      homeDir: dir,
      fetchImpl: unauthFetchStub,
    });
    expect(failRes.exitCode).toBe(1);
    expect(failRes.output.authenticated).toBe(false);
  });

  it("mcp-setup 및 catalog 명령이 Antigravity 설정과 Claude 앱 커넥터·Flow 도구 카탈로그를 반환한다", async () => {
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

    const claudeAppRes = await executeVarco3dCli(
      ["mcp-setup", "--target", "claude-app"],
      { env: {}, cwd: home, repoRoot: home, homeDir: home },
    );
    expect(claudeAppRes.exitCode).toBe(0);
    expect(claudeAppRes.output.claudeDesktopAppConnector).toEqual(
      VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE,
    );

    const catalogToolsRes = await executeVarco3dCli(
      ["catalog", "--section", "mcp-tools"],
      { env: {}, cwd: home, repoRoot: home, homeDir: home },
    );
    expect(catalogToolsRes.exitCode).toBe(0);
    expect(catalogToolsRes.output.tools).toEqual(VARCO3D_MCP_FLOW_TOOLS);

    const quadAnimRes = await executeVarco3dCli(
      ["catalog", "--section", "animations", "--creature", "quadruped", "--category", "GALLOP"],
      { env: {}, cwd: home, repoRoot: home, homeDir: home },
    );
    expect(quadAnimRes.exitCode).toBe(0);
    expect(quadAnimRes.output.creature).toBe("quadruped");
    expect(quadAnimRes.output.categories).toHaveProperty("GALLOP");
  });

  it("bridge-import 명령이 기본 dry-run과 --confirm 시 로컬 DCC 브리지(/import) 전송을 수행한다", async () => {
    const dir = createTempDir();
    let importCalled = false;
    const fetchStub: typeof fetch = async (input, init) => {
      importCalled = true;
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toBe("http://127.0.0.1:5324/import");
      expect(init?.method).toBe("POST");
      const parsedBody = JSON.parse(String(init?.body)) as { url: string; name: string };
      expect(parsedBody).toEqual({
        url: "https://cdn.3d.varco.ai/mock/knight.glb",
        name: "knight_mesh",
      });
      return new Response(JSON.stringify({ imported: true, dcc: "Blender" }), {
        status: 200,
      });
    };

    const dryRes = await executeVarco3dCli(
      [
        "bridge-import",
        "--dcc",
        "blender",
        "--url",
        "https://cdn.3d.varco.ai/mock/knight.glb",
        "--name",
        "knight_mesh",
      ],
      { env: {}, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(dryRes.exitCode).toBe(0);
    expect(dryRes.output.dryRun).toBe(true);
    expect(importCalled).toBe(false);

    const confirmRes = await executeVarco3dCli(
      [
        "bridge-import",
        "--dcc",
        "blender",
        "--url",
        "https://cdn.3d.varco.ai/mock/knight.glb",
        "--name",
        "knight_mesh",
        "--confirm",
      ],
      { env: {}, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(confirmRes.exitCode).toBe(0);
    expect(confirmRes.output.imported).toBe(true);
    expect(importCalled).toBe(true);
  });

  it("유료 생성 명령(generate nc-openapi/studio, ai-rig, animate)은 --confirm이 없으면 dry-run 계획을 반환한다", async () => {
    const dir = createTempDir();
    const imgPath = join(dir, "character.png");
    writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    let networkCalled = false;
    const fetchStub: typeof fetch = async () => {
      networkCalled = true;
      return new Response("{}", { status: 200 });
    };

    const ncGenRes = await executeVarco3dCli(
      ["generate", "--image", imgPath, "--face-type", "quad", "--polygon-count", "200000"],
      { env: {}, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(ncGenRes.exitCode).toBe(0);
    expect(ncGenRes.output.dryRun).toBe(true);
    expect(ncGenRes.output.provider).toBe("nc-openapi");
    expect(ncGenRes.output.url).toBe(`${VARCO3D_DEFAULT_NC_OPENAPI_BASE}/3d/varco/v1/image-to-3d`);
    expect(ncGenRes.output.fields).toEqual({
      target_face_type: "quad",
      target_face_num: "200000",
      generate_texture: "true",
      seed: "-1",
    });

    const studioGenRes = await executeVarco3dCli(
      ["generate", "--image", imgPath, "--provider", "studio", "--use-alpha", "--polygon-count", "250000"],
      { env: {}, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(studioGenRes.exitCode).toBe(0);
    expect(studioGenRes.output.dryRun).toBe(true);
    expect(studioGenRes.output.url).toBe(`${VARCO3D_DEFAULT_API_BASE}/v2/generate`);
    expect(studioGenRes.output.fields).toEqual({
      useAlpha: "true",
      polygonCount: "250000",
    });

    const rigRes = await executeVarco3dCli(
      ["ai-rig", "--source-task-id", "0195f7d2-0000-7000-8000-000000000001"],
      { env: {}, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
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
      { env: {}, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
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

  it("NC OpenAPI 및 Studio v2 파이프라인(generate --confirm, wait, download-glb)이 각각 명세대로 동작한다", async () => {
    const dir = createTempDir();
    const imgPath = join(dir, "input.png");
    const ncGlbPath = join(dir, "output/nc-model.glb");
    const studioGlbPath = join(dir, "output/studio-model.glb");
    writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const ncRequestId = "req-nc-001";
    const studioTaskId = "0195f7d2-1111-7000-8000-000000000099";
    let studioPollCount = 0;

    const fetchStub: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = (init?.headers ?? {}) as Record<string, string>;

      if (url.endsWith("/3d/varco/v1/image-to-3d")) {
        expect(headers.OPENAPI_KEY).toBe("test-key");
        return new Response(JSON.stringify({ requestId: ncRequestId }), { status: 200 });
      }
      if (url.endsWith(`/inference/result/${ncRequestId}`)) {
        expect(headers.OPENAPI_KEY).toBe("test-key");
        return new Response(
          JSON.stringify({
            status: "done",
            model_url: "https://cdn.3d.varco.ai/mock/nc-model.glb",
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/v2/generate")) {
        expect(headers["x-api-key"]).toBe("test-key");
        return new Response(
          JSON.stringify({
            taskId: studioTaskId,
            type: "GENERATE_TEXTURED_MESH",
            status: "PENDING",
          }),
          { status: 200 },
        );
      }
      if (url.endsWith(`/v2/tasks/${studioTaskId}`)) {
        studioPollCount += 1;
        const status = studioPollCount < 2 ? "IN_PROGRESS" : "COMPLETED";
        return new Response(
          JSON.stringify({
            taskId: studioTaskId,
            type: "GENERATE_TEXTURED_MESH",
            status,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith(`/v2/tasks/${studioTaskId}/download-glb`)) {
        return new Response(
          JSON.stringify({
            taskId: studioTaskId,
            glbUrl: "https://cdn.3d.varco.ai/mock/studio-model.glb",
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("https://cdn.3d.varco.ai/mock/")) {
        return new Response(Buffer.from("glTF-mock-binary"), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    };

    const env = { VARCO_3D_API_KEY: "test-key" };

    // 1) NC OpenAPI (default provider)
    const ncGenRes = await executeVarco3dCli(
      ["generate", "--image", imgPath, "--confirm"],
      { env, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(ncGenRes.exitCode).toBe(0);
    expect(ncGenRes.output.requestId).toBe(ncRequestId);

    const ncDlRes = await executeVarco3dCli(
      ["download-glb", ncRequestId, "--output", ncGlbPath],
      { env, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(ncDlRes.exitCode).toBe(0);
    expect(ncDlRes.output.savedPath).toBe(ncGlbPath);
    expect(readFileSync(ncGlbPath, "utf8")).toBe("glTF-mock-binary");

    // 2) Studio v2 provider
    const studioGenRes = await executeVarco3dCli(
      ["generate", "--image", imgPath, "--provider", "studio", "--confirm"],
      { env, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(studioGenRes.exitCode).toBe(0);
    expect(studioGenRes.output.taskId).toBe(studioTaskId);

    const waitRes = await executeVarco3dCli(
      ["wait", studioTaskId, "--provider", "studio", "--interval", "100", "--timeout", "2000"],
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
    expect(studioPollCount).toBe(2);

    const studioDlRes = await executeVarco3dCli(
      ["download-glb", studioTaskId, "--provider", "studio", "--output", studioGlbPath],
      { env, cwd: dir, repoRoot: dir, homeDir: dir, fetchImpl: fetchStub },
    );
    expect(studioDlRes.exitCode).toBe(0);
    expect(studioDlRes.output.savedPath).toBe(studioGlbPath);
    expect(readFileSync(studioGlbPath, "utf8")).toBe("glTF-mock-binary");
  });

  it("입력 검증 함수가 잘못된 polygonCount와 인자를 명확한 한글 오류로 거부한다", () => {
    expect(() => validatePolygonCount("500")).toThrow(/polygonCount/);
    expect(() => validatePolygonCount("400000", "nc-openapi")).toThrow(/300000/);
    expect(() => validatePolygonCount("2000000", "studio")).toThrow(/1000000/);
    expect(validatePolygonCount("300000", "nc-openapi")).toBe(300_000);
    expect(validatePolygonCount("500000", "studio")).toBe(500_000);

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
