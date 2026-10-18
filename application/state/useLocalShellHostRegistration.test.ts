import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Host, TerminalSession } from '../../domain/models';
import { createLocalTerminalSession } from './sessionFactories';
import { useLocalShellHostRegistration } from './useLocalShellHostRegistration';
import {
  getVaultSnapshot, getVaultSnapshotActions, publishVaultSnapshot,
  registerVaultSnapshotActions, type VaultSnapshotActions,
} from './vaultSnapshotStore';

test('registration waits for vault hydration and does not resurrect a deleted host on session updates', async () => {
  const originalSnapshot = getVaultSnapshot();
  const originalActions = getVaultSnapshotActions();
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalAct = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  let hosts: Host[] = [];
  let sessions: TerminalSession[] = [createLocalTerminalSession('first', { shell: '/bin/bash' })];
  let writes = 0;
  let renderer: ReactTestRenderer | undefined;
  const Probe = () => { useLocalShellHostRegistration(sessions); return null; };
  try {
    publishVaultSnapshot({ ...originalSnapshot, hosts: [], isVaultInitialized: false });
    registerVaultSnapshotActions({
      updateHosts: (update: Host[] | ((previous: Host[]) => Host[])) => {
        hosts = typeof update === 'function' ? update(hosts) : update;
        writes++;
        return Promise.resolve('written' as const);
      },
    } as VaultSnapshotActions);
    await act(async () => { renderer = create(React.createElement(Probe)); });
    assert.equal(writes, 0);
    await act(async () => {
      publishVaultSnapshot({ ...originalSnapshot, hosts: [], isVaultInitialized: true });
    });
    assert.equal(hosts.length, 1);
    assert.equal(hosts[0].group, 'Local Shells');
    hosts = [];
    sessions = sessions.map(session => ({ ...session, status: 'connected' }));
    await act(async () => { renderer?.update(React.createElement(Probe)); });
    assert.equal(writes, 1);
    assert.equal(hosts.length, 0);
    sessions = [...sessions, createLocalTerminalSession('second', { shell: '/bin/bash' })];
    await act(async () => { renderer?.update(React.createElement(Probe)); });
    assert.equal(hosts.length, 1);
    sessions = [];
    await act(async () => { renderer?.update(React.createElement(Probe)); });
    assert.equal(hosts.length, 1);
  } finally {
    await act(async () => { renderer?.unmount(); });
    publishVaultSnapshot(originalSnapshot);
    registerVaultSnapshotActions(originalActions);
    environment.IS_REACT_ACT_ENVIRONMENT = originalAct;
  }
});
