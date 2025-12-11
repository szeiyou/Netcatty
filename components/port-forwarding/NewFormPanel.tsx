/**
 * Port Forwarding New Form Panel
 * All-in-one form for creating new port forwarding rules (skip wizard mode)
 */
import React from 'react';
import { ChevronDown, Zap } from 'lucide-react';
import { PortForwardingRule, PortForwardingType, Host } from '../../domain/models';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AsidePanel, AsidePanelContent, AsidePanelFooter } from '../ui/aside-panel';
import { DistroAvatar } from '../DistroAvatar';
import { TrafficDiagram } from '../TrafficDiagram';
import { cn } from '../../lib/utils';

export interface NewFormPanelProps {
    draft: Partial<PortForwardingRule>;
    hosts: Host[];
    onDraftChange: (updates: Partial<PortForwardingRule>) => void;
    onSave: () => void;
    onClose: () => void;
    onOpenHostSelector: () => void;
    onOpenWizard: () => void;
    isValid: boolean;
}

export const NewFormPanel: React.FC<NewFormPanelProps> = ({
    draft,
    hosts,
    onDraftChange,
    onSave,
    onClose,
    onOpenHostSelector,
    onOpenWizard,
    isValid,
}) => {
    const selectedHost = hosts.find(h => h.id === draft.hostId);

    return (
        <AsidePanel
            open={true}
            onClose={onClose}
            title="New Port Forwarding"
            width="w-[360px]"
        >
            <AsidePanelContent>
                {/* Type Selector */}
                <div className="flex gap-1 p-1 bg-secondary/80 rounded-lg border border-border/60">
                    {(['local', 'remote', 'dynamic'] as PortForwardingType[]).map((type) => (
                        <Button
                            key={type}
                            variant={draft.type === type ? 'default' : 'ghost'}
                            size="sm"
                            className={cn(
                                "flex-1 h-9",
                                draft.type === type ? "bg-primary text-primary-foreground" : ""
                            )}
                            onClick={() => onDraftChange({ type })}
                        >
                            {type[0].toUpperCase() + type.slice(1)}
                        </Button>
                    ))}
                </div>

                {/* Traffic Diagram */}
                <div className="-my-1">
                    <TrafficDiagram type={draft.type || 'local'} isAnimating={true} />
                </div>

                {/* Label */}
                <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Label</Label>
                    <Input
                        placeholder="Rule label"
                        className="h-10"
                        value={draft.label || ''}
                        onChange={e => onDraftChange({ label: e.target.value })}
                    />
                </div>

                {/* Local Port */}
                <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Local port number *</Label>
                    <Input
                        type="number"
                        placeholder="e.g. 8080"
                        className="h-10"
                        value={draft.localPort || ''}
                        onChange={e => onDraftChange({ localPort: parseInt(e.target.value) || undefined })}
                    />
                </div>

                {/* Bind Address */}
                <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Bind address</Label>
                    <Input
                        placeholder="127.0.0.1"
                        className="h-10"
                        value={draft.bindAddress || ''}
                        onChange={e => onDraftChange({ bindAddress: e.target.value })}
                    />
                </div>

                {/* Intermediate Host */}
                <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Intermediate host *</Label>
                    <Button
                        variant="secondary"
                        className="w-full h-10 justify-between"
                        onClick={onOpenHostSelector}
                    >
                        {selectedHost ? (
                            <div className="flex items-center gap-2">
                                <DistroAvatar
                                    host={selectedHost}
                                    fallback={selectedHost.os[0].toUpperCase()}
                                    className="h-6 w-6"
                                />
                                <span>{selectedHost.label}</span>
                            </div>
                        ) : (
                            <span className="text-muted-foreground">Select a host</span>
                        )}
                        <ChevronDown size={14} />
                    </Button>
                </div>

                {/* Destination - for local/remote only */}
                {(draft.type === 'local' || draft.type === 'remote') && (
                    <>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Destination address *</Label>
                            <Input
                                placeholder="e.g. localhost or 192.168.1.100"
                                className="h-10"
                                value={draft.remoteHost || ''}
                                onChange={e => onDraftChange({ remoteHost: e.target.value })}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Destination port number *</Label>
                            <Input
                                type="number"
                                placeholder="e.g. 3306"
                                className="h-10"
                                value={draft.remotePort || ''}
                                onChange={e => onDraftChange({ remotePort: parseInt(e.target.value) || undefined })}
                            />
                        </div>
                    </>
                )}
            </AsidePanelContent>
            <AsidePanelFooter className="space-y-2">
                <Button
                    className="w-full h-10"
                    disabled={!isValid}
                    onClick={onSave}
                >
                    Create Rule
                </Button>
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        className="h-10 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <button
                        className="text-xs text-muted-foreground hover:text-foreground/80 flex items-center gap-1 px-2 py-1 rounded hover:bg-foreground/5 transition-colors"
                        onClick={onOpenWizard}
                        title="Open Port Forwarding Wizard"
                    >
                        <Zap size={12} />
                        Open Wizard
                    </button>
                </div>
            </AsidePanelFooter>
        </AsidePanel>
    );
};

export default NewFormPanel;
