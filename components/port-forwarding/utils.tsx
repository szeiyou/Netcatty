/**
 * Port Forwarding utilities and constants
 */
import React from 'react';
import { Globe, Server, Shuffle } from 'lucide-react';
import { PortForwardingType } from '../../domain/models';

export const TYPE_LABELS: Record<PortForwardingType, string> = {
  local: 'Local Forwarding',
  remote: 'Remote Forwarding',
  dynamic: 'Dynamic Forwarding',
};

export const TYPE_DESCRIPTIONS: Record<PortForwardingType, string> = {
  local: 'Local forwarding lets you access a remote server\'s listening port as though it were local.',
  remote: 'Remote forwarding opens a port on the remote machine and forwards connections to the local (current) host.',
  dynamic: 'Dynamic port forwarding turns Netcatty into a SOCKS proxy server. SOCKS proxy server is a protocol to request any connection via a remote host.',
};

export const TYPE_ICONS: Record<PortForwardingType, React.ReactNode> = {
  local: <Globe size={16} />,
  remote: <Server size={16} />,
  dynamic: <Shuffle size={16} />,
};

/**
 * Get status color class for a rule
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500';
    case 'connecting':
      return 'bg-yellow-500 animate-pulse';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-muted-foreground/40';
  }
}

/**
 * Get type badge color class
 */
export function getTypeColor(type: PortForwardingType, isActive: boolean): string {
  const colors = {
    local: isActive ? 'bg-blue-500 text-white' : 'bg-blue-500/15 text-blue-500',
    remote: isActive ? 'bg-orange-500 text-white' : 'bg-orange-500/15 text-orange-500',
    dynamic: isActive ? 'bg-purple-500 text-white' : 'bg-purple-500/15 text-purple-500',
  };
  return colors[type];
}

/**
 * Generate default label for a rule
 */
export function generateRuleLabel(
  type: PortForwardingType,
  localPort?: number,
  remoteHost?: string,
  remotePort?: number
): string {
  switch (type) {
    case 'local':
      return `Local:${localPort} → ${remoteHost}:${remotePort}`;
    case 'remote':
      return `Remote:${localPort} → ${remoteHost}:${remotePort}`;
    case 'dynamic':
      return `SOCKS:${localPort}`;
    default:
      return 'New Rule';
  }
}
