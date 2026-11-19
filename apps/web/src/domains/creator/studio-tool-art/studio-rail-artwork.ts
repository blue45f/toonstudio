import type { StudioRailToolId } from "../studio-app-settings";
import type { StudioArtworkTool } from "./StudioToolArtwork";

export const studioRailArtwork = {
  select: "select", transform: "transform", hand: "hand", pen: "pen", "pixel-pencil": "pixel", eraser: "eraser",
  blend: "blend", "wet-mix": "wetMix", "dodge-burn": "lightDark", liquify: "liquify", fill: "fill", "lasso-fill": "lassoFill",
  eyedropper: "dropper", "marquee-rect": "selectRect", "marquee-circle": "selectCircle", lasso: "lasso", crop: "crop",
  "smart-shape": "shapes", "shape-rect": "rect", "shape-ellipse": "oval", text: "text", bubble: "bubble", image: "image",
  comment: "pin", perspective: "guides", "frame-anim": "animation", mannequin3d: "mannequin", vrm3d: "pose",
  "character-shaper": "character", bg3d: "bg3d", "hybrid-dcc": "model", reference: "references", zoom: "search",
  "zoom-fit": "fit", "rotate-view": "rotate",
} as const satisfies Record<StudioRailToolId, StudioArtworkTool>;
