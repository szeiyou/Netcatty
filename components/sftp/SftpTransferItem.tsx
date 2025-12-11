/**
 * SFTP Transfer item component for transfer queue
 */

import React, { memo } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { TransferTask } from '../../types';
import { formatTransferBytes, formatSpeed } from './utils';
import {
    ArrowDown,
    Loader2,
    CheckCircle2,
    XCircle,
    RefreshCw,
    X,
} from 'lucide-react';

interface SftpTransferItemProps {
    task: TransferTask;
    onCancel: () => void;
    onRetry: () => void;
    onDismiss: () => void;
}

const SftpTransferItemInner: React.FC<SftpTransferItemProps> = ({ task, onCancel, onRetry, onDismiss }) => {
    const progress = task.totalBytes > 0 ? Math.min((task.transferredBytes / task.totalBytes) * 100, 100) : 0;

    const speedFormatted = formatSpeed(task.speed);

    const remainingBytes = task.totalBytes - task.transferredBytes;
    const remainingTime = task.speed > 0
        ? Math.ceil(remainingBytes / task.speed)
        : 0;
    const remainingFormatted = remainingTime > 60
        ? `~${Math.ceil(remainingTime / 60)}m left`
        : remainingTime > 0
            ? `~${remainingTime}s left`
            : '';

    // Format bytes transferred / total
    const bytesDisplay = task.status === 'transferring' && task.totalBytes > 0
        ? `${formatTransferBytes(task.transferredBytes)} / ${formatTransferBytes(task.totalBytes)}`
        : task.status === 'completed' && task.totalBytes > 0
            ? formatTransferBytes(task.totalBytes)
            : '';

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-background/60 border-t border-border/40 backdrop-blur-sm">
            <div className="h-6 w-6 rounded flex items-center justify-center shrink-0">
                {task.status === 'transferring' && <Loader2 size={14} className="animate-spin text-primary" />}
                {task.status === 'pending' && <ArrowDown size={14} className="text-muted-foreground animate-bounce" />}
                {task.status === 'completed' && <CheckCircle2 size={14} className="text-green-500" />}
                {task.status === 'failed' && <XCircle size={14} className="text-destructive" />}
                {task.status === 'cancelled' && <XCircle size={14} className="text-muted-foreground" />}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm truncate font-medium">{task.fileName}</span>
                    {task.status === 'transferring' && speedFormatted && (
                        <span className="text-xs text-primary/80 font-mono">{speedFormatted}</span>
                    )}
                    {task.status === 'transferring' && remainingFormatted && (
                        <span className="text-xs text-muted-foreground">{remainingFormatted}</span>
                    )}
                </div>
                {(task.status === 'transferring' || task.status === 'pending') && (
                    <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-2 bg-secondary/80 rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full relative overflow-hidden",
                                    task.status === 'pending'
                                        ? "bg-muted-foreground/50 animate-pulse"
                                        : "bg-gradient-to-r from-primary via-primary/90 to-primary"
                                )}
                                style={{
                                    width: task.status === 'pending' ? '100%' : `${progress}%`,
                                    transition: 'width 150ms ease-out'
                                }}
                            >
                                {/* Animated shine effect */}
                                {task.status === 'transferring' && (
                                    <div
                                        className="absolute inset-0 w-1/2 h-full"
                                        style={{
                                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                                            animation: 'progress-shimmer 1.5s ease-in-out infinite',
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 min-w-[40px] text-right font-mono">
                            {task.status === 'pending' ? 'waiting...' : `${Math.round(progress)}%`}
                        </span>
                    </div>
                )}
                {task.status === 'transferring' && bytesDisplay && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                        {bytesDisplay}
                    </div>
                )}
                {task.status === 'completed' && bytesDisplay && (
                    <div className="text-[10px] text-green-600 mt-0.5">
                        Completed - {bytesDisplay}
                    </div>
                )}
                {task.status === 'failed' && task.error && (
                    <span className="text-xs text-destructive">{task.error}</span>
                )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
                {task.status === 'failed' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRetry} title="Retry">
                        <RefreshCw size={12} />
                    </Button>
                )}
                {(task.status === 'pending' || task.status === 'transferring') && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onCancel} title="Cancel">
                        <X size={12} />
                    </Button>
                )}
                {(task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss} title="Dismiss">
                        <X size={12} />
                    </Button>
                )}
            </div>
        </div>
    );
};

export const SftpTransferItem = memo(SftpTransferItemInner);
SftpTransferItem.displayName = 'SftpTransferItem';
