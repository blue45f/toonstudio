import { useMemo } from "react";

import { resolveStudioVrmHeldPropContacts } from "./studio-vrm-held-prop-contacts";
import { StudioVrmPropAttachment } from "./StudioVrmWardrobePropsProjection";

import type { ComponentProps } from "react";

type AttachmentProps = ComponentProps<typeof StudioVrmPropAttachment>;

export function StudioVrmViewportPropAttachments({ instances, ...props }: Omit<AttachmentProps, "instance"> & {
  readonly instances: readonly AttachmentProps["instance"][];
}) {
  const effective = useMemo(() => resolveStudioVrmHeldPropContacts(instances, props.metrics), [instances, props.metrics]);
  return <>
    {effective.map(instance => (
      <StudioVrmPropAttachment key={`${props.rigRevision}:${instance.uid}`} instance={instance} {...props} />
    ))}
  </>;
}
