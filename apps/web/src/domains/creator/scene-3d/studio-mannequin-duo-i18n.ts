/**
 * 3D 데생 인형 2인 구도(상대 인형) UI 문구 사전.
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록하고, UI는 `t(key, fallback)` 또는
 * `t(key, values, fallback)`로 해소한다. 두 로케일의 키 집합은 항상 같아야 한다
 * (studio-mannequin-duo-i18n.test.ts 가 패리티를 고정한다).
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

export const STUDIO_MANNEQUIN_DUO_I18N_KO: Readonly<Record<string, string>> = Object.freeze({
  "studio.mannequinDuo.title": "2인 구도 — 상대 인형",
  "studio.mannequinDuo.restored": "저장된 2인 구도입니다. 상대 인형도 함께 그려지고 캡처에 담깁니다.",
  "studio.mannequinDuo.position": "상대 위치 — 앞뒤 {z}m · 좌우 {x}m",
  "studio.mannequinDuo.target": "조작할 인형",
  "studio.mannequinDuo.lead": "주인공",
  "studio.mannequinDuo.partner": "상대",
  "studio.mannequinDuo.hint": "상대를 고르면 뷰포트의 IK 핸들·관절 드래그와 1인 포즈 프리셋이 상대에게 적용됩니다. 뷰포트에서 인형을 눌러도 바뀝니다.",
  "studio.mannequinDuo.undo": "상대 되돌리기",
  "studio.mannequinDuo.redo": "상대 다시 실행",
  "studio.mannequinDuo.frame": "두 인형 모두 보기",
  "studio.mannequinDuo.remove": "상대 제거",
  "studio.mannequinDuo.badge": "2인",
});

export const STUDIO_MANNEQUIN_DUO_I18N_EN: Readonly<Record<string, string>> = Object.freeze({
  "studio.mannequinDuo.title": "Two-person shot — partner figure",
  "studio.mannequinDuo.restored": "Saved two-person shot. The partner figure is drawn and captured too.",
  "studio.mannequinDuo.position": "Partner position — front/back {z} m · left/right {x} m",
  "studio.mannequinDuo.target": "Figure to pose",
  "studio.mannequinDuo.lead": "Lead",
  "studio.mannequinDuo.partner": "Partner",
  "studio.mannequinDuo.hint": "With Partner selected, viewport IK handles, joint drags and one-person pose presets apply to the partner. Clicking a figure in the viewport also switches.",
  "studio.mannequinDuo.undo": "Undo partner",
  "studio.mannequinDuo.redo": "Redo partner",
  "studio.mannequinDuo.frame": "Frame both figures",
  "studio.mannequinDuo.remove": "Remove partner",
  "studio.mannequinDuo.badge": "Duo",
});

registerI18nLocaleEntries("ko", STUDIO_MANNEQUIN_DUO_I18N_KO);
registerI18nLocaleEntries("en", STUDIO_MANNEQUIN_DUO_I18N_EN);
