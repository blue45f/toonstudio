import { studioFrameClip, type StudioFrameGeometry } from "@toonstudio/studio-project-model/frame-clip";
import { fmt } from "./studio-svg-export-geometry";

/** 배경 다각형과 자식·지우개 경계가 같은 문서 경로를 사용한다. */
export function studioSvgPanelClip(id: string, frame: StudioFrameGeometry): string {
  const clip = studioFrameClip(frame);
  const shape = clip.points
    ? `<polygon points="${clip.points.map((value) => fmt(value)).join(" ")}"/>`
    : `<rect x="${fmt(clip.x)}" y="${fmt(clip.y)}" width="${fmt(clip.width)}" height="${fmt(clip.height)}"/>`;
  return `<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${shape}</clipPath>`;
}
