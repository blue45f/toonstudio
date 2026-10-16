// 방·웹툰 배경을 추가한 직후의 안내 한 줄과, 그 결과를 바로잡는 버튼들("숨긴 벽 되돌리기", "새로 만든 곳 보기").
// 선택기와 방 만들기 패널이 같은 모양으로 쓴다. 무상태 — 문구와 동작은 부모가 정한다.
// 지연 청크(템플릿 탭)에서만 가져온다.

import { STUDIO_BG3D_FOCUS_BUILT_LABEL, STUDIO_BG3D_RESTORE_WALLS_LABEL } from "./studio-bg3d-build-notice";

export interface StudioBg3dBuildNoticeProps {
  readonly message: string | null;
  readonly disabled?: boolean;
  /** 주어지면 "숨긴 벽 되돌리기" 버튼을 그린다. */
  readonly onRestoreWalls?: (() => void) | undefined;
  /** 주어지면 "새로 만든 곳 보기" 버튼을 그린다(화면 밖에 만들었을 때). */
  readonly onFocusBuilt?: (() => void) | undefined;
}

const ACTION_BUTTON =
  "inline-flex min-h-9 items-center rounded-md border border-line bg-card px-2.5 text-[0.66rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

export function StudioBg3dBuildNotice({
  message,
  disabled = false,
  onRestoreWalls,
  onFocusBuilt,
}: StudioBg3dBuildNoticeProps) {
  return (
    <div className="mt-2">
      <p
        role="status"
        aria-live="polite"
        data-testid="studio-bg3d-build-notice"
        className="min-h-4 text-[0.65rem] leading-relaxed text-fg-3"
      >
        {message}
      </p>
      {onRestoreWalls || onFocusBuilt ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {onRestoreWalls ? (
            <button type="button" disabled={disabled} className={ACTION_BUTTON} onClick={() => onRestoreWalls()}>
              {STUDIO_BG3D_RESTORE_WALLS_LABEL}
            </button>
          ) : null}
          {onFocusBuilt ? (
            <button type="button" disabled={disabled} className={ACTION_BUTTON} onClick={() => onFocusBuilt()}>
              {STUDIO_BG3D_FOCUS_BUILT_LABEL}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
