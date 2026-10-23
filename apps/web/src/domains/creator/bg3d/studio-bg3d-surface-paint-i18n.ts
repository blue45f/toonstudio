/**
 * 도형(프리미티브) 표면 그리기 마운트 문구 사전(2026-10-23).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. 화면은 `t(key, fallback)` 로 부르므로 키가 없어도 한국어 폴백이
 * 그대로 보인다. 그리기 패널 본문의 문구는 패널(StudioBg3dTexturePaintPanel)이 갖고, 여기는 마운트가 붙이는 제목과
 * "그릴 수 없는 이유"만 둔다. 키 패리티·실제 참조는 studio-bg3d-room-builder-i18n.test.ts 가 함께 고정한다.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.bg3dSurfacePaint.heading": "도형 표면 그리기",
  "studio.bg3dSurfacePaint.lockedReason": "잠긴 도형에는 그릴 수 없어요. 레이어 목록에서 잠금을 푼 뒤 그려 주세요.",
  "studio.bg3dSurfacePaint.hiddenReason": "숨긴 도형에는 그릴 수 없어요. 레이어 목록의 눈 아이콘으로 다시 보이게 한 뒤 그려 주세요.",
  "studio.bg3dSurfacePaint.busyReason": "캡처·불러오기·물리 미리보기가 끝난 뒤 그릴 수 있어요.",
});

registerI18nLocaleEntries("en", {
  "studio.bg3dSurfacePaint.heading": "Paint on shape surface",
  "studio.bg3dSurfacePaint.lockedReason": "You cannot paint on a locked shape. Unlock it in the layer list, then paint.",
  "studio.bg3dSurfacePaint.hiddenReason": "You cannot paint on a hidden shape. Show it again with the eye icon in the layer list, then paint.",
  "studio.bg3dSurfacePaint.busyReason": "You can paint once capture, loading or the physics preview has finished.",
});
