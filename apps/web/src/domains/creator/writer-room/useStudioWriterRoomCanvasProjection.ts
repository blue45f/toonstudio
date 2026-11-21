/**
 * 작가실(Writer Room) 컷 플랜 투영·페이지 삽입 런타임의 지연 로더 훅.
 * 작가실 패널이 열리기 전까지 투영 엔진과 페이지 빌더를 초기 진입 그래프에서 분리한다.
 */
import { useEffect, useState } from "react";

import type { PageState } from "../studio-page-state";
import type { StudioWriterRoomDocument } from "../studio-writer-room";
import type { StudioWriterRoomCanvasProjectionResult } from "../studio-writer-room-canvas-projection";

interface WriterRoomProjectionModules {
  readonly projection: typeof import("../studio-writer-room-canvas-projection");
  readonly pages: typeof import("./buildStudioWriterRoomCanvasPages");
}

let cachedWriterRoomProjectionModules: WriterRoomProjectionModules | null = null;
let inflightWriterRoomProjectionModules: Promise<WriterRoomProjectionModules> | null = null;

function loadWriterRoomProjectionModules(): Promise<WriterRoomProjectionModules> {
  if (cachedWriterRoomProjectionModules) {
    return Promise.resolve(cachedWriterRoomProjectionModules);
  }
  if (!inflightWriterRoomProjectionModules) {
    inflightWriterRoomProjectionModules = Promise.all([
      import("../studio-writer-room-canvas-projection"),
      import("./buildStudioWriterRoomCanvasPages"),
    ])
      .then(([projection, pages]) => {
        cachedWriterRoomProjectionModules = { projection, pages };
        return cachedWriterRoomProjectionModules;
      })
      .catch((error) => {
        inflightWriterRoomProjectionModules = null;
        throw error;
      });
  }
  return inflightWriterRoomProjectionModules;
}

export interface StudioWriterRoomCanvasProjectionHookInput {
  readonly writerRoomOpen: boolean;
  readonly writerRoom: StudioWriterRoomDocument;
  readonly characterBible: unknown;
  readonly canvasWidth: number;
}

export function useStudioWriterRoomCanvasProjection({
  writerRoomOpen,
  writerRoom,
  characterBible,
  canvasWidth,
}: StudioWriterRoomCanvasProjectionHookInput) {
  const [modules, setModules] = useState<WriterRoomProjectionModules | null>(
    () => cachedWriterRoomProjectionModules,
  );

  useEffect(() => {
    if (!writerRoomOpen || modules) return;
    let cancelled = false;
    void loadWriterRoomProjectionModules()
      .then((loaded) => {
        if (!cancelled) setModules(loaded);
      })
      .catch(() => {
        // 패널 재열기 시 다시 시도할 수 있도록 오류 시 빈 계획을 유지한다.
      });
    return () => {
      cancelled = true;
    };
  }, [modules, writerRoomOpen]);

  const writerRoomCanvasPlan: StudioWriterRoomCanvasProjectionResult | null =
    writerRoomOpen && modules
      ? modules.projection.projectStudioWriterRoomToCanvasPlan(writerRoom, {
          characterBible,
          canvasWidth,
          minimumPageHeight: 1080,
          targetPageHeight: 8_000,
          maxPanelsPerPage: 12,
          maxDialogueLinesPerPanel: 12,
          maxSfxLabelsPerPanel: 8,
        })
      : null;

  function buildAndInsertWriterRoomPages(args: {
    readonly plan: StudioWriterRoomCanvasProjectionResult;
    readonly pages: readonly PageState[];
    readonly activePageId: string;
  }): { readonly createdPages: PageState[]; readonly nextPages: PageState[] } | null {
    const activeModules = modules ?? cachedWriterRoomProjectionModules;
    if (!activeModules) return null;
    const createdPages = activeModules.pages.buildStudioWriterRoomCanvasPages({
      plan: args.plan,
      writerRoom,
    });
    const nextPages = activeModules.pages.insertStudioWriterRoomCanvasPages(
      args.pages,
      args.activePageId,
      createdPages,
    );
    return { createdPages, nextPages };
  }

  return {
    writerRoomCanvasPlan,
    buildAndInsertWriterRoomPages,
  };
}
