/**
 * SFTP File row component for file list
 */

import React, { memo } from 'react';
import { cn } from '../../lib/utils';
import { Folder } from 'lucide-react';
import { SftpFileEntry } from '../../types';
import { formatBytes, formatDate, getFileIcon, ColumnWidths } from './utils';

interface SftpFileRowProps {
    entry: SftpFileEntry;
    isSelected: boolean;
    isDragOver: boolean;
    columnWidths: ColumnWidths;
    onSelect: (e: React.MouseEvent) => void;
    onOpen: () => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
}

const SftpFileRowInner: React.FC<SftpFileRowProps> = ({
    entry,
    isSelected,
    isDragOver,
    columnWidths,
    onSelect,
    onOpen,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
}) => {
    const isParentDir = entry.name === '..';

    return (
        <div
            draggable={!isParentDir}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onSelect}
            onDoubleClick={onOpen}
            className={cn(
                "px-4 py-2 items-center cursor-pointer text-sm transition-colors",
                isSelected ? "bg-primary/15 text-foreground" : "hover:bg-secondary/40",
                isDragOver && entry.type === 'directory' && "bg-primary/25 ring-1 ring-primary/50"
            )}
            style={{ display: 'grid', gridTemplateColumns: `${columnWidths.name}% ${columnWidths.modified}% ${columnWidths.size}% ${columnWidths.type}%` }}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                    "h-7 w-7 rounded flex items-center justify-center shrink-0",
                    entry.type === 'directory' ? "bg-primary/10 text-primary" : "bg-secondary/60 text-muted-foreground"
                )}>
                    {entry.type === 'directory' ? <Folder size={14} /> : getFileIcon(entry)}
                </div>
                <span className="truncate">{entry.name}</span>
            </div>
            <span className="text-xs text-muted-foreground truncate">{formatDate(entry.lastModified)}</span>
            <span className="text-xs text-muted-foreground truncate text-right">
                {entry.type === 'directory' ? '--' : formatBytes(entry.size)}
            </span>
            <span className="text-xs text-muted-foreground truncate capitalize text-right">
                {entry.type === 'directory' ? 'folder' : entry.name.split('.').pop()?.toLowerCase() || 'file'}
            </span>
        </div>
    );
};

export const SftpFileRow = memo(SftpFileRowInner);
SftpFileRow.displayName = 'SftpFileRow';
