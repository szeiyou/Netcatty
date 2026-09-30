import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  isAppBackgroundActive,
  isAppBackgroundVideo,
  nextAppBackgroundImageId,
  resolveAppBackgroundImageStyle,
  resolveAppBackgroundImageUrl,
  resolveAppBackgroundMediaStyle,
} from '../domain/appBackground';
import { useAppBackgroundSettings } from '../application/state/appBackgroundStore';

const SURFACE_ALPHA_VAR = '--nc-app-surface-alpha';
const CROSSFADE_MS = 700;

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
const BackgroundImage: React.FC<{ src: string; style: React.CSSProperties; onReady?: () => void }> = ({ src, style, onReady }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) onReady?.();
  }, [src, onReady]);
  useEffect(() => {
    const img = imgRef.current;
    return () => {
      img?.removeAttribute('src');
    };
  }, [src]);
  return <img ref={imgRef} src={src} alt="" decoding="async" draggable={false} style={style} onLoad={onReady} />;
};

/**
 * Looping muted background video. Paused while the window is hidden
 * (minimized / occluded) so it costs nothing when nobody can see it.
 */
const BackgroundVideo: React.FC<{ src: string; style: React.CSSProperties; onReady?: () => void }> = ({ src, style, onReady }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onReady?.();
  }, [src, onReady]);

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
      onLoadedData={onReady}
    />
  );
};

const BackgroundTile: React.FC<{
  src: string;
  style: React.CSSProperties;
  onReady?: () => void;
}> = ({ src, style, onReady }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) onReady?.();
  }, [src, onReady]);
  return <>
    <div style={style} />
    {onReady && <img ref={imgRef} src={src} alt="" style={{ display: 'none' }} onLoad={onReady} />}
  </>;
};

/**
 * Paints the user's selected app backgrounds behind the whole window.
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
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const imageIdsKey = settings.imageIds.join('|');
  const imageIds = useMemo(() => imageIdsKey ? imageIdsKey.split('|') : [], [imageIdsKey]);

  useEffect(() => {
    setCurrentImageId(imageIds[0] ?? null);
  }, [imageIds]);

  useEffect(() => {
    if (!active || !hasBeenFocused || imageIds.length < 2) return;
    const timer = window.setInterval(() => {
      setCurrentImageId((current) => nextAppBackgroundImageId(imageIds, current));
    }, settings.intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [active, hasBeenFocused, imageIds, settings.intervalSeconds]);
  const imageId = currentImageId && imageIds.includes(currentImageId)
    ? currentImageId : imageIds[0];
  const [displayedId, setDisplayedId] = useState(imageId);
  const [incoming, setIncoming] = useState<{ id: string; ready: boolean } | null>(null);

  useEffect(() => {
    if (!imageId) return;
    if (!displayedId || !imageIds.includes(displayedId)) {
      // A removed file cannot remain as the outgoing layer.
      setDisplayedId(imageId);
      setIncoming(null);
      return;
    }
    if ((imageId === displayedId && !incoming) || incoming?.id === imageId) return;
    // If the selection changes mid-fade, keep whichever layer is already visible.
    const visibleId = incoming?.ready ? incoming.id : displayedId;
    setDisplayedId(visibleId);
    setIncoming(visibleId === imageId ? null : { id: imageId, ready: false });
  }, [imageId, imageIds, displayedId, incoming]);

  useEffect(() => {
    if (!incoming?.ready) return;
    const timer = window.setTimeout(() => {
      setDisplayedId(incoming.id);
      setIncoming((current) => current?.id === incoming.id ? null : current);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [incoming]);

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

  if (!active || !imageId) return null;

  // Blur samples transparent pixels past the edge; overscan hides the halo.
  const overscan = settings.blur > 0 ? -settings.blur * 2 : 0;
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

  const renderMedia = (id: string, onReady?: () => void) => {
    const url = resolveAppBackgroundImageUrl(id);
    if (isAppBackgroundVideo(id)) {
      return <BackgroundVideo src={url} style={mediaBox} onReady={onReady} />;
    }
    if (settings.fit === 'tile') {
      // Tiling needs CSS background-repeat; preload before revealing this layer.
      return <BackgroundTile src={url} onReady={onReady} style={{
        position: 'absolute',
        inset: overscan,
        willChange: 'transform',
        backgroundImage: `url("${url}")`,
        ...resolveAppBackgroundImageStyle(settings.fit),
        filter,
      }} />;
    }
    return <BackgroundImage src={url} style={mediaBox} onReady={onReady} />;
  };

  const media = hasBeenFocused && [
    <div key={displayedId} className="app-background-crossfade" style={{ opacity: incoming?.ready ? 0 : 1 }}>
      {renderMedia(displayedId)}
    </div>,
    incoming && <div key={incoming.id} className="app-background-crossfade" style={{ opacity: incoming.ready ? 1 : 0 }}>
      {renderMedia(incoming.id, () => setIncoming((current) => current?.id === incoming.id && !current.ready
        ? { ...current, ready: true } : current))}
    </div>,
  ];

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
