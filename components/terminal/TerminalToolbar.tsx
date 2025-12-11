/**
 * Terminal Toolbar
 * Displays SFTP, Scripts buttons and close button in terminal status bar
 */
import React from 'react';
import { Zap, FolderInput, X } from 'lucide-react';
import { Snippet } from '../../types';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';

export interface TerminalToolbarProps {
    status: 'connecting' | 'connected' | 'disconnected';
    snippets: Snippet[];
    isScriptsOpen: boolean;
    setIsScriptsOpen: (open: boolean) => void;
    onOpenSFTP: () => void;
    onSnippetClick: (command: string) => void;
    showClose?: boolean;
    onClose?: () => void;
}

export const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
    status,
    snippets,
    isScriptsOpen,
    setIsScriptsOpen,
    onOpenSFTP,
    onSnippetClick,
    showClose,
    onClose,
}) => {
    const buttonBase = "h-7 px-2 text-[11px] bg-white/5 hover:bg-white/10 text-white shadow-none border-none";

    return (
        <>
            <Button
                variant="secondary"
                size="sm"
                className={buttonBase}
                disabled={status !== 'connected'}
                title={status === 'connected' ? "Open SFTP" : "Available after connect"}
                onClick={onOpenSFTP}
            >
                <FolderInput size={12} className="mr-2" /> SFTP
            </Button>

            <Popover open={isScriptsOpen} onOpenChange={setIsScriptsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="secondary"
                        size="sm"
                        className={buttonBase}
                    >
                        <Zap size={12} className="mr-2" /> Scripts
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                    <div className="px-3 py-2 text-[10px] uppercase text-muted-foreground font-semibold bg-muted/30 border-b">
                        Library
                    </div>
                    <ScrollArea className="h-64">
                        <div className="py-1">
                            {snippets.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-muted-foreground italic">
                                    No snippets available
                                </div>
                            ) : (
                                snippets.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => onSnippetClick(s.command)}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex flex-col gap-0.5"
                                    >
                                        <span className="font-medium">{s.label}</span>
                                        <span className="text-muted-foreground truncate font-mono text-[10px]">
                                            {s.command}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </PopoverContent>
            </Popover>

            {showClose && onClose && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    title="Close session"
                >
                    <X size={12} />
                </Button>
            )}
        </>
    );
};

export default TerminalToolbar;
