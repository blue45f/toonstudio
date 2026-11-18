import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { build, type InlineConfig, type Plugin } from "vite";

export const ADMIN_QUALITY_BASE = "/admin/platform/quality/";
export const ADMIN_BUSINESS_PLAN_BASE = "/admin/growth/business-plan/";
export const ADMIN_WORKSPACE_BASE = "/admin/workspace/";

interface AdminQualityEntryOptions {
  readonly repositoryRoot: string;
  readonly buildAdmin?: (config: InlineConfig) => Promise<unknown>;
}

/** 앱 소스를 공유하지 않고 관리자 빌드 산출물만 같은 출처의 하위 경로에 조립한다. */
export function adminQualityEntryPlugin({ repositoryRoot, buildAdmin = build }: AdminQualityEntryOptions): Plugin {
  let outputDirectory: string | undefined;

  return {
    name: "toonstudio-admin-quality-entry",
    apply: "build",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (!outputDirectory) throw new Error("관리자 검증 보드의 Web 출력 경로를 확인할 수 없습니다.");
      // 별도 Vite 설정으로 빌드하므로 Web manifest와 Studio 청크 소유권을 덮어쓰지 않는다.
      for (const base of [ADMIN_QUALITY_BASE, ADMIN_BUSINESS_PLAN_BASE]) {
        await buildAdmin({
          configFile: path.resolve(repositoryRoot, "apps/admin-web/vite.config.ts"),
          base,
          build: {
            outDir: path.join(outputDirectory, base.slice(1)),
            emptyOutDir: true,
            manifest: false,
          },
        });
      }
      // 통합 작업실은 quality 번들의 절대 자산 경로를 재사용한다.
      // 사업계획서의 독립 자산 경로와 Web·Studio manifest는 그대로 유지한다.
      const workspaceDirectory = path.join(outputDirectory, ADMIN_WORKSPACE_BASE.slice(1));
      await mkdir(workspaceDirectory, { recursive: true });
      await copyFile(path.join(outputDirectory, "admin/platform/quality/index.html"), path.join(workspaceDirectory, "index.html"));
    },
  };
}
