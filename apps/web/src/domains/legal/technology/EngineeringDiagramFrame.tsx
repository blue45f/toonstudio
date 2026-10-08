import { Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EngineeringDiagramView } from "./EngineeringDiagramView";
import type { EngineeringDiagram } from "./engineering-diagram-types";
import "./engineering-surfaces.css";

import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale("EngineeringDiagramFrame", ko, en);

/**
 * 페이지 안의 도식 + "크게 보기" 대화상자.
 * 본문 폭(약 830px)에서는 6열짜리 도식의 글자가 작아지므로, 발표 중에도 쓸 수 있게 한 번에 화면 폭으로 키워 보여준다.
 * 네이티브 `<dialog>` 를 쓰므로 배경 비활성화·포커스 가둠·Esc 닫기·포커스 복귀를 브라우저가 처리한다.
 * 큰 도식은 열릴 때만 한 번 더 그려 카드 수만큼 SVG 가 늘어나지 않는다.
 */
export function EngineeringDiagramFrame({ diagram, className }: { readonly diagram: EngineeringDiagram; readonly className?: string }) {
  useBilingualI18nRevision();
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const title = bi(diagram.title.ko, diagram.title.en);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!zoomed || !dialog) return undefined;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, [zoomed]);

  const close = (): void => {
    setZoomed(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="eng-dia-frame">
      <EngineeringDiagramView diagram={diagram} className={className} />
      <button ref={triggerRef} type="button" className="eng-dia-frame__zoom" aria-haspopup="dialog" onClick={() => setZoomed(true)}>
        <Maximize2 size={13} aria-hidden="true" />
        {bi("크게 보기", "Enlarge")}
        <span className="sr-only"> · {title}</span>
      </button>
      {zoomed ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- 배경(backdrop) 클릭으로 닫는 것은 마우스 편의 기능이고, 키보드는 Esc 와 닫기 버튼으로 닫는다.
        <dialog
          ref={dialogRef}
          className="eng-dia-zoom"
          aria-label={title}
          onClose={close}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <button type="button" className="eng-dia-zoom__close" onClick={close}>
            <X size={15} aria-hidden="true" />
            {bi("닫기", "Close")}
          </button>
          <EngineeringDiagramView diagram={diagram} />
        </dialog>
      ) : null}
    </div>
  );
}
