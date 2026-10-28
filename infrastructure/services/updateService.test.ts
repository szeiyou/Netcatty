import test from 'node:test';
import assert from 'node:assert/strict';
import { checkForUpdates, getDownloadUrlForPlatform, getReleaseUrl } from './updateService';

test('Windows x64 checks and downloads use the self-hosted release feed', async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, { window: { netcatty: {
    getHostedUpdateRelease: async () => ({
      version: '1.1.90-bg.2',
      releaseDate: '2026-10-28T02:33:39Z',
      releaseNotes: 'Custom release',
      files: [{ url: 'Netcatty-1.1.90-bg.2-win-x64.exe', size: 123 }],
      source: { tag: 'v1.1.90-bg.2', url: 'https://github.com/szeiyou/Netcatty/releases/tag/v1.1.90-bg.2' },
    }),
  } } });
  globalThis.fetch = async () => { throw new Error('Renderer must not fetch the hosted feed or GitHub'); };
  try {
    const result = await checkForUpdates('1.1.90-bg.1');
    assert.equal(result.error, undefined);
    assert.equal(result.hasUpdate, true);
    assert.equal(result.latestRelease?.body, 'Custom release');
    assert.equal(result.latestRelease?.htmlUrl, 'https://github.com/szeiyou/Netcatty/releases/tag/v1.1.90-bg.2');
    assert.equal(getDownloadUrlForPlatform(result.latestRelease!, 'win32'),
      'http://47.116.163.88:8022/netcatty/windows/x64/Netcatty-1.1.90-bg.2-win-x64.exe');
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(globalThis, { window: originalWindow });
  }
});

test('hosted feed errors are reported without falling back to upstream releases', async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, { window: { netcatty: {
    getHostedUpdateRelease: async () => { throw new Error('Update service returned 503'); },
  } } });
  globalThis.fetch = async () => { throw new Error('Must not fall back to upstream'); };
  try {
    const result = await checkForUpdates('1.1.90-bg.1');
    assert.equal(result.hasUpdate, false);
    assert.equal(result.error, 'Update service returned 503');
    assert.equal(result.latestRelease, null);
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(globalThis, { window: originalWindow });
  }
});

test('release links use the custom repository only on Windows x64', async () => {
  const originalWindow = globalThis.window;
  try {
    for (const [platform, arch, owner] of [
      ['win32', 'x64', 'szeiyou'],
      ['win32', 'arm64', 'binaricat'],
      ['darwin', 'arm64', 'binaricat'],
      ['linux', 'x64', 'binaricat'],
    ]) {
      Object.assign(globalThis, { window: { netcatty: {
        getAppInfo: async () => ({ platform, arch }),
      } } });
      assert.equal(await getReleaseUrl('1.1.90-bg.2'),
        `https://github.com/${owner}/Netcatty/releases/tag/v1.1.90-bg.2`);
    }
  } finally {
    Object.assign(globalThis, { window: originalWindow });
  }
});
