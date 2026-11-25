import {
  StudioOnnxAnimeStylePanel,
  StudioOnnxColorizePanel,
  StudioOnnxUpscalePanel,
} from "../studio-page-lazy-ui";

interface StudioOnnxInspectorImageToolsProps {
  readonly src: string;
  readonly cloudConfigured: boolean;
  readonly onResult: (dataUrl: string) => void;
}

export function StudioOnnxInspectorImageTools({
  src,
  cloudConfigured,
  onResult,
}: StudioOnnxInspectorImageToolsProps) {
  return (
    <>
      <StudioOnnxColorizePanel src={src} cloudConfigured={cloudConfigured} onResult={onResult} />
      <StudioOnnxUpscalePanel src={src} onResult={onResult} />
      <StudioOnnxAnimeStylePanel src={src} cloudConfigured={cloudConfigured} onResult={onResult} />
    </>
  );
}
