import {
  Check,
  Cloud,
  Download,
  Github,
  Loader2,
  Moon,
  Palette,
  Sun,
  TerminalSquare,
  Upload,
} from "lucide-react";
import React, { useState } from "react";
import { Host, SSHKey, Snippet, TerminalSettings, CursorShape, RightClickBehavior, LinkModifier, DEFAULT_TERMINAL_SETTINGS } from "../domain/models";
import { TERMINAL_THEMES } from "../infrastructure/config/terminalThemes";
import { TERMINAL_FONTS, MIN_FONT_SIZE, MAX_FONT_SIZE } from "../infrastructure/config/fonts";
import {
  loadFromGist,
  syncToGist,
} from "../infrastructure/services/syncService";
import { cn } from "../lib/utils";
import { SyncConfig } from "../types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: string) => void;
  exportData: () => unknown;
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
  primaryColor: string;
  onPrimaryColorChange: (color: string) => void;
  syncConfig: SyncConfig | null;
  onSyncConfigChange: (config: SyncConfig | null) => void;
  terminalThemeId: string;
  onTerminalThemeChange: (id: string) => void;
  terminalFontFamilyId?: string;
  onTerminalFontFamilyChange?: (id: string) => void;
  terminalFontSize?: number;
  onTerminalFontSizeChange?: (size: number) => void;
  terminalSettings?: TerminalSettings;
  onTerminalSettingsChange?: <K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) => void;
}

const COLORS = [
  { name: "Blue", value: "221.2 83.2% 53.3%" },
  { name: "Violet", value: "262.1 83.3% 57.8%" },
  { name: "Rose", value: "346.8 77.2% 49.8%" },
  { name: "Orange", value: "24.6 95% 53.1%" },
  { name: "Green", value: "142.1 76.2% 36.3%" },
];

const FONT_WEIGHTS = [
  { value: 100, label: "100 - Thin" },
  { value: 200, label: "200 - Extra Light" },
  { value: 300, label: "300 - Light" },
  { value: 400, label: "400 - Normal" },
  { value: 500, label: "500 - Medium" },
  { value: 600, label: "600 - Semi Bold" },
  { value: 700, label: "700 - Bold" },
  { value: 800, label: "800 - Extra Bold" },
  { value: 900, label: "900 - Black" },
];

// Setting row component
interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-3 gap-8">
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium">{label}</div>
      {description && (
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

// Toggle switch component
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
      checked ? "bg-primary" : "bg-muted"
    )}
  >
    <span
      className={cn(
        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
        checked ? "translate-x-5" : "translate-x-0"
      )}
    />
  </button>
);

// Select dropdown component
interface SelectOption<T> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

function Select<T extends string | number>({ value, options, onChange, className }: SelectProps<T>) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const val = typeof value === 'number' 
          ? parseInt(e.target.value) as T 
          : e.target.value as T;
        onChange(val);
      }}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// Section header component
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <h3 className="text-lg font-semibold mb-4 mt-6 first:mt-0">{title}</h3>
);

