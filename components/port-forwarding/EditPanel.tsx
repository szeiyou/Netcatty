/**
 * Port Forwarding Edit Panel
 * Form for editing an existing port forwarding rule
 */
import React from 'react';
import { Copy, Trash2, ChevronDown } from 'lucide-react';
import { PortForwardingRule, Host } from '../../domain/models';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AsidePanel, AsidePanelContent, AsidePanelFooter, AsideActionMenu, AsideActionMenuItem } from '../ui/aside-panel';
import { DistroAvatar } from '../DistroAvatar';
import { TrafficDiagram } from '../TrafficDiagram';

export interface EditPanelProps {
    rule: PortForwardingRule;
    draft: Partial<PortForwardingRule>;
    hosts: Host[];
    onDraftChange: (updates: Partial<PortForwardingRule>) => void;
    onSave: () => void;
    onClose: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onOpenHostSelector: () => void;
}

export const EditPanel: React.FC<EditPanelProps> = ({
    rule,
    draft,
    hosts,
    onDraftChange,
    onSave,
    onClose,
    onDuplicate,
    onDelete,
    onOpenHostSelector,
}) => {
    const selectedHost = hosts.find(h => h.id === draft.hostId);

    return (
        <AsidePanel
            open={true}
            onClose={onClose}
            title="Edit Port Forwarding"
            width="w-[360px]"
            actions={
                <AsideActionMenu>
                    <AsideActionMenuItem
                        icon={<Copy size={14} />}
                        onClick={onDuplicate}
                    >
                        Duplicate
                    </AsideActionMenuItem>
                    <AsideActionMenuItem
                        icon={<Trash2 size={14} />}
                        variant="destructive"
                        onClick={onDelete}
                    >
                        Delete
                    </AsideActionMenuItem>
                </AsideActionMenu>
            }
        >
            <AsidePanelContent>
                {/* Traffic Diagram */}
                <div className="-my-1">
                    <TrafficDiagram type={draft.type || rule.type} isAnimating={true} />
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

                {/* Intermediate Host - for all types */}
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
                    onClick={onSave}
                >
                    Save Changes
                </Button>
                <Button
                    variant="ghost"
                    className="w-full h-10 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                    onClick={onClose}
                >
                    Cancel
                </Button>
            </AsidePanelFooter>
        </AsidePanel>
    );
};

export default EditPanel;
