import React, { useCallback, useState } from "react";
import { ImageIcon, X } from "lucide-react";

import { useI18n } from "../../../application/i18n/I18nProvider";
import {
  clearAppBackgroundImage,
  pickAppBackgroundImage,
  removeAppBackgroundImage,
  updateAppBackgroundSettings,
  useAppBackgroundSettings,
} from "../../../application/state/appBackgroundStore";
import {
  APP_BACKGROUND_BLUR_MAX,
  APP_BACKGROUND_SURFACE_OPACITY_MIN,
  appBackgroundFitsFor,
  isAppBackgroundVideo,
  resolveAppBackgroundImageUrl,
  type AppBackgroundFit,
} from "../../../domain/appBackground";
import { Button } from "../../ui/button";
import { toast } from "../../ui/toast";
import { SectionHeader, SettingRow, Select, Toggle } from "../settings-ui";

export const AppBackgroundSettingsSection: React.FC = () => {
  const { t } = useI18n();
  const settings = useAppBackgroundSettings();
  const [picking, setPicking] = useState(false);
  const hasImage = settings.imageIds.length > 0;
  const canTile = settings.imageIds.every((id) => !isAppBackgroundVideo(id));

  const handlePick = useCallback(async () => {
    setPicking(true);
    try {
      const result = await pickAppBackgroundImage();
      if (result.status === "imported") {
        if (result.animated) {
          toast.warning(t("settings.appearance.background.animatedWarning"), { duration: 10000 });
        }
        return;
      }
      if (result.status !== "error") return;
      const message = result.error === "unsupported-type"
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
          <div className="flex w-56 max-w-[45vw] flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePick} disabled={picking}>
                {hasImage
                  ? t("settings.appearance.background.change")
                  : t("settings.appearance.background.choose")}
              </Button>
              {hasImage && (
                <Button variant="ghost" size="sm" onClick={clearAppBackgroundImage} disabled={picking}>
                  {t("settings.appearance.background.removeAll")}
                </Button>
              )}
            </div>
            <div className="flex max-w-full flex-wrap gap-2">
              {hasImage ? settings.imageIds.map((imageId, index) => (
                <div key={imageId} className="relative h-12 w-20 overflow-hidden rounded-md border border-border bg-muted/50">
                  {isAppBackgroundVideo(imageId) ? (
                    <video src={resolveAppBackgroundImageUrl(imageId)} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    <img src={resolveAppBackgroundImageUrl(imageId)} alt="" className="h-full w-full object-cover" draggable={false} />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAppBackgroundImage(imageId)}
                    disabled={picking}
                    aria-label={`${t("settings.appearance.background.remove")} ${index + 1}`}
                    className="absolute right-0 top-0 rounded-bl bg-background/80 p-0.5 text-foreground hover:bg-background"
                  >
                    <X size={12} />
                  </button>
                </div>
              )) : (
                <div className="flex h-10 w-16 items-center justify-center rounded-md border border-border bg-muted/50" aria-hidden="true">
                  <ImageIcon size={16} className="text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </SettingRow>

        <SettingRow label={t("settings.appearance.background.interval")}>
          <Select
            value={String(settings.intervalSeconds)}
            options={[10, 30, 60, 300, 600, 1800, 3600].map((seconds) => ({
              value: String(seconds),
              label: t(`settings.appearance.background.interval.${seconds}`),
            }))}
            onChange={(seconds) => updateAppBackgroundSettings({ intervalSeconds: Number(seconds) })}
            disabled={settings.imageIds.length < 2}
            className="w-36"
          />
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
            options={appBackgroundFitsFor(canTile ? null : settings.imageIds.find(isAppBackgroundVideo) ?? null).map((fit) => ({
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
