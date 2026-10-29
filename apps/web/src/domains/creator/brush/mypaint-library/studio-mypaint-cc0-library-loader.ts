/**
 * 작업자 전용: CC0 MyPaint 설정 데이터(약 160KB)를 처음 쓸 때 한 번만 지연 로드해 libmypaint 문서를 만든다.
 * 메인 스레드·초기 번들은 이 모듈을 정적으로 가져오지 않는다.
 */
import {
  buildStudioMypaintCc0Program,
  findStudioMypaintCc0BrushRow,
  isStudioMypaintCc0BrushId,
} from "./studio-mypaint-cc0-library-program";

import type { StudioMypaintCc0Program } from "./studio-mypaint-cc0-library-program";
import type { StudioMypaintCc0BrushRow } from "./studio-mypaint-cc0-library-data.generated";

let rows: Promise<readonly StudioMypaintCc0BrushRow[]> | null = null;

function loadRows(): Promise<readonly StudioMypaintCc0BrushRow[]> {
  if (!rows) {
    const pending = import("./studio-mypaint-cc0-library-data.generated")
      .then((module) => module.STUDIO_MYPAINT_CC0_LIBRARY_ROWS);
    rows = pending;
    // 실패한 로드를 캐시하지 않는다. 다음 요청이 다시 시도한다.
    void pending.catch(() => { if (rows === pending) rows = null; });
  }
  return rows;
}

/** 라이브러리 브러시를 작업 색·지름으로 프로그램한다. 알 수 없는 id 는 명시적으로 거부한다. */
export async function loadStudioMypaintCc0Program(
  brushId: string,
  color: string,
  diameterPx: number,
): Promise<StudioMypaintCc0Program> {
  if (!isStudioMypaintCc0BrushId(brushId)) throw new TypeError(`허용하지 않는 MyPaint 브러시 id: ${String(brushId)}`);
  const row = findStudioMypaintCc0BrushRow(await loadRows(), brushId);
  if (!row) throw new Error(`CC0 MyPaint 라이브러리에 없는 브러시입니다: ${brushId}`);
  return buildStudioMypaintCc0Program(row, { color, diameterPx });
}
