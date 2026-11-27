/**
 * Serial Host Details Panel
 * A dedicated editor for serial port hosts (distinct from SSH HostDetailsPanel)
 */
import { Eye, EyeOff, Save, Tag, Usb, X } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { useI18n } from '../application/i18n/I18nProvider';
import type { GroupConfig, Host, SerialConfig, SerialFlowControl, SerialParity } from '../domain/models';
import { resolveHostGroupForSave } from '../domain/hostGroupPathMutations';
import {
  resolveSerialBackspaceFormValue,
  resolveSerialBackspaceOverrideOnSave,
} from '../domain/serialBackspace';

import { isSerialEndpointPath, isWindowsNamedPipePath } from '../domain/serialEndpoint';

import {
  SerialAdvancedOptionsSection,
  SERIAL_BAUD_RATES as BAUD_RATES,
} from './SerialAdvancedOptions';
import { useSerialPortDiscovery } from './serial/useSerialPortDiscovery';
import { Button } from './ui/button';
import { Combobox, ComboboxOption, MultiCombobox } from './ui/combobox';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  AsidePanel,
  AsidePanelContent,
  AsidePanelFooter,
  type AsidePanelLayout,
  type AsidePanelResizeProps,
} from './ui/aside-panel';
import { HostDetailsSection } from './host-details/HostDetailsSection';
import { HostNotesEditor } from './host/HostNotesEditor';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '../lib/utils';
import { HostIconPopover, type HostIconPickerOptions, type HostIconSelection } from './host-details/HostIconPopover';

interface SerialHostDetailsPanelProps {
  initialData: Host;
  creationProtocolControl?: React.ReactNode;
  iconPickerOptions?: HostIconPickerOptions;
  allTags?: string[];
  groups?: string[];
  groupDefaults?: Partial<GroupConfig>;
  onSave: (host: Host) => void;
  onCancel: () => void;
  layout?: AsidePanelLayout;
  className?: string;
}

type SerialHostDetailsPanelPropsWithResize = SerialHostDetailsPanelProps & AsidePanelResizeProps;

