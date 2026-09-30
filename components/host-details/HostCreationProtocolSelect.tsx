import React from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { cn } from "../../lib/utils";

export type HostCreationProtocol = "ssh" | "telnet" | "serial";

export function HostCreationProtocolSelect({ value, onChange }: {
  value: HostCreationProtocol;
  onChange: (protocol: HostCreationProtocol) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold">{t("hostDetails.create.protocol")}</p>
      <div className="flex gap-1 rounded-md border border-border/70 p-1" role="group" aria-label={t("hostDetails.create.protocol")}>
        {(["ssh", "telnet", "serial"] as const).map((protocol) => (
          <button
            key={protocol}
            type="button"
            aria-pressed={value === protocol}
            className={cn("flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === protocol ? "bg-secondary text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground")}
            onClick={() => onChange(protocol)}
          >
            {protocol === "serial" ? t("terminal.connection.protocol.serial") : protocol === "ssh" ? "SSH" : "Telnet"}
          </button>
        ))}
      </div>
    </div>
  );
}
