import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  PlugZap,
  Plus,
  Settings2,
  Tag,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import { useApplicationBackend, type SshAgentStatus } from "../application/state/useApplicationBackend";
import { applyGroupDefaults, resolveGroupDefaults, resolveGroupTerminalThemeId } from "../domain/groupConfig";
import {
  getEffectiveHostDistro,
  normalizePrimaryTelnetState,
} from "../domain/host";
import {
  formatProxyConfigEndpoint,
  formatProxyConfigType,
  updateProxyConfigField,
} from "../domain/proxyProfiles";
import { hasRequiredHostAuthCredential, resolveHostAuth, resolveHostAuthMethodForPersistence } from "../domain/sshAuth";
import { canServeAsSshJumpHost } from "../domain/terminalProtocol";
import { customThemeStore } from "../application/state/customThemeStore";
import {
  hasHostFontSizeOverride,
  hasHostThemeOverride,
  resolveHostTerminalFontSize,
  resolveHostTerminalThemeId,
} from "../domain/terminalAppearance";
import { EnvVar, GroupConfig, Host, Identity, KnownHost, ManagedSource, ProxyConfig, ProxyProfile, Snippet, SSHKey, TerminalSettings } from "../types";
import { DISTRO_COLORS, DISTRO_LOGOS } from "./DistroAvatar";
import SerialHostDetailsPanel from "./SerialHostDetailsPanel";
import { HostCreationProtocolSelect } from "./host-details/HostCreationProtocolSelect";
import { HostIconPopover } from "./host-details/HostIconPopover";
import ThemeSelectPanel from "./ThemeSelectPanel";
import {
  AsidePanel,
  AsidePanelContent,
  AsidePanelFooter,
  type AsidePanelLayout,
  type AsidePanelResizeProps,
} from "./ui/aside-panel";
import { HostDetailsAdvancedSections } from "./HostDetailsAdvancedSections";
import { detachEffectiveHostIdentity, HostDetailsConnectionSections } from "./HostDetailsConnectionSections";
import type { HostTotpFlushResult } from "./HostTotpFields";
import {
  LINUX_DISTRO_OPTION_IDS,
  parseOptionalPortInput,
  resolveDetailsTelnetPassword,
  resolveDetailsTelnetPort,
  resolveDetailsTelnetUsername,
  resolvePrimaryProtocolSavePort,
  resolvePrimaryProtocolSwitchPort,
  prepareTelnetCredentialsForSave,
  prepareProxyConfigForSave,
} from "./HostDetailsPanel.helpers";
export { parseOptionalPortInput } from "./HostDetailsPanel.helpers";
import { TerminalEncodingSelect } from "./TerminalEncodingSelect";
import { Button } from "./ui/button";
import { Combobox, ComboboxOption, MultiCombobox } from "./ui/combobox";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { PortalContainerProvider } from "./ui/portal-container";
import { Switch } from "./ui/switch";
import { toast } from "./ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

import {
  ChainPanel,
  CreateGroupPanel,
  HostDetailsSection,
  EnvVarsPanel,
  ProxyPanel,
} from "./host-details";
import { HostNotesEditor } from "./host/HostNotesEditor";
import { HostDetailsScriptsSection } from "./host/HostDetailsScriptsSection";
import { ensureHostConnectScriptIds, getEditableHostConnectScriptIds, syncSnippetsForHostConnectQueueSave } from "@/domain/hostConnectScripts.ts";
import {
  isPluginHostProtocol,
  sanitizePluginConnection,
  stripBuiltInConnectionFieldsForPluginHost,
} from "../domain/pluginConnection";
import { PluginConnectionSection } from "./PluginConnectionSection";
import { useHostConnectionTest } from "../application/state/useHostConnectionTest";
import { HostConnectionTestDialog } from "./host-details/HostConnectionTestDialog";

type CredentialType = "sshid" | "key" | "certificate" | "localKeyFile" | null;
type SubPanel =
  | "none"
  | "create-group"
  | "proxy"
  | "chain"
  | "env-vars"
  | "theme-select"
  | "telnet-theme-select";

interface HostDetailsPanelProps {
  initialData?: Host | null;
  availableKeys: SSHKey[];
  identities: Identity[];
  proxyProfiles?: ProxyProfile[];
  groups: string[];
  managedSources?: ManagedSource[];
  allTags?: string[]; // All available tags for autocomplete
  allHosts?: Host[]; // All hosts for chain selection
  defaultGroup?: string | null; // Default group for new hosts (from current navigation)
  terminalThemeId: string;
  terminalFontSize: number;
  onSave: (host: Host) => void;
  onCancel: () => void;
  onCreateGroup?: (groupPath: string) => void; // Callback to create a new group
  onCreateTag?: (tag: string) => void; // Callback to create a new tag
  groupDefaults?: Partial<import('../domain/models').GroupConfig>;
  groupConfigs?: GroupConfig[];
  layout?: AsidePanelLayout;
  onImportKey?: (draft: Partial<SSHKey>) => SSHKey;
  snippets?: Snippet[];
  onSnippetsChange?: (snippets: Snippet[]) => void;
  onHostsChange?: (hosts: Host[] | ((prev: Host[]) => Host[])) => void;
  knownHosts?: KnownHost[];
  onAddKnownHost?: (knownHost: KnownHost) => void;
  terminalSettings?: TerminalSettings;
  className?: string;
}

type HostDetailsPanelPropsWithResize = HostDetailsPanelProps & AsidePanelResizeProps;

