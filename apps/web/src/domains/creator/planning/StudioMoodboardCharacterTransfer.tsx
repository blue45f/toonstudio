import { useEffect, useRef, useState } from "react";

import { readStudioProjectDiagnosticSource, STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT } from "../studio-project-diagnostic-source-store";
import { updateStudioProjectWorkspaceState } from "../studio-project-workspace-store";

import { upsertStoryCharacterProfile } from "./studio-character-profile";
import { readDeviceMoodboard } from "./studio-moodboard-device-store";
import { type Moodboard } from "./studio-moodboard";
import { applyCharacterProfileDraftFromMoodboard, deriveCharacterProfileDraftFromMoodboard } from "./studio-moodboard-web-collect";

const fields = [["background", "배경 이야기"], ["motivation", "목표"], ["appearanceNotes", "외형 메모"]] as const;

function readSource(projectId: string) {
  try {
    return readStudioProjectDiagnosticSource(window.localStorage, projectId);
  } catch {
    return null;
  }
}

function buildPreview(projectId: string, board: Moodboard, cardIds: readonly string[], characterId: string) {
  const source = readSource(projectId);
  if (board.projectId !== projectId || !source?.story.bible.characters.some(character => character.id === characterId)) return null;
  const draft = deriveCharacterProfileDraftFromMoodboard(board, cardIds, characterId);
  const original = source.story.narrative.profiles.find(profile => profile.characterId === characterId) ?? null;
  const next = applyCharacterProfileDraftFromMoodboard(original, draft);
  return { draft, original, next };
}

export function StudioMoodboardCharacterTransfer({ projectId, board, cardIds, onAvailability }: {
  projectId: string; board: Moodboard; cardIds: readonly string[]; onAvailability: (available: boolean) => void;
}) {
  const [source, setSource] = useState(() => readSource(projectId));
  const [characterId, setCharacterId] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof buildPreview>>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setSource(readSource(projectId));
    window.addEventListener("storage", refresh);
    window.addEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, refresh);
    };
  }, [projectId]);
  const characters = source?.story.bible.characters ?? [];
  useEffect(() => { onAvailability(characters.length > 0); }, [characters.length, onAvailability]);
  const character = characters.find(item => item.id === characterId);
  const selectedDraft = character && deriveCharacterProfileDraftFromMoodboard(board, cardIds, character.id);
  const visible = preview && selectedDraft && JSON.stringify(preview.draft) === JSON.stringify(selectedDraft) ? preview : null;
  const changed = visible && fields.some(([field]) => visible.next[field] !== (visible.original?.[field] ?? ""));
  const validation = useRef<AbortController | null>(null);
  useEffect(() => () => validation.current?.abort(), [projectId, visible]);
  async function apply() {
    if (!visible || !changed || !character || validation.current) return;
    const request = new AbortController();
    validation.current = request;
    setError("");
    try {
      const stored = await readDeviceMoodboard(projectId);
      if (request.signal.aborted) return;
      if (stored?.kind !== "ready" || stored.board.projectId !== projectId
        || JSON.stringify(deriveCharacterProfileDraftFromMoodboard(stored.board, cardIds, character.id)) !== JSON.stringify(visible.draft)) {
        setPreview(null);
        setError("선택한 카드가 바뀌었어요. 보드의 최신 내용을 확인하고 다시 미리 보세요.");
        return;
      }
      const next = updateStudioProjectWorkspaceState(window.localStorage, projectId, current => {
        const latest = current.story.narrative.profiles.find(profile => profile.characterId === character.id) ?? null;
        if (!current.story.bible.characters.some(item => item.id === character.id) || JSON.stringify(latest) !== JSON.stringify(visible.original)) {
          throw new Error("profile-changed");
        }
        const narrative = upsertStoryCharacterProfile(current.story.narrative, applyCharacterProfileDraftFromMoodboard(latest, visible.draft));
        return { ...current, story: { ...current.story, narrative } };
      }, { target: window });
      setSource(next);
      setPreview(null);
      setStatus(`${character.name}의 인물 시트를 이 기기에 저장했어요.`);
    } catch (cause) {
      if (request.signal.aborted) return;
      if (cause instanceof Error && cause.message === "profile-changed") {
        setSource(readSource(projectId));
        setPreview(null);
        setError("인물 시트가 바뀌었어요. 최신 내용을 다시 미리 보세요.");
      } else setError("인물 시트를 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도하세요.");
    } finally { validation.current = null; }
  }
  return <section aria-label="보드에서 인물 시트로" className="mt-3 space-y-2 rounded-lg border border-line bg-panel p-3">
    <h3 className="text-sm font-bold">인물 시트에 메모 추가</h3>
    {characters.length ? <>
      <label>이 작품의 인물 <select value={character?.id ?? ""} onChange={event => {
        setCharacterId(event.target.value); setPreview(null); setError(""); setStatus("");
      }}><option value="">인물 선택</option>{characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="button" disabled={!character || !selectedDraft || !fields.some(([field]) => selectedDraft[field])} onClick={() => {
        setError(""); setStatus(""); setPreview(buildPreview(projectId, board, cardIds, characterId));
      }}>고른 카드로 인물 시트 미리 보기</button>
    </> : <p>이 작품에 등록된 인물이 없습니다. 스토리월드에 인물을 등록하면 보드의 메모를 시트에 추가할 수 있어요.</p>}
    {visible && <div aria-label="인물 시트 미리 보기" role="group" className="space-y-2">
      <strong>{character?.name} · 적용 후 내용</strong>
      {fields.filter(([field]) => visible.draft[field]).map(([field, label]) => <div key={field}>
        <h4>{label}</h4><p className="whitespace-pre-wrap">{visible.next[field]}</p>
      </div>)}
      {changed ? <button type="button" onClick={apply}>인물 시트에 추가</button> : <p>선택한 카드 내용이 이미 시트에 있어요.</p>}
      <button type="button" onClick={() => { setPreview(null); setError(""); }}>미리 보기 닫기</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
  </section>;
}
