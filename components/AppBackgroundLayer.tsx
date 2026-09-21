import React, { useLayoutEffect } from 'react';

import {
  isAppBackgroundActive,
  resolveAppBackgroundImageStyle,
  resolveAppBackgroundImageUrl,
} from '../domain/appBackground';
import { useAppBackgroundSettings } from '../application/state/appBackgroundStore';

const SURFACE_ALPHA_VAR = '--nc-app-surface-alpha';

/**
 * Paints the user's app background image behind the whole window.
 *
 * While active it marks <html data-app-background> and publishes
 * `--nc-app-surface-alpha`; index.css turns the theme surface colors
 * translucent from those, and terminal/chrome surfaces go through
 * `appSurfaceColor()`. With no image configured this renders nothing and
 * leaves the document untouched.
 */
export const AppBackgroundLayer: React.FC = () => {
  const settings = useAppBackgroundSettings();
  const active = isAppBackgroundActive(settings);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!active) {
      delete root.dataset.appBackground;
      root.style.removeProperty(SURFACE_ALPHA_VAR);
      return;
    }
    root.dataset.appBackground = '';
    root.style.setProperty(SURFACE_ALPHA_VAR, String(settings.surfaceOpacity));
  }, [active, settings.surfaceOpacity]);

  useLayoutEffect(() => () => {
    const root = document.documentElement;
    delete root.dataset.appBackground;
    root.style.removeProperty(SURFACE_ALPHA_VAR);
  }, []);

  if (!active || !settings.imageId) return null;

  // Blur samples transparent pixels past the edge; overscan hides the halo.
  const overscan = settings.blur > 0 ? -settings.blur * 2 : 0;

  return (
    <div
      aria-hidden="true"
      data-app-background-layer=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        overflow: 'hidden',
        pointerEvents: 'none',
        backgroundColor: 'hsl(var(--background))',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: overscan,
          backgroundImage: `url("${resolveAppBackgroundImageUrl(settings.imageId)}")`,
          ...resolveAppBackgroundImageStyle(settings.fit),
          filter: settings.blur > 0 ? `blur(${settings.blur}px)` : undefined,
        }}
      />
    </div>
  );
};
