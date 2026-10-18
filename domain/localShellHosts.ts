import type { Host, TerminalSession } from './models';

export const LOCAL_SHELLS_GROUP = 'Local Shells';

export function matchesLocalShellConfiguration(host: Host, session: TerminalSession): boolean {
  return host.protocol === 'local'
    && (host.localShell || '') === (session.localShell || '')
    && JSON.stringify(host.localShellArgs ?? []) === JSON.stringify(session.localShellArgs ?? [])
    && (host.localStartDir || '') === (session.localStartDir || '');
}

export function addLocalShellHosts(
  hosts: Host[],
  sessions: readonly TerminalSession[],
  options: { localOs: Host['os']; createId: () => string; createdAt: number },
): Host[] {
  let result = hosts;
  for (const session of sessions) {
    if (session.protocol !== 'local' || result.some(host =>
      host.id === session.hostId || matchesLocalShellConfiguration(host, session))) continue;
    result = [...result, {
      id: options.createId(),
      label: session.localShellName || session.hostLabel || 'Local Terminal',
      hostname: 'localhost',
      username: 'local',
      port: 0,
      os: options.localOs,
      group: LOCAL_SHELLS_GROUP,
      tags: [],
      protocol: 'local',
      createdAt: options.createdAt,
      localShell: session.localShell,
      localShellArgs: session.localShellArgs ? [...session.localShellArgs] : undefined,
      localShellName: session.localShellName,
      localShellIcon: session.localShellIcon,
      localStartDir: session.localStartDir,
    }];
  }
  return result;
}
