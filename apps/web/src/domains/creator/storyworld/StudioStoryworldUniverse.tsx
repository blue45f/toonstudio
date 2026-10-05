/**
 * 공유 세계관(유니버스) 관리 탭.
 *
 * 여러 작품이 한 세계관 묶음에 속하고, 캐릭터·장소·사실을 작품 간 공유 요소로
 * 명시 지정·해제하는 화면. 지정은 참조 기록일 뿐 데이터를 복사하지 않으며,
 * 자동 연결(제목 유사 등)은 제공하지 않는다.
 *
 * 경계: 레지스트리는 이 브라우저의 로컬 DB에만 있다. 서버 동기화·협업자 공유는
 * 서버 계약이 필요하고, 다른 작품의 로컬 요소 실재 여부는 그 작품을 열 때만
 * 확정할 수 있어 멤버 표에는 지정 시점 스냅샷으로 표시한다.
 */
import { Globe2, Link2, Link2Off, Plus, Save, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { StoryworldProject } from "./studio-storyworld-causality";
import {
  addStoryworldSharedElement,
  buildStoryworldUniverseMatrix,
  createStoryworldUniverse,
  deleteStoryworldUniverse,
  designateStoryworldSharedUsage,
  joinStoryworldUniverse,
  leaveStoryworldUniverse,
  parseStoryworldTagInput,
  removeStoryworldSharedElement,
  revokeStoryworldSharedUsage,
  updateStoryworldSharedElement,
  updateStoryworldUniverse,
  type StoryworldSharedElement,
  type StoryworldSharedElementKind,
  type StoryworldUniverse,
  type StoryworldUniverseRegistry,
} from "./studio-storyworld-universe";
import { loadStoryworldUniverseRegistry, saveStoryworldUniverseRegistry } from "./universe-store";

const SHARED_KIND_LABELS: Readonly<Record<StoryworldSharedElementKind, string>> = {
  character: "캐릭터",
  location: "장소",
  fact: "사실",
};

function localElements(
  project: StoryworldProject,
  kind: StoryworldSharedElementKind,
): readonly { readonly id: string; readonly label: string }[] {
  if (kind === "character") return project.characters.map((character) => ({ id: character.id, label: character.name }));
  if (kind === "fact") return project.facts.map((fact) => ({ id: fact.id, label: fact.label }));
  const locations = new Map<string, string>();
  for (const scene of project.scenes) {
    if (scene.locationId && !locations.has(scene.locationId)) locations.set(scene.locationId, scene.locationId);
  }
  return [...locations.entries()].map(([id, label]) => ({ id, label }));
}

function SharedElementCard({ registry, universe, element, project, scopeKey, onCommit }: {
  readonly registry: StoryworldUniverseRegistry;
  readonly universe: StoryworldUniverse;
  readonly element: StoryworldSharedElement;
  readonly project: StoryworldProject;
  readonly scopeKey: string;
  readonly onCommit: (registry: StoryworldUniverseRegistry) => void;
}) {
  const [name, setName] = useState(element.name);
  const [description, setDescription] = useState(element.description ?? "");
  const [tags, setTags] = useState((element.tags ?? []).join(", "));
  const [localId, setLocalId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const options = localElements(project, element.kind);
  const myUsage = element.usages.find((usage) => usage.scopeKey === scopeKey) ?? null;
  const myLocalAlive = myUsage ? options.some((option) => option.id === myUsage.elementId) : null;
  const matrix = buildStoryworldUniverseMatrix(universe).find((row) => row.element.id === element.id);

  const apply = (registry: StoryworldUniverseRegistry) => onCommit(registry);

  return (
    <article className="storyworld-universe-element">
      <div className="storyworld-universe-element__topline">
        <span className="storyworld-board-card__badge">{SHARED_KIND_LABELS[element.kind]}</span>
        <strong>{element.name}</strong>
        <code>{element.id}</code>
      </div>
      {element.description ? <p className="storyworld-settings-hint">{element.description}</p> : null}
      {element.tags && element.tags.length > 0 ? (
        <div className="storyworld-board-card__tags">
          {element.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      ) : null}

      <div className="storyworld-universe-usage">
        <h4>작품별 사용 현황</h4>
        {universe.members.length === 0 ? <p className="storyworld-settings-hint">멤버 작품이 없습니다.</p> : null}
        <ul>
          {matrix?.cells.map((cell) => (
            <li key={cell.scopeKey}>
              <span>{cell.memberTitle}</span>
              {cell.usage
                ? <span>사용 중 · <code>{cell.usage.elementId}</code> ({cell.usage.elementLabel})
                    {cell.scopeKey === scopeKey && myLocalAlive === false ? " · 로컬 요소가 삭제됨" : ""}
                  </span>
                : <span className="storyworld-settings-hint">미사용</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="storyworld-universe-designate">
        <label>
          <span>이 작품의 {SHARED_KIND_LABELS[element.kind]} 요소</span>
          <select onChange={(event) => setLocalId(event.target.value)} value={localId}>
            <option value="">선택…</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.label} ({option.id})</option>)}
          </select>
        </label>
        <button
          className="storyworld-button"
          disabled={localId === ""}
          onClick={() => {
            const option = options.find((item) => item.id === localId);
            if (!option) return;
            apply(designateStoryworldSharedUsage(
              registry,
              universe.id,
              element.id,
              { scopeKey, elementId: option.id, elementLabel: option.label, designatedAtIso: new Date().toISOString() },
              new Date().toISOString(),
            ));
            setLocalId("");
          }}
          type="button"
        >
          <Link2 aria-hidden size={15} /> 공유 요소로 지정
        </button>
        {myUsage ? (
          <button
            className="storyworld-button"
            onClick={() => apply(revokeStoryworldSharedUsage(
              registry,
              universe.id,
              element.id,
              scopeKey,
              myUsage.elementId,
              new Date().toISOString(),
            ))}
            type="button"
          >
            <Link2Off aria-hidden size={15} /> 내 지정 해제 ({myUsage.elementLabel})
          </button>
        ) : null}
      </div>

      <details className="storyworld-universe-edit">
        <summary>공유 요소 설정 편집</summary>
        <label className="storyworld-settings-field">
          <span>이름</span>
          <input onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label className="storyworld-settings-field">
          <span>설명</span>
          <textarea onChange={(event) => setDescription(event.target.value)} rows={2} value={description} />
        </label>
        <label className="storyworld-settings-field">
          <span>태그 (쉼표로 구분)</span>
          <input onChange={(event) => setTags(event.target.value)} value={tags} />
        </label>
        <div className="storyworld-settings-actions">
          <button
            className="storyworld-button storyworld-button--primary"
            onClick={() => apply(updateStoryworldSharedElement(
              registry,
              universe.id,
              element.id,
              { name, description, tags: parseStoryworldTagInput(tags) },
              new Date().toISOString(),
            ))}
            type="button"
          >
            <Save aria-hidden size={15} /> 공유 요소 저장
          </button>
          <button
            className="storyworld-button storyworld-button--danger"
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              apply(removeStoryworldSharedElement(
                registry,
                universe.id,
                element.id,
                new Date().toISOString(),
              ));
            }}
            type="button"
          >
            <Trash2 aria-hidden size={15} /> {confirmDelete ? "정말 삭제 — 지정 기록도 함께 지워집니다" : "공유 요소 삭제"}
          </button>
        </div>
      </details>
    </article>
  );
}

export function StudioStoryworldUniverse({ project, scopeKey }: {
  readonly project: StoryworldProject;
  readonly scopeKey: string;
}) {
  const [registry, setRegistry] = useState<StoryworldUniverseRegistry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newUniverseName, setNewUniverseName] = useState("");
  const [newElementName, setNewElementName] = useState("");
  const [newElementKind, setNewElementKind] = useState<StoryworldSharedElementKind>("character");
  const [universeName, setUniverseName] = useState("");
  const [universeDescription, setUniverseDescription] = useState("");
  const [confirmDeleteUniverse, setConfirmDeleteUniverse] = useState(false);

  useEffect(() => {
    let active = true;
    setRegistry(null);
    setLoadError(null);
    void loadStoryworldUniverseRegistry().then((loaded) => {
      if (active) setRegistry(loaded);
    }).catch((caught: unknown) => {
      if (active) setLoadError(caught instanceof Error ? caught.message : "공유 세계관을 열 수 없습니다.");
    });
    return () => { active = false; };
  }, [attempt]);

  const universe = useMemo(() => {
    if (!registry) return null;
    return registry.universes.find((item) => item.id === selectedId) ?? registry.universes[0] ?? null;
  }, [registry, selectedId]);

  useEffect(() => {
    setUniverseName(universe?.name ?? "");
    setUniverseDescription(universe?.description ?? "");
    setConfirmDeleteUniverse(false);
  }, [universe?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: StoryworldUniverseRegistry) => {
    setRegistry(next);
    setSaveError(null);
    void saveStoryworldUniverseRegistry(next).catch(() => {
      setSaveError("공유 세계관을 저장하지 못했습니다. 변경은 이 탭에만 남아 있습니다.");
    });
  };

  if (loadError !== null) {
    return (
      <div className="storyworld-tab-stack">
        <section className="storyworld-panel">
          <h2>공유 세계관을 열 수 없습니다</h2>
          <p role="alert">{loadError} 저장된 원본은 변경하지 않았습니다.</p>
          <button className="storyworld-button" onClick={() => setAttempt((value) => value + 1)} type="button">다시 열기</button>
        </section>
      </div>
    );
  }
  if (registry === null) {
    return (
      <div className="storyworld-tab-stack">
        <section className="storyworld-panel">
          <p role="status">공유 세계관 레지스트리를 여는 중입니다.</p>
        </section>
      </div>
    );
  }

  const now = () => new Date().toISOString();
  const isMember = universe?.members.some((member) => member.scopeKey === scopeKey) ?? false;

  return (
    <div className="storyworld-tab-stack">
      <section className="storyworld-panel">
        <div className="storyworld-panel__heading">
          <div>
            <h2><Globe2 aria-hidden size={18} /> 공유 세계관</h2>
            <p>
              여러 작품이 한 세계관을 공유하도록 묶고, 캐릭터·장소·사실을 작품 간 공유 요소로 명시 지정합니다.
              공유는 복사가 아니라 참조 기록이며, 자동 연결은 하지 않습니다.
            </p>
          </div>
        </div>
        <p className="storyworld-settings-hint">
          경계: 이 레지스트리는 이 브라우저의 로컬 저장소 범위에서만 관리됩니다. 서버 동기화·협업자 공유·다른 기기 전파는
          서버 계약이 필요합니다. 다른 작품의 요소 실재 여부는 그 작품의 스토리월드 랩을 열 때 현재 작품 기준으로만 확정됩니다.
        </p>
        {saveError ? <p className="storyworld-inline-error" role="alert">{saveError}</p> : null}

        <div className="storyworld-universe-create">
          <label>
            <span className="sr-only">새 공유 세계관 이름</span>
            <input onChange={(event) => setNewUniverseName(event.target.value)} placeholder="새 공유 세계관 이름" value={newUniverseName} />
          </label>
          <button
            className="storyworld-button"
            onClick={() => {
              const created = createStoryworldUniverse(registry, newUniverseName, now());
              commit(created.registry);
              setSelectedId(created.id);
              setNewUniverseName("");
            }}
            type="button"
          >
            <Plus aria-hidden size={16} /> 공유 세계관 만들기
          </button>
          {registry.universes.length > 0 ? (
            <label>
              <span className="sr-only">공유 세계관 선택</span>
              <select onChange={(event) => setSelectedId(event.target.value)} value={universe?.id ?? ""}>
                {registry.universes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>

        {universe === null ? (
          <p className="storyworld-settings-hint">아직 공유 세계관이 없습니다. 위에서 만들면 이 작품을 멤버로 넣을 수 있습니다.</p>
        ) : (
          <>
            <div className="storyworld-universe-meta">
              <label className="storyworld-settings-field">
                <span>세계관 이름</span>
                <input onChange={(event) => setUniverseName(event.target.value)} value={universeName} />
              </label>
              <label className="storyworld-settings-field">
                <span>세계관 설명</span>
                <input onChange={(event) => setUniverseDescription(event.target.value)} value={universeDescription} />
              </label>
              <button
                className="storyworld-button"
                onClick={() => commit(updateStoryworldUniverse(registry, universe.id, { name: universeName, description: universeDescription }, now()))}
                type="button"
              >
                <Save aria-hidden size={15} /> 세계관 정보 저장
              </button>
              <button
                className="storyworld-button storyworld-button--danger"
                onClick={() => {
                  if (!confirmDeleteUniverse) { setConfirmDeleteUniverse(true); return; }
                  commit(deleteStoryworldUniverse(registry, universe.id));
                  setSelectedId(null);
                }}
                type="button"
              >
                <Trash2 aria-hidden size={15} /> {confirmDeleteUniverse ? "정말 삭제" : "세계관 삭제"}
              </button>
            </div>

            <div className="storyworld-universe-members">
              <h3>멤버 작품 ({universe.members.length})</h3>
              <p className="storyworld-settings-hint">
                현재 작품: {project.title} <code>{scopeKey}</code> — {isMember ? "멤버입니다." : "아직 멤버가 아닙니다."}
              </p>
              {isMember ? (
                <button
                  className="storyworld-button"
                  onClick={() => commit(leaveStoryworldUniverse(registry, universe.id, scopeKey, now()))}
                  type="button"
                >
                  <UserMinus aria-hidden size={15} /> 이 작품을 멤버에서 빼기 (사용 지정도 함께 해제)
                </button>
              ) : (
                <button
                  className="storyworld-button storyworld-button--primary"
                  onClick={() => commit(joinStoryworldUniverse(registry, universe.id, {
                    scopeKey,
                    projectId: project.id,
                    title: project.title,
                    joinedAtIso: now(),
                  }, now()))}
                  type="button"
                >
                  <UserPlus aria-hidden size={15} /> 이 작품을 멤버로 추가
                </button>
              )}
              <ul>
                {universe.members.map((member) => (
                  <li key={member.scopeKey}>
                    <strong>{member.title}</strong>
                    <code>{member.scopeKey}</code>
                    <span>공유 요소 사용 {universe.sharedElements.filter((element) => element.usages.some((usage) => usage.scopeKey === member.scopeKey)).length}개</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="storyworld-universe-add">
              <label>
                <span className="sr-only">공유 요소 종류</span>
                <select onChange={(event) => setNewElementKind(event.target.value as StoryworldSharedElementKind)} value={newElementKind}>
                  {(Object.keys(SHARED_KIND_LABELS) as StoryworldSharedElementKind[]).map((value) => (
                    <option key={value} value={value}>{SHARED_KIND_LABELS[value]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">새 공유 요소 이름</span>
                <input onChange={(event) => setNewElementName(event.target.value)} placeholder="새 공유 요소 이름" value={newElementName} />
              </label>
              <button
                className="storyworld-button"
                onClick={() => {
                  const added = addStoryworldSharedElement(registry, universe.id, newElementKind, newElementName, now());
                  if (added.id !== null) {
                    commit(added.registry);
                    setNewElementName("");
                  }
                }}
                type="button"
              >
                <Plus aria-hidden size={16} /> 공유 요소 추가
              </button>
            </div>

            <div className="storyworld-universe-elements">
              {universe.sharedElements.length === 0 ? (
                <p className="storyworld-settings-hint">아직 공유 요소가 없습니다. 공유할 캐릭터·장소·사실을 정의하고, 각 작품에서 자기 요소를 지정해 연결하세요.</p>
              ) : null}
              {universe.sharedElements.map((element) => (
                <SharedElementCard
                  element={element}
                  key={element.id}
                  onCommit={commit}
                  project={project}
                  registry={registry}
                  scopeKey={scopeKey}
                  universe={universe}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
