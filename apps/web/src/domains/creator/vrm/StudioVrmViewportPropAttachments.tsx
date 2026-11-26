import { StudioVrmPropAttachment } from "./StudioVrmWardrobePropsProjection";

import type { ComponentProps } from "react";

type AttachmentProps = ComponentProps<typeof StudioVrmPropAttachment>;

export function StudioVrmViewportPropAttachments({ instances, ...props }: Omit<AttachmentProps, "instance"> & {
  readonly instances: readonly AttachmentProps["instance"][];
}) {
  return <>
    {instances.map(instance => (
      <StudioVrmPropAttachment key={`${props.rigRevision}:${instance.uid}`} instance={instance} {...props} />
    ))}
  </>;
}
