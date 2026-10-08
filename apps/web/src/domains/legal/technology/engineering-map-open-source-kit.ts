import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 지도 · open-source 의 행을 만드는 공용 도구와 작성 기준(행 자료는 engineering-map-open-source-rows*.ts).
 * 지도 본체는 engineering-map-open-source.ts.
 *
 * 작성 기준(2026-10-07):
 * - 버전·SPDX 는 설치본 `node_modules/<pkg>/package.json` 과 대조했다(직접 런타임 의존성 117개).
 * - `status` 는 앱 진입점(apps/web/src/app/main.tsx)에서 import 그래프를 따라가 도달하는지로 확인했다.
 *   도달하지 않으면 live 로 쓰지 않는다(예: xatlasjs, three-mesh-bvh, resvg provider, HarfBuzz provider).
 * - 법률 판단은 하지 않는다. 저장소가 기록한 라이선스 라벨과 처리 방식만 적는다.
 */

export const t = (ko: string, en: string): LocalizedText => ({ ko, en });
export const same = (value: string): LocalizedText => ({ ko: value, en: value });
export const AS_OF = "2026-10-07";
