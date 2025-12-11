/**
 * Proxy Configuration Sub-Panel
 * Panel for configuring HTTP/SOCKS5 proxy settings
 */
import React from 'react';
import { Trash2, Check } from 'lucide-react';
import { ProxyConfig } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { AsidePanel, AsidePanelContent } from '../ui/aside-panel';
import { cn } from '../../lib/utils';

export interface ProxyPanelProps {
    proxyConfig?: ProxyConfig;
    onUpdateProxy: (field: keyof ProxyConfig, value: string | number) => void;
    onClearProxy: () => void;
    onBack: () => void;
    onCancel: () => void;
}

export const ProxyPanel: React.FC<ProxyPanelProps> = ({
    proxyConfig,
    onUpdateProxy,
    onClearProxy,
    onBack,
    onCancel,
}) => {
    return (
        <AsidePanel
            open={true}
            onClose={onCancel}
            title="New Proxy"
            showBackButton={true}
            onBack={onBack}
            actions={
                <Button size="sm" onClick={onBack} disabled={!proxyConfig?.host}>
                    Save
                </Button>
            }
        >
            <AsidePanelContent>
                <Card className="p-3 space-y-3 bg-card border-border/80">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">Type</p>
                        <div className="flex gap-2">
                            <Button
                                variant={proxyConfig?.type === 'http' ? "secondary" : "ghost"}
                                size="sm"
                                className={cn("h-8", proxyConfig?.type === 'http' && "bg-primary/15")}
                                onClick={() => onUpdateProxy('type', 'http')}
                            >
                                <Check size={14} className={cn("mr-1", proxyConfig?.type !== 'http' && "opacity-0")} />
                                HTTP
                            </Button>
                            <Button
                                variant={proxyConfig?.type === 'socks5' ? "secondary" : "ghost"}
                                size="sm"
                                className={cn("h-8", proxyConfig?.type === 'socks5' && "bg-primary/15")}
                                onClick={() => onUpdateProxy('type', 'socks5')}
                            >
                                <Check size={14} className={cn("mr-1", proxyConfig?.type !== 'socks5' && "opacity-0")} />
                                SOCKS5
                            </Button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Input
                            placeholder="Proxy Host"
                            value={proxyConfig?.host || ""}
                            onChange={(e) => onUpdateProxy('host', e.target.value)}
                            className="h-10 flex-1"
                        />
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Port</span>
                            <Input
                                type="number"
                                placeholder="3128"
                                value={proxyConfig?.port || ""}
                                onChange={(e) => onUpdateProxy('port', parseInt(e.target.value) || 0)}
                                className="h-10 w-20 text-center"
                            />
                        </div>
                    </div>
                </Card>

                <Card className="p-3 space-y-3 bg-card border-border/80">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">Credentials</p>
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                    </div>
                    <Input
                        placeholder="Proxy Username"
                        value={proxyConfig?.username || ""}
                        onChange={(e) => onUpdateProxy('username', e.target.value)}
                        className="h-10"
                    />
                    <Input
                        placeholder="Proxy Password"
                        type="password"
                        value={proxyConfig?.password || ""}
                        onChange={(e) => onUpdateProxy('password', e.target.value)}
                        className="h-10"
                    />
                    <Button variant="ghost" size="sm" className="text-primary" onClick={() => { }}>
                        Identities
                    </Button>
                </Card>

                {proxyConfig?.host && (
                    <Button variant="ghost" className="w-full h-10 text-destructive" onClick={onClearProxy}>
                        <Trash2 size={14} className="mr-2" /> Remove Proxy
                    </Button>
                )}
            </AsidePanelContent>
        </AsidePanel>
    );
};

export default ProxyPanel;
