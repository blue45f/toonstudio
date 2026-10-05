/**
 * 스토리월드 설정 관리 탭.
 *
 * 원본 데이터(JSON) 탭뿐이던 요소 편집을 구조화 폼으로 제공한다. 각 폼은 선택된 요소의
 * id를 key로 마운트되어 초안 상태를 자체 보유하고, "설정 저장"을 눌렀을 때만 편집 연산
 * (studio-storyworld-editing)을 통해 프로젝트에 반영한다 — 반영 경로는 기존 자동 저장과 같다.
 *
 * 무빙툰 확장 설정은 캐릭터 단위 연출 "설정 데이터"만 관리한다. 모션 엔진
 * (studio-motion-fx)은 작품·컷 단위 설정을 소비하므로 캐릭터 프로필은 렌더에
 * 연결되지 않으며, 그 경계를 화면에 그대로 적는다.
 */
import { BookOpenCheck, Clapperboard, Film, Plus, Save, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { EMPHASIS_PRESETS, REVEAL_PRESETS } from "../studio-motion-fx";
import type {
  StoryworldCharacter,
  StoryworldFactDefinition,
  StoryworldProject,
  StoryworldScene,
} from "./studio-storyworld-causality";
import {
  addStoryworldCharacter,
  addStoryworldFact,
  addStoryworldScene,
  parseStoryworldTagInput,
  removeStoryworldCharacter,
  removeStoryworldFact,
  removeStoryworldScene,
  updateStoryworldCharacter,
  updateStoryworldFact,
  updateStoryworldScene,
  type StoryworldEditableKind,
} from "./studio-storyworld-editing";

export interface StoryworldSettingsFocus {
  readonly kind: StoryworldEditableKind;
  readonly id: string;
  /** 같은 요소를 다시 지목해도 포커스가 이동하도록 호출마다 바꾸는 값. */
  readonly nonce: number;
}

const KIND_LABELS: Readonly<Record<StoryworldEditableKind, string>> = {
  character: "캐릭터",
  fact: "사실",
  scene: "장면",
};

const KIND_ICONS: Readonly<Record<StoryworldEditableKind, typeof UserRound>> = {
  character: UserRound,
  fact: BookOpenCheck,
  scene: Clapperboard,
};

function toggleId(ids: string[], id: string, checked: boolean): string[] {
  return checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id);
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="storyworld-settings-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CheckList({ legend, options, selected, onToggle }: {
  readonly legend: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly selected: readonly string[];
  readonly onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <fieldset className="storyworld-settings-fieldset">
      <legend>{legend}</legend>
      {options.length === 0 ? <p className="storyworld-settings-hint">선택할 항목이 없습니다.</p> : null}
      <div className="storyworld-settings-checks">
        {options.map((option) => (
          <label key={option.id}>
            <input
              checked={selected.includes(option.id)}
              onChange={(event) => onToggle(option.id, event.target.checked)}
              type="checkbox"
            />
            <span>{option.label}</span>
            <code>{option.id}</code>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DeleteButton({ label, onDelete }: { readonly label: string; readonly onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      className="storyworld-button storyworld-button--danger"
      onClick={() => { if (confirm) onDelete(); else setConfirm(true); }}
      type="button"
    >
      <Trash2 aria-hidden size={16} /> {confirm ? "정말 삭제 — 참조도 함께 정리됩니다" : label}
    </button>
  );
}

function CharacterSettingsForm({ project, character, onChange, onDelete }: {
  readonly project: StoryworldProject;
  readonly character: StoryworldCharacter;
  readonly onChange: (project: StoryworldProject) => void;
  readonly onDelete: () => void;
}) {
  const [name, setName] = useState(character.name);
  const [aliases, setAliases] = useState((character.aliases ?? []).join(", "));
  const [description, setDescription] = useState(character.description ?? "");
  const [tags, setTags] = useState((character.tags ?? []).join(", "));
  const [goal, setGoal] = useState(character.goal ?? "");
  const [initialFactIds, setInitialFactIds] = useState<string[]>([...(character.initialFactIds ?? [])]);
  const [secretFactIds, setSecretFactIds] = useState<string[]>([...(character.secretFactIds ?? [])]);
  const [reveal, setReveal] = useState(character.motion?.reveal ?? "");
  const [emphasis, setEmphasis] = useState(character.motion?.emphasis ?? "");
  const [expressionNotes, setExpressionNotes] = useState(character.motion?.expressionNotes ?? "");
  const [voiceNote, setVoiceNote] = useState(character.motion?.voiceNote ?? "");
  const factOptions = project.facts.map((fact) => ({ id: fact.id, label: fact.label }));

  const save = () => {
    onChange(updateStoryworldCharacter(project, character.id, {
      name,
      aliases: aliases.split(","),
      description,
      tags: parseStoryworldTagInput(tags),
      goal,
      initialFactIds,
      secretFactIds,
      motion: {
        reveal: reveal || undefined,
        emphasis: emphasis || undefined,
        expressionNotes: expressionNotes || undefined,
        voiceNote: voiceNote || undefined,
      },
    }));
  };

  return (
    <>
      <h3><UserRound aria-hidden size={16} /> 캐릭터 설정 <code>{character.id}</code></h3>
      <Field label="이름">
        <input onChange={(e) => setName(e.target.value)} value={name} />
      </Field>
      <Field label="별칭 (쉼표로 구분)">
        <input onChange={(e) => setAliases(e.target.value)} value={aliases} />
      </Field>
      <Field label="목표">
        <input onChange={(e) => setGoal(e.target.value)} value={goal} />
      </Field>
      <Field label="설명">
        <textarea onChange={(e) => setDescription(e.target.value)} rows={3} value={description} />
      </Field>
      <Field label="태그 (쉼표로 구분)">
        <input onChange={(e) => setTags(e.target.value)} value={tags} />
      </Field>
      <CheckList
        legend="처음부터 아는 사실 (관계 연결)"
        onToggle={(id, checked) => setInitialFactIds((ids) => toggleId(ids, id, checked))}
        options={factOptions}
        selected={initialFactIds}
      />
      <CheckList
        legend="비밀 사실 (관계 연결)"
        onToggle={(id, checked) => setSecretFactIds((ids) => toggleId(ids, id, checked))}
        options={factOptions}
        selected={secretFactIds}
      />
      <fieldset className="storyworld-settings-fieldset storyworld-settings-motion">
        <legend><Film aria-hidden size={14} /> 무빙툰 확장 설정</legend>
        <p className="storyworld-settings-hint">
          캐릭터 단위 연출 설정 데이터입니다. 모션 엔진은 아직 작품·컷 단위 설정을 렌더에 쓰므로,
          이 프로필은 렌더에 연결되지 않고 설정 관리용으로만 저장됩니다.
        </p>
        <Field label="등장 리빌 (무빙툰 프리셋)">
          <select onChange={(e) => setReveal(e.target.value)} value={reveal}>
            <option value="">미지정 — 작품 기본</option>
            {REVEAL_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} — {preset.description}</option>)}
          </select>
        </Field>
        <Field label="등장 강조 (무빙툰 프리셋)">
          <select onChange={(e) => setEmphasis(e.target.value)} value={emphasis}>
            <option value="">미지정</option>
            {EMPHASIS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} — {preset.description}</option>)}
          </select>
        </Field>
        <Field label="표정 세트 메모">
          <textarea onChange={(e) => setExpressionNotes(e.target.value)} rows={2} value={expressionNotes} />
        </Field>
        <Field label="음성 연기 메모">
          <textarea onChange={(e) => setVoiceNote(e.target.value)} rows={2} value={voiceNote} />
        </Field>
      </fieldset>
      <div className="storyworld-settings-actions">
        <button className="storyworld-button storyworld-button--primary" onClick={save} type="button">
          <Save aria-hidden size={16} /> 설정 저장
        </button>
        <DeleteButton label="캐릭터 삭제" onDelete={onDelete} />
      </div>
    </>
  );
}