const HostDetailsPanelContent: React.FC<HostDetailsPanelPropsWithResize> = ({
  initialData,
  availableKeys,
  identities,
  proxyProfiles = [],
  groups,
  managedSources = [],
  allTags = [],
  allHosts = [],
  defaultGroup,
  terminalThemeId,
  terminalFontSize,
  onSave,
  onCancel,
  onCreateGroup,
  onCreateTag,
  groupDefaults,
  groupConfigs = [],
  layout = "overlay",
  onImportKey,
  snippets = [],
  onSnippetsChange,
  onHostsChange,
  knownHosts,
  onAddKnownHost,
  terminalSettings,
  className,
  resizable,
  persistWidthStorageKey,
  resizeAriaLabel,
}) => {
  const { t } = useI18n();
  const asideResizeProps = {
    resizable,
    persistWidthStorageKey,
    resizeAriaLabel,
  };
  const { checkSshAgent } = useApplicationBackend();
  const baselineSnippetsRef = useRef(snippets);
  const totpFlushRef = useRef<(() => Promise<HostTotpFlushResult>) | null>(null);
  const savingHostRef = useRef(false);
  const baselineHydratedRef = useRef(snippets.length > 0);
  const openingQueueIdsRef = useRef<string[]>([]);
  const [form, setForm] = useState<Host>(
    () =>
      (initialData ? normalizePrimaryTelnetState(initialData) : null) ||
      ({
        id: crypto.randomUUID(),
        label: "",
        hostname: "",
        port: groupDefaults?.port ? undefined : 22,
        username: groupDefaults?.username ? "" : "root",
        protocol: "ssh",
        tags: [],
        os: "linux",
        authMethod: undefined,
        authPolicyVersion: 1,
        charset: groupDefaults?.charset ? undefined : "UTF-8",
        distroMode: "auto",
        createdAt: Date.now(),
        group: defaultGroup || undefined, // Pre-fill with current navigation group
      } as Host),
  );

  const isCreating = !initialData;
  const [serialMode, setSerialMode] = useState(false);
  const [serialDraft, setSerialDraft] = useState<Host | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeSubPanel, setActiveSubPanel] = useState<SubPanel>("none");

  const [credentialPopoverOpen, setCredentialPopoverOpen] = useState(false);
  const [selectedCredentialType, setSelectedCredentialType] =
    useState<CredentialType>(null);

  const [identitySuggestionsOpen, setIdentitySuggestionsOpen] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showTelnetPassword, setShowTelnetPassword] = useState(false);
  const [showAlgorithmOverrides, setShowAlgorithmOverrides] = useState(false);
  const [showNotesEditor, setShowNotesEditor] = useState(() => Boolean(initialData?.notes?.trim()));
  const [pluginConnectionValid, setPluginConnectionValid] = useState(true);

  const [newKeyFilePath, setNewKeyFilePath] = useState("");
  const [pendingReferenceKeyPath, setPendingReferenceKeyPath] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupParent, setNewGroupParent] = useState("");

  const [sshAgentStatus, setSshAgentStatus] = useState<SshAgentStatus | null>(null);
  const [sshForwardingAgentStatus, setSshForwardingAgentStatus] = useState<SshAgentStatus | null>(null);

  const [testOpen, setTestOpen] = useState(false);
  const hostConnectionTest = useHostConnectionTest({
    host: form,
    hosts: allHosts,
    keys: availableKeys,
    identities,
    knownHosts,
    groupConfigs,
    proxyProfiles,
    terminalSettings,
    onAddKnownHost,
  });

  const handleStartTest = () => {
    setTestOpen(true);
    void hostConnectionTest.startTest();
  };

  const handleCloseTest = () => {
    setTestOpen(false);
  };

  useEffect(() => {
    let cancelled = false;
    if (form.agentForwarding || form.useSshAgent === true) {
      void checkSshAgent({
        identityAgent: form.useSshAgent === true ? form.identityAgent : undefined,
        hostname: form.hostname,
        port: form.port,
        username: form.username,
      }).then((status) => {
        if (!cancelled) setSshAgentStatus(status);
      });
    } else {
      setSshAgentStatus(null);
    }
    return () => {
      cancelled = true;
    };
  }, [form.agentForwarding, form.useSshAgent, form.identityAgent, form.hostname, form.port, form.username, checkSshAgent]);

  useEffect(() => {
    let cancelled = false;
    if (form.agentForwarding) {
      void checkSshAgent({
        identityAgent: form.identityAgent,
        agentForwarding: true,
        hostname: form.hostname,
        port: form.port,
        username: form.username,
      }).then((status) => {
        if (!cancelled) setSshForwardingAgentStatus(status);
      });
    } else {
      setSshForwardingAgentStatus(null);
    }
    return () => {
      cancelled = true;
    };
  }, [form.agentForwarding, form.identityAgent, form.hostname, form.port, form.username, checkSshAgent]);

  const [groupInputValue, setGroupInputValue] = useState(form.group || "");

  const initialHostId = initialData?.id;

  useEffect(() => {
    baselineSnippetsRef.current = snippets;
    baselineHydratedRef.current = snippets.length > 0;
    if (!initialData) {
      openingQueueIdsRef.current = [];
    } else {
      const normalized = normalizePrimaryTelnetState(initialData);
      const ensured = snippets.length > 0
        ? ensureHostConnectScriptIds(normalized, snippets)
        : normalized;
      openingQueueIdsRef.current = getEditableHostConnectScriptIds(ensured, snippets);
    }
    // Snapshot only when opening/reopening a host editor, not on live snippet edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHostId]);

  useEffect(() => {
    // If the editor opened before snippets hydrated, capture the first non-empty
    // catalog as baseline so concurrent-edit guards still have a reference.
    if (baselineHydratedRef.current) return;
    if (snippets.length === 0) return;
    baselineSnippetsRef.current = snippets;
    baselineHydratedRef.current = true;
    if (initialData) {
      const normalized = normalizePrimaryTelnetState(initialData);
      const ensured = ensureHostConnectScriptIds(normalized, snippets);
      openingQueueIdsRef.current = getEditableHostConnectScriptIds(ensured, snippets);
    }
  }, [initialData, snippets]);

  useEffect(() => {
    if (!initialData) return;
    const normalized = normalizePrimaryTelnetState(initialData);
    setForm(
      snippets.length > 0
        ? ensureHostConnectScriptIds(normalized, snippets)
        : normalized,
    );
    setGroupInputValue(initialData.group || "");
    setPendingReferenceKeyPath(null);
    setShowPassword(false);
    setShowTelnetPassword(false);
    setShowNotesEditor(Boolean(normalized.notes?.trim()));
    // Reset only when opening a different host — not when snippets list updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHostId]);

  useEffect(() => {
    if (!initialData || snippets.length === 0) return;
    setForm((prev) => {
      if (prev.id !== initialData.id) return prev;
      const synced = ensureHostConnectScriptIds(prev, snippets);
      if (
        synced.connectScriptIds === prev.connectScriptIds
        && synced.loginScriptId === prev.loginScriptId
      ) {
        return prev;
      }
      return synced;
    });
  }, [initialData, snippets]);

  const update = <K extends keyof Host>(key: K, value: Host[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addLocalKeyFilePath = useCallback((path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setForm((prev) => ({
      ...prev,
      identityFilePaths: onImportKey ? [trimmed] : [...(prev.identityFilePaths || []), trimmed],
      identityFileId: undefined,
      authMethod: "key",
    }));
    setPendingReferenceKeyPath(onImportKey ? trimmed : null);
    setNewKeyFilePath("");
    setSelectedCredentialType(null);
  }, [onImportKey]);

  const effectiveGroupDefaults = useMemo(() => {
    const currentGroupPath = form.group || defaultGroup;
    if (currentGroupPath && groupConfigs.length > 0) {
      return resolveGroupDefaults(currentGroupPath, groupConfigs);
    }
    return groupDefaults;
  }, [defaultGroup, form.group, groupConfigs, groupDefaults]);

  const effectiveAuthHost = useMemo(
    () => effectiveGroupDefaults ? applyGroupDefaults(form, effectiveGroupDefaults) : form,
    [effectiveGroupDefaults, form],
  );

  const selectedIdentity = useMemo(() => {
    if (!effectiveAuthHost.identityId) return undefined;
    return identities.find((i) => i.id === effectiveAuthHost.identityId);
  }, [effectiveAuthHost.identityId, identities]);

  const effectiveAuth = useMemo(() => resolveHostAuth({
    host: effectiveAuthHost,
    keys: availableKeys,
    identities,
  }), [availableKeys, effectiveAuthHost, identities]);
  const effectiveAuthMethod = effectiveAuth.authMethod;

  const effectiveThemeId = useMemo(
    () => resolveHostTerminalThemeId(form, resolveGroupTerminalThemeId(effectiveGroupDefaults, terminalThemeId)),
    [effectiveGroupDefaults, form, terminalThemeId],
  );
  const effectiveFontSize = useMemo(
    () => resolveHostTerminalFontSize(form, terminalFontSize),
    [form, terminalFontSize],
  );
  const hasEffectiveThemeOverride = useMemo(
    () => hasHostThemeOverride(form),
    [form],
  );
  const hasEffectiveFontSizeOverride = useMemo(
    () => hasHostFontSizeOverride(form),
    [form],
  );
  const effectiveTelnetThemeId =
    form.protocols?.find((p) => p.protocol === "telnet")?.theme || effectiveThemeId;
  const effectiveTelnetPort = resolveDetailsTelnetPort(form, effectiveGroupDefaults);
  const effectiveTelnetUsername = resolveDetailsTelnetUsername(form, effectiveGroupDefaults);
  const effectiveTelnetPassword = resolveDetailsTelnetPassword(form, effectiveGroupDefaults);
  const distroOptions = useMemo(
    () =>
      LINUX_DISTRO_OPTION_IDS.map((value) => ({
        value,
        label: t(`hostDetails.distro.option.${value}`),
        icon: DISTRO_LOGOS[value],
        bgClass: DISTRO_COLORS[value] || DISTRO_COLORS.default,
      })),
    [t],
  );

  const getDistroOptionLabel = useCallback(
    (value?: string) =>
      distroOptions.find((option) => option.value === value)?.label ||
      value ||
      t("hostDetails.distro.pending"),
    [distroOptions, t],
  );

  const effectiveFormDistro = getEffectiveHostDistro(form);
  const selectedProxyProfile = useMemo(
    () => proxyProfiles.find((profile) => profile.id === form.proxyProfileId),
    [form.proxyProfileId, proxyProfiles],
  );
  const hasMissingProxyProfile = Boolean(form.proxyProfileId && !selectedProxyProfile);
  const proxySummaryType = hasMissingProxyProfile
    ? t("hostDetails.proxyPanel.missing")
    : formatProxyConfigType(selectedProxyProfile?.config || form.proxyConfig) || "HTTP";
  const proxySummaryLabel = hasMissingProxyProfile
    ? t("hostDetails.proxyPanel.missingSaved")
    : selectedProxyProfile
      ? selectedProxyProfile.label
      : formatProxyConfigEndpoint(form.proxyConfig);
  const proxySummaryTooltip = hasMissingProxyProfile
    ? t("hostDetails.proxyPanel.missingSaved")
    : selectedProxyProfile
      ? `${selectedProxyProfile.label} - ${formatProxyConfigEndpoint(selectedProxyProfile.config)}`
      : `${formatProxyConfigType(form.proxyConfig)} ${formatProxyConfigEndpoint(form.proxyConfig)}`;

  const handleDistroModeChange = useCallback((mode: "auto" | "manual") => {
    setForm((prev) => ({
      ...prev,
      distroMode: mode,
      manualDistro:
        mode === "manual"
          ? prev.manualDistro || getEffectiveHostDistro(prev) || "linux"
          : prev.manualDistro,
    }));
  }, []);

  const updateProxyConfig = useCallback(
    (field: keyof ProxyConfig, value: ProxyConfig[keyof ProxyConfig]) => {
      setForm((prev) => {
        const { proxyProfileId: _proxyProfileId, directProxy: _directProxy, ...rest } = prev;
        return {
          ...rest,
          proxyConfig: updateProxyConfigField(prev.proxyConfig, field, value),
        } as Host;
      });
    },
    [],
  );

  const clearProxyConfig = useCallback(() => {
    setForm((prev) => {
      const { proxyConfig: _proxyConfig, proxyProfileId: _proxyProfileId, directProxy: _directProxy, ...rest } = prev;
      return rest as Host;
    });
  }, []);

  const selectProxyProfile = useCallback((profileId: string | undefined) => {
    setForm((prev) => {
      const { proxyConfig: _proxyConfig, proxyProfileId: _proxyProfileId, directProxy: _directProxy, ...rest } = prev;
      if (!profileId) return rest as Host;
      return { ...rest, proxyProfileId: profileId } as Host;
    });
  }, []);

  const selectDirectProxy = useCallback(() => {
    setForm((prev) => {
      const { proxyConfig: _proxyConfig, proxyProfileId: _proxyProfileId, ...rest } = prev;
      return { ...rest, directProxy: true } as Host;
    });
  }, []);

  const addHostToChain = (hostId: string) => {
    setForm((prev) => ({
      ...prev,
      hostChain: {
        hostIds: [...(prev.hostChain?.hostIds || []), hostId],
      },
    }));
  };

  const removeHostFromChain = (index: number) => {
    setForm((prev) => {
      const ids = (prev.hostChain?.hostIds || []).filter((_, i) => i !== index);
      return { ...prev, hostChain: ids.length > 0 ? { hostIds: ids } : undefined };
    });
  };

  const clearHostChain = useCallback(() => {
    setForm((prev) => {
      const { hostChain: _hostChain, ...rest } = prev;
      return rest as Host;
    });
  }, []);

  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  const addEnvVar = () => {
    if (!newEnvName.trim()) return;
    const newVar: EnvVar = { name: newEnvName.trim(), value: newEnvValue };
    setForm((prev) => ({
      ...prev,
      environmentVariables: [...(prev.environmentVariables || []), newVar],
    }));
    setNewEnvName("");
    setNewEnvValue("");
  };

  const removeEnvVar = (index: number) => {
    setForm((prev) => {
      const filtered = (prev.environmentVariables || []).filter((_, i) => i !== index);
      return { ...prev, environmentVariables: filtered.length > 0 ? filtered : undefined };
    });
  };
  const pluginProtocolActive = isPluginHostProtocol(form.protocol);
  const hasHostname = form.hostname.trim().length > 0;
  const canSaveHost = pluginProtocolActive
    ? pluginConnectionValid && Boolean(sanitizePluginConnection(form.pluginConnection, form.protocol))
    : hasHostname;

  const handleSubmit = async () => {
    if (savingHostRef.current) return;
    savingHostRef.current = true;
    try {
    const flushed = await totpFlushRef.current?.();
    if (flushed && !flushed.ok) return;
    const hostname = form.hostname.trim()
      || (pluginProtocolActive ? form.label.trim() || form.pluginConnection?.providerId || "plugin" : "");
    if (!hostname || !canSaveHost) return;
    if (!pluginProtocolActive && !hasRequiredHostAuthCredential({ host: effectiveAuthHost, keys: availableKeys, identities })) {
      toast.error(t("hostDetails.auth.credentialRequired"));
      return;
    }
    const proxySave = pluginProtocolActive
      ? { normalizedProxyConfig: undefined, error: undefined }
      : prepareProxyConfigForSave({
      proxyConfig: form.proxyConfig,
      proxyProfileId: form.proxyProfileId,
      proxyProfiles,
      identities,
    });
    if (proxySave.error) {
      const messageKey = proxySave.error === "port"
        ? "proxyProfiles.error.port"
        : proxySave.error === "required"
          ? "hostDetails.proxyPanel.error.required"
          : proxySave.error === "missingSaved"
            ? "hostDetails.proxyPanel.missingSaved"
            : proxySave.error === "missingIdentity"
              ? "hostDetails.proxyPanel.missingIdentity"
              : proxySave.error === "incompleteIdentity"
                ? "hostDetails.proxyPanel.incompleteIdentity"
                : "hostDetails.proxyPanel.unreadableIdentity";
      toast.error(t(messageKey));
      setActiveSubPanel("proxy");
      return;
    }
    const normalizedProxyConfig = proxySave.normalizedProxyConfig;
    let finalLabel = form.label?.trim() || hostname;
    const finalGroup = groupInputValue.trim() || form.group || "";

    const targetManagedSource = managedSources
      .filter(s => finalGroup === s.groupName || finalGroup.startsWith(s.groupName + "/"))
      .sort((a, b) => b.groupName.length - a.groupName.length)[0];

    const canBeManaged = !form.protocol || form.protocol === "ssh";

    if (targetManagedSource && canBeManaged) {
      finalLabel = finalLabel.replace(/\s/g, '');
    }

    let finalManagedSourceId: string | undefined;
    if (targetManagedSource && canBeManaged) {
      finalManagedSourceId = targetManagedSource.id;
    } else if (managedSources.length === 0 && form.managedSourceId && canBeManaged) {
      finalManagedSourceId = form.managedSourceId;
    } else {
      finalManagedSourceId = undefined;
    }

    const { proxyConfig: _draftProxyConfig, ...formWithoutProxyDraft } = form;
    const finalPort = resolvePrimaryProtocolSavePort(
      form.protocol,
      form.port,
      Boolean(groupDefaults?.port),
      Boolean(groupDefaults?.telnetPort),
    );
    let cleaned: Host = {
      ...formWithoutProxyDraft,
      ...(normalizedProxyConfig && { proxyConfig: normalizedProxyConfig }),
      hostname,
      label: finalLabel,
      group: finalGroup,
      tags: form.tags || [],
      notes: form.notes?.trim() || undefined,
      port: finalPort,
      password: form.savePassword === false ? undefined : form.password,
      authMethod: resolveHostAuthMethodForPersistence({
        host: form,
        keys: availableKeys,
        identities,
        groupDefaults: effectiveGroupDefaults,
      }),
      authPolicyVersion: 1,
      managedSourceId: finalManagedSourceId,
    };
    if (flushed?.ok) {
      if (flushed.totp) cleaned.totp = flushed.totp;
      else delete cleaned.totp;
    }
    if (pluginProtocolActive) {
      const pluginConnection = sanitizePluginConnection(cleaned.pluginConnection, cleaned.protocol);
      if (!pluginConnection) return;
      cleaned = stripBuiltInConnectionFieldsForPluginHost({ ...cleaned, pluginConnection });
    }
    cleaned = prepareTelnetCredentialsForSave(normalizePrimaryTelnetState(cleaned));
    if (
      onImportKey &&
      pendingReferenceKeyPath &&
      cleaned.identityFilePaths?.includes(pendingReferenceKeyPath)
    ) {
      const fileName = pendingReferenceKeyPath.split('/').pop() || pendingReferenceKeyPath;
      const key = onImportKey({
        source: 'reference',
        filePath: pendingReferenceKeyPath,
        label: fileName,
        privateKey: '',
        category: 'key',
      });
      cleaned = {
        ...cleaned,
        identityFileId: key.id,
        identityFilePaths: [pendingReferenceKeyPath],
        authMethod: "key",
      };
    }
    const preserveLegacyTheme = initialData?.theme != null && cleaned.themeOverride !== false;
    const preserveLegacyFontFamily = initialData?.fontFamily != null && cleaned.fontFamilyOverride !== false;
    const preserveLegacyFontSize = initialData?.fontSize != null && cleaned.fontSizeOverride !== false;

    if (cleaned.themeOverride === false) {
      delete cleaned.theme;
    } else if (preserveLegacyTheme && cleaned.theme == null) {
      cleaned.theme = initialData?.theme;
    }

    if (cleaned.fontFamilyOverride === false) {
      delete cleaned.fontFamily;
    } else if (preserveLegacyFontFamily && cleaned.fontFamily == null) {
      cleaned.fontFamily = initialData?.fontFamily;
    }

    if (cleaned.fontSizeOverride === false) {
      delete cleaned.fontSize;
    } else if (preserveLegacyFontSize && cleaned.fontSize == null) {
      cleaned.fontSize = initialData?.fontSize;
    }

    if ((cleaned.protocol && cleaned.protocol !== "ssh") || cleaned.moshEnabled || cleaned.etEnabled) {
      delete cleaned.x11Forwarding;
    }
    if (onSnippetsChange || onHostsChange) {
      const hostId = cleaned.id;
      if (snippets.length === 0 && !baselineHydratedRef.current) {
        // Vault may publish hosts before snippets hydrate. Do not wipe unresolved
        // connectScriptIds while the script catalog is still incomplete.
      } else {
        const savedQueueIds = openingQueueIdsRef.current;
        const finalQueueIds = getEditableHostConnectScriptIds(cleaned, snippets);
        const synced = syncSnippetsForHostConnectQueueSave(
          snippets,
          hostId,
          savedQueueIds,
          finalQueueIds,
          {
            baselineSnippets: baselineSnippetsRef.current,
            hosts: allHosts,
          },
        );
        cleaned = {
          ...cleaned,
          connectScriptIds: synced.connectScriptIds.length > 0
            ? synced.connectScriptIds
            : undefined,
          // sanitizeHost reconstitutes connectScriptIds from loginScriptId when
          // the explicit queue is absent; clear the legacy field when emptied.
          ...(synced.connectScriptIds.length === 0
            ? { loginScriptId: undefined }
            : {}),
        };
        if (synced.changed && onSnippetsChange) {
          onSnippetsChange(synced.snippets);
        }
        if (onHostsChange && synced.hosts.length > 0) {
          const peerChanged = synced.hosts.some((host) => {
            if (host.id === cleaned.id) return false;
            const original = allHosts.find((entry) => entry.id === host.id);
            return original !== undefined && original !== host;
          });
          if (peerChanged) {
            // Append only the script IDs this save newly queued onto each peer.
            // Leave the edited host alone so onSave can three-way merge it.
            onHostsChange((prevHosts) => {
              const peerAdds = new Map<string, string[]>();
              for (const syncedHost of synced.hosts) {
                if (syncedHost.id === cleaned.id) continue;
                const snapshot = allHosts.find((entry) => entry.id === syncedHost.id);
                if (!snapshot || snapshot === syncedHost) continue;
                const snapshotIds = snapshot.connectScriptIds ?? [];
                const addedIds = (syncedHost.connectScriptIds ?? []).filter(
                  (id) => !snapshotIds.includes(id),
                );
                if (addedIds.length > 0) peerAdds.set(syncedHost.id, addedIds);
              }
              return prevHosts.map((host) => {
                if (host.id === cleaned.id) return host;
                const addedIds = peerAdds.get(host.id);
                if (!addedIds || addedIds.length === 0) return host;
                const currentIds = host.connectScriptIds ?? [];
                const mergedIds = [...currentIds];
                for (const id of addedIds) {
                  if (!mergedIds.includes(id)) mergedIds.push(id);
                }
                if (
                  mergedIds.length === currentIds.length
                  && mergedIds.every((id, index) => id === currentIds[index])
                ) {
                  return host;
                }
                return { ...host, connectScriptIds: mergedIds };
              });
            });
          }
        }
      }
    }
    onSave(stripBuiltInConnectionFieldsForPluginHost(cleaned));
    } finally {
      savingHostRef.current = false;
    }
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const fullPath = newGroupParent
      ? `${newGroupParent}/${newGroupName.trim()}`
      : newGroupName.trim();
    onCreateGroup?.(fullPath);
    setGroupInputValue(fullPath);
    update("group", fullPath);
    setNewGroupName("");
    setNewGroupParent("");
    setActiveSubPanel("none");
  };

  const availableHostsForChain = useMemo(() => {
    const chainedIds = new Set(form.hostChain?.hostIds || []);
    // Chain hops are SSH ProxyJump hops; never offer local/serial/telnet/plugin
    // entries (e.g. saved local shells) as jump hosts.
    return allHosts.filter((h) =>
      h.id !== form.id
      && !chainedIds.has(h.id)
      && canServeAsSshJumpHost(h),
    );
  }, [allHosts, form.id, form.hostChain?.hostIds]);

  const chainedHosts = useMemo(() => {
    const ids = form.hostChain?.hostIds || [];
    return ids
      .map((id) => allHosts.find((h) => h.id === id))
      .filter(Boolean) as Host[];
  }, [allHosts, form.hostChain?.hostIds]);

  const groupOptions: ComboboxOption[] = useMemo(() => {
    return groups.map((g) => ({
      value: g,
      label: g.includes("/") ? g.split("/").pop()! : g,
      sublabel: g.includes("/") ? g : undefined,
    }));
  }, [groups]);

  const tagOptions: ComboboxOption[] = useMemo(() => {
    const allTagSet = new Set([...allTags, ...(form.tags || [])]);
    return Array.from(allTagSet).map((t) => ({ value: t, label: t }));
  }, [allTags, form.tags]);

  const keysByCategory = useMemo(() => {
    return {
      key: availableKeys.filter((k) => k.category === "key"),
      certificate: availableKeys.filter((k) => k.category === "certificate"),
      identity: availableKeys.filter((k) => k.category === "identity"),
    };
  }, [availableKeys]);

  const selectedTelnetIdentity = useMemo(() => {
    if (!form.telnetIdentityId) return undefined;
    return identities.find((i) => i.id === form.telnetIdentityId);
  }, [form.telnetIdentityId, identities]);

  const telnetIdentityOptions: ComboboxOption[] = useMemo(
    () =>
      identities.map((identity) => ({
        value: identity.id,
        label: identity.label,
        sublabel: identity.username,
      })),
    [identities],
  );

  const filteredIdentitySuggestions = useMemo(() => {
    if (selectedIdentity) return [];
    const q = (form.username || "").toLowerCase().trim();
    const base = identities;
    const filtered = q
      ? base.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.username.toLowerCase().includes(q),
      )
      : base;
    return filtered.slice(0, 6);
  }, [form.username, identities, selectedIdentity]);

  useEffect(() => {
    if (!identitySuggestionsOpen) return;
    if (filteredIdentitySuggestions.length === 0) {
      setIdentitySuggestionsOpen(false);
    }
  }, [filteredIdentitySuggestions.length, identitySuggestionsOpen]);

  const applyIdentity = useCallback(
    (identity: Identity) => {
      setForm((prev) => ({
        ...prev,
        identityId: identity.id,
        username: identity.username,
        authMethod: identity.authMethod,
        password: undefined,
        identityFileId: undefined,
        identityFilePaths: undefined,
      }));
      setPendingReferenceKeyPath(null);
      setSelectedCredentialType(null);
      setCredentialPopoverOpen(false);
      setIdentitySuggestionsOpen(false);
    },
    [],
  );

  const clearIdentity = useCallback(() => {
    setForm((prev) => detachEffectiveHostIdentity(prev, effectiveAuth.username));
    setIdentitySuggestionsOpen(false);
  }, [effectiveAuth.username]);

  const updateTelnetIdentity = useCallback((identityId: string) => {
    setForm((prev) => ({
      ...prev,
      telnetIdentityId: identityId || undefined,
      ...(identityId
        ? {
          telnetUsername: undefined,
          telnetPassword: undefined,
        }
        : {}),
    }));
  }, []);

  const groupField = (
            <Combobox
              options={groupOptions}
              value={form.group || ""}
              onValueChange={(val) => {
                update("group", val);
                setGroupInputValue(val);
              }}
              placeholder={t(isCreating ? "hostDetails.create.ungrouped" : "hostDetails.group.placeholder")}
              ariaLabel={t("hostDetails.create.group")}
              allowCreate={true}
              onCreateNew={(val) => {
                onCreateGroup?.(val);
                update("group", val);
                setGroupInputValue(val);
              }}
              createText="Create Group"
              triggerClassName={isCreating ? "w-full h-7 text-xs" : "flex-1 h-10"}
            />
  );
  const connectionSections = (
    <HostDetailsConnectionSections compact={isCreating}
          totpFlushRef={totpFlushRef}
          t={t}
          form={form}
          setForm={setForm}
          update={update}
          groupDefaults={effectiveGroupDefaults}
          effectiveAuthMethod={effectiveAuthMethod}
          effectiveUsername={effectiveAuth.username}
          effectiveIdentityId={effectiveAuthHost.identityId}
          selectedIdentity={selectedIdentity}
          clearIdentity={clearIdentity}
          identities={identities}
          identitySuggestionsOpen={identitySuggestionsOpen}
          filteredIdentitySuggestions={filteredIdentitySuggestions}
          setIdentitySuggestionsOpen={setIdentitySuggestionsOpen}
          availableKeys={availableKeys}
          applyIdentity={applyIdentity}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          pendingReferenceKeyPath={pendingReferenceKeyPath}
          setPendingReferenceKeyPath={setPendingReferenceKeyPath}
          selectedCredentialType={selectedCredentialType}
          setSelectedCredentialType={setSelectedCredentialType}
          credentialPopoverOpen={credentialPopoverOpen}
          setCredentialPopoverOpen={setCredentialPopoverOpen}
          keysByCategory={keysByCategory}
          newKeyFilePath={newKeyFilePath}
          setNewKeyFilePath={setNewKeyFilePath}
          addLocalKeyFilePath={addLocalKeyFilePath}
          handleDistroModeChange={handleDistroModeChange}
          distroOptions={distroOptions}
          effectiveFormDistro={effectiveFormDistro}
          getDistroOptionLabel={getDistroOptionLabel}
    />
  );

  const protocolControl = (
    <HostCreationProtocolSelect
      value={serialMode ? "serial" : form.protocol === "telnet" ? "telnet" : "ssh"}
      onChange={(protocol) => {
        if (protocol === "serial") {
          // Serial auto-login must start without the SSH form's credentials.
          setSerialDraft((previous) => previous ?? {
            id: form.id,
            label: form.label,
            hostname: "",
            username: "",
            port: 115200,
            protocol: "serial",
            os: "linux",
            tags: [...(form.tags || [])],
            group: form.group,
            notes: form.notes,
            charset: form.charset,
            createdAt: form.createdAt,
            distroMode: form.distroMode,
            manualDistro: form.manualDistro,
            iconMode: form.iconMode,
            iconId: form.iconId,
            iconColorMode: form.iconColorMode,
            iconColor: form.iconColor,
            iconColorCustom: form.iconColorCustom,
          });
          setSerialMode(true);
          return;
        }
        setSerialMode(false);
        setForm((previous) => ({
          ...previous,
          protocol,
          port: resolvePrimaryProtocolSwitchPort(previous.port, protocol, Boolean(effectiveGroupDefaults?.telnetPort), Boolean(effectiveGroupDefaults?.port)),
        }));
      }}
    />
  );

  const renderPanels = (panel: React.ReactNode) => {
    if (!isCreating) return panel;

  return (
    <>
      <div hidden={serialMode} className="h-full min-h-0 [&>div]:!w-full [&>div]:!border-l-0 [&>div]:!shadow-none">
        {panel}
      </div>
      {serialDraft && (
        <div hidden={!serialMode} className="h-full min-h-0 [&>div]:!w-full [&>div]:!border-l-0 [&>div]:!shadow-none">
          <SerialHostDetailsPanel
            initialData={serialDraft}
            groups={groups}
            allTags={allTags}
            groupDefaults={effectiveGroupDefaults}
            onSave={onSave}
            onCancel={onCancel}
            layout="inline"
            creationProtocolControl={protocolControl}
            iconPickerOptions={{ distroOptions, getDistroOptionLabel }}
          />
        </div>
      )}
    </>
  );
  };

  if (activeSubPanel === "create-group") {
    return renderPanels(
      <CreateGroupPanel
        newGroupName={newGroupName}
        setNewGroupName={setNewGroupName}
        newGroupParent={newGroupParent}
        setNewGroupParent={setNewGroupParent}
        groups={groups}
        onSave={handleCreateGroup}
        onBack={() => setActiveSubPanel("none")}
        onCancel={onCancel}
        layout={layout}
        {...asideResizeProps}
      />
    );
  }

  if (activeSubPanel === "proxy") {
    return renderPanels(
      <ProxyPanel
        proxyConfig={form.proxyConfig}
        proxyProfiles={proxyProfiles}
        identities={identities}
        selectedProxyProfileId={form.proxyProfileId}
        directProxy={form.directProxy}
        onUpdateProxy={updateProxyConfig}
        onSelectProxyProfile={selectProxyProfile}
        onSelectDirectProxy={selectDirectProxy}
        onClearProxy={clearProxyConfig}
        onBack={() => setActiveSubPanel("none")}
        onCancel={onCancel}
        layout={layout}
        {...asideResizeProps}
      />
    );
  }

  if (activeSubPanel === "chain") {
    return renderPanels(
      <ChainPanel
        formLabel={form.label}
        formHostname={form.hostname}
        form={form}
        chainedHosts={chainedHosts}
        availableHostsForChain={availableHostsForChain}
        onAddHost={addHostToChain}
        onRemoveHost={removeHostFromChain}
        onClearChain={clearHostChain}
        onBack={() => setActiveSubPanel("none")}
        onCancel={onCancel}
        layout={layout}
        {...asideResizeProps}
      />
    );
  }

  if (activeSubPanel === "env-vars") {
    return renderPanels(
      <EnvVarsPanel
        hostLabel={form.label}
        hostHostname={form.hostname}
        environmentVariables={form.environmentVariables || []}
        newEnvName={newEnvName}
        newEnvValue={newEnvValue}
        setNewEnvName={setNewEnvName}
        setNewEnvValue={setNewEnvValue}
        onAddEnvVar={addEnvVar}
        onRemoveEnvVar={removeEnvVar}
        onUpdateEnvVar={(index, field, value) => {
          const newVars = [...(form.environmentVariables || [])];
          newVars[index] = { ...newVars[index], [field]: value };
          setForm((prev) => ({ ...prev, environmentVariables: newVars }));
        }}
        onSave={() => {
          if (newEnvName.trim()) addEnvVar();
          setActiveSubPanel("none");
        }}
        onBack={() => setActiveSubPanel("none")}
        onCancel={onCancel}
        layout={layout}
        {...asideResizeProps}
      />
    );
  }

  if (activeSubPanel === "theme-select") {
    return renderPanels(
      <ThemeSelectPanel
        open={true}
        selectedThemeId={effectiveThemeId}
        onSelect={(themeId) => {
          if (themeId === effectiveThemeId && !hasEffectiveThemeOverride) {
            setActiveSubPanel("none");
            return;
          }
          setForm((prev) => ({ ...prev, theme: themeId, themeOverride: true }));
          setActiveSubPanel("none");
        }}
        onClose={onCancel}
        onBack={() => setActiveSubPanel("none")}
        showBackButton={true}
        layout={layout}
        {...asideResizeProps}
      />
    );
  }

  if (activeSubPanel === "telnet-theme-select") {
    return renderPanels(
      <ThemeSelectPanel
        open={true}
        selectedThemeId={effectiveTelnetThemeId}
        onSelect={(themeId) => {
          const telnetConfig = form.protocols?.find(
            (p) => p.protocol === "telnet",
          );
          if (telnetConfig) {
            const newProtocols = form.protocols?.map((p) =>
              p.protocol === "telnet" ? { ...p, theme: themeId } : p,
            );
            setForm((prev) => ({ ...prev, protocols: newProtocols }));
          } else {
            const newProtocols = [
              ...(form.protocols || []),
              {
                protocol: "telnet" as const,
                port: effectiveTelnetPort,
                enabled: true,
                theme: themeId,
              },
            ];
            setForm((prev) => ({ ...prev, protocols: newProtocols }));
          }
          setActiveSubPanel("none");
        }}
        onClose={onCancel}
        onBack={() => setActiveSubPanel("none")}
        showBackButton={true}
        layout={layout}
        {...asideResizeProps}
      />
    );
  }

  const standardPanel = (
    <AsidePanel
      open={true}
      onClose={onCancel}
      width={isCreating ? "w-[520px]" : "w-[420px]"}
      layout={layout}
      className={cn(className, isCreating && "[&_input]:h-7 [&_input]:bg-secondary/40 [&_input]:text-xs [&_input]:focus-visible:ring-1 [&_input]:focus-visible:ring-ring [&_textarea]:bg-secondary/40 [&_textarea]:focus-visible:ring-1 [&_textarea]:focus-visible:ring-ring")}
      dataSection="host-details-panel"
      {...asideResizeProps}
      title={
        initialData ? t("hostDetails.title.details") : t("hostDetails.title.new")
      }
      actions={
        <>
          {!pluginProtocolActive && form.protocol !== "telnet" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleStartTest}
                    disabled={!canSaveHost}
                    aria-label={t("hostConnectionTest.title")}
                  >
                    <PlugZap size={16} />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("hostConnectionTest.title")}
              </TooltipContent>
            </Tooltip>
          )}
          {!isCreating && <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleSubmit}
            disabled={!canSaveHost}
            aria-label={t("hostDetails.saveAria")}
          >
            <Check size={16} />
          </Button>}
        </>
      }
    >
      <AsidePanelContent className={isCreating ? "[&_[data-radix-scroll-area-viewport]>div>div]:space-y-2 [&_[data-radix-scroll-area-viewport]>div>div]:py-3" : undefined}>
        <HostDetailsSection
          icon={<Settings2 size={14} className="text-muted-foreground" />}
          title={t(isCreating ? "hostDetails.create.name" : "hostDetails.section.general")}
          className={isCreating ? "!border-0 !bg-transparent !p-0 !shadow-none !space-y-1.5 [&>div:first-child>span]:hidden" : undefined}
        >
          <div className="flex items-center gap-2">
            {isCreating && <HostIconPopover host={form} options={{ distroOptions, getDistroOptionLabel }} onChange={(next) => setForm((previous) => ({ ...previous, ...next }))} />}
          <Input
            placeholder={t("hostDetails.label.placeholder")}
            value={form.label}
            onChange={(e) => {
              let value = e.target.value;
              const targetGroup = groupInputValue.trim() || form.group || "";
              const willBeManaged = managedSources.some(s =>
                targetGroup === s.groupName || targetGroup.startsWith(s.groupName + "/")
              );
              const canBeManaged = !form.protocol || form.protocol === "ssh";
              if (willBeManaged && canBeManaged) {
                value = value.replace(/\s/g, '');
              }
              update("label", value);
            }}
            aria-label={t("hostDetails.create.name")}
            className="h-10"
          />
          </div>

          {!isCreating && <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0"><FolderPlus size={16} className="text-muted-foreground" /></div>
            {groupField}
          </div>}

          {!isCreating && <>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
              <Tag size={16} className="text-muted-foreground" />
            </div>
            <MultiCombobox
              options={tagOptions}
              values={form.tags || []}
              onValuesChange={(vals) => update("tags", vals)}
              placeholder="Add tags..."
              allowCreate={true}
              onCreateNew={(val) => onCreateTag?.(val)}
              createText="Create Tag"
              triggerClassName="flex-1 min-h-10"
            />
          </div>
          </>}
        </HostDetailsSection>

        {isCreating && !pluginProtocolActive && protocolControl}

        <PluginConnectionSection
          form={form}
          setForm={setForm}
          t={t}
          onValidityChange={setPluginConnectionValid}
          identities={identities}
          keys={availableKeys}
        />

        {!pluginProtocolActive && (!isCreating || form.protocol !== "telnet") ? connectionSections : null}
        {isCreating && form.protocol === "telnet" && (
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
              <label className="min-w-0 space-y-1.5">
                <span className="text-xs font-semibold">{t("hostDetails.section.address")} <span className="text-destructive">*</span></span>
                <Input aria-label={t("hostDetails.section.address")} placeholder={t("hostDetails.hostname.placeholder")} value={form.hostname} onChange={(event) => update("hostname", event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold">{t("hostDetails.port")}</span>
                <Input aria-label={t("hostDetails.port")} type="number" min={1} max={65535} value={effectiveTelnetPort} onChange={(event) => update("telnetPort", parseOptionalPortInput(event.target.value))} />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="min-w-0 space-y-1.5">
                <span className="text-xs font-semibold">{t("hostDetails.username.placeholder")}</span>
                <Input value={effectiveTelnetUsername} placeholder={t("hostDetails.telnet.username")} onChange={(event) => update("telnetUsername", event.target.value)} disabled={Boolean(form.telnetIdentityId)} />
              </label>
              <label className="min-w-0 space-y-1.5">
                <span className="text-xs font-semibold">{t("hostDetails.password.placeholder")}</span>
                <div className="relative">
                  <Input className="pr-9" type={showTelnetPassword ? "text" : "password"} value={effectiveTelnetPassword} placeholder={t("hostDetails.telnet.password")} onChange={(event) => update("telnetPassword", event.target.value)} disabled={Boolean(form.telnetIdentityId)} />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showTelnetPassword ? t("hostDetails.password.hide") : t("hostDetails.password.show")} onClick={() => setShowTelnetPassword(!showTelnetPassword)}>{showTelnetPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
              </label>
            </div>
          </div>
        )}
        {isCreating && (
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">{t("hostDetails.create.group")}</p>
              {groupField}
            </div>
            {!pluginProtocolActive && form.protocol !== "telnet" && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">{t("hostDetails.create.connection")}</p>
                <div className="flex gap-1 rounded-md border border-border/70 p-1" role="group" aria-label={t("hostDetails.create.connection")}>
                  {(["direct", "chain", "proxy"] as const).map((mode) => {
                    const selected = mode === "direct" ? !chainedHosts.length && !form.proxyConfig && !form.proxyProfileId : mode === "chain" ? chainedHosts.length > 0 : Boolean(form.proxyConfig || form.proxyProfileId);
                    return <button key={mode} type="button" aria-pressed={selected} className={cn("flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected ? "bg-secondary text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground")} onClick={() => {
                      if (mode === "direct") { clearHostChain(); clearProxyConfig(); }
                      else setActiveSubPanel(mode);
                    }}>{t(mode === "direct" && (effectiveGroupDefaults?.hostChain?.hostIds?.length || effectiveGroupDefaults?.proxyConfig || effectiveGroupDefaults?.proxyProfileId) ? "hostDetails.create.connection.inherit" : `hostDetails.create.connection.${mode}`)}</button>;
                  })}
                </div>
                {chainedHosts.length > 0 && <p className="truncate text-xs text-muted-foreground">{chainedHosts.map((host) => host.label || host.hostname).join(" > ")}</p>}
                {(form.proxyConfig || form.proxyProfileId) && <p className="truncate text-xs text-muted-foreground">{proxySummaryLabel}</p>}
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">{t("hostDetails.notes.label")}</span>
              <Textarea value={form.notes ?? ""} onChange={(event) => update("notes", event.target.value)} placeholder={t("hostDetails.notes.placeholder")} className="min-h-20 resize-y text-xs" rows={3} />
            </label>
            <button type="button" className="flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground" aria-expanded={showAdvanced} aria-controls={`host-advanced-${form.id}`} onClick={() => setShowAdvanced(!showAdvanced)}>
              <ChevronRight size={14} className={cn("transition-transform duration-150", showAdvanced && "rotate-90")} />
              {t("hostDetails.create.advanced")}
            </button>
          </>
        )}
        <div id={`host-advanced-${form.id}`} hidden={isCreating && !showAdvanced} className="space-y-4">
        {isCreating && <>
          <MultiCombobox options={tagOptions} values={form.tags || []} onValuesChange={(values) => update("tags", values)} placeholder={t("hostDetails.create.tags")} allowCreate onCreateNew={(value) => onCreateTag?.(value)} />
          {!pluginProtocolActive && form.protocol !== "telnet" && React.cloneElement(connectionSections, { compact: false, advancedOnly: true })}
        </>}


        {onSnippetsChange ? (
          <HostDetailsScriptsSection
            host={form}
            onHostChange={setForm}
            snippets={snippets}
            t={t}
          />
        ) : null}

        {!isCreating && <HostDetailsSection
          icon={<FileText size={14} className="text-muted-foreground shrink-0" />}
          title={t("hostDetails.notes.label")}
          hint={t("hostDetails.notes.help")}
          action={
            <Switch
              checked={showNotesEditor}
              onCheckedChange={setShowNotesEditor}
              aria-label={
                showNotesEditor
                  ? t("hostDetails.notes.toggle.hide")
                  : t("hostDetails.notes.toggle.show")
              }
            />
          }
        >
          {showNotesEditor ? (
            <HostNotesEditor
              panelKey={form.id}
              value={form.notes ?? ""}
              onChange={(notes) => update("notes", notes)}
              showHeader={false}
              defaultTab="edit"
            />
          ) : null}
        </HostDetailsSection>}

        <HostDetailsAdvancedSections
          t={t}
          form={form}
          setForm={setForm}
          update={update}
          effectiveThemeId={effectiveThemeId}
          hasEffectiveThemeOverride={hasEffectiveThemeOverride}
          effectiveFontSize={effectiveFontSize}
          hasEffectiveFontSizeOverride={hasEffectiveFontSizeOverride}
          sshAgentStatus={sshAgentStatus}
          sshForwardingAgentStatus={sshForwardingAgentStatus}
          effectiveGroupDefaults={effectiveGroupDefaults}
          effectiveAuthMethod={effectiveAuthMethod}
          showAlgorithmOverrides={showAlgorithmOverrides}
          setShowAlgorithmOverrides={setShowAlgorithmOverrides}
          chainedHosts={chainedHosts}
          setActiveSubPanel={setActiveSubPanel}
          clearHostChain={clearHostChain}
          proxySummaryType={proxySummaryType}
          proxySummaryLabel={proxySummaryLabel}
          proxySummaryTooltip={proxySummaryTooltip}
          clearProxyConfig={clearProxyConfig}
        />

        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-border/60" />
          <span className="text-xs text-muted-foreground">{t("hostDetails.otherProtocols")}</span>
          <div className="flex-1 h-px bg-border/60" />
        </div>

        {form.telnetEnabled || form.protocol === "telnet" ? (
          <HostDetailsSection
            icon={<Plus size={14} className="text-muted-foreground" />}
            title="Telnet"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 h-10 flex items-center gap-2 bg-secondary/70 border border-border/70 rounded-md px-3">
                <span className="text-xs text-muted-foreground">{t("hostDetails.telnetOn")}</span>
                <div className="ml-auto w-1/2 min-w-0 flex items-center gap-2 justify-end">
	                  <Input
	                    type="number"
	                    value={effectiveTelnetPort}
	                    onChange={(e) => update("telnetPort", parseOptionalPortInput(e.target.value))}
	                    className="h-8 flex-1 min-w-0 text-center"
	                  />
                  <span className="text-xs text-muted-foreground">{t("hostDetails.port")}</span>
                </div>
              </div>
              {form.protocol !== "telnet" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => update("telnetEnabled", false)}
                >
                  <X size={14} />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t("hostDetails.telnet.setDefault")}</span>
              <Switch
                checked={form.protocol === "telnet"}
                onCheckedChange={(checked) => {
                  const nextProtocol = checked ? "telnet" : "ssh";
                  setForm((prev) => ({
                    ...prev,
                    protocol: nextProtocol,
                    port: resolvePrimaryProtocolSwitchPort(
                      prev.port,
                      nextProtocol,
                      Boolean(groupDefaults?.telnetPort),
                      Boolean(groupDefaults?.port),
                    ),
                  }));
                }}
              />
            </div>

            <p className="text-xs font-semibold">{t("hostDetails.telnet.credentials")}</p>
            {identities.length > 0 && (
              <Combobox
                options={telnetIdentityOptions}
                value={form.telnetIdentityId || ""}
                onValueChange={updateTelnetIdentity}
                placeholder={t("hostDetails.telnet.identity.placeholder")}
                emptyText={t("common.noResultsFound")}
                className="w-full"
              />
            )}
            {form.telnetIdentityId ? (
              <div className="text-xs text-muted-foreground">
                {selectedTelnetIdentity
                  ? `${selectedTelnetIdentity.username} - ${selectedTelnetIdentity.label}`
                  : t("hostDetails.identity.missing")}
              </div>
            ) : (
              <>
                <Input
                  placeholder={t("hostDetails.telnet.username")}
                  value={effectiveTelnetUsername}
                  onChange={(e) =>
                    update("telnetUsername" as keyof Host, e.target.value)
                  }
                  className="h-10"
                />
                <div className="relative">
                  <Input
                    placeholder={t("hostDetails.telnet.password")}
                    type={showTelnetPassword ? "text" : "password"}
                    value={effectiveTelnetPassword}
                    onChange={(e) =>
                      update("telnetPassword" as keyof Host, e.target.value)
                    }
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTelnetPassword(!showTelnetPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showTelnetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </>
            )}

            <TerminalEncodingSelect
              value={form.charset}
              inheritedValue={effectiveGroupDefaults?.charset}
              onValueChange={(value) => update("charset", value)}
            />

            <button
              type="button"
              className="w-full flex items-center gap-3 p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
              onClick={() => setActiveSubPanel("telnet-theme-select")}
            >
              <div
                className="w-12 h-8 rounded-md border border-border/60 flex items-center justify-center text-[6px] font-mono overflow-hidden"
                style={{
                  backgroundColor:
                    customThemeStore.getThemeById(effectiveTelnetThemeId)?.colors.background || "#100F0F",
                  color:
                    customThemeStore.getThemeById(effectiveTelnetThemeId)?.colors.foreground || "#CECDC3",
                }}
              >
                <div className="p-0.5">
                  <div
                    style={{
                      color: customThemeStore.getThemeById(effectiveTelnetThemeId)?.colors.green,
                    }}
                  >
                    $
                  </div>
                </div>
              </div>
              <span className="text-sm flex-1">
                {customThemeStore.getThemeById(effectiveTelnetThemeId)?.name || "Flexoki Dark"}
              </span>
            </button>
          </HostDetailsSection>
        ) : (
          <Button
            variant="ghost"
            className="w-full h-10 justify-start gap-2 border border-dashed border-border/60"
            onClick={() => {
              update("telnetEnabled", true);
            }}
          >
            <Plus size={14} />
            {t("hostDetails.telnet.add")}
          </Button>
        )}
        </div>
      </AsidePanelContent>
      <AsidePanelFooter className={isCreating ? "flex items-center justify-end gap-2" : undefined}>
        {isCreating && <Button variant="secondary" className="h-8 px-3 text-xs" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button
          className={isCreating ? "h-8 px-4 text-xs" : "w-full h-10"}
          onClick={handleSubmit}
          disabled={!canSaveHost}
        >
          {t("common.save")}
        </Button>
      </AsidePanelFooter>
      <HostConnectionTestDialog
        open={testOpen}
        onClose={handleCloseTest}
        host={form}
        keys={availableKeys}
        test={hostConnectionTest}
      />
    </AsidePanel>
  );

  return renderPanels(standardPanel);
};


const HostDetailsPanel: React.FC<HostDetailsPanelPropsWithResize> = (props) => {
  const { t } = useI18n();
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  if (props.initialData) return <HostDetailsPanelContent {...props} />;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onCancel(); }}>
      <DialogContent
        ref={setPortalContainer}
        hideCloseButton
        overlayClassName="bg-black/40 backdrop-blur-sm"
        className="flex h-[min(800px,calc(100dvh-32px))] w-[calc(100vw-32px)] max-w-[520px] flex-col gap-0 overflow-visible rounded-xl border-border/70 p-0"
      >
        <DialogTitle className="sr-only">{t("hostDetails.title.new")}</DialogTitle>
        <PortalContainerProvider container={portalContainer}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit] [&_.split-panel-enter]:!animate-none [&>div]:!w-full [&>div]:!border-l-0 [&>div]:!shadow-none">
            <HostDetailsPanelContent {...props} layout="inline" resizable={false} className={props.className} />
          </div>
        </PortalContainerProvider>
      </DialogContent>
    </Dialog>
  );
};

export default HostDetailsPanel;