export const SerialHostDetailsPanel: React.FC<SerialHostDetailsPanelPropsWithResize> = ({
  initialData,
  creationProtocolControl,
  iconPickerOptions,
  allTags = [],
  groups = [],
  groupDefaults,
  onSave,
  onCancel,
  layout = 'overlay',
  className,
  resizable,
  persistWidthStorageKey,
  resizeAriaLabel,
}) => {
  const { t } = useI18n();
  const { portOptions, isLoadingPorts, loadPorts } = useSerialPortDiscovery();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [iconSelection, setIconSelection] = useState<HostIconSelection>(() => ({
    distroMode: initialData.distroMode,
    manualDistro: initialData.manualDistro,
    iconMode: initialData.iconMode,
    iconId: initialData.iconId,
    iconColorMode: initialData.iconColorMode,
    iconColor: initialData.iconColor,
    iconColorCustom: initialData.iconColorCustom,
  }));
  const [label, setLabel] = useState(initialData.label);
  const [username, setUsername] = useState(initialData.username || '');
  const [password, setPassword] = useState(initialData.password || '');
  // Tracks whether the user edited the password field this session. An empty
  // password is a meaningful serial credential (the auto-login detector
  // submits a blank line at a Password prompt), so an explicit edit to blank
  // must be saved as '' while an untouched field preserves the stored value.
  const [passwordChanged, setPasswordChanged] = useState(false);
  // Explicit "remove the saved credential" flag. An empty password field is a
  // meaningful serial credential (a present blank password), so blanking the
  // input alone cannot restore `password` to undefined — the user needs a
  // dedicated control to delete the credential entirely.
  const [passwordCleared, setPasswordCleared] = useState(false);
  const [selectedPort, setSelectedPort] = useState(initialData.serialConfig?.path || initialData.hostname || '');
  const [baudRate, setBaudRate] = useState(initialData.serialConfig?.baudRate || initialData.port || 115200);
  const [dataBits, setDataBits] = useState<5 | 6 | 7 | 8>(initialData.serialConfig?.dataBits || 8);
  const [stopBits, setStopBits] = useState<1 | 1.5 | 2>(initialData.serialConfig?.stopBits || 1);
  const [parity, setParity] = useState<SerialParity>(initialData.serialConfig?.parity || 'none');
  const [flowControl, setFlowControl] = useState<SerialFlowControl>(initialData.serialConfig?.flowControl || 'none');
  const [localEcho, setLocalEcho] = useState(initialData.serialConfig?.localEcho || false);
  const [lineMode, setLineMode] = useState(initialData.serialConfig?.lineMode || false);
  const [backspaceBehavior, setBackspaceBehavior] = useState(
    resolveSerialBackspaceFormValue(initialData, groupDefaults),
  );
  const [backspaceBehaviorChanged, setBackspaceBehaviorChanged] = useState(false);
  const [byteOrientedBackspace, setByteOrientedBackspace] = useState(
    initialData.serialConfig?.byteOrientedBackspace ?? false,
  );
  const [charset, setCharset] = useState(initialData.charset || 'UTF-8');
  const [tags, setTags] = useState<string[]>(initialData.tags || []);
  const [group, setGroup] = useState(initialData.group || '');
  const originalGroupRef = useRef(initialData.group || '');
  const [notes, setNotes] = useState(initialData.notes ?? '');

  const handleSave = () => {
    if (!selectedPort) return;

    const config: SerialConfig = {
      path: selectedPort.trim(),
      baudRate,
      dataBits,
      stopBits,
      parity,
      flowControl,
      localEcho,
      lineMode,
      backspaceBehavior: resolveSerialBackspaceOverrideOnSave({
        initialHost: initialData,
        selectedBehavior: backspaceBehavior,
        behaviorChanged: backspaceBehaviorChanged,
      }),
      byteOrientedBackspace,
    };

    const portName = selectedPort.split('/').pop() || selectedPort;
    const updatedHost: Host = {
      ...initialData,
      ...iconSelection,
      label: label.trim() || `Serial: ${portName}`,
      hostname: selectedPort.trim(),
      port: baudRate,
      username: username.trim() || undefined,
      // An empty password is meaningful for serial auto-login: the detector
      // distinguishes an absent password from a present empty string and
      // submits the required blank line at a Password prompt. An explicit edit
      // saves exactly what the user typed (including a blank line); the
      // dedicated clear control removes the credential entirely (undefined);
      // an untouched field preserves the stored credential as-is.
      password: passwordChanged
        ? (passwordCleared ? undefined : password)
        : (initialData.password ?? undefined),
      tags,
      group: resolveHostGroupForSave(group, originalGroupRef.current, group !== originalGroupRef.current),
      charset,
      serialConfig: config,
      backspaceBehavior: undefined,
      notes: notes.trim() || undefined,
    };

    onSave(updatedHost);
  };

  // Tag options for MultiCombobox
  const tagOptions: ComboboxOption[] = useMemo(() => {
    const allUniqueTags = new Set([...allTags, ...tags]);
    return Array.from(allUniqueTags).map((tag) => ({
      value: tag,
      label: tag,
    }));
  }, [allTags, tags]);

  // Group options for Combobox
  const groupOptions: ComboboxOption[] = useMemo(() => {
    const allGroups = new Set(groups);
    if (group && !allGroups.has(group)) {
      allGroups.add(group);
    }
    return Array.from(allGroups).map((g) => ({
      value: g,
      label: g,
    }));
  }, [groups, group]);

  // Validation
  const trimmedPort = selectedPort.trim();
  const isNamedPipe = isWindowsNamedPipePath(trimmedPort);
  const isPortValid = isSerialEndpointPath(trimmedPort);
  const isBaudRateValid = Number.isInteger(baudRate) && baudRate > 0;
  const isValid = isPortValid && (isNamedPipe || isBaudRateValid);


  const serialConnectionFields = (<>
        {/* Serial Port */}
        <div className={creationProtocolControl ? "space-y-1.5" : "space-y-2"}>
          <div className={cn("flex items-center justify-between", creationProtocolControl && "h-4")}>
            <Label htmlFor="serial-port">{t('serial.field.port')}</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadPorts}
              disabled={isLoadingPorts}
              className={creationProtocolControl ? "h-5 px-2 text-xs" : "h-6 px-2 text-xs"}
            >
              {t('common.refresh')}
            </Button>
          </div>
          <Combobox
            triggerClassName={creationProtocolControl ? "h-7 text-xs" : undefined}
            options={portOptions}
            value={selectedPort}
            onValueChange={setSelectedPort}
            placeholder={t('serial.field.selectPort')}
            emptyText={t('serial.noPorts')}
            allowCreate
            createText={t('common.use')}
            icon={<Usb size={14} className="text-muted-foreground" />}
          />
          <p className="text-xs text-muted-foreground">
            {t('serial.field.namedPipeHint')}
          </p>
          {!isPortValid && selectedPort && (
            <p className="text-xs text-destructive">
              {t('serial.field.customPortPlaceholder')}
            </p>
          )}
        </div>

        {/* Baud Rate (not used by named pipes) */}
        {!isNamedPipe && (
        <div className={creationProtocolControl ? "space-y-1.5" : "space-y-2"}>
          <Label className={creationProtocolControl ? "flex h-4 items-center" : undefined} htmlFor="baud-rate">{t('serial.field.baudRate')}</Label>
          <Combobox
            triggerClassName={creationProtocolControl ? "h-7 text-xs" : undefined}
            clearable={creationProtocolControl ? false : undefined}
            options={BAUD_RATES.map((rate) => ({
              value: String(rate),
              label: String(rate),
            }))}
            value={String(baudRate)}
            onValueChange={(val) => {
              const parsed = parseInt(val, 10);
              if (!isNaN(parsed) && parsed > 0) {
                setBaudRate(parsed);
              }
            }}
            placeholder={t('serial.field.baudRatePlaceholder')}
            emptyText={t('serial.field.baudRateEmpty')}
            allowCreate
            createText={t('common.use')}
          />
          {baudRate > 0 && !BAUD_RATES.includes(baudRate) && (
            <p className="text-xs text-muted-foreground">
              {t('serial.field.customBaudRate')}
            </p>
          )}
        </div>
        )}

  </>);

  const nameField = (
          <div className="flex items-center gap-2">
            {creationProtocolControl && iconPickerOptions && <HostIconPopover host={{ ...initialData, ...iconSelection, label }} options={iconPickerOptions} onChange={(next) => setIconSelection((previous) => ({ ...previous, ...next }))} />}
            <Input
              id="serial-label"
              aria-label={t('hostDetails.create.name')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('serial.field.configLabelPlaceholder')}
            />
          </div>
  );

  return (
    <AsidePanel
      open={true}
      onClose={onCancel}
      title={t(creationProtocolControl ? 'hostDetails.title.new' : 'serial.edit.title')}
      subtitle={creationProtocolControl ? undefined : initialData.label}
      className={cn('z-40', creationProtocolControl && "[&_input]:h-7 [&_input]:bg-secondary/40 [&_input]:text-xs [&_input]:focus-visible:ring-1 [&_input]:focus-visible:ring-ring [&_textarea]:focus-visible:ring-1 [&_textarea]:focus-visible:ring-ring [&_label]:text-xs [&_label]:font-semibold", className)}
      layout={layout}
      dataSection="serial-host-details-panel"
      resizable={resizable}
      persistWidthStorageKey={persistWidthStorageKey}
      resizeAriaLabel={resizeAriaLabel}
    >
      <AsidePanelContent className={creationProtocolControl ? "[&_[data-radix-scroll-area-viewport]>div>div]:space-y-2 [&_[data-radix-scroll-area-viewport]>div>div]:py-3" : undefined}>
        {/* Keep the shared name and protocol controls in the same position. */}
        {creationProtocolControl ? <HostDetailsSection
          icon={null}
          title={t('hostDetails.create.name')}
          className="!border-0 !bg-transparent !p-0 !shadow-none !space-y-1.5 [&>div:first-child>span]:hidden"
        >
          {nameField}
        </HostDetailsSection> : (
          <div className="space-y-2">
            <Label htmlFor="serial-label">{t('serial.field.configLabel')}</Label>
            {nameField}
          </div>
        )}

        {creationProtocolControl}

        {creationProtocolControl ? (
          <div className="grid grid-cols-[minmax(0,1fr)_100px] items-start gap-3">
            {serialConnectionFields}
          </div>
        ) : serialConnectionFields}

        {/* Login credentials (auto-login) */}
        <div className={creationProtocolControl ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "space-y-2"}>
          <div className={creationProtocolControl ? "space-y-1.5" : "contents"}>
          <Label htmlFor="serial-username">{t('serial.field.username')}</Label>
          <Input
            id="serial-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('serial.field.username')}
            autoComplete="off"
          />
          </div>
          <div className={creationProtocolControl ? "space-y-1.5" : "contents"}>
          {creationProtocolControl && <Label htmlFor="serial-password">{t('serial.field.password')}</Label>}
          <div className="relative">
            <Input
              id="serial-password"
              value={password}
              type={showPassword ? 'text' : 'password'}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordChanged(true);
                if (e.target.value !== '') {
                  setPasswordCleared(false);
                }
              }}
              placeholder={t('serial.field.password')}
              autoComplete="off"
              className="pr-16"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              {(initialData.password !== undefined || password !== '') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setPassword('');
                        setPasswordChanged(true);
                        setPasswordCleared(true);
                      }}
                      aria-label={t('serial.field.clearPassword')}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('serial.field.clearPassword')}</TooltipContent>
                </Tooltip>
              )}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          </div>
          <p className={cn("text-xs text-muted-foreground", creationProtocolControl && "col-span-full")}>
            {t('serial.field.autoLoginDesc')}
          </p>
        </div>

        {!creationProtocolControl && <>
        {/* Tags */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Tag size={14} />
            {t('hostDetails.tags')}
          </Label>
          <MultiCombobox
            options={tagOptions}
            values={tags}
            onValuesChange={setTags}
            placeholder={t('hostDetails.addTag')}
            allowCreate
            createText={t('hostDetails.createTag')}
          />
        </div>

        <HostNotesEditor
          panelKey={initialData.id}
          value={notes}
          onChange={setNotes}
        />

        </>}

        {/* Group */}
        <div className={creationProtocolControl ? "space-y-1.5" : "space-y-2"}>
          <Label>{t('hostDetails.group')}</Label>
          <Combobox
            triggerClassName={creationProtocolControl ? "h-7 text-xs" : undefined}
            options={groupOptions}
            value={group}
            onValueChange={setGroup}
            placeholder={t('hostDetails.selectGroup')}
            allowCreate
            createText={t('hostDetails.createGroup')}
          />
        </div>

        {creationProtocolControl ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold">{t('hostDetails.notes.label')}</span>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('hostDetails.notes.placeholder')} className="min-h-20 bg-secondary/40 text-xs font-normal" rows={3} />
          </label>
        ) : null}

        {/* Advanced Options */}
        <SerialAdvancedOptionsSection
          open={showAdvanced}
          onOpenChange={setShowAdvanced}
          isNamedPipe={isNamedPipe}
          dataBits={dataBits}
          onDataBitsChange={setDataBits}
          stopBits={stopBits}
          onStopBitsChange={setStopBits}
          parity={parity}
          onParityChange={setParity}
          flowControl={flowControl}
          onFlowControlChange={setFlowControl}
          backspaceBehavior={backspaceBehavior}
          onBackspaceBehaviorChange={(value) => {
            setBackspaceBehavior(value);
            setBackspaceBehaviorChanged(true);
          }}
          byteOrientedBackspace={byteOrientedBackspace}
          onByteOrientedBackspaceChange={setByteOrientedBackspace}
          localEcho={localEcho}
          onLocalEchoChange={setLocalEcho}
          lineMode={lineMode}
          onLineModeChange={setLineMode}
          charset={charset}
          onCharsetChange={setCharset}
        />
      </AsidePanelContent>

      <AsidePanelFooter>
        <div className={cn("flex gap-2", creationProtocolControl && "justify-end")}>
          <Button variant={creationProtocolControl ? "secondary" : "ghost"} onClick={onCancel} className={creationProtocolControl ? "h-8 px-3 text-xs" : "flex-1"}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!isValid} className={creationProtocolControl ? "h-8 px-4 text-xs" : "flex-1"}>
            {!creationProtocolControl && <Save size={14} className="mr-2" />}
            {t('common.save')}
          </Button>
        </div>
      </AsidePanelFooter>
    </AsidePanel>
  );
};

export default SerialHostDetailsPanel;
