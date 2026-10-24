import Module from "node:module";

/**
 * `zod@<4.6.6` 보안 override(GHSA-mrhx-c7xc-m3w5)로 인해 `eslint-plugin-react-compiler@19.1.0-rc.2`의
 * 전이 의존성 `zod`가 4.6.7로 수렴한다. 해당 RC 번들은 Zod v3(`z.function().args(...)`) API를
 * `require("zod")`로 호출하므로, `eslint-plugin-react-compiler` 내부 CJS `require("zod")`만
 * `zod@4.6.7`이 기본 제공하는 호환 엔트리(`zod/v3`)로 연결한다.
 */
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveEslintReactCompilerZodV3(
  request,
  parent,
  isMain,
  options,
) {
  if (
    request === "zod" &&
    typeof parent?.filename === "string" &&
    parent.filename.includes("eslint-plugin-react-compiler")
  ) {
    return originalResolveFilename.call(this, "zod/v3", parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
