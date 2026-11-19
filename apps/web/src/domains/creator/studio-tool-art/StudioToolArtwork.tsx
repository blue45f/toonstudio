import {
  AudioLines, Blend, Box, Boxes, BriefcaseBusiness, Brush, Circle, CircleDashed, Clapperboard,
  Contrast, Crop, Droplet, Eraser, Focus, FolderOpen, Frame, Grid2x2, Hand, Image, Images, Lasso, LassoSelect,
  History, House, Layers, Link2, MessageCircle, MousePointer2, PaintBucket, Palette,
  MapPin, PenTool, PersonStanding, Pipette, RectangleHorizontal, RotateCw, Save, Scaling, Search, Shapes,
  Spline, SquareDashed, Type, Upload, UserRound, Users, Waves,
} from "lucide-react";

import instruments from "./atelier-tools.webp";
import commands from "./atelier-commands.webp";
import edits from "./atelier-edit.webp";
import media from "./atelier-media.webp";
import workbench from "./atelier-workbench.webp";
import "./StudioToolArtwork.css";

const tools = {
  pen: [instruments, 0, 0, PenTool], eraser: [instruments, 1, 0, Eraser], brush: [instruments, 2, 0, Brush], color: [instruments, 3, 0, Palette],
  layers: [instruments, 0, 1, Layers], select: [instruments, 1, 1, MousePointer2], fill: [instruments, 2, 1, PaintBucket], frame: [instruments, 3, 1, Frame],
  bubble: [instruments, 0, 2, MessageCircle], bg3d: [instruments, 1, 2, Box], character: [instruments, 2, 2, UserRound], mannequin: [instruments, 3, 2, PersonStanding],
  save: [commands, 0, 0, Save], search: [commands, 1, 0, Search], history: [commands, 2, 0, History], export: [commands, 3, 0, Upload],
  share: [commands, 0, 1, Link2], team: [commands, 1, 1, Users], projects: [commands, 2, 1, FolderOpen], tools: [commands, 3, 1, BriefcaseBusiness],
  animation: [commands, 0, 2, Clapperboard], space: [commands, 1, 2, House], model: [commands, 2, 2, Boxes], sound: [commands, 3, 2, AudioLines],
  transform: [edits, 0, 0, Scaling], hand: [edits, 1, 0, Hand], pixel: [edits, 2, 0, Grid2x2], blend: [edits, 3, 0, Blend],
  wetMix: [edits, 0, 1, Droplet], lightDark: [edits, 1, 1, Contrast], liquify: [edits, 2, 1, Waves], lassoFill: [edits, 3, 1, LassoSelect],
  dropper: [edits, 0, 2, Pipette], selectRect: [edits, 1, 2, SquareDashed], selectCircle: [edits, 2, 2, CircleDashed], lasso: [edits, 3, 2, Lasso],
  crop: [media, 0, 0, Crop], shapes: [media, 1, 0, Shapes], rect: [media, 2, 0, RectangleHorizontal], oval: [media, 3, 0, Circle],
  text: [media, 0, 1, Type], image: [media, 1, 1, Image], pin: [media, 2, 1, MapPin], guides: [media, 3, 1, Spline],
  pose: [media, 0, 2, PersonStanding], references: [media, 1, 2, Images], fit: [media, 2, 2, Focus], rotate: [media, 3, 2, RotateCw],
  drawingDesk: [workbench, 0, 0, PenTool], storyboard: [workbench, 1, 0, Frame], performer: [workbench, 2, 0, UserRound],
  environment: [workbench, 0, 1, House], stageProp: [workbench, 1, 1, Box], manuscript: [workbench, 2, 1, Upload],
} as const;

export type StudioArtworkTool = keyof typeof tools;

/** 버튼 이름은 호출자가 제공한다. 강제색 또는 이미지 오류 시 같은 의미의 선 아이콘을 표시한다. */
export function StudioToolArtwork({ tool, className = "" }: {
  readonly tool: StudioArtworkTool;
  readonly className?: string;
}) {
  const [atlas, column, row, Fallback] = tools[tool];
  return (
    <span className={`studio-tool-art ${className}`.trim()} data-studio-tool-art={tool} aria-hidden="true">
      <img key={atlas} src={atlas} alt="" draggable={false} decoding="async"
        style={{ left: `-${column * 100}%`, top: `-${row * 100}%`, ...(atlas === workbench && { width: "300%", height: "200%" }) }}
        onLoad={event => { event.currentTarget.dataset.ready = "true"; }}
        onError={event => { delete event.currentTarget.dataset.ready; }} />
      <Fallback aria-hidden="true" focusable="false" />
    </span>
  );
}
