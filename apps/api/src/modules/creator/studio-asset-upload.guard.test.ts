import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { AuthenticatedUploadGuard } from "./studio-asset-upload.guard";

type RequestHeaders = Record<string, string | string[] | undefined>;

function contextFor(headers: RequestHeaders): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe("AuthenticatedUploadGuard", () => {
  it("로그인 사용자 헤더가 없으면 본문을 받기 전에 403 으로 거부한다", () => {
    const guard = new AuthenticatedUploadGuard();
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
  });

  it("빈 문자열이나 중복 전송된 배열 헤더도 로그인으로 보지 않는다", () => {
    const guard = new AuthenticatedUploadGuard();
    expect(() => guard.canActivate(contextFor({ "x-user-id": "" }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor({ "x-user-id": ["u1", "u2"] }))).toThrow(
      ForbiddenException,
    );
  });

  it("세션 미들웨어가 검증해 채운 사용자 id 가 있으면 통과시킨다", () => {
    const guard = new AuthenticatedUploadGuard();
    expect(guard.canActivate(contextFor({ "x-user-id": "u1" }))).toBe(true);
  });
});

// 가드는 인터셉터(Multer)보다 먼저 실행된다. 업로드 라우트가 가드 없이 FileInterceptor 만 달면
// 익명 요청도 한도(5~20MB)만큼 본문이 메모리에 쌓인 뒤에야 서비스의 로그인 검사에 걸린다.
const API_SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MULTER_INTERCEPTORS: ReadonlySet<string> = new Set([
  "FileInterceptor",
  "FilesInterceptor",
  "FileFieldsInterceptor",
  "AnyFilesInterceptor",
]);
// 셋 모두 studio-asset-upload.guard.ts 의 requireAuthenticatedUploadRequest 로 로그인부터 확인한다.
const PRE_MULTER_AUTH_GUARDS: ReadonlySet<string> = new Set([
  "AuthenticatedUploadGuard",
  "StudioWorkAssetUploadGuard",
  "StudioRasterAssetUploadGuard",
]);

function controllerFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : controllerFiles(path);
    return entry.isFile() && entry.name.endsWith(".controller.ts") ? [path] : [];
  });
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(
  decorator: ts.Decorator,
): { readonly name: string; readonly args: readonly ts.Expression[] } | null {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) return null;
  return { name: expression.expression.text, args: [...expression.arguments] };
}

function guardNames(decorators: readonly ts.Decorator[]): string[] {
  return decorators.flatMap((decorator) => {
    const call = decoratorCall(decorator);
    if (call?.name !== "UseGuards") return [];
    return call.args.filter(ts.isIdentifier).map((arg) => arg.text);
  });
}

function usesMulter(decorators: readonly ts.Decorator[]): boolean {
  return decorators.some((decorator) => {
    const call = decoratorCall(decorator);
    if (call?.name !== "UseInterceptors") return false;
    return call.args.some(
      (arg) =>
        ts.isCallExpression(arg)
        && ts.isIdentifier(arg.expression)
        && MULTER_INTERCEPTORS.has(arg.expression.text),
    );
  });
}

interface MultipartRoute {
  readonly id: string;
  readonly guards: readonly string[];
}

function multipartRoutes(): MultipartRoute[] {
  const routes: MultipartRoute[] = [];
  for (const file of controllerFiles(join(API_SOURCE_ROOT, "modules"))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const label = relative(API_SOURCE_ROOT, file).split(sep).join("/");
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      const classGuards = guardNames(decoratorsOf(node));
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) continue;
        const decorators = decoratorsOf(member);
        if (!usesMulter(decorators)) continue;
        routes.push({
          id: `${label}#${node.name.text}.${member.name.text}`,
          guards: [...classGuards, ...guardNames(decorators)],
        });
      }
    });
  }
  return routes;
}

describe("멀티파트 업로드 라우트의 Multer 이전 인증 가드", () => {
  const routes = multipartRoutes();

  it("스캐너가 알려진 업로드 라우트를 실제로 찾아낸다", () => {
    expect(routes.map((route) => route.id)).toEqual(
      expect.arrayContaining([
        "modules/studio-unity-space-layout/studio-unity-space-background.controller.ts#StudioUnitySpaceBackgroundController.upload",
        "modules/production-collaboration/production-voice-commentary.controller.ts#ProductionVoiceCommentaryController.create",
        "modules/studio-project-graph/studio-recording-booth-asset.controller.ts#StudioRecordingBoothAssetController.create",
        "modules/studio-project-graph/studio-review-voice-note.controller.ts#StudioReviewVoiceNoteController.create",
        "modules/production-collaboration/production-integration.controller.ts#ProductionIntegrationController.createDocumensoEnvelope",
        "modules/studio-project-graph/studio-review-preview-producer.controller.ts#StudioReviewPreviewProducerController.upload",
      ]),
    );
  });

  it("모든 업로드 라우트가 로그인 확인 가드를 가진다(익명 본문은 메모리에 쌓이지 않는다)", () => {
    const unguarded = routes
      .filter((route) => !route.guards.some((name) => PRE_MULTER_AUTH_GUARDS.has(name)))
      .map((route) => route.id);
    expect(unguarded).toEqual([]);
  });
});
