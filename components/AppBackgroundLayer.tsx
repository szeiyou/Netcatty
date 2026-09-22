import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  isAppBackgroundActive,
  isAppBackgroundVideo,
  resolveAppBackgroundImageStyle,
  resolveAppBackgroundImageUrl,
  resolveAppBackgroundMediaStyle,
} from '../domain/appBackground';
import { useAppBackgroundSettings } from '../application/state/appBackgroundStore';

const SURFACE_ALPHA_VAR = '--nc-app-surface-alpha';

/**
 * False until this window has had focus once. A window created hidden (the
 * pre-warmed settings window) still reports `visibilityState === 'visible'`
 * and would load and animate the background for nobody; it never has focus
 * until it is actually shown.
 */
function useWindowHasBeenFocused(): boolean {
  const [focused, setFocused] = useState(() => typeof document !== 'undefined' && document.hasFocus());
  useEffect(() => {
    if (focused) return;
    const handleFocus = () => setFocused(true);
    window.addEventListener('focus', handleFocus);
    // Focus may have arrived between the initial render and this effect.
    if (document.hasFocus()) setFocused(true);
    return () => window.removeEventListener('focus', handleFocus);
  }, [focused]);
  return focused;
}

/**
 * Background image as an <img> element. Unlike a CSS background-image,
 * removing the element (or clearing its src) aborts a still-running load
 * and frees the decoded frames, so switching away from a huge animated
 * image releases its CPU and memory right away.
 */
const BackgroundImage: React.FC<{ src: string; style: React.CSSProperties }> = ({ src, style }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    return () => {
      img?.removeAttribute('src');
    };
  }, [src]);
  return <img ref={imgRef} src={src} alt="" decoding="async" draggable={false} style={style} />;
};

/**
 * Looping muted background video. Paused while the window is hidden
 * (minimized / occluded) so it costs nothing when nobody can see it.
 */
const BackgroundVideo: React.FC<{ src: string; style: React.CSSProperties }> = ({ src, style }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (document.visibilityState === 'hidden') {
        video.pause();
      } else if (video.paused) {
        video.play().catch(() => {
          // Autoplay of a muted video is always allowed; a rejection here
          // means the source failed to load, which the element already shows.
        });
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      // Stop buffering/decoding right away instead of waiting for GC.
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay
      loop
      muted
      playsInline
      disablePictureInPicture
      disableRemotePlayback
      preload="auto"
      style={style}
    />
  );
};

/**
 * Paints the user's app background image or video behind the whole window.
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
  const hasBeenFocused = useWindowHasBeenFocused();

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
  const url = resolveAppBackgroundImageUrl(settings.imageId);
  const filter = settings.blur > 0 ? `blur(${settings.blur}px)` : undefined;
  // <img>/<video> are replaced elements: insets alone do not stretch them.
  const mediaBox: React.CSSProperties = {
    position: 'absolute',
    inset: overscan,
    width: `calc(100% + ${-overscan * 2}px)`,
    height: `calc(100% + ${-overscan * 2}px)`,
    willChange: 'transform',
    ...resolveAppBackgroundMediaStyle(settings.fit),
    filter,
  };

  let media: React.ReactNode = null;
  if (!hasBeenFocused) {
    // Keep the tinted base only; load the media once the window is shown.
  } else if (isAppBackgroundVideo(settings.imageId)) {
    media = <BackgroundVideo key={url} src={url} style={mediaBox} />;
  } else if (settings.fit === 'tile') {
    // Tiling needs CSS background-repeat; object-fit has no equivalent.
    media = (
      <div
        key={url}
        style={{
          position: 'absolute',
          inset: overscan,
          willChange: 'transform',
          backgroundImage: `url("${url}")`,
          ...resolveAppBackgroundImageStyle(settings.fit),
          filter,
        }}
      />
    );
  } else {
    media = <BackgroundImage key={url} src={url} style={mediaBox} />;
  }

  // The media gets its own compositor layer (will-change) inside a fully
  // contained box. Otherwise it is rasterized into the same layer as the UI
  // painted above it, so every frame of an animated image or video would
  // also re-raster the translucent app surfaces and stall terminal rendering.
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
        contain: 'strict',
        backgroundColor: 'hsl(var(--background))',
      }}
    >
      {media}
    </div>
  );
};
