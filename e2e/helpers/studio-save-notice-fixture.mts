import { buildStudioReactFixture } from "./studio-react-fixture.mjs";

export const STUDIO_SAVE_NOTICE_FIXTURE_EVENT = "studio-save-notice-fixture";

/** 안내 데이터만 제어하고 요약 버튼·상세 대화상자·포커스 복귀는 실제 제품 컴포넌트로 검사한다. */
export async function buildStudioSaveNoticeFixture(): Promise<string> {
  return buildStudioReactFixture(`
    import { useEffect, useState } from "react";
    import { createPortal } from "react-dom";
    import { createRoot } from "react-dom/client";
    import { StudioSaveSyncStatusCenter } from "./domains/creator/StudioSaveSyncStatusCenter";
    import { createEmptyOperationJournal } from "./domains/creator/studio-operation-recovery-coordinator";
    import { useEditorStatusSlot, useServiceStatusSlot } from "./shared/lib/modal-status-slot";

    const journal = createEmptyOperationJournal("chrome-layout-fixture");
    function NoticeSlots() {
      const editor = useEditorStatusSlot(), active = useServiceStatusSlot();
      const [messages, setMessages] = useState([]);
      useEffect(() => {
        const update = event => {
          if (event instanceof CustomEvent && Array.isArray(event.detail)
              && event.detail.every(message => typeof message === "string")) setMessages(event.detail);
        };
        window.addEventListener("${STUDIO_SAVE_NOTICE_FIXTURE_EVENT}", update);
        return () => window.removeEventListener("${STUDIO_SAVE_NOTICE_FIXTURE_EVENT}", update);
      }, []);
      if (!editor) return null;
      const summary = active?.kind === "modal" ? active.element : editor.summary;
      return <>
        <span hidden data-studio-fixture-notice-count={messages.length}/>
        {messages.map(message => createPortal(
          <span role="status" data-studio-offline-important="true">{message}</span>, summary, message))}
        {createPortal(<section className="space-y-3" data-studio-fixture-notice-details="true">
          {messages.map(message => <p key={message} data-studio-fixture-notice-full="true">{message}</p>)}
        </section>, editor.element)}
      </>;
    }
    function Fixture() {
      const [retries, setRetries] = useState(0), [backups, setBackups] = useState(0);
      return <>
        <StudioSaveSyncStatusCenter journal={journal} presentation="drawing" isOpfsActive={false}
          onRetrySave={() => setRetries(value => value + 1)}
          onDownloadLocalBackup={() => setBackups(value => value + 1)}/>
        <NoticeSlots/>
        <span hidden data-studio-fixture-retries={retries} data-studio-fixture-backups={backups}/>
      </>;
    }
    createRoot(document.getElementById("studio-save-fixture")).render(<Fixture/>);
  `);
}
