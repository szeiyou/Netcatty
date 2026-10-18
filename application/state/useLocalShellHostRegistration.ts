import { useEffect, useRef } from 'react';
import type { TerminalSession } from '../../domain/models';
import { addLocalShellHosts } from '../../domain/localShellHosts';
import { detectLocalOs } from '../../lib/localShell';
import { useVaultSnapshotActions, useVaultSnapshotField } from './vaultSnapshotStore';

/** Register each opened local session once, without recreating deleted hosts. */
export function useLocalShellHostRegistration(sessions: readonly TerminalSession[]): void {
  const initialized = useVaultSnapshotField('isVaultInitialized');
  const actions = useVaultSnapshotActions();
  const registeredSessionIds = useRef(new Set<string>());

  useEffect(() => {
    if (!initialized || !actions) return;
    const localSessions = sessions.filter(session => session.protocol === 'local'
      && !registeredSessionIds.current.has(session.id));
    if (localSessions.length === 0) return;
    void actions.updateHosts(hosts => addLocalShellHosts(hosts, localSessions, {
      localOs: detectLocalOs(typeof navigator === 'undefined' ? undefined : navigator.userAgent),
      createId: () => crypto.randomUUID(),
      createdAt: Date.now(),
    }));
    for (const session of localSessions) registeredSessionIds.current.add(session.id);
  }, [sessions, initialized, actions]);
}
