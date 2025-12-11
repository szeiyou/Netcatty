/**
 * Import Key Panel - Import existing SSH key
 */

import React, { useRef, useCallback } from 'react';
import { SSHKey, KeyType } from '../../types';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Upload } from 'lucide-react';
import { detectKeyType } from './utils';

interface ImportKeyPanelProps {
    draftKey: Partial<SSHKey>;
    setDraftKey: (key: Partial<SSHKey>) => void;
    onImport: () => void;
}

export const ImportKeyPanel: React.FC<ImportKeyPanelProps> = ({
    draftKey,
    setDraftKey,
    onImport,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content) {
                const detectedType = detectKeyType(content);
                const label = file.name.replace(/\.(pem|key|pub|ppk)$/i, '');

                setDraftKey({
                    ...draftKey,
                    privateKey: content,
                    label: draftKey.label || label,
                    type: detectedType,
                });
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }, [draftKey, setDraftKey]);

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

        const file = event.dataTransfer.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content) {
                const detectedType = detectKeyType(content);
                const label = file.name.replace(/\.(pem|key|pub|ppk)$/i, '');

                setDraftKey({
                    ...draftKey,
                    privateKey: content,
                    label: draftKey.label || label,
                    type: detectedType,
                });
            }
        };
        reader.readAsText(file);
    }, [draftKey, setDraftKey]);

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pem,.key,.pub,.ppk,*"
                className="hidden"
                onChange={handleFileImport}
            />

            <div className="space-y-2">
                <Label>Label</Label>
                <Input
                    value={draftKey.label || ''}
                    onChange={e => setDraftKey({ ...draftKey, label: e.target.value })}
                    placeholder="Key label"
                />
            </div>

            <div className="space-y-2">
                <Label>Private key *</Label>
                <Textarea
                    value={draftKey.privateKey || ''}
                    onChange={e => setDraftKey({ ...draftKey, privateKey: e.target.value })}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    className="min-h-[120px] font-mono text-xs"
                />
            </div>

            <div className="space-y-2">
                <Label>Public key</Label>
                <Textarea
                    value={draftKey.publicKey || ''}
                    onChange={e => setDraftKey({ ...draftKey, publicKey: e.target.value })}
                    placeholder="ssh-ed25519 AAAAC3... user@host"
                    className="min-h-[80px] font-mono text-xs"
                />
            </div>

            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    Certificate
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Optional
                    </span>
                </Label>
                <Textarea
                    value={draftKey.certificate || ''}
                    onChange={e => setDraftKey({ ...draftKey, certificate: e.target.value })}
                    placeholder="Paste certificate..."
                    className="min-h-[80px] font-mono text-xs"
                />
            </div>

            <div
                className="border border-dashed border-border/80 rounded-xl p-4 text-center space-y-2 bg-background/60 transition-colors hover:border-primary/50"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Upload size={16} />
                    <span className="text-sm">Drag and drop a private key file to import</span>
                </div>
                <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                >
                    Import from key file
                </Button>
            </div>

            <Button
                className="w-full h-11"
                onClick={onImport}
                disabled={!draftKey.label?.trim() || !draftKey.privateKey?.trim()}
            >
                Save Key
            </Button>
        </>
    );
};
