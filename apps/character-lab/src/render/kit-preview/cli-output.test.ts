import { describe, expect, it } from "vitest";

import { DEFAULT_KIT_PREVIEW_BACKGROUND, parseKitPreviewArgs } from "./cli-args";
import {
  KIT_PREVIEW_CLI_REPORT_SCHEMA,
  KIT_PREVIEW_EXIT,
  buildFinalReport,
  buildMontageArgs,
  classifyBrowserEvent,
  contactSheetColumns,
  decideExitCode,
  isKitAssetFailureCode,
  defaultOutputPrefix,
  outputFileName,
  planRenderJobs,
  sanitizeFileToken,
  summarizeTimings,
} from "./cli-output";

import type { KitPreviewRequest } from "./cli-args";
import type { RenderRecord } from "./cli-output";

function request(): KitPreviewRequest {
  const parsed = parseKitPreviewArgs(["--glb", "base.glb", "--out", "out", "--morph", "facs:jawOpen=1", "--color", "hair=#112233", "--pose", "arms-up"]);
  if (!parsed.ok || parsed.help) throw new Error("테스트 인자가 유효하지 않습니다.");
  return parsed.request;
}

function record(overrides: Partial<RenderRecord> = {}): RenderRecord {
  return {
    view: "front",
    shading: "toon",
    status: "ok",
    file: "x__front__toon.png",
    width: 256,
    height: 256,
    coverage: 0.2,
    readyMs: 100,
    renderMs: 50,
    wallMs: 2000,
    notes: [],
    code: null,
    reasonKo: null,
    hud: null,
    ...overrides,
  };
}

