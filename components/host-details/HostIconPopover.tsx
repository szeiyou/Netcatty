import React, { useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { getEffectiveHostDistro } from "../../domain/host";
import type { Host } from "../../types";
import { DistroAvatar } from "../DistroAvatar";
import { HostIconPicker } from "../HostIconPicker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { PortalContainerProvider } from "../ui/portal-container";

type PickerProps = React.ComponentProps<typeof HostIconPicker>;
export type HostIconPickerOptions = Pick<PickerProps, "distroOptions" | "getDistroOptionLabel">;
export type HostIconSelection = Parameters<PickerProps["onChange"]>[0];

export function HostIconPopover({ host, options, onChange }: {
  host: Host;
  options: HostIconPickerOptions;
  onChange: PickerProps["onChange"];
}) {
  const { t } = useI18n();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-primary/50 bg-primary/10 transition-colors hover:bg-primary/20" aria-label={t("hostDetails.icon.sectionTitle")}>
          <DistroAvatar host={host} fallback={host.label || host.hostname} size="sm" />
        </button>
      </PopoverTrigger>
      <PopoverContent ref={setContainer} className="w-[360px] max-w-[calc(100vw-48px)]" align="start">
        {/* Keep nested menus inside the popover's focus and stacking boundary. */}
        <PortalContainerProvider container={container}>
          <HostIconPicker
            {...options}
            previewHost={host}
            effectiveDistro={getEffectiveHostDistro(host)}
            distroMode={host.distroMode}
            manualDistro={host.manualDistro}
            iconMode={host.iconMode}
            iconId={host.iconId}
            iconColorMode={host.iconColorMode}
            iconColor={host.iconColor}
            iconColorCustom={host.iconColorCustom}
            onChange={onChange}
          />
        </PortalContainerProvider>
      </PopoverContent>
    </Popover>
  );
}
