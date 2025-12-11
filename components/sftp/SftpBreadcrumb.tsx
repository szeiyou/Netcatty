/**
 * SFTP Breadcrumb navigation component
 */

import React, { memo } from 'react';
import { cn } from '../../lib/utils';
import { ChevronRight, Home } from 'lucide-react';

interface SftpBreadcrumbProps {
    path: string;
    onNavigate: (path: string) => void;
    onHome: () => void;
}

const SftpBreadcrumbInner: React.FC<SftpBreadcrumbProps> = ({ path, onNavigate, onHome }) => {
    // Handle both Windows (C:\path) and Unix (/path) style paths
    const isWindowsPath = /^[A-Za-z]:/.test(path);
    const separator = isWindowsPath ? /[\\/]/ : /\//;
    const parts = path.split(separator).filter(Boolean);

    // For Windows, first part might be drive letter like "C:"
    const buildPath = (index: number) => {
        if (isWindowsPath) {
            return parts.slice(0, index + 1).join('\\');
        }
        return '/' + parts.slice(0, index + 1).join('/');
    };

    return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto scrollbar-none">
            <button
                onClick={onHome}
                className="hover:text-foreground p-1 rounded hover:bg-secondary/60 shrink-0"
                title="Go to home"
            >
                <Home size={12} />
            </button>
            <ChevronRight size={12} className="opacity-40 shrink-0" />
            {parts.map((part, idx) => {
                const partPath = buildPath(idx);
                const isLast = idx === parts.length - 1;
                return (
                    <React.Fragment key={partPath}>
                        <button
                            onClick={() => onNavigate(partPath)}
                            className={cn(
                                "hover:text-foreground px-1 py-0.5 rounded hover:bg-secondary/60 truncate max-w-[120px]",
                                isLast && "text-foreground font-medium"
                            )}
                        >
                            {part}
                        </button>
                        {!isLast && <ChevronRight size={12} className="opacity-40 shrink-0" />}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export const SftpBreadcrumb = memo(SftpBreadcrumbInner);
SftpBreadcrumb.displayName = 'SftpBreadcrumb';
