/**
 * App-wide background image settings.
 *
 * Backgrounds are images or looping muted videos (mp4/webm); each image ID
 * names one file, and its extension tells them apart. The files live
 * in the main process userData directory (`app-backgrounds/`), imported by
 * appBackgroundBridge. The renderer only stores opaque image IDs and
 * loads it through the `netcatty-bg://` protocol, so this setting is
 * device-local and never carries a raw filesystem path.
 */

export type AppBackgroundFit = 'cover' | 'contain' | 'tile' | 'center';

export interface AppBackgroundSettings {
  enabled: boolean;
  imageIds: string[];
  intervalSeconds: number;
  fit: AppBackgroundFit;
  /** Opacity of app surfaces (panels, terminal) drawn on top of the image. */
  surfaceOpacity: number;
  /** Gaussian blur applied to the image, in px. */
  blur: number;
}

export const APP_BACKGROUND_PROTOCOL_SCHEME = 'netcatty-bg';
export const APP_BACKGROUND_FITS: readonly AppBackgroundFit[] = ['cover', 'contain', 'tile', 'center'];
export const APP_BACKGROUND_SURFACE_OPACITY_MIN = 0.2;
export const APP_BACKGROUND_SURFACE_OPACITY_MAX = 1;
export const APP_BACKGROUND_BLUR_MAX = 40;
export const APP_BACKGROUND_INTERVAL_MIN = 10;
export const APP_BACKGROUND_INTERVAL_MAX = 3600;

/** Content-hash file name produced by appBackgroundBridge.importImage. */
const IMAGE_ID_PATTERN = /^[a-f0-9]{16,64}\.(png|jpg|jpeg|webp|gif|bmp|avif|mp4|webm)$/;
const VIDEO_ID_PATTERN = /\.(mp4|webm)$/;

export const DEFAULT_APP_BACKGROUND_SETTINGS: AppBackgroundSettings = Object.freeze({
  enabled: false,
  imageIds: [],
  intervalSeconds: 60,
  fit: 'cover',
  surfaceOpacity: 0.8,
  blur: 0,
});

export function isValidAppBackgroundImageId(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_ID_PATTERN.test(value);
}

/** Whether the background file is a video (played by a <video> element). */
export function isAppBackgroundVideo(imageId: string | null): boolean {
  return imageId !== null && VIDEO_ID_PATTERN.test(imageId);
}

/** Fit modes that apply to a background file; videos cannot tile. */
export function appBackgroundFitsFor(imageId: string | null): readonly AppBackgroundFit[] {
  return isAppBackgroundVideo(imageId)
    ? APP_BACKGROUND_FITS.filter((fit) => fit !== 'tile')
    : APP_BACKGROUND_FITS;
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

export function normalizeAppBackgroundSettings(raw: unknown): AppBackgroundSettings {
  const input = raw && typeof raw === 'object'
    ? (raw as Partial<AppBackgroundSettings> & { imageId?: unknown }) : {};
  const defaults = DEFAULT_APP_BACKGROUND_SETTINGS;
  const imageIds = Array.isArray(input.imageIds)
    ? input.imageIds
    : isValidAppBackgroundImageId(input.imageId) ? [input.imageId] : [];
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    imageIds: [...new Set(imageIds.filter(isValidAppBackgroundImageId))],
    intervalSeconds: Math.round(clamp(input.intervalSeconds,
      APP_BACKGROUND_INTERVAL_MIN, APP_BACKGROUND_INTERVAL_MAX, defaults.intervalSeconds)),
    fit: APP_BACKGROUND_FITS.includes(input.fit as AppBackgroundFit)
      ? (input.fit as AppBackgroundFit)
      : defaults.fit,
    surfaceOpacity: clamp(
      input.surfaceOpacity,
      APP_BACKGROUND_SURFACE_OPACITY_MIN,
      APP_BACKGROUND_SURFACE_OPACITY_MAX,
      defaults.surfaceOpacity,
    ),
    blur: Math.round(clamp(input.blur, 0, APP_BACKGROUND_BLUR_MAX, defaults.blur)),
  };
}

/** The background only takes effect once an image has actually been imported. */
export function isAppBackgroundActive(settings: AppBackgroundSettings): boolean {
  return settings.enabled && settings.imageIds.length > 0;
}

export function nextAppBackgroundImageId(imageIds: readonly string[], currentId: string | null): string | null {
  if (imageIds.length === 0) return null;
  const index = imageIds.indexOf(currentId ?? '');
  return imageIds[(index + 1) % imageIds.length];
}

export function resolveAppBackgroundImageUrl(imageId: string): string {
  return `${APP_BACKGROUND_PROTOCOL_SCHEME}://image/${encodeURIComponent(imageId)}`;
}

export function resolveAppBackgroundImageStyle(fit: AppBackgroundFit): {
  backgroundSize: string;
  backgroundRepeat: string;
  backgroundPosition: string;
} {
  switch (fit) {
    case 'contain':
      return { backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    case 'tile':
      return { backgroundSize: 'auto', backgroundRepeat: 'repeat', backgroundPosition: 'top left' };
    case 'center':
      return { backgroundSize: 'auto', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    case 'cover':
    default:
      return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
  }
}

/**
 * `object-fit` / `object-position` for a background drawn by an <img> or
 * <video> element. Tiling has no object-fit equivalent (tiled images use
 * the CSS background path; videos cannot tile), so it falls back to cover.
 */
export function resolveAppBackgroundMediaStyle(fit: AppBackgroundFit): {
  objectFit: 'cover' | 'contain' | 'none';
  objectPosition: string;
} {
  switch (fit) {
    case 'contain':
      return { objectFit: 'contain', objectPosition: 'center' };
    case 'center':
      return { objectFit: 'none', objectPosition: 'center' };
    case 'tile':
    case 'cover':
    default:
      return { objectFit: 'cover', objectPosition: 'center' };
  }
}

/**
 * CSS color for an app surface that should let the background image show
 * through. `--nc-app-surface-alpha` is only defined on <html> while the
 * background is active, so with the feature off this resolves to the
 * original color unchanged.
 */
export function appSurfaceColor(color: string): string {
  return `color-mix(in srgb, ${color} calc(var(--nc-app-surface-alpha, 1) * 100%), transparent)`;
}

/**
 * CSS color for a surface nested inside another app surface (toolbar rows
 * inside a sidebar, …). While the background is active it becomes fully
 * transparent so translucent layers do not stack into an opaque block; with
 * the feature off it resolves to the original color.
 */
export function appNestedSurfaceColor(color: string): string {
  return `color-mix(in srgb, ${color} calc(var(--nc-app-nested-surface-alpha, 1) * 100%), transparent)`;
}

/**
 * xterm theme background for a terminal drawn over the app background.
 * The alpha must be zero (the pane container provides the tinted surface),
 * but the RGB channels must stay the theme color: xterm renders inverse
 * video with `opaque(background)` as the foreground.
 */
export function resolveTransparentTerminalBackground(background: string): string {
  const hex = background.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}00`;
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) return `${hex.slice(0, 7)}00`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}00`;
  }
  return background;
}