function FactSettingsForm({ project, fact, onChange, onDelete }: {
  readonly project: StoryworldProject;
  readonly fact: StoryworldFactDefinition;
  readonly onChange: (project: StoryworldProject) => void;
  readonly onDelete: () => void;
}) {
  const [label, setLabel] = useState(fact.label);
  const [description, setDescription] = useState(fact.description ?? "");
  const [subjectId, setSubjectId] = useState(fact.subjectId);
  const [factKey, setFactKey] = useState(fact.key);
  const [tags, setTags] = useState((fact.tags ?? []).join(", "));
  const [canonical, setCanonical] = useState(fact.canonical === true);
  const subjectOptions = useMemo(() => {
    const subjects = new Set<string>([
      ...project.characters.map((character) => character.id),
      ...project.facts.map((item) => item.subjectId),
    ]);
    return [...subjects].sort();
  }, [project]);

  const save = () => {
    onChange(updateStoryworldFact(project, fact.id, {
      label,
      description,
      subjectId,
      key: factKey,
      tags: parseStoryworldTagInput(tags),
      canonical,
    }));
  };

  return (
    <>
      <h3><BookOpenCheck aria-hidden size={16} /> 사실 설정 <code>{fact.id}</code></h3>
      <Field label="라벨">
        <input onChange={(e) => setLabel(e.target.value)} value={label} />
      </Field>
      <Field label="설명">
        <textarea onChange={(e) => setDescription(e.target.value)} rows={3} value={description} />
      </Field>
      <Field label="주체 (캐릭터 id 또는 세계 주체)">
        <input list="storyworld-subject-options" onChange={(e) => setSubjectId(e.target.value)} value={subjectId} />
        <datalist id="storyworld-subject-options">
          {subjectOptions.map((subject) => <option key={subject} value={subject} />)}
        </datalist>
      </Field>
      <Field label="속성 키">
        <input onChange={(e) => setFactKey(e.target.value)} value={factKey} />
      </Field>
      <Field label="태그 (쉼표로 구분)">
        <input onChange={(e) => setTags(e.target.value)} value={tags} />
      </Field>
      <p className="storyworld-settings-hint">
        초기값: {fact.initialValue === undefined ? "없음" : JSON.stringify(fact.initialValue)} ·
        초기값과 독자 공개 순서는 원본 데이터 탭에서 편집합니다.
      </p>
      <label className="storyworld-settings-inline-check">
        <input checked={canonical} onChange={(e) => setCanonical(e.target.checked)} type="checkbox" />
        캐논 사실 (근거 영수증에 포함)
      </label>
      <div className="storyworld-settings-actions">
        <button className="storyworld-button storyworld-button--primary" onClick={save} type="button">
          <Save aria-hidden size={16} /> 설정 저장
        </button>
        <DeleteButton label="사실 삭제" onDelete={onDelete} />
      </div>
    </>
  );
}

