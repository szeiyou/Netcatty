import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_APP_BACKGROUND_SETTINGS,
  appNestedSurfaceColor,
  appSurfaceColor,
  isAppBackgroundActive,
  isValidAppBackgroundImageId,
  normalizeAppBackgroundSettings,
  resolveAppBackgroundImageStyle,
  resolveAppBackgroundImageUrl,
  resolveTransparentTerminalBackground,
} from './appBackground.ts';

const IMAGE_ID = '0123456789abcdef0123456789abcdef.png';

test('normalize falls back to defaults for garbage input', () => {
  assert.deepEqual(normalizeAppBackgroundSettings(null), DEFAULT_APP_BACKGROUND_SETTINGS);
  assert.deepEqual(normalizeAppBackgroundSettings('nope'), DEFAULT_APP_BACKGROUND_SETTINGS);
  assert.deepEqual(
    normalizeAppBackgroundSettings({ enabled: 'yes', fit: 'stretch', surfaceOpacity: 'x', blur: NaN }),
    DEFAULT_APP_BACKGROUND_SETTINGS,
  );
});

test('normalize clamps numeric ranges', () => {
  const low = normalizeAppBackgroundSettings({ surfaceOpacity: 0, blur: -5 });
  assert.equal(low.surfaceOpacity, 0.2);
  assert.equal(low.blur, 0);
  const high = normalizeAppBackgroundSettings({ surfaceOpacity: 3, blur: 999.6 });
  assert.equal(high.surfaceOpacity, 1);
  assert.equal(high.blur, 40);
});

test('normalize rejects image ids that could escape the image directory', () => {
  for (const imageId of ['../secret.png', '/etc/passwd', 'abc.png', `${IMAGE_ID}/..`, 'C:\\x.png']) {
    assert.equal(normalizeAppBackgroundSettings({ imageId }).imageId, null, imageId);
    assert.equal(isValidAppBackgroundImageId(imageId), false, imageId);
  }
  assert.equal(normalizeAppBackgroundSettings({ imageId: IMAGE_ID }).imageId, IMAGE_ID);
});

test('background is only active when enabled with an image', () => {
  assert.equal(isAppBackgroundActive({ ...DEFAULT_APP_BACKGROUND_SETTINGS, enabled: true }), false);
  assert.equal(isAppBackgroundActive({ ...DEFAULT_APP_BACKGROUND_SETTINGS, imageId: IMAGE_ID }), false);
  assert.equal(
    isAppBackgroundActive({ ...DEFAULT_APP_BACKGROUND_SETTINGS, enabled: true, imageId: IMAGE_ID }),
    true,
  );
});

test('image url uses the dedicated protocol', () => {
  assert.equal(resolveAppBackgroundImageUrl(IMAGE_ID), `netcatty-bg://image/${IMAGE_ID}`);
});

test('fit modes map to css background properties', () => {
  assert.equal(resolveAppBackgroundImageStyle('cover').backgroundSize, 'cover');
  assert.equal(resolveAppBackgroundImageStyle('contain').backgroundSize, 'contain');
  assert.equal(resolveAppBackgroundImageStyle('tile').backgroundRepeat, 'repeat');
  assert.equal(resolveAppBackgroundImageStyle('center').backgroundRepeat, 'no-repeat');
});

test('surface color falls back to fully opaque when the alpha var is unset', () => {
  assert.equal(
    appSurfaceColor('#112233'),
    'color-mix(in srgb, #112233 calc(var(--nc-app-surface-alpha, 1) * 100%), transparent)',
  );
});

test('nested surface color falls back to fully opaque when the alpha var is unset', () => {
  assert.equal(
    appNestedSurfaceColor('#112233'),
    'color-mix(in srgb, #112233 calc(var(--nc-app-nested-surface-alpha, 1) * 100%), transparent)',
  );
});

test('transparent terminal background keeps rgb channels for inverse video', () => {
  assert.equal(resolveTransparentTerminalBackground('#1e1e2e'), '#1e1e2e00');
  assert.equal(resolveTransparentTerminalBackground('#1e1e2eff'), '#1e1e2e00');
  assert.equal(resolveTransparentTerminalBackground('#abc'), '#aabbcc00');
  assert.equal(resolveTransparentTerminalBackground('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
});
