import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LIBRARY_GUIDE_AREAS_B } from "../../../../../../apps/web/src/domains/legal/technology/engineering-library-guide-areas-b";

/**
 * 라이브러리 해설 영역 7 "서버와 데이터"가 API 소스에 대해 말하는 사실을 API 쪽 파일에서 읽어 대조한다.
 * 웹 앱의 비통합 테스트는 다른 앱의 src 를 읽을 수 없으므로(validate-app-boundaries), API 소스를 읽는 단언만 이 통합 폴더에 둔다.
 * 웹 쪽 설정 파일(pnpm-workspace.yaml·wrangler.jsonc 등)을 대조하는 단언은 apps/web/src/domains/legal/technology/engineering-library-guide-areas-b.test.ts 에 있다.
 */

const source = (relativePath: string): string => readFileSync(join(process.cwd(), relativePath), "utf8");
const serverArea = (): string => {
  const found = LIBRARY_GUIDE_AREAS_B.find((candidate) => candidate.id === "server-data");
  if (!found) throw new Error("영역 server-data 없음");
  return JSON.stringify(found);
};

describe("라이브러리 해설 영역 7 · API 쪽 사실", () => {
  it("pg 연결 풀 기본 최대 연결 수와 조정 범위가 카드 문구와 같다", () => {
    const bounds = /boundedPoolInt\(env\.WEBDEX_PG_POOL_MAX,\s*(\d+),\s*(\d+),\s*(\d+)\)/u.exec(source("apps/api/src/platform/database/pg-connection.ts"));
    expect(bounds).not.toBeNull();
    const [, pool, min, max] = bounds as unknown as [string, string, string, string];
    const server = serverArea();
    expect(server).toContain(`기본 ${pool}개`);
    expect(server).toContain(`defaults to ${pool}`);
    expect(server).toContain(`${min}~${max} 조정`);
    expect(server).toContain(`from ${min} to ${max}`);
  });

  it("API 실행 역할과 전역 Zod 파이프·접두사가 NestJS 카드 문구와 같다", () => {
    const roles = [...(/API_RUNTIME_ROLES\s*=\s*\[([\s\S]*?)\]\s*as const/u.exec(source("apps/api/src/config/runtime-role.ts"))?.[1] ?? "").matchAll(/"([^"]+)"/gu)].map((match) => match[1] as string);
    expect(roles.length).toBeGreaterThan(0);
    const server = serverArea();
    for (const role of roles) expect(server, `역할 ${role}`).toContain(role);
    expect(server).toContain(`역할 ${roles.length}가지`);
    expect(source("apps/api/src/runtime/runtime-boundary.test.ts")).toContain("describe(");

    const main = source("apps/api/src/main.ts");
    expect(main).toContain("app.useGlobalPipes(new ZodValidationPipe())");
    expect(main).toContain('app.setGlobalPrefix("api"');
    expect(source("apps/api/src/platform/http/zod-validation.pipe.ts")).toContain("createZodValidationPipe");
  });

  it("API 빌드가 기배포 SQL 원문·공유 Zod 버전을 검사하고 drizzle-kit push 를 실행하지 않는다", () => {
    const build = (JSON.parse(source("apps/api/package.json")) as { scripts: Record<string, string> }).scripts.build ?? "";
    expect(build).toContain("verify-production-release-compatibility.mjs");
    expect(build).not.toContain("drizzle-kit push");
    const start = (JSON.parse(source("apps/api/package.json")) as { scripts: Record<string, string> }).scripts.start ?? "";
    expect(start).not.toContain("drizzle-kit");
    const check = source("scripts/verify-production-release-compatibility.mjs");
    expect(check).toContain("기배포 마이그레이션 원문 불일치");
    expect(check).toContain("공유 Zod 런타임 버전 불일치");
    const server = serverArea();
    expect(server).toContain("drizzle-kit push");
  });
});