describe("출력 이름", () => {
  it("파일 이름 토큰을 안전하게 만든다", () => {
    expect(sanitizeFileToken("Base Female (v1).glb")).toBe("Base-Female-v1-.glb");
    expect(sanitizeFileToken("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeFileToken("한글")).toBe("kit");
    expect(sanitizeFileToken("")).toBe("kit");
  });

  it("기본 접두는 베이스 GLB 파일 이름이고 경로 구분자 두 종류를 모두 처리한다", () => {
    expect(defaultOutputPrefix("/a/b/base_female_s1.glb")).toBe("base_female_s1");
    expect(defaultOutputPrefix("C:\\kit\\Orion Avatar.GLB")).toBe("Orion-Avatar");
  });

  it("렌더 작업은 셰이딩이 바깥 루프이고 파일 이름이 겹치지 않는다", () => {
    const jobs = planRenderJobs("kit", ["front", "face"], ["toon", "pbr"]);
    expect(jobs.map((job) => `${job.shading}/${job.view}`)).toEqual(["toon/front", "toon/face", "pbr/front", "pbr/face"]);
    expect(new Set(jobs.map((job) => job.fileName)).size).toBe(4);
    expect(outputFileName("kit", "face-q3", "pbr")).toBe("kit__face-q3__pbr.png");
  });
});

describe("접촉 시트 인자", () => {
  it("칸 수는 4 이하이고 요청이 있으면 항목 수를 넘지 않는다", () => {
    expect(contactSheetColumns(16)).toBe(4);
    expect(contactSheetColumns(2)).toBe(2);
    expect(contactSheetColumns(0)).toBe(1);
    expect(contactSheetColumns(3, 8)).toBe(3);
    expect(contactSheetColumns(16, 6)).toBe(6);
  });

  it("라벨과 파일을 짝으로 나열하고 타일·여백을 지정한다", () => {
    const args = buildMontageArgs(
      [
        { file: "a.png", label: "front · toon" },
        { file: "b.png", label: "front · pbr" },
      ],
      { tile: 256, columns: 0, background: DEFAULT_KIT_PREVIEW_BACKGROUND, outFile: "sheet.png", fontPath: null },
    );
    const labelAt = args.indexOf("-label");
    expect(args.slice(labelAt, labelAt + 6)).toEqual(["-label", "front · toon", "a.png", "-label", "front · pbr", "b.png"]);
    expect(args).toContain("-tile");
    expect(args[args.indexOf("-tile") + 1]).toBe("2x");
    // 칸 폭 = 이미지 252 + 여백 2×2 = 256, 8비트 PNG
    expect(args[args.indexOf("-geometry") + 1]).toBe("252x252+2+2");
    expect(args[args.indexOf("-depth") + 1]).toBe("8");
    expect(args[args.length - 1]).toBe("sheet.png");
    expect(args).not.toContain("-font");
  });

  it("글꼴 경로가 있으면 -font를 싣는다", () => {
    const args = buildMontageArgs([{ file: "a.png", label: "x" }], { tile: 128, columns: 0, background: "#000000", outFile: "o.png", fontPath: "/f.ttf" });
    expect(args[args.indexOf("-font") + 1]).toBe("/f.ttf");
  });
});

describe("브라우저 이벤트 분류", () => {
  it("소음은 버리고 오류·경고는 한글 경고로 바꾼다", () => {
    expect(classifyBrowserEvent({ kind: "console", level: "log", text: "hello" })).toBeNull();
    expect(classifyBrowserEvent({ kind: "console", level: "warning", text: "[vite] connecting..." })).toBeNull();
    expect(classifyBrowserEvent({ kind: "console", level: "warning", text: "GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels" })).toBeNull();
    const error = classifyBrowserEvent({ kind: "console", level: "error", text: "Failed to compile shader\n  line 1" });
    expect(error).toMatchObject({ code: "browser-console-error", severity: "warn" });
    expect(error?.messageKo).toContain("Failed to compile shader line 1");
    expect(classifyBrowserEvent({ kind: "console", level: "warning", text: "texture too big" })).toMatchObject({ code: "browser-console-warning", severity: "info" });
    expect(classifyBrowserEvent({ kind: "pageerror", text: "TypeError: x" })).toMatchObject({ code: "browser-page-error", severity: "error" });
  });

  it("텍스처 업로드 실패는 별도 코드의 경고로 올린다", () => {
    expect(classifyBrowserEvent({ kind: "console", level: "warning", text: "WebGL: INVALID_VALUE: texImage2D: bad image data" })).toMatchObject({ code: "texture-upload-warning", severity: "warn" });
    expect(classifyBrowserEvent({ kind: "console", level: "warning", text: "[.WebGL-0x1] GL_INVALID_OPERATION: glGenerateMipmap: Texture format does not support mipmap generation." })?.code).toBe("texture-upload-warning");
  });

  it("취소된 요청과 정상 응답은 경고로 올리지 않는다", () => {
    expect(classifyBrowserEvent({ kind: "requestfailed", url: "http://x/a", reason: "net::ERR_ABORTED" })).toBeNull();
    expect(classifyBrowserEvent({ kind: "requestfailed", url: "http://x/a.glb", reason: "net::ERR_CONNECTION_REFUSED" })).toMatchObject({ code: "browser-request-failed" });
    expect(classifyBrowserEvent({ kind: "http", status: 200, url: "http://x" })).toBeNull();
    expect(classifyBrowserEvent({ kind: "http", status: 404, url: "http://x/tex.png" })).toMatchObject({ code: "browser-http-error" });
  });

  it("아주 긴 메시지는 한 줄로 자른다", () => {
    const warning = classifyBrowserEvent({ kind: "console", level: "error", text: "x".repeat(2000) });
    expect(warning?.messageKo.length).toBeLessThan(400);
  });
});

describe("타이밍 요약", () => {
  it("셰이딩별 첫 렌더와 이후 평균을 나눈다", () => {
    const records = [
      record({ shading: "toon", view: "front", wallMs: 6000 }),
      record({ shading: "toon", view: "side", wallMs: 1000 }),
      record({ shading: "toon", view: "back", wallMs: 2000 }),
      record({ shading: "pbr", view: "front", wallMs: 9000 }),
      record({ shading: "pbr", view: "side", status: "failed", wallMs: 500 }),
    ];
    const timings = summarizeTimings(records, 3500, 30000);
    expect(timings.loadSec).toBe(3.5);
    expect(timings.perViewSec).toBe(4.5);
    expect(timings.medianViewSec).toBe(4);
    expect(timings.maxViewSec).toBe(9);
    expect(timings.byShading.toon).toEqual({ firstSec: 6, restAvgSec: 1.5, count: 3 });
    expect(timings.byShading.pbr).toEqual({ firstSec: 9, restAvgSec: null, count: 1 });
    expect(timings.totalSec).toBe(30);
  });

  it("성공한 렌더가 없으면 0으로 보고한다", () => {
    const timings = summarizeTimings([record({ status: "failed" })], 100, 200);
    expect(timings.perViewSec).toBe(0);
    expect(timings.medianViewSec).toBe(0);
    expect(timings.maxViewSec).toBe(0);
  });
});

describe("종료 코드", () => {
  it("실패 단계별로 코드를 정한다", () => {
    const failure = (stage: "arguments" | "environment" | "fetch" | "prepare" | "engine" | "load" | "render") => ({ stage, code: "x", reasonKo: "x" });
    expect(decideExitCode(failure("arguments"), [])).toBe(KIT_PREVIEW_EXIT.usage);
    expect(decideExitCode(failure("environment"), [])).toBe(KIT_PREVIEW_EXIT.environment);
    expect(decideExitCode(failure("fetch"), [])).toBe(KIT_PREVIEW_EXIT.asset);
    expect(decideExitCode(failure("prepare"), [])).toBe(KIT_PREVIEW_EXIT.asset);
    expect(decideExitCode(failure("engine"), [])).toBe(KIT_PREVIEW_EXIT.render);
    expect(decideExitCode(failure("load"), [])).toBe(KIT_PREVIEW_EXIT.render);
  });

  it("키트 소스 경로에서 엔진 로더가 에셋을 거부한 load 실패(kit-* 계약 코드)는 에셋 오류(3), 뷰어·엔진 인프라 실패는 4", () => {
    const load = (code: string) => ({ stage: "load" as const, code, reasonKo: "x" });
    for (const code of ["kit-joint-mismatch", "kit-mesh-undeclared", "kit-sha-mismatch", "kit-morph-missing", "kit-skin-invalid"]) {
      expect(isKitAssetFailureCode(code), code).toBe(true);
      expect(decideExitCode(load(code), []), code).toBe(KIT_PREVIEW_EXIT.asset);
    }
    for (const code of ["kit-source-load-failed", "kit-engine-failed", "kit-preview-no-bytes", "package-sha-mismatch", "engine-disposed"]) {
      expect(isKitAssetFailureCode(code), code).toBe(false);
      expect(decideExitCode(load(code), []), code).toBe(KIT_PREVIEW_EXIT.render);
    }
  });

  it("건너뛴 뷰는 실패가 아니고 성공한 렌더가 없거나 실패가 있으면 4다", () => {
    expect(decideExitCode(null, [])).toBe(KIT_PREVIEW_EXIT.ok);
    expect(decideExitCode(null, [record(), record({ status: "skipped", file: null })])).toBe(KIT_PREVIEW_EXIT.ok);
    expect(decideExitCode(null, [record(), record({ status: "failed", file: null })])).toBe(KIT_PREVIEW_EXIT.render);
    expect(decideExitCode(null, [record({ status: "skipped", file: null })])).toBe(KIT_PREVIEW_EXIT.render);
  });
});

describe("최종 보고서", () => {
  it("정적 보고서가 없어도(자산 실패) 같은 모양으로 낸다", () => {
    const report = buildFinalReport({
      generatedAt: "2026-10-08T00:00:00.000Z",
      request: request(),
      inputFiles: [{ path: "base.glb", bytes: 10, sha256: "a".repeat(64) }],
      environment: { node: "v22", playwright: "1.62.1", chromium: null, chromiumPath: null, renderer: "swiftshader", devServer: "spawned" },
      outDir: "out",
      staticReport: null,
      source: null,
      runtime: null,
      renders: [],
      contactSheets: [],
      warnings: [{ code: "kit-joint-mismatch", severity: "error", source: "part.glb", messageKo: "조인트가 다릅니다." }],
      failure: { stage: "prepare", code: "kit-joint-mismatch", reasonKo: "조인트가 다릅니다." },
      loadMs: 120,
      totalMs: 900,
    });
    expect(report.schema).toBe(KIT_PREVIEW_CLI_REPORT_SCHEMA);
    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(KIT_PREVIEW_EXIT.asset);
    expect(report.meshes).toEqual([]);
    expect(report.totals).toBeNull();
    expect(report.warningCounts).toEqual({ error: 1, warn: 0, info: 0 });
    expect(report.request.pose).toBe("arms-up");
    expect(report.request.morphs).toEqual([{ name: "facs:jawOpen", value: 1 }]);
    expect(report.request.colors).toEqual({ hair: "#112233" });
    expect(report.timings.loadSec).toBe(0.12);
    // 소스 종류를 판정하기 전에 실패하면 null이다
    expect(report.sourceKind).toBeNull();
    expect(report.sourceKindReasonKo).toBeNull();
    expect(report.request.legacyMerge).toBe(false);
    expect(report.request.toon).toEqual({});
    expect(report.kitPlan).toBeNull();
  });

  it("어느 경로로 렌더했는지(sourceKind kit|package)와 판정 근거를 싣는다", () => {
    const base = {
      generatedAt: "2026-10-08T00:00:00.000Z",
      request: request(),
      inputFiles: [],
      environment: { node: "v22", playwright: null, chromium: null, chromiumPath: null, renderer: "default", devServer: "spawned" },
      outDir: "out",
      staticReport: null,
      source: null,
      runtime: null,
      renders: [record()],
      contactSheets: [],
      warnings: [],
      failure: null,
      loadMs: 1,
      totalMs: 2,
    };
    const kit = buildFinalReport({ ...base, source: { kind: "kit", reasonKo: "베이스에 키트 이름 메시가 있습니다.", forced: false } });
    expect(kit.sourceKind).toBe("kit");
    expect(kit.sourceKindReasonKo).toContain("키트 이름");
    const legacy = buildFinalReport({ ...base, source: { kind: "package", reasonKo: "--legacy-merge로 강제했습니다.", forced: true } });
    expect(legacy.sourceKind).toBe("package");
  });

  it("JSON으로 왕복할 수 있다", () => {
    const report = buildFinalReport({
      generatedAt: "2026-10-08T00:00:00.000Z",
      request: request(),
      inputFiles: [],
      environment: { node: "v22", playwright: null, chromium: null, chromiumPath: null, renderer: "default", devServer: "spawned" },
      outDir: "out",
      staticReport: null,
      source: null,
      runtime: null,
      renders: [record()],
      contactSheets: ["x__sheet.png"],
      warnings: [],
      failure: null,
      loadMs: 1,
      totalMs: 2,
    });
    expect(report.ok).toBe(true);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
