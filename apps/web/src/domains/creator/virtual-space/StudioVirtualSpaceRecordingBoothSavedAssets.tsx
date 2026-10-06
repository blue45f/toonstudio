import { useEffect, useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  deleteStudioRecordingBoothAsset,
  listStudioRecordingBoothAssets,
  readStudioRecordingBoothAsset,
  type StudioRecordingBoothAssetView,
} from "./studio-recording-booth-asset-client";

export interface StudioVirtualSpaceRecordingBoothSavedAssetsProps {
  readonly workId: string;
  /** 저장 완료된 테이크 수. 바뀌면 목록을 다시 읽는다. */
  readonly refreshKey: number;
}

function formatClock(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 전사가 없는 테이크라, 검수 음성 메모의 폴백과 같은 결로 이름 자막 트랙을 단다. */
function nameCaptionTrack(name: string, durationMs: number): string {
  const totalSec = Math.max(1, Math.ceil(durationMs / 1000));
  const end = `${String(Math.floor(totalSec / 60)).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}.000`;
  const body = `WEBVTT\n\n00:00.000 --> ${end}\n${name.replace(/[\r\n]+/gu, " ")}\n`;
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(body)}`;
}

/**
 * 프로젝트에 저장된 부스 테이크 목록. 부스 패널이 마운트될 때와 새 테이크가
 * 저장될 때마다 서버 목록을 다시 읽는다 — 목록의 정본은 서버다.
 * 불러오기 실패는 빈 목록으로 위장하지 않고 재시도 동선을 남긴다.
 */
export function StudioVirtualSpaceRecordingBoothSavedAssets({ workId, refreshKey }: StudioVirtualSpaceRecordingBoothSavedAssetsProps) {
  const bt = useBilingual("StudioVirtualSpaceRecordingBoothSavedAssets");
  const [items, setItems] = useState<readonly StudioRecordingBoothAssetView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [playing, setPlaying] = useState<{ readonly assetId: string; readonly url: string } | null>(null);
  const [playFailedId, setPlayFailedId] = useState<string | null>(null);
  const [deleteFailedId, setDeleteFailedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listStudioRecordingBoothAssets(workId)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [workId, refreshKey, reloadToken]);

  const play = async (assetId: string) => {
    setPlayFailedId(null);
    try {
      const result = await readStudioRecordingBoothAsset(workId, assetId);
      setPlaying({ assetId, url: result.signedRead.url });
    } catch {
      setPlayFailedId(assetId);
    }
  };

  const remove = async (view: StudioRecordingBoothAssetView) => {
    setDeleteFailedId(null);
    setDeletingId(view.asset.id);
    try {
      await deleteStudioRecordingBoothAsset(workId, view.asset.id, {
        operationId: `booth-delete:${view.asset.id}:${view.asset.sha256.slice(0, 16)}`,
        expectedSha256: view.asset.sha256,
      });
      setItems((previous) => previous?.filter((item) => item.asset.id !== view.asset.id) ?? previous);
      setPlaying((previous) => (previous?.assetId === view.asset.id ? null : previous));
    } catch {
      setDeleteFailedId(view.asset.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-label={bt("프로젝트에 저장된 테이크", "Takes saved to this project")}>
      <h3>{bt("프로젝트에 저장된 테이크", "Takes saved to this project")}</h3>
      {items === null && !loadFailed ? (
        <p role="status">{bt("저장된 테이크를 불러오는 중이에요.", "Loading saved takes.")}</p>
      ) : null}
      {loadFailed && items === null ? (
        <>
          <p role="alert">{bt("저장된 테이크를 불러오지 못했어요.", "Couldn't load the saved takes.")}</p>
          <button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            {bt("다시 시도", "Retry")}
          </button>
        </>
      ) : null}
      {items !== null && items.length === 0 ? (
        <p className="space-panel-note">{bt("아직 프로젝트에 저장된 테이크가 없어요.", "No takes saved to this project yet.")}</p>
      ) : null}
      {items !== null && items.length > 0 ? (
        <ul>
          {items.map((view) => {
            const { asset } = view;
            const isPlaying = playing?.assetId === asset.id;
            return (
              <li key={asset.id}>
                <span>
                  {asset.name} · {formatClock(Math.round(asset.durationMs / 1000))}
                  {` · ${new Date(asset.createdAt).toLocaleDateString()}`}
                </span>
                {isPlaying ? (
                  <>
                    <audio controls autoPlay src={playing.url} aria-label={asset.name}>
                      <track kind="captions" src={nameCaptionTrack(asset.name, asset.durationMs)} srcLang="ko" label={bt("테이크 이름", "Take name")} default />
                    </audio>
                    <button type="button" onClick={() => setPlaying(null)}>
                      <Square size={14} aria-hidden />{bt("닫기", "Close")}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { void play(asset.id); }}>
                    <Play size={14} aria-hidden />{bt("재생", "Play")}
                  </button>
                )}
                {view.canDelete ? (
                  <button type="button" disabled={deletingId === asset.id} onClick={() => { void remove(view); }}>
                    <Trash2 size={14} aria-hidden />{bt("삭제", "Delete")}
                  </button>
                ) : null}
                {playFailedId === asset.id ? (
                  <span role="alert">{bt("재생을 준비하지 못했어요.", "Couldn't prepare playback.")}</span>
                ) : null}
                {deleteFailedId === asset.id ? (
                  <span role="alert">{bt("삭제하지 못했어요. 다시 시도해 주세요.", "Couldn't delete it. Please try again.")}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export default StudioVirtualSpaceRecordingBoothSavedAssets;
