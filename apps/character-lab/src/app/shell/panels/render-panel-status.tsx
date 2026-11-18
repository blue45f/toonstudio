import { EXTENDED_FEATURE_LABELS_KO, RIG_CAPABILITY_IDS, readExtendedFeatures } from "../../../render/beta-features";
import { SCENE_FEATURE_IDS, SCENE_FEATURE_LABELS_KO, SCENE_FEATURE_STATUS_LABELS_KO } from "../../../render/scene-features";

import type { SceneFeatureReport } from "../../../render/scene-features";

interface RenderPanelFeatureStatusProps {
  readonly engineReady: boolean;
  readonly features: SceneFeatureReport | null;
}

export function RenderPanelFeatureStatus({ engineReady, features }: RenderPanelFeatureStatusProps) {
  const extended = readExtendedFeatures(features);
  return (
    <>
      <h3 className="cl-render-title">엔진 기능 상태</h3>
      {!engineReady ? (
        <p className="cl-render-hint">엔진이 준비되면 기능 가용성이 여기에 표시됩니다.</p>
      ) : features ? (
        <table className="cl-render-table" aria-label="엔진 기능 상태">
          <tbody>
            {SCENE_FEATURE_IDS.map((id) => {
              const entry = features[id];
              return (
                <tr key={id} data-feature={id} data-status={entry.status}>
                  <th scope="row">{SCENE_FEATURE_LABELS_KO[id]}</th>
                  <td>{SCENE_FEATURE_STATUS_LABELS_KO[entry.status]}</td>
                  <td>{entry.reasonKo ?? entry.detail ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="cl-render-hint">이 엔진은 기능 가용성 보고를 제공하지 않습니다.</p>
      )}
      {extended ? (
        <table className="cl-render-table" aria-label="확장 기능 상태">
          <tbody>
            {RIG_CAPABILITY_IDS.map((id) => {
              const entry = extended[id];
              if (!entry) return null;
              return (
                <tr key={id} data-feature={id} data-status={entry.status}>
                  <th scope="row">{EXTENDED_FEATURE_LABELS_KO[id]}</th>
                  <td>{SCENE_FEATURE_STATUS_LABELS_KO[entry.status]}</td>
                  <td>{entry.reasonKo ?? entry.detail ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
