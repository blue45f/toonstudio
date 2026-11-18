import { fileURLToPath } from "node:url";

/** 앱 전체 빌드·public 복사 없이 필요한 제품 컴포넌트와 React만 메모리에 묶는다. */
export async function buildStudioReactFixture(source: string): Promise<string> {
  const { build } = await import("vite");
  const root = fileURLToPath(new URL("../../apps/web", import.meta.url));
  const entry = `${root}/src/__studio-react-fixture.tsx`;

  const result = await build({
    root, configFile: false, publicDir: false, logLevel: "error", clearScreen: false,
    oxc: { jsx: { runtime: "automatic" } },
    resolve: { dedupe: ["react", "react-dom"], alias: { "@": `${root}/src` } },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "studio-react-browser-fixture",
      resolveId(id) { return id === entry ? entry : undefined; },
      load(id) { return id === entry ? source : undefined; },
    }],
    build: { write: false, copyPublicDir: false, emptyOutDir: false, minify: false, target: "es2022",
      lib: { entry, name: "StudioReactFixture", formats: ["iife"] },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs.flatMap(output => "output" in output
    ? output.output.filter(item => item.type === "chunk") : []);
  const [chunk, ...extra] = chunks;
  if (!chunk || extra.length > 0) throw new Error("Studio fixture JavaScript 번들이 하나가 아닙니다.");
  return chunk.code;
}
