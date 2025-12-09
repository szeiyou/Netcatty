import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RemoteFile, Host } from '../types';
import { Folder, FileText, Download, Upload, ArrowUp, RefreshCw, HardDrive, Trash2, Loader2, Plus, X, ChevronRight, Home } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu';
import { DistroAvatar } from './DistroAvatar';

interface SFTPModalProps {
    host: Host;
    credentials: {
        username?: string;
        hostname: string;
        port?: number;
        password?: string;
        privateKey?: string;
    };
    open: boolean;
    onClose: () => void;
}

const SFTPModal: React.FC<SFTPModalProps> = ({ host, credentials, open, onClose }) => {
    const [currentPath, setCurrentPath] = useState('/');
    const [files, setFiles] = useState<RemoteFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const sftpIdRef = useRef<string | null>(null);
    const initializedRef = useRef(false);

    const ensureSftp = async () => {
        if (sftpIdRef.current) return sftpIdRef.current;
        if (!window.nebula?.openSftp) throw new Error("SFTP bridge unavailable");
        const sftpId = await window.nebula.openSftp({
            sessionId: `sftp-modal-${host.id}`,
            hostname: credentials.hostname,
            username: credentials.username || 'root',
            port: credentials.port || 22,
            password: credentials.password,
            privateKey: credentials.privateKey,
        });
        sftpIdRef.current = sftpId;
        return sftpId;
    };

    const loadFiles = useCallback(async (path: string) => {
        try {
            setError(null);
            const sftpId = await ensureSftp();
            setLoading(true);
            const list = await window.nebula.listSftp(sftpId, path);
            setFiles(list);
            setSelectedFiles(new Set());
        } catch (e) {
            console.error("Failed to load files", e);
            setError(e instanceof Error ? e.message : 'Failed to load directory');
            setFiles([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const closeSftp = async () => {
        if (sftpIdRef.current && window.nebula?.closeSftp) {
            try { await window.nebula.closeSftp(sftpIdRef.current); } catch { }
        }
        sftpIdRef.current = null;
    };

    useEffect(() => {
        return () => {
            closeSftp();
        };
    }, []);

    useEffect(() => {
        if (open) {
            if (!initializedRef.current) {
                initializedRef.current = true;
                setCurrentPath('/');
            }
            loadFiles(currentPath);
        } else {
            closeSftp();
            initializedRef.current = false;
        }
    }, [open, currentPath, loadFiles]);

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
    };

    const handleUp = () => {
        if (currentPath === '/') return;
        const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
        setCurrentPath(parent);
    };

    const handleDownload = async (file: RemoteFile) => {
        try {
            const sftpId = await ensureSftp();
            const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
            setLoading(true);
            const content = await window.nebula.readSftp(sftpId, fullPath);
            const blob = new Blob([content], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Download failed');
        } finally {
            setLoading(false);
        }
    };

    const handleUploadFile = async (file: File) => {
        const sftpId = await ensureSftp();
        setUploading(true);
        setUploadProgress(`Uploading ${file.name}...`);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;

            // Try binary upload first, fall back to text
            if (window.nebula.writeSftpBinary) {
                await window.nebula.writeSftpBinary(sftpId, fullPath, arrayBuffer);
            } else {
                // Fallback: read as text (works for text files)
                const text = await file.text();
                await window.nebula.writeSftp(sftpId, fullPath, text);
            }

            await loadFiles(currentPath);
            setUploadProgress(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed');
            setUploadProgress(null);
        } finally {
            setUploading(false);
        }
    };

    const handleUploadMultiple = async (fileList: FileList) => {
        for (let i = 0; i < fileList.length; i++) {
            await handleUploadFile(fileList[i]);
        }
    };

    const handleDelete = async (file: RemoteFile) => {
        if (!confirm(`Delete "${file.name}"?`)) return;
        try {
            const sftpId = await ensureSftp();
            const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
            // Use deleteSftp which handles both files and directories
            if (window.nebula.deleteSftp) {
                await window.nebula.deleteSftp(sftpId, fullPath);
            }
            await loadFiles(currentPath);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Delete failed');
        }
    };

    const handleCreateFolder = async () => {
        const folderName = prompt("New folder name?");
        if (!folderName) return;
        try {
            const sftpId = await ensureSftp();
            const fullPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
            await window.nebula.mkdirSftp(sftpId, fullPath);
            await loadFiles(currentPath);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create folder');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleUploadMultiple(e.target.files);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    // Drag and Drop handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleUploadMultiple(e.dataTransfer.files);
        }
    };

    const handleClose = async () => {
        await closeSftp();
        onClose();
    };

    // Breadcrumbs
    const breadcrumbs = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);

    const toggleFileSelection = (fileName: string) => {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            if (next.has(fileName)) {
                next.delete(fileName);
            } else {
                next.add(fileName);
            }
            return next;
        });
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                {/* Header */}
                <DialogHeader className="px-4 py-3 border-b border-border/60 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <DistroAvatar host={host} fallback={host.label.slice(0, 2).toUpperCase()} className="h-8 w-8" />
                            <div>
                                <DialogTitle className="text-sm font-semibold">{host.label}</DialogTitle>
                                <div className="text-xs text-muted-foreground font-mono">
                                    {credentials.username || 'root'}@{credentials.hostname}:{credentials.port || 22}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-8" onClick={() => inputRef.current?.click()} disabled={uploading}>
                                <Upload size={14} className="mr-2" /> Upload
                            </Button>
                            <Button variant="outline" size="sm" className="h-8" onClick={handleCreateFolder}>
                                <Plus size={14} className="mr-2" /> New Folder
                            </Button>
                            <input
                                type="file"
                                className="hidden"
                                ref={inputRef}
                                onChange={handleFileSelect}
                                multiple
                            />
                        </div>
                    </div>
                </DialogHeader>

                {/* Toolbar */}
                <div className="px-4 py-2 border-b border-border/60 flex items-center gap-2 flex-shrink-0 bg-muted/30">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleUp} disabled={currentPath === '/'}>
                        <ArrowUp size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentPath('/')}>
                        <Home size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => loadFiles(currentPath)}>
                        <RefreshCw size={14} className={cn(loading && "animate-spin")} />
                    </Button>

                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-hidden">
                        <button
                            className="text-muted-foreground hover:text-foreground px-1"
                            onClick={() => setCurrentPath('/')}
                        >
                            /
                        </button>
                        {breadcrumbs.map((part, idx) => (
                            <React.Fragment key={idx}>
                                <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />
                                <button
                                    className="text-muted-foreground hover:text-foreground truncate px-1"
                                    onClick={() => setCurrentPath('/' + breadcrumbs.slice(0, idx + 1).join('/'))}
                                >
                                    {part}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Error display */}
                {error && (
                    <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs border-b border-destructive/20">
                        {error}
                        <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
                    </div>
                )}

                {/* Upload progress */}
                {uploadProgress && (
                    <div className="px-4 py-2 bg-primary/10 text-primary text-xs border-b border-primary/20 flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin" />
                        {uploadProgress}
                    </div>
                )}

                {/* File List */}
                <div
                    className={cn(
                        "flex-1 overflow-y-auto relative",
                        dragActive && "bg-primary/5 ring-2 ring-inset ring-primary"
                    )}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    {dragActive && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                            <div className="bg-background/95 p-6 rounded-xl shadow-lg border-2 border-dashed border-primary text-primary font-medium flex flex-col items-center gap-2">
                                <Upload size={32} />
                                <span>Drop files to upload</span>
                            </div>
                        </div>
                    )}

                    {loading && files.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {files.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Folder size={48} className="mb-3 opacity-50" />
                            <div className="text-sm font-medium">Empty Directory</div>
                            <div className="text-xs mt-1">Drag and drop files here to upload</div>
                        </div>
                    )}

                    {/* Table Header */}
                    {files.length > 0 && (
                        <div className="sticky top-0 bg-muted/50 backdrop-blur-sm border-b border-border/60 px-4 py-2 grid grid-cols-[1fr,100px,150px,80px] gap-4 text-xs font-medium text-muted-foreground">
                            <div>Name</div>
                            <div>Size</div>
                            <div>Modified</div>
                            <div className="text-right">Actions</div>
                        </div>
                    )}

                    {/* File rows */}
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <div className="divide-y divide-border/30">
                                {files.map((file, idx) => (
                                    <ContextMenu key={idx}>
                                        <ContextMenuTrigger>
                                            <div
                                                className={cn(
                                                    "px-4 py-2.5 grid grid-cols-[1fr,100px,150px,80px] gap-4 items-center hover:bg-muted/50 cursor-pointer transition-colors text-sm",
                                                    selectedFiles.has(file.name) && "bg-primary/10"
                                                )}
                                                onClick={() => {
                                                    if (file.type === 'directory') {
                                                        handleNavigate(currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`);
                                                    } else {
                                                        toggleFileSelection(file.name);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={cn("shrink-0", file.type === 'directory' ? "text-blue-400" : "text-muted-foreground")}>
                                                        {file.type === 'directory' ? <Folder size={18} fill="currentColor" fillOpacity={0.2} /> : <FileText size={18} />}
                                                    </div>
                                                    <span className="truncate font-medium">{file.name}</span>
                                                </div>
                                                <div className="text-xs text-muted-foreground">{file.size}</div>
                                                <div className="text-xs text-muted-foreground truncate">{file.lastModified}</div>
                                                <div className="flex items-center justify-end gap-1">
                                                    {file.type === 'file' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                                                            title="Download"
                                                        >
                                                            <Download size={14} />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 hover:text-destructive"
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </div>
                                            </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent>
                                            {file.type === 'directory' && (
                                                <ContextMenuItem onClick={() => handleNavigate(currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`)}>
                                                    Open
                                                </ContextMenuItem>
                                            )}
                                            {file.type === 'file' && (
                                                <ContextMenuItem onClick={() => handleDownload(file)}>
                                                    <Download size={14} className="mr-2" /> Download
                                                </ContextMenuItem>
                                            )}
                                            <ContextMenuItem className="text-destructive" onClick={() => handleDelete(file)}>
                                                <Trash2 size={14} className="mr-2" /> Delete
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                ))}
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                            <ContextMenuItem onClick={handleCreateFolder}>
                                <Plus className="h-4 w-4 mr-2" /> New folder
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => inputRef.current?.click()}>
                                <Upload className="h-4 w-4 mr-2" /> Upload files
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => loadFiles(currentPath)}>
                                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground bg-muted/30 flex-shrink-0">
                    <span>{files.length} items{selectedFiles.size > 0 && ` • ${selectedFiles.size} selected`}</span>
                    <span>{loading ? "Loading..." : uploading ? "Uploading..." : "Ready"}</span>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SFTPModal;
