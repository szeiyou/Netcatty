import assert from 'node:assert/strict';
import test from 'node:test';
import { addLocalShellHosts } from './localShellHosts';
import { createLocalTerminalSession } from '../application/state/sessionFactories';

const options = { localOs: 'windows' as const, createId: () => 'saved-local', createdAt: 1 };

test('local shell registration creates a persistent grouped host and deduplicates repeated opens', () => {
  const session = createLocalTerminalSession('one', {
    shell: 'wsl.exe', shellArgs: ['-d', 'Ubuntu'], shellName: 'Ubuntu (WSL)', shellIcon: 'ubuntu', localStartDir: '/work',
  });
  const hosts = addLocalShellHosts([], [session], options);
  assert.equal(hosts[0].group, 'Local Shells');
  assert.equal(hosts[0].label, 'Ubuntu (WSL)');
  assert.equal(hosts[0].localStartDir, '/work');
  assert.deepEqual(hosts[0].localShellArgs, ['-d', 'Ubuntu']);
  assert.notEqual(hosts[0].localShellArgs, session.localShellArgs);
  assert.equal(addLocalShellHosts(hosts, [{ ...session, id: 'two' }], options), hosts);
  assert.equal(session.hostId, 'local-terminal');
});

test('different WSL distributions, arguments and start directories are separate configurations', () => {
  const base = createLocalTerminalSession('one', { shell: 'wsl.exe', shellArgs: ['-d', 'Ubuntu'] });
  const sessions = [base, { ...base, id: 'two', localShellArgs: ['-d', 'Debian'] }, { ...base, id: 'three', localStartDir: '/work' }];
  let counter = 0;
  const hosts = addLocalShellHosts([], sessions, { ...options, createId: () => `local-${++counter}` });
  assert.equal(hosts.length, 3);
  assert.equal(new Set(hosts.map(host => host.id)).size, 3);
});

test('existing user managed local hosts are reused without changing their name or group', () => {
  const session = createLocalTerminalSession('one');
  const hosts = addLocalShellHosts([], [session], options).map(host => ({ ...host, label: 'My shell', group: 'Work' }));
  assert.equal(addLocalShellHosts(hosts, [{ ...session, localShellArgs: [] }], options), hosts);
  assert.equal(addLocalShellHosts(hosts, [{ ...session, hostId: hosts[0].id, localShell: '/bin/zsh' }], options), hosts);
  assert.equal(addLocalShellHosts(hosts, [{ ...session, protocol: 'ssh' }], options), hosts);
});
