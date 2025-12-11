/**
 * Terminal Authentication Dialog
 * Displays auth form with password/key selection for SSH connection
 */
import React from 'react';
import { Lock, Key, Eye, EyeOff, ChevronDown, AlertCircle } from 'lucide-react';
import { SSHKey } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../lib/utils';

export interface TerminalAuthDialogProps {
    authMethod: 'password' | 'key';
    setAuthMethod: (method: 'password' | 'key') => void;
    authUsername: string;
    setAuthUsername: (username: string) => void;
    authPassword: string;
    setAuthPassword: (password: string) => void;
    authKeyId: string | null;
    setAuthKeyId: (keyId: string | null) => void;
    showAuthPassword: boolean;
    setShowAuthPassword: (show: boolean) => void;
    authRetryMessage: string | null;
    keys: SSHKey[];
    onSubmit: () => void;
    onSubmitWithoutSave?: () => void;
    onCancel: () => void;
    isValid: boolean;
}

export const TerminalAuthDialog: React.FC<TerminalAuthDialogProps> = ({
    authMethod,
    setAuthMethod,
    authUsername,
    setAuthUsername,
    authPassword,
    setAuthPassword,
    authKeyId,
    setAuthKeyId,
    showAuthPassword,
    setShowAuthPassword,
    authRetryMessage,
    keys,
    onSubmit,
    onSubmitWithoutSave,
    onCancel,
    isValid,
}) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isValid) {
            onSubmit();
        }
    };

    return (
        <>
            {/* Auth method tabs */}
            <div className="flex gap-1 p-1 bg-secondary/80 rounded-lg border border-border/60">
                <button
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                        authMethod === 'password'
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                    onClick={() => setAuthMethod('password')}
                >
                    <Lock size={14} />
                    Password
                </button>
                <button
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                        authMethod === 'key'
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                    onClick={() => setAuthMethod('key')}
                >
                    <Key size={14} />
                    Public Key
                </button>
            </div>

            {/* Auth retry error message */}
            {authRetryMessage && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                    <AlertCircle size={16} />
                    {authRetryMessage}
                </div>
            )}

            <div className="space-y-3">
                <div className="space-y-2">
                    <Label htmlFor="auth-username">Username</Label>
                    <Input
                        id="auth-username"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        placeholder="root"
                    />
                </div>

                {authMethod === 'password' ? (
                    <div className="space-y-2">
                        <Label htmlFor="auth-password">Password</Label>
                        <div className="relative">
                            <Input
                                id="auth-password"
                                type={showAuthPassword ? 'text' : 'password'}
                                value={authPassword}
                                onChange={(e) => setAuthPassword(e.target.value)}
                                placeholder="Enter password"
                                className={cn("pr-10", authRetryMessage && "border-destructive/50")}
                                autoFocus={!!authRetryMessage}
                                onKeyDown={handleKeyDown}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowAuthPassword(!showAuthPassword)}
                            >
                                {showAuthPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Label>Select Key</Label>
                        {keys.filter(k => k.category === 'key').length === 0 ? (
                            <div className="text-sm text-muted-foreground p-3 border border-dashed border-border/60 rounded-lg text-center">
                                No keys available. Add keys in the Keychain section.
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {keys.filter(k => k.category === 'key').map((key) => (
                                    <button
                                        key={key.id}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left",
                                            authKeyId === key.id
                                                ? "border-primary bg-primary/5"
                                                : "border-border/50 hover:bg-secondary/50"
                                        )}
                                        onClick={() => setAuthKeyId(key.id)}
                                    >
                                        <div className={cn(
                                            "h-8 w-8 rounded-lg flex items-center justify-center",
                                            key.source === 'biometric' ? "bg-purple-500/20 text-purple-500" : "bg-primary/20 text-primary"
                                        )}>
                                            <Key size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{key.label}</div>
                                            <div className="text-xs text-muted-foreground">Type {key.type}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between pt-2">
                <Button variant="secondary" onClick={onCancel}>
                    Close
                </Button>
                <div className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button disabled={!isValid} onClick={onSubmit}>
                                Continue & Save
                                <ChevronDown size={14} className="ml-2" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1 z-50" align="end">
                            <button
                                className="w-full px-3 py-2 text-sm text-left hover:bg-secondary rounded-md"
                                onClick={onSubmitWithoutSave ?? onSubmit}
                                disabled={!isValid}
                            >
                                Continue
                            </button>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </>
    );
};

export default TerminalAuthDialog;
