import { VERIFIED_SCENE_ERRORS } from "./studio-bg3d-verified-scene-error";
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";
import { STUDIO_BG3D_VERIFIED_LOCAL_SCENES } from "./studio-bg3d-verified-local-scenes";

registerI18nLocaleEntries("ko", {
  "studio.bg3d.verified.failed": "장면을 배치하지 못했습니다. 편집기 안내를 확인하고 다시 시도하세요.",
  "studio.bg3d.verified.done": "장면을 적용했습니다. 내 템플릿으로 저장할 수 있습니다.",
  "studio.bg3d.verified.title": "검증 모델 장면",
  "studio.bg3d.verified.select": "검증 장면",
  "studio.bg3d.verified.identity": "파일 크기와 SHA-256 확인",
  "studio.bg3d.verified.confirm": "이 모델을 사용할 권리를 확인했습니다",
  "studio.bg3d.verified.apply": "기기 라이브러리에서 적용",
  "studio.bg3d.verified.file": "검증 장면의 GLB 파일",
  "studio.bg3d.verified.wait": "기기의 모델을 확인하고 장면에 배치하고 있습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.bg3d.verified.title": "Verified model scenes",
  "studio.bg3d.verified.select": "Verified scene",
  "studio.bg3d.verified.confirm": "I have confirmed my right to use this model",
  "studio.bg3d.verified.apply": "Apply from device library",
  "studio.bg3d.verified.file": "GLB file for the verified scene",
  "studio.bg3d.verified.identity": "Expected file size and SHA-256",
  "studio.bg3d.verified.wait": "Checking the local model and placing it in the scene…",
  "studio.bg3d.verified.done": "Scene applied. You can now save it to My Templates.",
  "studio.bg3d.verified.failed": "The scene could not be placed. Check the editor message and try again.",
});


const tripoApiNote = "Generated with the Tripo API and reviewed for local development. Redistribution rights for the model file are unconfirmed.";
const varcoNote = "CC BY 4.0 applies to the source image. The 3D development copy was optimized. Rights to redistribute the model file are unconfirmed.";
const sceneNotes: Readonly<Record<string, readonly [string, string]>> = {
  "apartment-lobby": ["A wide background view of the shared entrance and waiting area.", tripoApiNote],
  "food-cart": ["A close-up prop for a street scene.", tripoApiNote],
  "one-room": ["An interior template showing the furniture layout.", tripoApiNote],
  "park-bench": ["A foreground bench for an outdoor scene.", varcoNote],
  "coffee-shop": ["An isometric view into the coffee shop.", varcoNote],
  "knight-crest": ["A heraldic shield for an interior decoration shot.", "Created from text with a paid Tripo Studio plan. Use is subject to the rights recorded for the linked file."],
};
for (const scene of STUDIO_BG3D_VERIFIED_LOCAL_SCENES) {
  const usage = "studio.bg3d.verified.usage." + scene.id;
  const rights = "studio.bg3d.verified.rights." + scene.id;
  registerI18nLocaleEntries("ko", { [usage]: scene.usage, [rights]: scene.rightsNote });
  const english = sceneNotes[scene.id];
  if (english) registerI18nLocaleEntries("en", { [usage]: english[0], [rights]: english[1] });
}

registerI18nLocaleEntries("ko", Object.fromEntries(Object.entries(VERIFIED_SCENE_ERRORS).map(([code, message]) => [
  "studio.bg3d.verified.error." + code, message,
])));
registerI18nLocaleEntries("en", {
  "studio.bg3d.verified.error.size": "The selected file size does not match the verified model.",
  "studio.bg3d.verified.error.hash": "The selected file’s SHA-256 does not match the verified model.",
  "studio.bg3d.verified.error.missing": "This model is not in the device library. Choose the GLB file below.",
  "studio.bg3d.verified.error.credit": "The model’s local rights record must include this credit.",
  "studio.bg3d.verified.error.integrity": "The local model’s hash or size does not match the verified scene.",
});
