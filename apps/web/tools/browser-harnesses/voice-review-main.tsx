import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { VoiceCommentaryTrack } from "@/domains/creator/production-hub/review-voice-commentary-model";
import type { VoiceCompareCapture } from "@/domains/creator/production-hub/voice-compare-view";

import { createEmptyCompareSession, poolItemFromExternal, type CompareSession } from "@/domains/creator/production-hub/compare-review-model";
import { CompareReviewViewer } from "@/domains/creator/production-hub/CompareReviewViewer";
import { ReviewVoiceCommentaryPanel } from "@/domains/creator/production-hub/ReviewVoiceCommentaryPanel";
import { useEpisodeVoiceCommentary } from "@/domains/creator/production-hub/use-episode-voice-commentary";
import { useVoiceCompareBridge } from "@/domains/creator/production-hub/use-voice-compare-bridge";
import { createEmptyStudioCommentsDocument } from "@/domains/creator/studio-comments";
import { useI18n } from "@/shared/lib/i18n";
import "@/app/styles/globals.css";

// 이 파일은 실제 컴포넌트의 조작 검증용이다. API 응답·원고는 합성이며 실제 서버 인가/저장을 증명하지 않는다.
const image = (label: string, color: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="${color}"/><rect x="100" y="200" width="600" height="800" fill="white" stroke="black" stroke-width="12"/><text x="180" y="550" font-size="72">${label}</text><path d="M100 200L700 1000M700 200L100 1000" stroke="black" stroke-width="8"/></svg>`)}`;
const pool = [
  poolItemFromExternal({ assetId: "voice-story", label: "콘티 고정본", imageUrl: image("STORY", "#e5e7eb"), addedBy: "fixture-reviewer", addedAt: "2026-10-30T00:00:00Z" }),
  poolItemFromExternal({ assetId: "voice-line", label: "선화 고정본", imageUrl: image("LINE", "#bfdbfe"), addedBy: "fixture-reviewer", addedAt: "2026-10-30T00:00:00Z" }),
  poolItemFromExternal({ assetId: "voice-color", label: "채색 고정본", imageUrl: image("COLOR", "#fde68a"), addedBy: "fixture-reviewer", addedAt: "2026-10-30T00:00:00Z" }),
];
const initialSession: CompareSession = { ...createEmptyCompareSession("voice-fixture-episode"), pool, panes: [pool[0].source, pool[1].source] };
const emptyManuscript = createEmptyStudioCommentsDocument();
interface RecordingReceipt { readonly byteSize: number; readonly mimeType: string | null; readonly track: VoiceCommentaryTrack }

function Fixture() {
  const lang = useI18n((state) => state.lang), setLang = useI18n((state) => state.setLang);
  const [tab, setTab] = useState<"viewer" | "compare">("compare");
  const [session, setSession] = useState(initialSession);
  const [comments, setComments] = useState(createEmptyStudioCommentsDocument);
  const [pinMode, setPinMode] = useState(false);
  const [receipt, setReceipt] = useState<RecordingReceipt | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [observed, setObserved] = useState<VoiceCompareCapture | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null), programmaticScrollRef = useRef(false);
  const compare = useVoiceCompareBridge();
  const voice = useEpisodeVoiceCommentary({ projectId: "voice-fixture-project", episodeId: "voice-fixture-episode", isDemo: false,
    tab, setTab, comments: emptyManuscript, compareComments: comments, compareItems: [], pageId: "voice-fixture-page",
    panelRef, programmaticScrollRef, captureCompareView: compare.capture, applyCompareView: compare.apply });
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  const save = useCallback((track: VoiceCommentaryTrack, blob: Blob | null) => {
    // 검증 전용 다운로드 URL은 제품 URL과 별도로 소유한다. 제품의 URL 해제/메모리 증거로 사용하지 않는다.
    setDownloadUrl(blob ? URL.createObjectURL(blob) : null);
    setReceipt({ byteSize: blob?.size ?? 0, mimeType: blob?.type ?? null, track: { ...track, audio: null } });
    voice.handleSaveVoiceTrack(track, blob);
  }, [voice.handleSaveVoiceTrack]);

  return <main className="mx-auto max-w-6xl p-4 text-fg">
    <h1 className="text-xl font-bold">음성 검토 · 실제 브라우저 조작 검증</h1>
    <p className="my-3 text-sm">원고와 API 응답은 합성입니다. Chromium의 실제 마이크·MediaRecorder와 실제 검토 컴포넌트를 사용하며, 서버 인가·DB·운영 배포의 증거가 아닙니다.</p>
    <nav className="mb-4 flex flex-wrap items-center gap-3" aria-label="검증 화면">
      <label>검증 언어 <select className="min-h-11 border border-line bg-panel px-2" aria-label="검증 언어" value={lang} onChange={(event) => setLang(event.target.value === "en" ? "en" : "ko")}><option value="ko">한국어</option><option value="en">English</option></select></label>
      <button type="button" className="min-h-11 border border-line px-3" aria-pressed={tab === "compare"} onClick={() => setTab("compare")}>비교 탭</button>
      <button type="button" className="min-h-11 border border-line px-3" aria-pressed={tab === "viewer"} onClick={() => setTab("viewer")}>원고 탭</button>
      <button type="button" className="min-h-11 border border-line px-3" onClick={() => setObserved(compare.capture())}>현재 비교 상태 읽기</button>
    </nav>
    <div ref={panelRef} className="min-w-0">
      {tab === "compare" ? <CompareReviewViewer session={session} onSessionChange={setSession} comments={comments} onCommentsChange={setComments}
        currentActor={{ id: "fixture-reviewer", displayName: "검증 검수자" }} pinMode={pinMode} onPinModeChange={setPinMode}
        onVoiceCompareControllerChange={compare.register} /> : <p>원고 탭 합성 안내 — 비교 뷰어는 현재 해제되어 있습니다.</p>}
    </div>
    <div className="mt-5 rounded-2xl border border-line bg-panel p-4" data-testid="voice-panel">
      <ReviewVoiceCommentaryPanel episodeId="voice-fixture-episode" tracks={voice.voiceTracks}
        authorName="검증 검수자" authorId="fixture-reviewer" loading={voice.voiceListState === "loading"}
        error={[voice.voiceSaveError, voice.voiceListState === "error" ? "검증 목록 요청 실패" : null].filter(Boolean).join("\n") || null}
        captureView={voice.captureVoiceView} onSaveTrack={save} onPreparePlayback={voice.handlePrepareVoicePlayback}
        onApplyView={voice.applyVoiceView} onOpenPin={voice.handleOpenVoicePin} />
    </div>
    <section className="mt-5 space-y-3 rounded-2xl border border-line p-4" aria-label="테스트 관측">
      <h2 className="font-bold">테스트 전용 관측</h2>
      <output aria-label="목록 상태" className="block">{voice.voiceListState}</output>
      {downloadUrl ? <a className="inline-flex min-h-11 items-center border border-line px-3" href={downloadUrl} download="voice-recording.webm">녹음 파일 다운로드</a> : null}
      {downloadUrl ? <audio aria-label="녹음 파일 검사" controls preload="metadata" src={downloadUrl} /> : null}
      <output aria-label="녹음 결과" className="block whitespace-pre-wrap break-all">{receipt ? JSON.stringify(receipt) : "null"}</output>
      <output aria-label="현재 비교 상태" className="block whitespace-pre-wrap break-all">{observed ? JSON.stringify(observed) : "null"}</output>
    </section>
  </main>;
}
const host = document.getElementById("test-root");
if (!host) throw new Error("음성 검토 fixture 컨테이너가 없습니다.");
createRoot(host).render(<Fixture />);
