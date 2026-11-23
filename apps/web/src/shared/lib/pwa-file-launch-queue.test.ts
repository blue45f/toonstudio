import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { matchRoutes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { appRoutes } from "../../app/routes/groups/app-routes";
import {
  classifyPwaLaunchFileFormat,
  extractPwaLaunchFileExtension,
  installPwaLaunchQueueConsumer,
  readWindowControlsOverlayState,
  subscribeWindowControlsOverlayGeometry,
  type LaunchParamsLike,
  type LaunchQueueFileHandleLike,
  type PwaLaunchFileEntry,
} from "./pwa-file-launch-queue";

interface ManifestFileHandler {
  readonly action: string;
  readonly name?: string;
  readonly launch_type?: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
  readonly icons?: readonly { readonly src: string; readonly sizes: string; readonly type: string }[];
}

interface ManifestWithFileHandling {
  readonly id: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display_override?: readonly string[];
  readonly launch_handler?: {
    readonly client_mode?: string | readonly string[];
  };
  readonly file_handlers?: readonly ManifestFileHandler[];
}

function makeFakeHandle(
  name: string,
  options: { readonly kind?: "file" | "directory"; readonly content?: string } = {},
): LaunchQueueFileHandleLike {
  const payload = options.content ?? `content:${name}`;
  return {
    name,
    kind: options.kind ?? "file",
    getFile: async () => new File([payload], name, { type: "application/octet-stream" }),
  };
}

describe("이중 PWA 매니페스트 file_handlers · launch_handler 동기화 계약", () => {
  const rootManifestPath = join(process.cwd(), "apps/web/public/manifest.webmanifest");
  const brandManifestPath = join(
    process.cwd(),
    "apps/web/public/brand/jewel-atelier-v1/manifest.webmanifest",
  );
  const rootRaw = readFileSync(rootManifestPath, "utf8");
  const brandRaw = readFileSync(brandManifestPath, "utf8");
  const rootManifest = JSON.parse(rootRaw) as ManifestWithFileHandling;
  const brandManifest = JSON.parse(brandRaw) as ManifestWithFileHandling;

  it("루트 매니페스트와 brand/jewel-atelier-v1 매니페스트가 바이트 단위로 일치한다", () => {
    expect(brandRaw).toBe(rootRaw);
  });

  it("두 매니페스트 모두 launch_handler(focus-existing, auto)와 .toon/.ora/.psd file_handlers를 선언한다", () => {
    const registeredRoutes = appRoutes.filter((route) => !["*", "/*"].includes(route.path));

    for (const manifest of [rootManifest, brandManifest]) {
      expect(manifest.id).toBe("/");
      expect(manifest.start_url).toBe("/studio");
      expect(manifest.display_override).toContain("window-controls-overlay");
      expect(manifest.launch_handler).toEqual({
        client_mode: ["focus-existing", "auto"],
      });

      const handlers = manifest.file_handlers ?? [];
      expect(handlers.length).toBeGreaterThanOrEqual(1);

      const allExtensions = new Set<string>();
      for (const handler of handlers) {
        expect(["/studio", "/studio/open"]).toContain(handler.action);
        expect(handler.action.startsWith(manifest.scope)).toBe(true);
        expect(matchRoutes(registeredRoutes, handler.action)).not.toBeNull();
        for (const extensions of Object.values(handler.accept)) {
          for (const ext of extensions) {
            allExtensions.add(ext.toLowerCase());
          }
        }
        for (const icon of handler.icons ?? []) {
          expect(existsSync(join(process.cwd(), "apps/web/public", icon.src))).toBe(true);
        }
      }

      expect(allExtensions.has(".toon")).toBe(true);
      expect(allExtensions.has(".ora")).toBe(true);
      expect(allExtensions.has(".psd")).toBe(true);
    }
  });

  it("atelier-motion.css가 WCO 미디어 쿼리에서만 env(titlebar-area-*) CSS 변수를 노출한다", () => {
    const css = readFileSync(
      join(process.cwd(), "apps/web/src/app/styles/atelier-motion.css"),
      "utf8",
    );
    expect(css).toContain("@media (display-mode: window-controls-overlay)");
    expect(css).toContain("env(titlebar-area-height, 0px)");
    expect(css).toContain("env(titlebar-area-x, 0px)");
    expect(css).toContain("--wco-safe-top: 0px;");
    expect(css).toContain("--wco-safe-left: 0px;");
  });
});

describe("extractPwaLaunchFileExtension & classifyPwaLaunchFileFormat", () => {
  it("확장자를 정규화하고 스튜디오 지원 포맷을 분류한다", () => {
    expect(extractPwaLaunchFileExtension("EP01.TOON")).toBe(".toon");
    expect(extractPwaLaunchFileExtension("scene.final.v2.ORA")).toBe(".ora");
    expect(extractPwaLaunchFileExtension("no-extension")).toBe("");
    expect(extractPwaLaunchFileExtension(".hidden")).toBe("");

    expect(classifyPwaLaunchFileFormat("episode01.toon")).toBe("toon");
    expect(classifyPwaLaunchFileFormat("episode01.toonstudio")).toBe("toon");
    expect(classifyPwaLaunchFileFormat("cut04.ORA")).toBe("ora");
    expect(classifyPwaLaunchFileFormat("cover.Psd")).toBe("psd");
    expect(classifyPwaLaunchFileFormat("cut01.png")).toBe("png");
    expect(classifyPwaLaunchFileFormat("thumb.webp")).toBe("webp");
    expect(classifyPwaLaunchFileFormat("pitch-deck.pptx")).toBe("pptx");
    expect(classifyPwaLaunchFileFormat("readme.txt")).toBe("unknown");
  });
});

describe("installPwaLaunchQueueConsumer", () => {
  it("window.launchQueue.setConsumer로 전달된 파일을 포맷별로 분류해 전달하고 정리 함수로 해제한다", async () => {
    const holder: { consumer: ((params: LaunchParamsLike) => void | Promise<void>) | null } = {
      consumer: null,
    };
    const setConsumer = vi.fn((consumer: (params: LaunchParamsLike) => void | Promise<void>) => {
      holder.consumer = consumer;
    });
    const received: Array<readonly PwaLaunchFileEntry[]> = [];

    const dispose = installPwaLaunchQueueConsumer(
      (files) => {
        received.push(files);
      },
      { targetWindow: { launchQueue: { setConsumer } } },
    );

    expect(setConsumer).toHaveBeenCalledTimes(1);
    expect(holder.consumer).not.toBeNull();

    holder.consumer?.({
      targetURL: "https://www.toonstudio.cloud/studio",
      files: [
        makeFakeHandle("ep12.toon"),
        makeFakeHandle("layers.ora"),
        makeFakeHandle("keyart.PSD"),
        makeFakeHandle("cut.png"),
        makeFakeHandle("banner.webp"),
        makeFakeHandle("board.pptx"),
        makeFakeHandle("notes.txt"),
        makeFakeHandle("ignored-dir", { kind: "directory" }),
      ],
    });

    expect(received).toHaveLength(1);
    const batch = received[0] ?? [];
    expect(batch.map((entry) => entry.format)).toEqual([
      "toon",
      "ora",
      "psd",
      "png",
      "webp",
      "pptx",
      "unknown",
    ]);
    expect(batch[0]?.supportedInStudio).toBe(true);
    expect(batch[6]?.supportedInStudio).toBe(false);
    expect(batch[0]?.targetUrl).toBe("https://www.toonstudio.cloud/studio");

    const file = await batch[0]?.getFile();
    expect(file?.name).toBe("ep12.toon");

    // 정리 함수 호출 이후에는 추가 전달을 무시한다.
    dispose();
    holder.consumer?.({
      targetURL: "https://www.toonstudio.cloud/studio",
      files: [makeFakeHandle("after-dispose.toon")],
    });
    expect(received).toHaveLength(1);
  });

  it("launchQueue 미지원 환경에서는 예외 없이 안전한 no-op 정리 함수를 반환한다", () => {
    const onFiles = vi.fn();
    const disposeFromEmpty = installPwaLaunchQueueConsumer(onFiles, { targetWindow: {} });
    const disposeFromNull = installPwaLaunchQueueConsumer(onFiles, { targetWindow: null });

    expect(() => disposeFromEmpty()).not.toThrow();
    expect(() => disposeFromNull()).not.toThrow();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("비동기 콜백 오류를 onError로 안전하게 전달하고 빈 파일 목록은 무시한다", async () => {
    const holder: { consumer: ((params: LaunchParamsLike) => void | Promise<void>) | null } = {
      consumer: null,
    };
    const onError = vi.fn();
    const onFiles = vi.fn(async () => {
      throw new Error("import failed");
    });

    installPwaLaunchQueueConsumer(onFiles, {
      targetWindow: {
        launchQueue: {
          setConsumer: (consumer) => {
            holder.consumer = consumer;
          },
        },
      },
      onError,
    });

    holder.consumer?.({ targetURL: "/studio", files: [] });
    expect(onFiles).not.toHaveBeenCalled();

    holder.consumer?.({ targetURL: "/studio", files: [makeFakeHandle("broken.psd")] });
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});

describe("readWindowControlsOverlayState & subscribeWindowControlsOverlayGeometry", () => {
  it("미지원 브라우저에서는 supported=false와 0px 안전 여백을 반환한다", () => {
    const state = readWindowControlsOverlayState({ targetNavigator: {} });
    expect(state.supported).toBe(false);
    expect(state.visible).toBe(false);
    expect(state.safeInsets).toEqual({ top: 0, left: 0, right: 0 });
    expect(state.cssVariables["--wco-safe-top"]).toBe("0px");
    expect(state.cssVariables["--wco-safe-left"]).toBe("0px");
  });

  it("WCO가 비활성(visible=false)이면 기존 레이아웃을 보존하도록 0px 여백을 반환한다", () => {
    const state = readWindowControlsOverlayState({
      targetNavigator: {
        windowControlsOverlay: {
          visible: false,
          getTitlebarAreaRect: () => ({ x: 78, y: 0, width: 1200, height: 38 }),
        },
      },
      viewportWidth: 1280,
    });
    expect(state.supported).toBe(true);
    expect(state.visible).toBe(false);
    expect(state.safeInsets).toEqual({ top: 0, left: 0, right: 0 });
  });

  it("macOS(좌측 컨트롤) 및 Windows(우측 컨트롤) WCO 안전 여백과 CSS 변수를 정확히 계산한다", () => {
    const macState = readWindowControlsOverlayState({
      targetNavigator: {
        windowControlsOverlay: {
          visible: true,
          getTitlebarAreaRect: () => ({ x: 78, y: 0, width: 1202, height: 38 }),
        },
      },
      viewportWidth: 1280,
    });
    expect(macState.supported).toBe(true);
    expect(macState.visible).toBe(true);
    expect(macState.safeInsets).toEqual({ top: 38, left: 78, right: 0 });
    expect(macState.cssVariables).toEqual({
      "--wco-titlebar-x": "78px",
      "--wco-titlebar-y": "0px",
      "--wco-titlebar-width": "1202px",
      "--wco-titlebar-height": "38px",
      "--wco-safe-top": "38px",
      "--wco-safe-left": "78px",
    });

    const winState = readWindowControlsOverlayState({
      targetNavigator: {
        windowControlsOverlay: {
          visible: true,
          getTitlebarAreaRect: () => ({ x: 0, y: 0, width: 1142, height: 32 }),
        },
      },
      viewportWidth: 1280,
    });
    expect(winState.safeInsets).toEqual({ top: 32, left: 0, right: 138 });
  });

  it("geometrychange 이벤트를 구독하고 해제 시 리스너를 제거한다", () => {
    let currentWidth = 1100;
    const listeners = new Set<() => void>();
    const targetNavigator = {
      windowControlsOverlay: {
        visible: true,
        getTitlebarAreaRect: () => ({ x: 72, y: 0, width: currentWidth, height: 36 }),
        addEventListener: (_type: "geometrychange", fn: () => void) => {
          listeners.add(fn);
        },
        removeEventListener: (_type: "geometrychange", fn: () => void) => {
          listeners.delete(fn);
        },
      },
    };
    const onChange = vi.fn();

    const unsubscribe = subscribeWindowControlsOverlayGeometry(onChange, {
      targetNavigator,
      viewportWidth: 1280,
    });
    expect(listeners.size).toBe(1);

    currentWidth = 1208;
    for (const listener of listeners) listener();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.titlebarRect.width).toBe(1208);

    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
