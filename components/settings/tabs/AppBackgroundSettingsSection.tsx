import React, { useCallback, useState } from "react";
import { ImageIcon } from "lucide-react";

import { useI18n } from "../../../application/i18n/I18nProvider";
import {
  clearAppBackgroundImage,
  pickAppBackgroundImage,
  updateAppBackgroundSettings,
  useAppBackgroundSettings,
} from "../../../application/state/appBackgroundStore";
import {
  APP_BACKGROUND_BLUR_MAX,
  APP_BACKGROUND_SURFACE_OPACITY_MIN,
  resolveAppBackgroundImageUrl,
  type AppBackgroundFit,
} from "../../../domain/appBackground";
import { Button } from "../../ui/button";
import { toast } from "../../ui/toast";
import { SectionHeader, SettingRow, Select, Toggle } from "../settings-ui";

const FIT_OPTIONS: AppBackgroundFit[] = ["cover", "contain", "tile", "center"];

export const AppBackgroundSettingsSection: React.FC = () => {
  const { t } = useI18n();
  const settings = useAppBackgroundSettings();
  const [picking, setPicking] = useState(false);
  const hasImage = settings.imageId !== null;

  const handlePick = useCallback(async () => {
    setPicking(true);
    try {
      const result = await pickAppBackgroundImage();
      if (result.status !== "error") return;
      const message = result.error === "too-large"
        ? t("settings.appearance.background.error.tooLarge", {
          size: Math.round((result.maxBytes ?? 0) / (1024 * 1024)),
        })
        : result.error === "unsupported-type"
          ? t("settings.appearance.background.error.unsupported")
          : t("settings.appearance.background.error.generic");
      toast.error(message);
    } catch (err) {
      console.warn("[AppBackground] Failed to import image:", err);
      toast.error(t("settings.appearance.background.error.generic"));
    } finally {
      setPicking(false);
    }
  }, [t]);

  return (
    <>
      <SectionHeader title={t("settings.appearance.background")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          anchorId="appearance-background-image"
          label={t("settings.appearance.background.image")}
          description={t("settings.appearance.background.image.desc")}
        >
          <div className="flex items-center gap-2">
            <div
              className="h-10 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted/50 flex items-center justify-center"
              aria-hidden="true"
            >
              {settings.imageId ? (
                <img
                  src={resolveAppBackgroundImageUrl(settings.imageId)}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <ImageIcon size={16} className="text-muted-foreground" />
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handlePick} disabled={picking}>
              {hasImage
                ? t("settings.appearance.background.change")
                : t("settings.appearance.background.choose")}
            </Button>
            {hasImage && (
              <Button variant="ghost" size="sm" onClick={clearAppBackgroundImage} disabled={picking}>
                {t("settings.appearance.background.remove")}
              </Button>
            )}
          </div>
        </SettingRow>

        <SettingRow
          anchorId="appearance-background-enabled"
          label={t("settings.appearance.background.enabled")}
        >
          <Toggle
            checked={settings.enabled && hasImage}
            disabled={!hasImage}
            onChange={(enabled) => updateAppBackgroundSettings({ enabled })}
            ariaLabel={t("settings.appearance.background.enabled")}
          />
        </SettingRow>

        <SettingRow label={t("settings.appearance.background.fit")}>
          <Select
            value={settings.fit}
            options={FIT_OPTIONS.map((fit) => ({
              value: fit,
              label: t(`settings.appearance.background.fit.${fit}`),
            }))}
            onChange={(fit) => updateAppBackgroundSettings({ fit: fit as AppBackgroundFit })}
            disabled={!hasImage}
            className="w-36"
          />
        </SettingRow>

        <SettingRow
          label={t("settings.appearance.background.surfaceOpacity")}
          description={t("settings.appearance.background.surfaceOpacity.desc")}
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={Math.round(APP_BACKGROUND_SURFACE_OPACITY_MIN * 100)}
              max={100}
              step={1}
              value={Math.round(settings.surfaceOpacity * 100)}
              onChange={(e) => updateAppBackgroundSettings({ surfaceOpacity: Number(e.target.value) / 100 })}
              disabled={!hasImage}
              className="w-28 accent-primary disabled:opacity-50"
              aria-label={t("settings.appearance.background.surfaceOpacity")}
            />
            <span className="text-sm text-muted-foreground w-10 text-right tabular-nums">
              {Math.round(settings.surfaceOpacity * 100)}%
            </span>
          </div>
        </SettingRow>

        <SettingRow label={t("settings.appearance.background.blur")}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={APP_BACKGROUND_BLUR_MAX}
              step={1}
              value={settings.blur}
              onChange={(e) => updateAppBackgroundSettings({ blur: Number(e.target.value) })}
              disabled={!hasImage}
              className="w-28 accent-primary disabled:opacity-50"
              aria-label={t("settings.appearance.background.blur")}
            />
            <span className="text-sm text-muted-foreground w-10 text-right tabular-nums">
              {settings.blur}px
            </span>
          </div>
        </SettingRow>
      </div>
    </>
  );
};