// Divider component
const Divider: React.FC = () => <div className="h-px bg-border my-2" />;

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  exportData,
  theme,
  onThemeChange,
  primaryColor,
  onPrimaryColorChange,
  syncConfig,
  onSyncConfigChange,
  terminalThemeId,
  onTerminalThemeChange,
  terminalFontFamilyId = "menlo",
  onTerminalFontFamilyChange,
  terminalFontSize = 14,
  onTerminalFontSizeChange,
  terminalSettings = DEFAULT_TERMINAL_SETTINGS,
  onTerminalSettingsChange,
}) => {
  const [importText, setImportText] = useState("");

  // Sync State
  const [githubToken, setGithubToken] = useState(syncConfig?.githubToken || "");
  const [gistId, setGistId] = useState(syncConfig?.gistId || "");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );

  const handleManualExport = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(exportData(), null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "netcatty_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleManualImport = () => {
    try {
      JSON.parse(importText);
      onImport(importText);
      alert("Configuration imported successfully!");
      setImportText("");
    } catch {
      alert("Invalid JSON format.");
    }
  };

  const handleSaveSyncConfig = async () => {
    if (!githubToken) return;

    setIsSyncing(true);
    setSyncStatus("idle");
    try {
      if (gistId) {
        await loadFromGist(githubToken, gistId);
      }
      onSyncConfigChange({ githubToken, gistId });
      setSyncStatus("success");
    } catch (e) {
      console.error(e);
      setSyncStatus("error");
      alert("Failed to verify Gist or Token.");
    } finally {
      setIsSyncing(false);
    }
  };

  const performSyncUpload = async () => {
    if (!githubToken) return;
    setIsSyncing(true);
    try {
      const data = exportData() as {
        keys: SSHKey[];
        hosts: Host[];
        snippets: Snippet[];
        customGroups: string[];
      };
      const newGistId = await syncToGist(
        githubToken,
        gistId || undefined,
        data,
      );
      if (!gistId) {
        setGistId(newGistId);
        onSyncConfigChange({
          githubToken,
          gistId: newGistId,
          lastSync: Date.now(),
        });
      } else {
        onSyncConfigChange({ ...syncConfig!, lastSync: Date.now() });
      }
      alert("Backup uploaded to Gist successfully!");
    } catch (e) {
      alert("Upload failed: " + e);
    } finally {
      setIsSyncing(false);
    }
  };

  const performSyncDownload = async () => {
    if (!githubToken || !gistId) return;
    setIsSyncing(true);
    try {
      const data = await loadFromGist(githubToken, gistId);
      onImport(JSON.stringify(data));
      onSyncConfigChange({ ...syncConfig!, lastSync: Date.now() });
      alert("Configuration restored from Gist!");
    } catch (e) {
      alert("Download failed: " + e);
    } finally {
      setIsSyncing(false);
    }
  };

  const getHslStyle = (hsl: string) => ({ backgroundColor: `hsl(${hsl})` });

  const currentTerminalTheme = TERMINAL_THEMES.find(t => t.id === terminalThemeId) || TERMINAL_THEMES[0];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 h-[700px] gap-0 overflow-hidden flex flex-row">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure appearance, terminal theme, sync and data options.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          defaultValue="appearance"
          orientation="vertical"
          className="flex-1 flex h-full"
        >
          {/* Sidebar using TabsList */}
          <div className="w-56 border-r bg-muted/20 p-4 flex flex-col gap-2 shrink-0 h-full">
            <h2 className="text-lg font-bold px-2 mb-2">Settings</h2>
            <TabsList className="flex flex-col h-auto bg-transparent gap-1 p-0 justify-start">
              <TabsTrigger
                value="appearance"
                className="w-full justify-start gap-3 px-3 py-2 data-[state=active]:bg-background"
              >
                <Palette size={16} /> Appearance
              </TabsTrigger>
              <TabsTrigger
                value="terminal"
                className="w-full justify-start gap-3 px-3 py-2 data-[state=active]:bg-background"
              >
                <TerminalSquare size={16} /> Terminal
              </TabsTrigger>
              <TabsTrigger
                value="sync"
                className="w-full justify-start gap-3 px-3 py-2 data-[state=active]:bg-background"
              >
                <Cloud size={16} /> Sync & Cloud
              </TabsTrigger>
              <TabsTrigger
                value="data"
                className="w-full justify-start gap-3 px-3 py-2 data-[state=active]:bg-background"
              >
                <Download size={16} /> Data
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Content Area */}
          <ScrollArea className="flex-1 h-full">
            <div className="p-6">
              {/* Appearance Tab */}
              <TabsContent value="appearance" className="mt-0 border-0">
                <SectionHeader title="UI Theme" />
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                  <ThemeCard
                    active={theme === "light"}
                    onClick={() => onThemeChange("light")}
                    icon={<Sun size={24} className="text-orange-500" />}
                    label="Light"
                  />
                  <ThemeCard
                    active={theme === "dark"}
                    onClick={() => onThemeChange("dark")}
                    icon={<Moon size={24} className="text-blue-400" />}
                    label="Dark"
                  />
                </div>

                <SectionHeader title="Accent Color" />
                <div className="flex flex-wrap gap-4">
                  {COLORS.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => onPrimaryColorChange(c.value)}
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-sm",
                        primaryColor === c.value
                          ? "ring-2 ring-offset-2 ring-foreground scale-110"
                          : "hover:scale-105",
                      )}
                      style={getHslStyle(c.value)}
                      title={c.name}
                    >
                      {primaryColor === c.value && (
                        <Check
                          className="text-white drop-shadow-md"
                          size={18}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </TabsContent>

              {/* Terminal Tab - Redesigned */}
              <TabsContent value="terminal" className="mt-0 border-0">
                {/* Color Scheme Section */}
                <SectionHeader title="Color Scheme" />
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    {/* Mini Terminal Preview */}
                    <div
                      className="w-20 h-14 rounded border flex flex-col p-1.5 gap-0.5 shrink-0 shadow-sm"
                      style={{
                        backgroundColor: currentTerminalTheme.colors.background,
                        borderColor: currentTerminalTheme.colors.selection,
                      }}
                    >
                      <div className="flex gap-1">
                        <div className="w-4 h-1 rounded-full" style={{ backgroundColor: currentTerminalTheme.colors.green }} />
                        <div className="w-6 h-1 rounded-full" style={{ backgroundColor: currentTerminalTheme.colors.foreground, opacity: 0.5 }} />
                      </div>
                      <div className="flex gap-1">
                        <div className="w-3 h-1 rounded-full" style={{ backgroundColor: currentTerminalTheme.colors.blue }} />
                        <div className="w-5 h-1 rounded-full" style={{ backgroundColor: currentTerminalTheme.colors.cyan }} />
                      </div>
                      <div className="w-2 h-2 mt-auto rounded-sm" style={{ backgroundColor: currentTerminalTheme.colors.cursor }} />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{currentTerminalTheme.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{currentTerminalTheme.type} Theme</div>
                    </div>
                    <Select
                      value={terminalThemeId}
                      options={TERMINAL_THEMES.map(t => ({ value: t.id, label: t.name }))}
                      onChange={onTerminalThemeChange}
                      className="w-48"
                    />
                  </div>
                </div>

                {/* Font Section */}
                <SectionHeader title="Font" />
                <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                  <SettingRow label="Font" description="Terminal font family">
                    <Select
                      value={terminalFontFamilyId}
                      options={TERMINAL_FONTS.map(f => ({ value: f.id, label: f.name }))}
                      onChange={(id) => onTerminalFontFamilyChange?.(id)}
                      className="w-44"
                    />
                  </SettingRow>

                  <SettingRow label="Font size">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={MIN_FONT_SIZE}
                        max={MAX_FONT_SIZE}
                        value={terminalFontSize}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (val >= MIN_FONT_SIZE && val <= MAX_FONT_SIZE) {
                            onTerminalFontSizeChange?.(val);
                          }
                        }}
                        className="w-20 text-center"
                      />
                    </div>
                  </SettingRow>

                  <SettingRow 
                    label="Enable font ligatures"
                    description="Display programming ligatures like => and !="
                  >
                    <Toggle
                      checked={terminalSettings.fontLigatures}
                      onChange={(v) => onTerminalSettingsChange?.('fontLigatures', v)}
                    />
                  </SettingRow>

                  <SettingRow label="Normal font weight">
                    <Select
                      value={terminalSettings.fontWeight}
                      options={FONT_WEIGHTS}
                      onChange={(v) => onTerminalSettingsChange?.('fontWeight', v)}
                      className="w-44"
                    />
                  </SettingRow>

                  <SettingRow label="Bold font weight">
                    <Select
                      value={terminalSettings.fontWeightBold}
                      options={FONT_WEIGHTS}
                      onChange={(v) => onTerminalSettingsChange?.('fontWeightBold', v)}
                      className="w-44"
                    />
                  </SettingRow>

                  <SettingRow 
                    label="Line padding"
                    description="Additional space between lines"
                  >
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={terminalSettings.linePadding}
                      onChange={(e) => onTerminalSettingsChange?.('linePadding', parseInt(e.target.value) || 0)}
                      className="w-20 text-center"
                    />
                  </SettingRow>

                  <SettingRow 
                    label="Fallback font"
                    description="Secondary font for missing characters"
                  >
                    <Input
                      type="text"
                      value={terminalSettings.fallbackFont}
                      onChange={(e) => onTerminalSettingsChange?.('fallbackFont', e.target.value)}
                      placeholder="e.g., Noto Sans"
                      className="w-44"
                    />
                  </SettingRow>
                </div>

                {/* Cursor Section */}
                <SectionHeader title="Cursor" />
                <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                  <SettingRow label="Cursor shape">
                    <div className="flex gap-2">
                      {(['block', 'bar', 'underline'] as CursorShape[]).map((shape) => (
                        <button
                          key={shape}
                          onClick={() => onTerminalSettingsChange?.('cursorShape', shape)}
                          className={cn(
                            "w-10 h-10 rounded-md border-2 flex items-center justify-center transition-colors",
                            terminalSettings.cursorShape === shape
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                          title={shape}
                        >
                          {shape === 'block' && <div className="w-3 h-4 bg-foreground rounded-sm" />}
                          {shape === 'bar' && <div className="w-0.5 h-4 bg-foreground rounded-full" />}
                          {shape === 'underline' && <div className="w-4 h-0.5 bg-foreground rounded-full" />}
                        </button>
                      ))}
                    </div>
                  </SettingRow>

                  <SettingRow label="Blink cursor">
                    <Toggle
                      checked={terminalSettings.cursorBlink}
                      onChange={(v) => onTerminalSettingsChange?.('cursorBlink', v)}
                    />
                  </SettingRow>
                </div>

                {/* Rendering Section */}
                <SectionHeader title="Rendering" />
                <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                  <SettingRow 
                    label="Scrollback"
                    description="Number of lines kept in buffer"
                  >
                    <Input
                      type="number"
                      min={1000}
                      max={100000}
                      step={1000}
                      value={terminalSettings.scrollback}
                      onChange={(e) => onTerminalSettingsChange?.('scrollback', parseInt(e.target.value) || 10000)}
                      className="w-28 text-center"
                    />
                  </SettingRow>

                  <SettingRow 
                    label="Draw bold text in bright colors"
                  >
                    <Toggle
                      checked={terminalSettings.drawBoldInBrightColors}
                      onChange={(v) => onTerminalSettingsChange?.('drawBoldInBrightColors', v)}
                    />
                  </SettingRow>

                  <SettingRow 
                    label="Minimum contrast ratio"
                    description="Adjust for accessibility (1-21)"
                  >
                    <Input
                      type="number"
                      min={1}
                      max={21}
                      value={terminalSettings.minimumContrastRatio}
                      onChange={(e) => onTerminalSettingsChange?.('minimumContrastRatio', parseFloat(e.target.value) || 1)}
                      className="w-20 text-center"
                    />
                  </SettingRow>
                </div>

                {/* Keyboard Section */}
                <SectionHeader title="Keyboard" />
                <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                  <SettingRow 
                    label="Use ⌥ as the Meta key"
                    description="Lets the shell handle Meta key instead of OS"
                  >
                    <Toggle
                      checked={terminalSettings.altAsMeta}
                      onChange={(v) => onTerminalSettingsChange?.('altAsMeta', v)}
                    />
                  </SettingRow>

                  <SettingRow 
                    label="Scroll on input"
                    description="Scrolls the terminal to bottom on user input"
                  >
                    <Toggle
                      checked={terminalSettings.scrollOnInput}
                      onChange={(v) => onTerminalSettingsChange?.('scrollOnInput', v)}
                    />
                  </SettingRow>
                </div>

                {/* Mouse Section */}
                <SectionHeader title="Mouse" />
                <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                  <SettingRow label="Right click">
                    <Select
                      value={terminalSettings.rightClickBehavior}
                      options={[
                        { value: 'context-menu' as RightClickBehavior, label: 'Context menu' },
                        { value: 'paste' as RightClickBehavior, label: 'Paste' },
                        { value: 'select-word' as RightClickBehavior, label: 'Select word' },
                      ]}
                      onChange={(v) => onTerminalSettingsChange?.('rightClickBehavior', v)}
                      className="w-40"
                    />
                  </SettingRow>

                  <SettingRow label="Paste on middle-click">
                    <Toggle
                      checked={terminalSettings.middleClickPaste}
                      onChange={(v) => onTerminalSettingsChange?.('middleClickPaste', v)}
                    />
                  </SettingRow>

                  <SettingRow 
                    label="Word separators"
                    description="Double-click selection stops at these characters"
                  >
                    <Input
                      type="text"
                      value={terminalSettings.wordSeparators}
                      onChange={(e) => onTerminalSettingsChange?.('wordSeparators', e.target.value)}
                      className="w-32 font-mono"
                    />
                  </SettingRow>

                  <SettingRow 
                    label="Require a key to click links"
                    description="Links are only clickable while holding this key"
                  >
                    <Select
                      value={terminalSettings.linkModifier}
                      options={[
                        { value: 'none' as LinkModifier, label: 'No modifier' },
                        { value: 'ctrl' as LinkModifier, label: 'Ctrl' },
                        { value: 'alt' as LinkModifier, label: 'Alt' },
                        { value: 'meta' as LinkModifier, label: '⌘ Command' },
                      ]}
                      onChange={(v) => onTerminalSettingsChange?.('linkModifier', v)}
                      className="w-40"
                    />
                  </SettingRow>
                </div>

                <div className="h-6" /> {/* Bottom padding */}
              </TabsContent>

              {/* Sync Tab */}
              <TabsContent
                value="sync"
                className="space-y-6 max-w-lg mt-0 border-0"
              >
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm text-blue-500 flex gap-3">
                  <Github className="shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="font-semibold mb-1">GitHub Gist Sync</h4>
                    <p className="opacity-90">
                      Backup and sync your hosts, keys, and snippets across
                      devices securely using a private GitHub Gist.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label>GitHub Personal Access Token</Label>
                    <Input
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxx"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Token needs <code>gist</code> scope.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label>Gist ID (Optional)</Label>
                    <Input
                      placeholder="Leave empty to create new"
                      value={gistId}
                      onChange={(e) => setGistId(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSaveSyncConfig}
                      disabled={isSyncing}
                      className="w-full sm:w-auto"
                    >
                      {isSyncing && (
                        <Loader2 className="animate-spin mr-2 h-4 w-4" />
                      )}
                      {syncStatus === "success"
                        ? "Verified & Saved"
                        : "Verify Connection"}
                    </Button>
                  </div>
                </div>

                {syncConfig?.githubToken && (
                  <>
                    <Divider />
                    <div className="grid grid-cols-2 gap-4">
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col gap-2"
                        onClick={performSyncUpload}
                        disabled={isSyncing}
                      >
                        <Upload size={20} />
                        <span>Upload Backup</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col gap-2"
                        onClick={performSyncDownload}
                        disabled={isSyncing}
                      >
                        <Download size={20} />
                        <span>Restore Backup</span>
                      </Button>
                    </div>
                    {syncConfig.lastSync && (
                      <p className="text-xs text-center text-muted-foreground">
                        Last Sync:{" "}
                        {new Date(syncConfig.lastSync).toLocaleString()}
                      </p>
                    )}
                  </>
                )}
              </TabsContent>

              {/* Data Tab */}
              <TabsContent
                value="data"
                className="space-y-6 max-w-lg mt-0 border-0"
              >
                <div className="p-5 border rounded-lg bg-card hover:bg-muted/20 transition-colors">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Download size={16} /> Export Data
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Download a JSON file containing all your hosts, keys, and
                    snippets.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleManualExport}
                    variant="outline"
                  >
                    Download JSON
                  </Button>
                </div>

                <div className="p-5 border rounded-lg bg-card hover:bg-muted/20 transition-colors">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Upload size={16} /> Import Data
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Restore your configuration from a previously exported JSON
                    file.
                  </p>
                  <Textarea
                    placeholder="Paste JSON content here..."
                    className="h-24 font-mono text-xs mb-3 resize-none bg-muted/50"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={handleManualImport}
                    disabled={!importText}
                  >
                    Import JSON
                  </Button>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

interface ThemeCardProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const ThemeCard = ({ active, onClick, icon, label }: ThemeCardProps) => (
  <div
    onClick={onClick}
    className={cn(
      "cursor-pointer rounded-xl border-2 p-6 flex flex-col items-center gap-4 transition-all duration-200 bg-card",
      active
        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
        : "border-muted hover:border-primary/50",
    )}
  >
    <div
      className={cn("p-3 rounded-full bg-background", active && "shadow-sm")}
    >
      {icon}
    </div>
    <span className="text-sm font-semibold">{label}</span>
  </div>
);

export default SettingsDialog;
