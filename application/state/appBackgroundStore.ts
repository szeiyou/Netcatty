import { useSyncExternalStore } from 'react';

import {
  DEFAULT_APP_BACKGROUND_SETTINGS,
  isAppBackgroundActive,
  normalizeAppBackgroundSettings,
  type AppBackgroundSettings,
} from '../../domain/appBackground';
import { STORAGE_KEY_APP_BACKGROUND } from '../../infrastructure/config/storageKeys';
import {
  LOCAL_STORAGE_ADAPTER_CHANGED_EVENT,
  localStorageAdapter,
} from '../../infrastructure/persistence/localStorageAdapter';
import { netcattyBridge } from '../../infrastructure/services/netcattyBridge';

type Listener = () => void;

/**
 * Device-local app background settings. Kept outside useSettingsState so
 * background tweaks (slider drags) never rebuild the settings object, and so
 * the settings window and the main window stay in sync through the native
 * `storage` event without IPC plumbing.
 */
class AppBackgroundStore {
  private snapshot: AppBackgroundSettings = DEFAULT_APP_BACKGROUND_SETTINGS;
  private loaded = false;
  private listeners = new Set<Listener>();
  private detachWindowListeners: (() => void) | null = null;

  getSnapshot = (): AppBackgroundSettings => {
    if (!this.loaded) {
      this.loaded = true;
      this.snapshot = this.readStored();
    }
    return this.snapshot;
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    this.attachWindowListeners();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.detachWindowListeners?.();
        this.detachWindowListeners = null;
      }
    };
  };

  update = (patch: Partial<AppBackgroundSettings>): void => {
    const next = normalizeAppBackgroundSettings({ ...this.getSnapshot(), ...patch });
    localStorageAdapter.write(STORAGE_KEY_APP_BACKGROUND, next);
    this.setSnapshot(next);
  };

  private readStored(): AppBackgroundSettings {
    try {
      return normalizeAppBackgroundSettings(localStorageAdapter.read(STORAGE_KEY_APP_BACKGROUND));
    } catch {
      return DEFAULT_APP_BACKGROUND_SETTINGS;
    }
  }

  private reload = (): void => {
    this.setSnapshot(this.readStored());
  };

  private setSnapshot(next: AppBackgroundSettings): void {
    const prev = this.snapshot;
    this.loaded = true;
    if (
      prev.enabled === next.enabled
      && prev.imageId === next.imageId
      && prev.fit === next.fit
      && prev.surfaceOpacity === next.surfaceOpacity
      && prev.blur === next.blur
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }

  private attachWindowListeners(): void {
    if (this.detachWindowListeners || typeof window === 'undefined') return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_APP_BACKGROUND || e.key === null) this.reload();
    };
    const handleAdapterChange = (e: Event) => {
      if ((e as CustomEvent<{ key: string }>).detail?.key === STORAGE_KEY_APP_BACKGROUND) this.reload();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(LOCAL_STORAGE_ADAPTER_CHANGED_EVENT, handleAdapterChange);
    this.detachWindowListeners = () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(LOCAL_STORAGE_ADAPTER_CHANGED_EVENT, handleAdapterChange);
    };
  }
}

export const appBackgroundStore = new AppBackgroundStore();

export const getAppBackgroundSettings = (): AppBackgroundSettings => appBackgroundStore.getSnapshot();

export const updateAppBackgroundSettings = (patch: Partial<AppBackgroundSettings>): void => {
  appBackgroundStore.update(patch);
};

export const isAppBackgroundActiveNow = (): boolean => isAppBackgroundActive(getAppBackgroundSettings());

export function useAppBackgroundSettings(): AppBackgroundSettings {
  return useSyncExternalStore(
    appBackgroundStore.subscribe,
    appBackgroundStore.getSnapshot,
    () => DEFAULT_APP_BACKGROUND_SETTINGS,
  );
}

export function useAppBackgroundActive(): boolean {
  return useSyncExternalStore(
    appBackgroundStore.subscribe,
    isAppBackgroundActiveNow,
    () => false,
  );
}

export type PickAppBackgroundImageResult =
  | { status: 'imported' }
  | { status: 'canceled' }
  | { status: 'error'; error: 'unsupported-type' | 'not-found' | 'too-large' | 'unavailable'; maxBytes?: number };

/** Remove an imported image file unless it is still the configured one. */
function discardImage(imageId: string | null): void {
  if (!imageId || imageId === getAppBackgroundSettings().imageId) return;
  netcattyBridge.get()?.removeAppBackgroundImage?.(imageId).catch((err) => {
    console.warn('[AppBackground] Failed to remove previous image:', err);
  });
}

/**
 * Let the user pick an image (native dialog in the main process), make it the
 * app background and enable it. The previously configured image file is
 * removed from userData.
 */
export async function pickAppBackgroundImage(): Promise<PickAppBackgroundImageResult> {
  const pick = netcattyBridge.get()?.pickAppBackgroundImage;
  if (!pick) return { status: 'error', error: 'unavailable' };
  const result = await pick();
  if ('error' in result) {
    if (result.error === 'canceled') return { status: 'canceled' };
    return { status: 'error', error: result.error, maxBytes: result.maxBytes };
  }
  const previousImageId = getAppBackgroundSettings().imageId;
  updateAppBackgroundSettings({ imageId: result.imageId, enabled: true });
  discardImage(previousImageId);
  return { status: 'imported' };
}

export function clearAppBackgroundImage(): void {
  const previousImageId = getAppBackgroundSettings().imageId;
  updateAppBackgroundSettings({ imageId: null, enabled: false });
  discardImage(previousImageId);
}
