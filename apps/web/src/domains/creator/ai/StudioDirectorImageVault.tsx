import { useState } from "react";

import { hasPersistedUserAiVault, unlockUserAiVault, useUserAi } from "@/shared/ai/user-ai-store";
import { USER_AI_SETTINGS_HREF } from "@/shared/ai/user-ai-types";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function StudioDirectorImageVault() {
  const bt = useBilingual("studio.director.imageVault");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { configuration } = useUserAi();
  if (!hasPersistedUserAiVault() || configuration.connections.length > 0) {
    return <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel p-3">
      <p className="text-xs text-fg-2">{bt("이미지 제작 연결이 필요해요. AI 설정에서 이미지 모델과 키를 연결하고, 이 기기에 암호화 저장한 뒤 돌아오세요.", "Connect an image model and key in AI settings, save the encrypted vault on this device, then return here.")}</p>
      <a href={USER_AI_SETTINGS_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-xs font-semibold">
        {bt("AI 설정 열기 (새 탭)", "Open AI settings (new tab)")}
      </a>
    </div>;
  }
  return <form className="mb-3 rounded-lg border border-line bg-panel p-3" onSubmit={async event => {
    event.preventDefault();
    if (busy || password.length < 12) return;
    setBusy(true);
    setError("");
    try {
      await unlockUserAiVault(password);
      setPassword("");
    } catch {
      setError(bt("잠금을 해제하지 못했습니다. 보관함 비밀번호를 확인하세요.", "Could not unlock the vault. Check its password."));
    } finally {
      setBusy(false);
    }
  }}>
    <p className="mb-2 text-xs text-fg-2">{bt("이 원고에서 이미지를 제작하려면 개인 AI 보관함을 열어 주세요.", "Unlock your personal AI vault to generate images in this document.")}</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs font-semibold">{bt("AI 보관함 비밀번호", "AI vault password")}
        <input type="password" autoComplete="current-password" value={password} maxLength={1024} onChange={event => setPassword(event.target.value)}
          className="min-h-11 rounded-md border border-line bg-canvas px-2 text-fg" />
      </label>
      <button type="submit" disabled={busy || password.length < 12} className="min-h-11 rounded-md border border-line px-3 text-xs font-semibold disabled:opacity-50">
        {bt("이 원고에서 잠금 해제", "Unlock in this document")}
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
  </form>;
}
