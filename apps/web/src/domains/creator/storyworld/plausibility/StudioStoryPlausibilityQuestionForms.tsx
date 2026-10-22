/**
 * 질문지의 여섯 가지 폼. 값은 부모가 들고 있고(onChange로 올린다), 문서에 쓰는 일은 부모가 한다.
 * 폼은 모두 보이는 이름표가 있는 입력만 쓰고, 입력을 고르지 않으면 저장할 수 없는 폼은 이유를 글로 알린다.
 */
import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/shared/lib/i18n";
import "../storyworld-status-i18n";

import type { StoryworldMotive, StoryworldProject, StoryworldScene, StoryworldSceneRole } from "../studio-storyworld-causality";
import {
  earlierScenes,
  type CauseDraft,
  type CoincidenceChoice,
  type CoincidenceDraft,
  type ConsequenceDraft,
  type InformationRowDraft,
  type InformationSourceKind,
  type MotiveRowDraft,
} from "./studio-story-plausibility-question-drafts";
import { PLAUSIBILITY_ROLE_LABELS, PLAUSIBILITY_ROLE_ORDER, isToggleFact } from "./studio-story-plausibility-questions";
import { topicJosa } from "./studio-story-plausibility-text";

interface FormBase {
  readonly project: StoryworldProject;
  readonly scene: StoryworldScene;
  readonly readOnly: boolean;
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// ── 1. 장면 성격 ──────────────────────────────────────────────────────

export function RolesForm({ value, onChange, readOnly }: FormBase & {
  readonly value: readonly StoryworldSceneRole[];
  readonly onChange: (next: readonly StoryworldSceneRole[]) => void;
}) {
  return (
    <fieldset className="plausibility-field" disabled={readOnly}>
      <legend>이 장면에 해당하는 것을 모두 고르세요</legend>
      {PLAUSIBILITY_ROLE_ORDER.map((role) => (
        <label key={role}>
          <input checked={value.includes(role)} onChange={() => onChange(toggle(value, role))} type="checkbox" />
          {PLAUSIBILITY_ROLE_LABELS[role]}
        </label>
      ))}
      <p className="plausibility-hint">아무것도 고르지 않고 저장하면 ‘특별할 것 없는 일반 장면’으로 기록돼요.</p>
    </fieldset>
  );
}

// ── 2. 동기 ───────────────────────────────────────────────────────────

const BASIS_OPTIONS: readonly { readonly value: StoryworldMotive["basis"] | ""; readonly label: string }[] = [
  { value: "", label: "아직 고르지 않았어요" },
  { value: "goal", label: "바라는 것 때문이에요" },
  { value: "event", label: "앞선 사건 때문이에요" },
  { value: "emotion", label: "감정 때문이에요" },
  { value: "unknown", label: "아직 모르겠어요" },
];

export function MotiveForm({ project, scene, value, onChange, readOnly }: FormBase & {
  readonly value: readonly MotiveRowDraft[];
  readonly onChange: (next: readonly MotiveRowDraft[]) => void;
}) {
  const earlier = earlierScenes(project, scene.id);
  const t = useT();
  const update = (index: number, patch: Partial<MotiveRowDraft>) =>
    onChange(value.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  if (value.length === 0) return <p className="plausibility-hint">{t("studio.storyworldStatus.questionForms.noCharacters", "이 이야기에는 아직 인물이 없어요. 설정 관리에서 인물을 먼저 만들어 주세요.")}</p>;
  return (
    <div className="plausibility-field">
      {value.map((row, index) => {
        const name = project.characters.find((character) => character.id === row.characterId)?.name ?? row.characterId;
        return (
          <div className="plausibility-rowform" key={row.characterId} role="group" aria-label={`${name}의 동기`}>
            <label>
              <span>{topicJosa(name)} 왜 움직이나요?</span>
              <select disabled={readOnly} onChange={(event) => {
                const next = BASIS_OPTIONS.find((option) => option.value === event.target.value);
                update(index, { basis: next ? next.value : "" });
              }} value={row.basis}
              >
                {BASIS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {row.basis === "event" ? (
              <label>
                <span>어떤 앞 장면 때문인가요?</span>
                <select disabled={readOnly} onChange={(event) => update(index, { causeSceneId: event.target.value })} value={row.causeSceneId}>
                  <option value="">고르지 않았어요</option>
                  {earlier.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.order}. {candidate.title}</option>)}
                </select>
              </label>
            ) : null}
            <label>
              <span>메모 (선택)</span>
              <input disabled={readOnly} maxLength={200} onChange={(event) => update(index, { note: event.target.value })} type="text" value={row.note} />
            </label>
          </div>
        );
      })}
    </div>
  );
}

// ── 3. 원인 ───────────────────────────────────────────────────────────

export function CauseForm({ project, scene, value, onChange, readOnly }: FormBase & {
  readonly value: CauseDraft;
  readonly onChange: (next: CauseDraft) => void;
}) {
  const earlier = earlierScenes(project, scene.id);
  const t = useT();
  const facts = project.facts.filter((fact) => isToggleFact(project, fact.id));
  return (
    <div className="plausibility-field">
      <fieldset className="plausibility-field" disabled={readOnly}>
        <legend>원인이 된 앞 장면</legend>
        {earlier.length === 0 ? <p className="plausibility-hint">{t("studio.storyworldStatus.questionForms.noEarlierScene", "이 장면보다 앞에 있는 장면이 없어요.")}</p> : null}
        {earlier.map((candidate) => (
          <label key={candidate.id}>
            <input
              checked={value.sceneIds.includes(candidate.id)}
              onChange={() => onChange({ ...value, sceneIds: toggle(value.sceneIds, candidate.id) })}
              type="checkbox"
            />
            {candidate.order}. {candidate.title}
          </label>
        ))}
      </fieldset>
      <fieldset className="plausibility-field" disabled={readOnly}>
        <legend>이 장면이 일어나려면 이미 성립해 있어야 하는 일</legend>
        {facts.length === 0 ? <p className="plausibility-hint">{t("studio.storyworldStatus.questionForms.noFactsYet", "고를 수 있는 설정이 아직 없어요. 설정 관리에서 사실을 먼저 적어 주세요.")}</p> : null}
        {facts.map((fact) => (
          <label key={fact.id}>
            <input
              checked={value.factIds.includes(fact.id)}
              onChange={() => onChange({ ...value, factIds: toggle(value.factIds, fact.id) })}
              type="checkbox"
            />
            {fact.label}
          </label>
        ))}
      </fieldset>
      {value.otherPreconditionCount > 0 ? (
        <p className="plausibility-hint">숫자 비교처럼 이 폼으로 고칠 수 없는 조건이 {value.otherPreconditionCount}개 더 있어요. 설정 관리에서 고쳐 주세요. 저장해도 지워지지 않아요.</p>
      ) : null}
      <p className="plausibility-hint">아무것도 고르지 않고 저장하면 ‘앞에 기댄 원인이 없다’고 기록돼요.</p>
    </div>
  );
}

// ── 4. 정보 ───────────────────────────────────────────────────────────

const SOURCE_OPTIONS: readonly { readonly value: InformationSourceKind; readonly label: string }[] = [
  { value: "initial", label: "처음부터 알고 있었어요" },
  { value: "scene", label: "앞 장면에서 알게 됐어요" },
  { value: "here", label: "이 장면에서 알게 돼요" },
  { value: "unknown", label: "아직 모르겠어요" },
];

export function InformationForm({ project, scene, value, onChange, readOnly }: FormBase & {
  readonly value: readonly InformationRowDraft[];
  readonly onChange: (next: readonly InformationRowDraft[]) => void;
}) {
  const earlier = earlierScenes(project, scene.id);
  const update = (index: number, patch: Partial<InformationRowDraft>) =>
    onChange(value.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  const addRow = () => {
    const characterId = (scene.participantIds ?? [])[0] ?? project.characters[0]?.id ?? "";
    const factId = project.facts[0]?.id ?? "";
    onChange([...value, { characterId, factId, source: "unknown", sceneId: "" }]);
  };
  return (
    <div className="plausibility-field">
      {value.length === 0 ? <p className="plausibility-hint">이 장면에서 인물이 ‘알고서’ 행동하는 일이 없다면 이대로 저장하세요.</p> : null}
      {value.map((row, index) => (
        <div className="plausibility-rowform" key={`${row.characterId}:${row.factId}:${index}`} role="group" aria-label={`정보 ${index + 1}`}>
          <label>
            <span>누가</span>
            <select disabled={readOnly} onChange={(event) => update(index, { characterId: event.target.value })} value={row.characterId}>
              {project.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
            </select>
          </label>
          <label>
            <span>무엇을 아나요</span>
            <select disabled={readOnly} onChange={(event) => update(index, { factId: event.target.value })} value={row.factId}>
              {project.facts.map((fact) => <option key={fact.id} value={fact.id}>{fact.label}</option>)}
            </select>
          </label>
          <label>
            <span>어떻게 알았나요</span>
            <select disabled={readOnly} onChange={(event) => {
              const next = SOURCE_OPTIONS.find((option) => option.value === event.target.value);
              update(index, { source: next ? next.value : "unknown" });
            }} value={row.source}
            >
              {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {row.source === "scene" ? (
            <label>
              <span>어느 앞 장면인가요</span>
              <select disabled={readOnly} onChange={(event) => update(index, { sceneId: event.target.value })} value={row.sceneId}>
                <option value="">고르지 않았어요</option>
                {earlier.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.order}. {candidate.title}</option>)}
              </select>
            </label>
          ) : null}
          <button className="storyworld-button" disabled={readOnly} onClick={() => onChange(value.filter((_, position) => position !== index))} type="button">
            <Trash2 aria-hidden size={14} /> 이 줄 지우기
          </button>
        </div>
      ))}
      <div>
        <button className="storyworld-button" disabled={readOnly || project.characters.length === 0 || project.facts.length === 0} onClick={addRow} type="button">
          <Plus aria-hidden size={14} /> 줄 추가
        </button>
        {project.facts.length === 0 ? <span className="plausibility-hint"> 설정 관리에서 사실을 먼저 적어야 고를 수 있어요.</span> : null}
      </div>
    </div>
  );
}

// ── 5. 우연·단서 ──────────────────────────────────────────────────────

const COINCIDENCE_OPTIONS: readonly { readonly value: Exclude<CoincidenceChoice, "unset">; readonly label: string }[] = [
  { value: "not-coincidence", label: "우연에 기대는 장면이 아니에요" },
  { value: "foreshadowed", label: "우연이지만 앞에 단서가 있어요" },
  { value: "none", label: "우연이고 앞에 단서가 없어요" },
  { value: "unknown", label: "아직 모르겠어요" },
];

export function CoincidenceForm({ project, scene, value, onChange, readOnly }: FormBase & {
  readonly value: CoincidenceDraft;
  readonly onChange: (next: CoincidenceDraft) => void;
}) {
  const t = useT();
  const earlier = earlierScenes(project, scene.id);
  return (
    <fieldset className="plausibility-field" disabled={readOnly}>
      <legend>이 장면의 사건은 어떤가요?</legend>
      {COINCIDENCE_OPTIONS.map((option) => (
        <label key={option.value}>
          <input
            checked={value.choice === option.value}
            name={`coincidence-${scene.id}`}
            onChange={() => onChange({ ...value, choice: option.value })}
            type="radio"
          />
          {option.label}
        </label>
      ))}
      {value.choice === "foreshadowed" ? (
        <fieldset className="plausibility-field">
          <legend>단서가 있는 앞 장면</legend>
          {earlier.length === 0 ? <p className="plausibility-hint">{t("studio.storyworldStatus.questionForms.noEarlierScene", "이 장면보다 앞에 있는 장면이 없어요.")}</p> : null}
          {earlier.map((candidate) => (
            <label key={candidate.id}>
              <input
                checked={value.clueSceneIds.includes(candidate.id)}
                onChange={() => onChange({ ...value, clueSceneIds: toggle(value.clueSceneIds, candidate.id) })}
                type="checkbox"
              />
              {candidate.order}. {candidate.title}
            </label>
          ))}
        </fieldset>
      ) : null}
    </fieldset>
  );
}

// ── 6. 결과 ───────────────────────────────────────────────────────────

export function ConsequenceForm({ project, value, onChange, readOnly }: FormBase & {
  readonly value: ConsequenceDraft;
  readonly onChange: (next: ConsequenceDraft) => void;
}) {
  const t = useT();
  const toggleFacts = project.facts.filter((fact) => isToggleFact(project, fact.id));
  const group = (legend: string, key: keyof ConsequenceDraft, facts: readonly { readonly id: string; readonly label: string }[]) => (
    <fieldset className="plausibility-field" disabled={readOnly}>
      <legend>{legend}</legend>
      {facts.length === 0 ? <p className="plausibility-hint">{t("studio.storyworldStatus.questionForms.noFacts", "고를 수 있는 설정이 없어요.")}</p> : null}
      {facts.map((fact) => (
        <label key={fact.id}>
          <input checked={value[key].includes(fact.id)} onChange={() => onChange({ ...value, [key]: toggle(value[key], fact.id) })} type="checkbox" />
          {fact.label}
        </label>
      ))}
    </fieldset>
  );
  return (
    <div className="plausibility-field">
      {group("이 장면 뒤에 새로 성립하는 일", "established", toggleFacts)}
      {group("이 장면 뒤에 사라지는 일", "ended", toggleFacts)}
      {group("이 장면에서 독자에게 새로 알려지는 일", "revealedToReader", project.facts)}
      <p className="plausibility-hint">아무것도 고르지 않고 저장하면 ‘이 장면 뒤에 달라지는 것이 없다’고 기록돼요.</p>
    </div>
  );
}
