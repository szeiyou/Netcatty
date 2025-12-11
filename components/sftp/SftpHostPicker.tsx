/**
 * SFTP Host Picker Dialog
 */

import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Host } from '../../types';
import { DistroAvatar } from '../DistroAvatar';
import { Monitor } from 'lucide-react';

interface SftpHostPickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    hosts: Host[];
    side: 'left' | 'right';
    hostSearch: string;
    onHostSearchChange: (search: string) => void;
    onSelectLocal: () => void;
    onSelectHost: (host: Host) => void;
}

export const SftpHostPicker: React.FC<SftpHostPickerProps> = ({
    open,
    onOpenChange,
    hosts,
    side,
    hostSearch,
    onHostSearchChange,
    onSelectLocal,
    onSelectHost,
}) => {
    const filteredHosts = useMemo(() => {
        const term = hostSearch.trim().toLowerCase();
        return hosts.filter(h =>
            !term ||
            h.label.toLowerCase().includes(term) ||
            h.hostname.toLowerCase().includes(term)
        ).sort((a, b) => a.label.localeCompare(b.label));
    }, [hosts, hostSearch]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Select Host</DialogTitle>
                    <DialogDescription>
                        Pick a host for the {side} pane
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Input
                        value={hostSearch}
                        onChange={e => onHostSearchChange(e.target.value)}
                        placeholder="Search hosts..."
                        className="h-9"
                    />

                    {/* Local option */}
                    <div
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/70 bg-secondary/30 cursor-pointer hover:border-primary/50 hover:bg-secondary/50 transition-colors"
                        onClick={() => { onSelectLocal(); onOpenChange(false); }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                                <Monitor size={16} />
                            </div>
                            <div>
                                <div className="text-sm font-medium">Local filesystem</div>
                                <div className="text-xs text-muted-foreground">Browse local files</div>
                            </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">Local</Badge>
                    </div>

                    {/* Remote hosts */}
                    <div className="max-h-64 overflow-auto space-y-2">
                        {filteredHosts.map(host => (
                            <div
                                key={host.id}
                                className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/70 bg-secondary/30 cursor-pointer hover:border-primary/50 hover:bg-secondary/50 transition-colors"
                                onClick={() => { onSelectHost(host); onOpenChange(false); }}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <DistroAvatar host={host} fallback={host.label[0].toUpperCase()} className="h-9 w-9" />
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium truncate">{host.label}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {host.username}@{host.hostname}
                                        </div>
                                    </div>
                                </div>
                                <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                                    SSH
                                </Badge>
                            </div>
                        ))}
                        {filteredHosts.length === 0 && (
                            <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border/60 rounded-lg">
                                No matching hosts
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
