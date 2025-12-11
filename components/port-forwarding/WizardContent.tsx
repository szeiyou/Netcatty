/**
 * Port Forwarding Wizard Content
 * Renders step-by-step wizard content for creating port forwarding rules
 */
import React from 'react';
import { Check } from 'lucide-react';
import { PortForwardingRule, PortForwardingType, Host } from '../../domain/models';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { DistroAvatar } from '../DistroAvatar';
import { TrafficDiagram } from '../TrafficDiagram';
import { cn } from '../../lib/utils';
import { TYPE_DESCRIPTIONS } from './utils';

export type WizardStep = 'type' | 'local-config' | 'remote-host-selection' | 'remote-config' | 'destination' | 'host-selection' | 'label';

export interface WizardContentProps {
    step: WizardStep;
    type: PortForwardingType;
    draft: Partial<PortForwardingRule>;
    hosts: Host[];
    onTypeChange: (type: PortForwardingType) => void;
    onDraftChange: (updates: Partial<PortForwardingRule>) => void;
    onOpenHostSelector: () => void;
}

export const WizardContent: React.FC<WizardContentProps> = ({
    step,
    type,
    draft,
    hosts,
    onTypeChange,
    onDraftChange,
    onOpenHostSelector,
}) => {
    const selectedHost = hosts.find(h => h.id === draft.hostId);

    switch (step) {
        case 'type':
            return (
                <>
                    <div className="text-sm font-medium mb-3">Select the port forwarding type:</div>
                    <div className="flex gap-1 p-1 bg-secondary/80 rounded-lg border border-border/60">
                        {(['local', 'remote', 'dynamic'] as PortForwardingType[]).map((t) => (
                            <Button
                                key={t}
                                variant={type === t ? 'default' : 'ghost'}
                                size="sm"
                                className={cn(
                                    "flex-1 h-9",
                                    type === t ? "bg-primary text-primary-foreground" : ""
                                )}
                                onClick={() => onTypeChange(t)}
                            >
                                {t[0].toUpperCase() + t.slice(1)}
                            </Button>
                        ))}
                    </div>

                    <div className="mt-6">
                        <TrafficDiagram type={type} isAnimating={true} />
                    </div>

                    <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                        {TYPE_DESCRIPTIONS[type]}
                    </p>
                </>
            );

        case 'local-config':
            return (
                <>
                    <div className="text-sm font-medium mb-3">Set the local port and binding address:</div>

                    <TrafficDiagram type={type} isAnimating={true} highlightRole="app" />

                    <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                        This port will be open on the local (current) device, and it will receive the traffic.
                    </p>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs">Local port number *</Label>
                            <Input
                                type="number"
                                placeholder="e.g. 8080"
                                className="h-10"
                                value={draft.localPort || ''}
                                onChange={e => onDraftChange({ localPort: parseInt(e.target.value) || undefined })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Bind address</Label>
                            <Input
                                placeholder="127.0.0.1"
                                className="h-10"
                                value={draft.bindAddress || ''}
                                onChange={e => onDraftChange({ bindAddress: e.target.value })}
                            />
                        </div>
                    </div>
                </>
            );

        case 'remote-host-selection':
            return (
                <>
                    <div className="text-sm font-medium mb-3">Select the remote host:</div>

                    <TrafficDiagram type={type} isAnimating={true} highlightRole="ssh-server" />

                    <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                        Select a host where the port will be open. The traffic from this port will be forwarded to the destination host.
                    </p>

                    <Button
                        variant="default"
                        className="w-full h-11"
                        onClick={onOpenHostSelector}
                    >
                        {selectedHost ? (
                            <div className="flex items-center gap-2 w-full">
                                <DistroAvatar host={selectedHost} fallback={selectedHost.os[0].toUpperCase()} className="h-6 w-6" />
                                <span>{selectedHost.label}</span>
                                <Check size={14} className="ml-auto" />
                            </div>
                        ) : (
                            'Select a host'
                        )}
                    </Button>
                </>
            );

        case 'remote-config':
            return (
                <>
                    <div className="text-sm font-medium mb-3">Set the port and binding address:</div>

                    <TrafficDiagram type={type} isAnimating={true} highlightRole="ssh-server" />

                    <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                        We will forward traffic from specified port and interface address of the selected host.
                    </p>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs">Remote port number *</Label>
                            <Input
                                type="number"
                                placeholder="e.g. 8080"
                                className="h-10"
                                value={draft.localPort || ''}
                                onChange={e => onDraftChange({ localPort: parseInt(e.target.value) || undefined })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Bind address</Label>
                            <Input
                                placeholder="127.0.0.1"
                                className="h-10"
                                value={draft.bindAddress || ''}
                                onChange={e => onDraftChange({ bindAddress: e.target.value })}
                            />
                        </div>
                    </div>
                </>
            );

        case 'destination':
            return (
                <>
                    <div className="text-sm font-medium mb-3">Select the destination host:</div>

                    <TrafficDiagram type={type} isAnimating={true} highlightRole="target" />

                    <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                        {type === 'local'
                            ? 'Enter the remote destination that you want to access through the tunnel.'
                            : 'The destination address and port where the traffic will be forwarded.'
                        }
                    </p>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs">Destination address *</Label>
                            <Input
                                placeholder="e.g. 127.0.0.1 or 192.168.1.100"
                                className="h-10"
                                value={draft.remoteHost || ''}
                                onChange={e => onDraftChange({ remoteHost: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Destination port number *</Label>
                            <Input
                                type="number"
                                placeholder="e.g. 3306"
                                className="h-10"
                                value={draft.remotePort || ''}
                                onChange={e => onDraftChange({ remotePort: parseInt(e.target.value) || undefined })}
                            />
                        </div>
                    </div>
                </>
            );

        case 'host-selection':
            return (
                <>
                    <div className="text-sm font-medium mb-3">Select the SSH server:</div>

                    <TrafficDiagram type={type} isAnimating={true} highlightRole="ssh-server" />

                    <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                        {type === 'dynamic'
                            ? 'Select the SSH server that will act as your SOCKS proxy.'
                            : 'Select the SSH server that will tunnel your traffic to the destination.'
                        }
                    </p>

                    <Button
                        variant="default"
                        className="w-full h-11"
                        onClick={onOpenHostSelector}
                    >
                        {selectedHost ? (
                            <div className="flex items-center gap-2 w-full">
                                <DistroAvatar host={selectedHost} fallback={selectedHost.os[0].toUpperCase()} className="h-6 w-6" />
                                <span>{selectedHost.label}</span>
                                <Check size={14} className="ml-auto" />
                            </div>
                        ) : (
                            'Select a host'
                        )}
                    </Button>

                    {/* Rule label */}
                    <div className="space-y-2 mt-6">
                        <Label className="text-xs">Label</Label>
                        <Input
                            placeholder={type === 'dynamic' ? "e.g. SOCKS Proxy" : "e.g. MySQL Production"}
                            className="h-10"
                            value={draft.label || ''}
                            onChange={e => onDraftChange({ label: e.target.value })}
                        />
                    </div>
                </>
            );

        case 'label':
            return (
                <>
                    <div className="text-sm font-medium mb-3">Select the label:</div>

                    <TrafficDiagram type={type} isAnimating={true} />

                    <div className="space-y-2 mt-4">
                        <Label className="text-xs">Label</Label>
                        <Input
                            placeholder="e.g. Remote Rule"
                            className="h-10"
                            value={draft.label || ''}
                            onChange={e => onDraftChange({ label: e.target.value })}
                        />
                    </div>
                </>
            );

        default:
            return null;
    }
};

export default WizardContent;
