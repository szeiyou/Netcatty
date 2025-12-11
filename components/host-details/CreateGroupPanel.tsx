/**
 * Create Group Sub-Panel
 * Panel for creating new groups within the host details
 */
import React from 'react';
import { FolderPlus, Plus, HelpCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card } from '../ui/card';
import { AsidePanel, AsidePanelContent } from '../ui/aside-panel';

interface ToggleRowProps {
    label: string;
    enabled: boolean;
    onToggle: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, enabled, onToggle }) => (
    <div className="flex items-center justify-between">
        <span className="text-sm">{label}</span>
        <button
            type="button"
            onClick={onToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'
                }`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'
                    }`}
            />
        </button>
    </div>
);

export interface CreateGroupPanelProps {
    newGroupName: string;
    setNewGroupName: (name: string) => void;
    newGroupParent: string;
    setNewGroupParent: (parent: string) => void;
    groups: string[];
    onSave: () => void;
    onBack: () => void;
    onCancel: () => void;
}

export const CreateGroupPanel: React.FC<CreateGroupPanelProps> = ({
    newGroupName,
    setNewGroupName,
    newGroupParent,
    setNewGroupParent,
    groups,
    onSave,
    onBack,
    onCancel,
}) => {
    return (
        <AsidePanel
            open={true}
            onClose={onCancel}
            title="New Group"
            showBackButton={true}
            onBack={onBack}
            actions={
                <Button size="sm" onClick={onSave} disabled={!newGroupName.trim()}>
                    Save
                </Button>
            }
        >
            <AsidePanelContent>
                <Card className="p-3 space-y-3 bg-card border-border/80">
                    <p className="text-xs font-semibold">General</p>
                    <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center">
                            <FolderPlus size={18} className="text-primary" />
                        </div>
                        <Input
                            placeholder="Group name"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            className="h-10 flex-1"
                            autoFocus
                        />
                    </div>
                    <div className="relative">
                        <Input
                            placeholder="Parent Group"
                            value={newGroupParent}
                            onChange={(e) => setNewGroupParent(e.target.value)}
                            list="parent-group-options"
                            className="h-10"
                        />
                        <datalist id="parent-group-options">
                            {groups.map((g) => <option key={g} value={g} />)}
                        </datalist>
                    </div>
                </Card>

                <Card className="p-3 space-y-2 bg-card border-border/80">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">Cloud Sync</p>
                        <HelpCircle size={14} className="text-muted-foreground" />
                    </div>
                    <ToggleRow label="Cloud Sync" enabled={false} onToggle={() => { }} />
                </Card>

                <Button variant="ghost" className="w-full h-10 gap-2">
                    <Plus size={16} /> Add protocol
                </Button>
            </AsidePanelContent>
        </AsidePanel>
    );
};

export default CreateGroupPanel;
