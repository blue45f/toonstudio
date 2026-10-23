/**
 * 3D 데생 인형 머리글 보조 동작 — JSON 내보내기·가져오기·공유 링크·사진 포즈.
 *
 * 넓은 화면(sm 이상)에서는 예전처럼 머리글에 버튼으로 늘어놓고, 휴대폰 폭에서는 ⋯ 메뉴
 * 하나로 모은다. 예전 머리글은 `hidden … sm:flex` 한 줄이라 휴대폰에서 네 버튼이 0×0으로
 * 사라져 JSON 저장·불러오기·공유 경로가 아예 없었다.
 *
 * 메뉴는 Radix DropdownMenu가 키보드(화살표·Enter·Esc)와 초점 복귀를 맡는다. 포털 대상을
 * 가장 가까운 대화상자로 잡아 메뉴가 aria-modal 범위와 대화상자 쌓임 순서 안에 머문다.
 * 메뉴 항목과 ⋯ 버튼은 터치 기준 44px 이상이다.
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Download, ImageIcon, MoreHorizontal, Share2, Upload } from "lucide-react";
import { useCallback, useState, type ReactElement, type ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";

interface HeaderAction {
  readonly id: "export" | "import" | "share" | "photo";
  readonly label: string;
  readonly title: string;
  readonly icon: ReactNode;
  readonly onSelect: () => void;
}

export interface StudioMannequinPoserHeaderActionsProps {
  readonly onExportJson: () => void;
  readonly onImportJson: () => void;
  readonly onCopyShareLink: () => void;
  /** 공유 링크 복사에 성공한 직후 잠깐 true. */
  readonly copiedLink: boolean;
  readonly onOpenPhotoPose: () => void;
}

const DESKTOP_BUTTON_CLASS = buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" });
const MENU_ITEM_CLASS =
  "flex min-h-11 w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 text-sm text-fg-2 outline-none transition-colors data-[highlighted]:bg-raised data-[highlighted]:text-fg";

export function StudioMannequinPoserHeaderActions({
  onExportJson,
  onImportJson,
  onCopyShareLink,
  copiedLink,
  onOpenPhotoPose,
}: StudioMannequinPoserHeaderActionsProps): ReactElement {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  // 메뉴 포털을 가장 가까운 대화상자 안에 둔다(쌓임 순서·aria-modal 범위 유지).
  const triggerRef = useCallback((node: HTMLButtonElement | null) => {
    setPortalContainer(node ? node.closest<HTMLElement>('[role="dialog"]') : null);
  }, []);

  const actions: readonly HeaderAction[] = [
    {
      id: "export",
      label: "내보내기",
      title: "포즈 및 체형 JSON 다운로드",
      icon: <Download size={13} aria-hidden />,
      onSelect: onExportJson,
    },
    {
      id: "import",
      label: "가져오기",
      title: "JSON 포즈 파일 불러오기",
      icon: <Upload size={13} aria-hidden />,
      onSelect: onImportJson,
    },
    {
      id: "share",
      label: "공유",
      title: "공유 해시 URL 복사",
      icon: copiedLink ? <Check size={13} className="text-accent" aria-hidden /> : <Share2 size={13} aria-hidden />,
      onSelect: onCopyShareLink,
    },
    {
      id: "photo",
      label: "사진 포즈",
      title: "MediaPipe 사진 포즈 스캐너 열기",
      icon: <ImageIcon size={13} aria-hidden />,
      onSelect: onOpenPhotoPose,
    },
  ];

  return (
    <>
      <div className="hidden items-center gap-1 sm:flex" data-studio-mannequin-header-actions="inline">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onSelect}
            className={DESKTOP_BUTTON_CLASS}
            title={action.title}
          >
            {action.icon} {action.label}
          </button>
        ))}
      </div>
      <div className="sm:hidden" data-studio-mannequin-header-actions="menu">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label="데생 인형 파일·공유 메뉴 (내보내기·가져오기·공유·사진 포즈)"
              title="내보내기·가져오기·공유·사진 포즈"
              className={buttonClass({ size: "icon", variant: "quiet", className: "size-11" })}
            >
              {copiedLink ? <Check size={16} className="text-accent" aria-hidden /> : <MoreHorizontal size={16} aria-hidden />}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal container={portalContainer ?? undefined}>
            <DropdownMenu.Content
              align="start"
              sideOffset={6}
              collisionPadding={8}
              aria-label="데생 인형 파일·공유"
              className="z-30 min-w-[13rem] rounded-xl border border-line-strong bg-panel p-1 shadow-2xl"
            >
              {actions.map((action) => (
                <DropdownMenu.Item key={action.id} onSelect={action.onSelect} className={MENU_ITEM_CLASS}>
                  {action.icon}
                  <span className="min-w-0 flex-1">{action.label}</span>
                  <span className="sr-only"> — {action.title}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {copiedLink ? "공유 링크를 복사했습니다." : ""}
      </span>
    </>
  );
}
