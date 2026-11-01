import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";

import type { Plugin, ResolvedConfig } from "vite";

type WebReactCompilerPlugin = Awaited<ReturnType<typeof babel>> & Pick<Plugin, "configResolved">;

/** 사용자 제외 규칙은 Babel 기본값을 덮어쓰므로 의존성과 가상 런타임 제외도 함께 보존한다. */
export const WEB_REACT_COMPILER_EXCLUDE = [
  /[/\\]node_modules[/\\]|^\0rolldown\/runtime\.js$/u,
  /programmatic-reload(?:-hmr)?\.ts(?:\?.*)?$/u,
];

function optimizedDependencyExclude(cacheDir: string): RegExp {
  const cachePath = cacheDir.replace(/\\/gu, "/").replace(/\/+$/u, "");
  const escaped = cachePath.split("/")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("[/\\\\]");
  // deps・환경별 deps_*・임시 deps_temp_*만 제외해 cacheDir 아래의 앱 소스도 보존한다.
  return new RegExp(`^(?:[/\\\\]@fs[/\\\\]?)?${escaped}[/\\\\]deps(?:_[^/\\\\?]*)?(?:[/\\\\]|$)`, "u");
}

/** 실제 resolved cacheDir를 Babel의 선행 필터와 환경별 옵션에 함께 반영한다. */
export async function createWebReactCompilerPlugin() {
  const exclude = [...WEB_REACT_COMPILER_EXCLUDE];
  const plugin: WebReactCompilerPlugin = await babel({ presets: [reactCompilerPreset()], exclude });
  const original = plugin.configResolved;
  const originalHandler = typeof original === "function" ? original : original?.handler;
  const wrapped = function (
    this: ThisParameterType<NonNullable<typeof originalHandler>>,
    config: ResolvedConfig,
  ) {
    exclude.splice(WEB_REACT_COMPILER_EXCLUDE.length, exclude.length, optimizedDependencyExclude(config.cacheDir));
    return originalHandler?.call(this, config);
  };
  plugin.configResolved = original && typeof original === "object"
    ? { ...original, handler: wrapped }
    : wrapped;
  return plugin;
}