function SceneSettingsForm({ project, scene, onChange, onDelete }: {
  readonly project: StoryworldProject;
  readonly scene: StoryworldScene;
  readonly onChange: (project: StoryworldProject) => void;
  readonly onDelete: () => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [description, setDescription] = useState(scene.description ?? "");
  const [order, setOrder] = useState(String(scene.order));
  const [timeIndex, setTimeIndex] = useState(scene.timeIndex === undefined ? "" : String(scene.timeIndex));
  const [locationId, setLocationId] = useState(scene.locationId ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>([...(scene.participantIds ?? [])]);
  const [dependsOnSceneIds, setDependsOnSceneIds] = useState<string[]>([...(scene.dependsOnSceneIds ?? [])]);
  const [disabled, setDisabled] = useState(scene.disabled === true);
  const characterOptions = project.characters.map((character) => ({ id: character.id, label: character.name }));
  const sceneOptions = project.scenes
    .filter((item) => item.id !== scene.id)
    .map((item) => ({ id: item.id, label: `${item.order}. ${item.title}` }));
  const locationOptions = useMemo(() => {
    const locations = new Set<string>();
    for (const item of project.scenes) if (item.locationId) locations.add(item.locationId);
    return [...locations].sort();
  }, [project]);

  const save = () => {
    const parsedOrder = Number(order);
    const parsedTime = timeIndex.trim() === "" ? null : Number(timeIndex);
    onChange(updateStoryworldScene(project, scene.id, {
      title,
      description,
      order: Number.isFinite(parsedOrder) ? parsedOrder : scene.order,
      timeIndex: parsedTime !== null && !Number.isFinite(parsedTime) ? scene.timeIndex ?? null : parsedTime,
      locationId: locationId.trim() === "" ? null : locationId,
      participantIds,
      dependsOnSceneIds,
      disabled,
    }));
  };

  return (
    <>
      <h3><Clapperboard aria-hidden size={16} /> 장면 설정 <code>{scene.id}</code></h3>
      <Field label="제목">
        <input onChange={(e) => setTitle(e.target.value)} value={title} />
      </Field>
      <Field label="설명">
        <textarea onChange={(e) => setDescription(e.target.value)} rows={3} value={description} />
      </Field>
      <div className="storyworld-settings-row">
        <Field label="순서">
          <input inputMode="numeric" onChange={(e) => setOrder(e.target.value)} value={order} />
        </Field>
        <Field label="시간 인덱스 (비우면 없음)">
          <input inputMode="numeric" onChange={(e) => setTimeIndex(e.target.value)} value={timeIndex} />
        </Field>
        <Field label="장소">
          <input list="storyworld-location-options" onChange={(e) => setLocationId(e.target.value)} value={locationId} />
          <datalist id="storyworld-location-options">
            {locationOptions.map((location) => <option key={location} value={location} />)}
          </datalist>
        </Field>
      </div>
      <CheckList
        legend="참여 캐릭터 (관계 연결)"
        onToggle={(id, checked) => setParticipantIds((ids) => toggleId(ids, id, checked))}
        options={characterOptions}
        selected={participantIds}
      />
      <CheckList
        legend="선행 장면 (의존 관계)"
        onToggle={(id, checked) => setDependsOnSceneIds((ids) => toggleId(ids, id, checked))}
        options={sceneOptions}
        selected={dependsOnSceneIds}
      />
      <label className="storyworld-settings-inline-check">
        <input checked={disabled} onChange={(e) => setDisabled(e.target.checked)} type="checkbox" />
        비활성 장면 (분석 실행에서 제외)
      </label>
      <div className="storyworld-settings-actions">
        <button className="storyworld-button storyworld-button--primary" onClick={save} type="button">
          <Save aria-hidden size={16} /> 설정 저장
        </button>
        <DeleteButton label="장면 삭제" onDelete={onDelete} />
      </div>
    </>
  );
}

export function StudioStoryworldSettings({ project, onChange, focusRequest }: {
  readonly project: StoryworldProject;
  readonly onChange: (project: StoryworldProject) => void;
  readonly focusRequest: StoryworldSettingsFocus | null;
}) {
  const [kind, setKind] = useState<StoryworldEditableKind>("character");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const elements = useMemo(() => {
    if (kind === "character") return project.characters.map((c) => ({ id: c.id, label: c.name }));
    if (kind === "fact") return project.facts.map((f) => ({ id: f.id, label: f.label }));
    return project.scenes.map((s) => ({ id: s.id, label: s.title }));
  }, [kind, project]);

  useEffect(() => {
    if (selectedId !== null && elements.some((element) => element.id === selectedId)) return;
    setSelectedId(elements[0]?.id ?? null);
  }, [elements, selectedId]);

  useEffect(() => {
    if (!focusRequest) return;
    setKind(focusRequest.kind);
    setSelectedId(focusRequest.id);
  }, [focusRequest]);

  const selectedCharacter = kind === "character"
    ? project.characters.find((character) => character.id === selectedId) ?? null
    : null;
  const selectedFact = kind === "fact"
    ? project.facts.find((fact) => fact.id === selectedId) ?? null
    : null;
  const selectedScene = kind === "scene"
    ? project.scenes.find((scene) => scene.id === selectedId) ?? null
    : null;

  const addElement = () => {
    const name = newName.trim();
    const added = kind === "character"
      ? addStoryworldCharacter(project, name)
      : kind === "fact"
        ? addStoryworldFact(project, name)
        : addStoryworldScene(project, name);
    onChange(added.project);
    setSelectedId(added.id);
    setNewName("");
  };

  const deleteSelected = () => {
    if (selectedId === null) return;
    if (kind === "character") onChange(removeStoryworldCharacter(project, selectedId));
    else if (kind === "fact") onChange(removeStoryworldFact(project, selectedId));
    else onChange(removeStoryworldScene(project, selectedId));
    setSelectedId(null);
  };

  return (
    <div className="storyworld-tab-stack">
      <section className="storyworld-panel">
        <div className="storyworld-panel__heading">
          <div>
            <h2>세계관 설정 관리</h2>
            <p>캐릭터·사실·장면을 원본 JSON 없이 폼으로 편집합니다. 저장하면 기존 자동 저장 경로로 보관되고 분석이 다시 실행됩니다.</p>
          </div>
        </div>
        <div className="storyworld-segmented" role="group" aria-label="설정 요소 종류">
          {(Object.keys(KIND_LABELS) as StoryworldEditableKind[]).map((value) => {
            const Icon = KIND_ICONS[value];
            const count = value === "character" ? project.characters.length : value === "fact" ? project.facts.length : project.scenes.length;
            return (
              <button aria-pressed={kind === value} key={value} onClick={() => setKind(value)} type="button">
                <Icon aria-hidden size={14} /> {KIND_LABELS[value]} {count}
              </button>
            );
          })}
        </div>

        <div className="storyworld-settings-create">
          <label>
            <span className="sr-only">새 {KIND_LABELS[kind]} 이름</span>
            <input
              onChange={(event) => setNewName(event.target.value)}
              placeholder={`새 ${KIND_LABELS[kind]} 이름`}
              value={newName}
            />
          </label>
          <button className="storyworld-button" onClick={addElement} type="button">
            <Plus aria-hidden size={16} /> {KIND_LABELS[kind]} 추가
          </button>
        </div>

        <div className="storyworld-settings-layout">
          <div className="storyworld-settings-list" role="listbox" aria-label={`${KIND_LABELS[kind]} 목록`}>
            {elements.length === 0 ? <p className="storyworld-settings-hint">아직 {KIND_LABELS[kind]}이(가) 없습니다. 위에서 추가하세요.</p> : null}
            {elements.map((element) => (
              <button
                aria-selected={selectedId === element.id}
                className={selectedId === element.id ? "is-selected" : ""}
                key={element.id}
                onClick={() => setSelectedId(element.id)}
                role="option"
                type="button"
              >
                <span>{element.label}</span>
                <code>{element.id}</code>
              </button>
            ))}
          </div>

          <div className="storyworld-settings-form">
            {selectedCharacter ? (
              <CharacterSettingsForm
                character={selectedCharacter}
                key={`character:${selectedCharacter.id}`}
                onChange={onChange}
                onDelete={deleteSelected}
                project={project}
              />
            ) : null}
            {selectedFact ? (
              <FactSettingsForm
                fact={selectedFact}
                key={`fact:${selectedFact.id}`}
                onChange={onChange}
                onDelete={deleteSelected}
                project={project}
              />
            ) : null}
            {selectedScene ? (
              <SceneSettingsForm
                key={`scene:${selectedScene.id}`}
                onChange={onChange}
                onDelete={deleteSelected}
                project={project}
                scene={selectedScene}
              />
            ) : null}
            {elements.length > 0 && !selectedCharacter && !selectedFact && !selectedScene ? (
              <p className="storyworld-settings-hint">왼쪽 목록에서 요소를 고르세요.</p>
            ) : null}
            {elements.length === 0 ? (
              <p className="storyworld-settings-hint">요소를 추가하면 이곳에서 이름·설명·태그·관계를 편집할 수 있습니다.</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
