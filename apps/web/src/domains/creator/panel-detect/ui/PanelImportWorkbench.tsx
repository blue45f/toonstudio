"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { PanelCardFlow } from "./PanelCardFlow";
import { PanelNotice } from "./PanelNotice";
import { PanelReflowFlow } from "./PanelReflowFlow";
import { PanelSourceStep, type PanelSourceReady } from "./PanelSourceStep";
import { PanelImportEnvironmentContext, resolvePanelImportEnvironment, type PanelImportEnvironment } from "./panel-import-env";
import { usePanelT } from "./use-panel-t";

export type PanelImportMode = "reflow" | "cards";

interface PanelImportWorkbenchProps {
  readonly mode: PanelImportMode;
  readonly onClose: () => void;
  /** 시험·특수 환경에서 디코딩·감지·캔버스·다운로드를 바꿔 끼운다. 운영은 생략한다. */
  readonly environment?: Partial<PanelImportEnvironment>;
}

interface Session {
  readonly ready: PanelSourceReady;
  readonly previewUrl: string;
}

/**
 * 컷 가져오기 작업대 — 권리 확인과 원고 선택(1단계) 뒤에 모드별 흐름(컷 감지·재배열 / 카드뉴스)을 잇는다.
 * 원고 이미지와 미리보기 주소는 여기서 한 번 만들고, 다른 원고를 고르거나 닫을 때 해제한다.
 */
export function PanelImportWorkbench({ mode, onClose, environment }: PanelImportWorkbenchProps): ReactElement {
  const t = usePanelT();
  const env = useMemo(() => resolvePanelImportEnvironment(environment), [environment]);
  const [session, setSession] = useState<Session | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // 환경 객체가 바뀌어도 해제 시점은 원고(session)가 바뀌거나 작업대가 닫힐 때뿐이어야 한다.
  const envRef = useRef(env);
  useEffect(() => {
    envRef.current = env;
  }, [env]);

  // 원고를 바꾸거나 작업대를 닫을 때 디코딩된 이미지와 미리보기 주소를 해제한다(브라우저 자원 동기화).
  useEffect(() => {
    if (!session) return undefined;
    return () => {
      envRef.current.revokePreviewUrl(session.previewUrl);
      session.ready.source.dispose();
    };
  }, [session]);

  const onReady = (ready: PanelSourceReady): void => {
    setSession({ ready, previewUrl: env.createPreviewUrl(ready.file) });
  };

  const reset = (): void => {
    setConfirmingReset(false);
    setSession(null);
  };

  return (
    <PanelImportEnvironmentContext.Provider value={env}>
      <div className="grid gap-4" data-panel-workbench={mode}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black text-fg">
            {mode === "reflow" ? t("panelImport.mode.reflow.title") : t("panelImport.mode.cards.title")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {session ? (
              <button type="button" onClick={() => setConfirmingReset(true)} className={buttonClass({ variant: "outline", size: "sm" })}>
                {t("panelImport.workbench.chooseAnother")}
              </button>
            ) : null}
            <button type="button" onClick={onClose} aria-label={t("panelImport.workbench.closeLabel")} className={cn(buttonClass({ variant: "quiet", size: "sm" }))}>
              <X size={15} aria-hidden="true" />
              {t("panelImport.common.close")}
            </button>
          </div>
        </div>

        {confirmingReset ? (
          <PanelNotice
            tone="warn"
            live="alert"
            actions={
              <>
                <button type="button" onClick={reset} className={buttonClass({ size: "sm" })}>{t("panelImport.workbench.startOver")}</button>
                <button type="button" onClick={() => setConfirmingReset(false)} className={buttonClass({ variant: "outline", size: "sm" })}>{t("panelImport.workbench.keepWorking")}</button>
              </>
            }
          >
            {t("panelImport.workbench.confirmReset")}
          </PanelNotice>
        ) : null}

        {session ? (
          mode === "reflow"
            ? <PanelReflowFlow ready={session.ready} previewUrl={session.previewUrl} />
            : <PanelCardFlow ready={session.ready} previewUrl={session.previewUrl} />
        ) : (
          <PanelSourceStep mode={mode} onReady={onReady} />
        )}
      </div>
    </PanelImportEnvironmentContext.Provider>
  );
}
