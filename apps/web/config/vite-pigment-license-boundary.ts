import type { Plugin } from "vite";

/** 패키지 이름과 실제 모듈 소유권을 검사한다. 저장 호환 ID·설명 문구는 금지하지 않는다. */
function isExternalMixboxModule(id: string): boolean {
  const path = id.replaceAll("\\", "/").split("?")[0];
  return path === "mixbox" || path.startsWith("mixbox/")
    || /(?:^|\/)node_modules\/(?:\.pnpm\/mixbox@[^/]+\/node_modules\/)?mixbox(?:\/|$)/u.test(path);
}

/** 실행 권리 프로필과 별개인 빌드 경계: 지연 청크·Worker에도 외부 Mixbox를 허용하지 않는다. */
export function pigmentLicenseBoundaryPlugin(scope: "app" | "worker" = "app"): Plugin {
  return {
    name: "toonstudio-pigment-license-boundary",
    apply: "build",
    enforce: "pre",
    resolveId(source) {
      if (isExternalMixboxModule(source)) this.error("외부 Mixbox 패키지는 배포할 수 없습니다. 자체 잠재 안료 제공자를 사용하세요.");
      return null;
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((entry) => entry.type === "chunk");
      const modules = [...new Set(chunks.flatMap((chunk) => Object.keys(chunk.modules)))];
      const forbidden = [...new Set([
        ...modules.filter(isExternalMixboxModule),
        ...chunks.flatMap((chunk) => [...chunk.imports, ...chunk.dynamicImports]).filter(isExternalMixboxModule),
      ])];
      if (forbidden.length > 0) this.error(`배포 청크에 외부 Mixbox 모듈이 있습니다: ${forbidden.join(", ")}`);
      this.emitFile({
        type: "asset",
        fileName: scope === "app" ? "legal/pigment-bundle-audit.json"
          : `legal/pigment-worker-audit-${(chunks[0]?.fileName ?? "empty").replaceAll(/[^a-zA-Z0-9_.-]/gu, "_")}.json`,
        source: `${JSON.stringify({
          schemaVersion: 1,
          scope,
          forbiddenPackages: ["mixbox"],
          forbiddenModules: forbidden,
          checkedChunks: chunks.length,
          checkedModules: modules.length,
          internalPigmentChunks: chunks.filter((chunk) => Object.keys(chunk.modules).some((id) =>
            /\/pigment\/latent-pigment-[^/]+\.[cm]?[jt]s$/u.test(id),
          )).map((chunk) => chunk.fileName).sort(),
        }, null, 2)}\n`,
      });
    },
  };
}
