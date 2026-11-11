import { CheckCircle2, CircleAlert, Download } from "lucide-react";

import { downloadIntegrationJson } from "./integration-platform-storage";
import type { PublishPackageResponse } from "./integration-platform-types";
import { downloadPreparedRss, type PublishFeedResult } from "./publish-prepared-file-downloads";

export function PublishPreparedFiles({ ko, result, feedResult }: {
  readonly ko: boolean;
  readonly result: PublishPackageResponse | null;
  readonly feedResult: PublishFeedResult | null;
}) {
  return <div className="space-y-5">
    {result ? <section aria-label={ko ? "게시 정보 JSON 결과" : "Publication JSON result"} className="space-y-4">
      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="flex items-center gap-2 font-bold text-fg">
          {result.ready ? <CheckCircle2 size={18} className="text-good" aria-hidden /> : <CircleAlert size={18} className="text-warn" aria-hidden />}
          {result.ready ? (ko ? "게시 정보 JSON 준비됨" : "Publication JSON prepared") : (ko ? "채널 정보 확인 필요" : "Check channel information")}
        </p>
        <p className="mt-2 text-sm leading-6 text-fg-2" role="status">{result.ready
          ? (ko ? "게시 정보 파일이 준비됐어요. 외부 게시와 예약은 아직 실행되지 않았습니다." : "The information file is prepared. External publication and scheduling have not run.")
          : (ko ? "채널 정보를 확인하세요. 게시가 실행되지 않았습니다." : "Review channel information. No publication has run.")}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-fg-3">{ko ? "제목" : "Title"}</dt><dd className="mt-1 break-words font-semibold text-fg">{result.title}</dd></div>
        <div><dt className="text-fg-3">{ko ? "후속 전달" : "Next handoff"}</dt><dd className="mt-1 font-semibold text-fg">{result.directlyExecutable ? (ko ? "연동 사용 가능 · 미게시" : "Integration available · unpublished") : (ko ? "수동 전달 필요" : "Manual handoff required")}</dd></div>
      </dl>
      <ul className="space-y-2">
        {result.channels.map((channel) => <li key={channel.id} className="flex gap-3 rounded-xl border border-line p-3 text-sm">
          {channel.valid ? <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-good" /> : <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-danger" />}
          <div className="min-w-0"><strong className="text-fg">{channel.name ?? channel.id}</strong>
            <span className="mt-1 block text-xs leading-5 text-fg-2">{channel.mode.startsWith("manual") ? (ko ? "수동 업로드" : "Manual upload") : (ko ? "채널 연동 정보" : "Channel integration information")} · {channel.executable ? (ko ? "연동 가능 · 실행 전" : "Integration available · not executed") : (ko ? "업로드 후 직접 확인" : "Confirm after uploading")}</span>
            {channel.reason ? <span className="mt-1 block text-xs leading-5 text-fg-2">{channel.reason}</span> : null}
          </div>
        </li>)}
      </ul>
      <p className="text-sm leading-6 text-fg-2">{ko ? "생성 결과는 게시 정보 JSON입니다. 이미지 변환·ZIP 생성·업로드·예약 등록·게시 완료를 뜻하지 않습니다." : "The output is publication metadata JSON. It does not convert images, create a ZIP, upload, schedule or complete publication."}</p>
      <details className="rounded-xl border border-line px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-fg-2">{ko ? "준비 파일 확인 정보" : "Prepared file details"}</summary>
        <div className="space-y-2 pb-3">{result.notices.map((notice) => <p key={notice} className="text-xs leading-5 text-fg-2">{notice}</p>)}<p className="break-all font-mono text-xs text-fg-3">sha256:{result.packageDigest}</p></div>
      </details>
    </section> : null}
    {feedResult ? <section aria-label={ko ? "피드 파일 결과" : "Feed file result"} className="space-y-3">
      <h3 className="font-bold text-fg">{ko ? "피드 미리보기 파일 준비됨" : "Feed preview files prepared"}</h3>
      <p className="text-sm leading-6 text-fg-2">{ko ? "파일을 내려받을 수 있습니다. 피드가 호스팅되거나 공개 주소가 개설된 것은 아닙니다." : "You can download the files. No feed is hosted and no public subscription address has been created."}</p>
      <div className="flex flex-wrap gap-2">
        {result ? <button type="button" onClick={() => downloadPreparedRss(feedResult)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold"><Download size={15} aria-hidden />RSS</button> : null}
        <button type="button" onClick={() => downloadIntegrationJson("feed.json", feedResult.jsonFeed)} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-semibold">JSON Feed</button>
        <button type="button" onClick={() => downloadIntegrationJson("activitypub.json", feedResult.activityPub)} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-semibold">ActivityPub</button>
      </div>
      <details className="rounded-xl border border-line px-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-fg-2">{ko ? "피드 파일 확인 정보" : "Feed file details"}</summary><p className="break-all pb-3 font-mono text-xs text-fg-3">sha256:{feedResult.digest}</p></details>
    </section> : null}
  </div>;
}
