/**
 * SFTP Conflict Resolution Dialog
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { AlertCircle } from 'lucide-react';

interface ConflictItem {
    transferId: string;
    fileName: string;
    sourcePath: string;
    targetPath: string;
    existingSize: number;
    newSize: number;
    existingModified: number;
    newModified: number;
}

interface SftpConflictDialogProps {
    conflicts: ConflictItem[];
    onResolve: (conflictId: string, action: 'replace' | 'skip' | 'duplicate') => void;
    formatFileSize: (size: number) => string;
}

export const SftpConflictDialog: React.FC<SftpConflictDialogProps> = ({ conflicts, onResolve, formatFileSize }) => {
    const [applyToAll, setApplyToAll] = useState(false);
    const conflict = conflicts[0]; // Handle first conflict

    if (!conflict) return null;

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    const handleAction = (action: 'replace' | 'skip' | 'duplicate') => {
        if (applyToAll) {
            // Apply to all conflicts
            conflicts.forEach(c => onResolve(c.transferId, action));
        } else {
            onResolve(conflict.transferId, action);
        }
        setApplyToAll(false);
    };

    return (
        <Dialog open={!!conflict} onOpenChange={() => handleAction('skip')}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                        File Conflict
                    </DialogTitle>
                    <DialogDescription>
                        A file with the same name already exists at the destination
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="text-sm">
                        <span className="font-medium">{conflict.fileName}</span>
                        <span className="text-muted-foreground ml-1">already exists</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="p-3 rounded-lg bg-secondary/50 border border-border/60">
                            <div className="font-medium mb-2 text-muted-foreground">Existing file</div>
                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Size:</span>
                                    <span>{formatFileSize(conflict.existingSize)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Modified:</span>
                                    <span>{formatDate(conflict.existingModified)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                            <div className="font-medium mb-2 text-primary">New file</div>
                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Size:</span>
                                    <span>{formatFileSize(conflict.newSize)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Modified:</span>
                                    <span>{formatDate(conflict.newModified)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {conflicts.length > 1 && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                                type="checkbox"
                                checked={applyToAll}
                                onChange={(e) => setApplyToAll(e.target.checked)}
                                className="rounded border-border"
                            />
                            Apply this action to all {conflicts.length} remaining conflicts
                        </label>
                    )}
                </div>

                <DialogFooter className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => handleAction('skip')}
                        className="flex-1"
                    >
                        Skip
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => handleAction('duplicate')}
                        className="flex-1"
                    >
                        Keep Both
                    </Button>
                    <Button
                        variant="default"
                        onClick={() => handleAction('replace')}
                        className="flex-1"
                    >
                        Replace
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
