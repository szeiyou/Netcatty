import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  PlugZap,
  Settings2,
  Tag,
} from "lucide-react";
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import { useApplicationBackend, type SshAgentStatus } from "../application/state/useApplicationBackend";
import { applyGroupDefaults, resolveGroupDefaults, resolveGroupTerminalThemeId } from "../domain/groupConfig";
import { normalizeGroupTargetPath, resolveHostGroupForSave } from "../domain/hostGroupPathMutations";
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
  mapProxySaveErrorKey,
  nextFormAfterSelectProxyProfile,
  nextFormAfterClearHostChain,
  nextFormAfterRemoveHostFromChain,
  resolveFormHostChainIds,
  resolveDisplayProxyProfileId,
} from "./HostDetailsPanel.helpers";
export { parseOptionalPortInput } from "./HostDetailsPanel.helpers";
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
import {
  applyHostDefaultConnectProtocol,
  DEFAULT_RDP_CONFIG,
  DEFAULT_RDP_PORT,
  DEFAULT_VNC_CONFIG,
  DEFAULT_VNC_PORT,
  getHostEnabledProtocols,
  isRemoteDesktopProtocol,
  resolveHostDefaultConnectProtocol,
  sanitizeRdpConfig,
  sanitizeVncConfig,
  shouldPromptHostProtocolOnConnect,
} from "../domain/remoteDesktop";
import { PluginConnectionSection } from "./PluginConnectionSection";
import { useHostConnectionTest } from "../application/state/useHostConnectionTest";
import { HostConnectionTestDialog } from "./host-details/HostConnectionTestDialog";
import { RemoteDesktopOptionsSection } from "./host-details/RemoteDesktopOptionsSection";

type EditableHostProtocol = "ssh" | "rdp" | "vnc" | "telnet";

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
  initialProtocol?: "ssh" | "rdp" | "vnc";
  availableKeys: SSHKey[];
  identities: Identity[];
  onCreateIdentity?: (identity: Identity) => void;
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

export const HostDetailsPanelContent: React.FC<HostDetailsPanelPropsWithResize> = ({
  initialData,
  initialProtocol,
  availableKeys,
  identities,
  onCreateIdentity,
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
    () => {
      if (initialData) return normalizePrimaryTelnetState(initialData);
      const startProto = initialProtocol ?? "ssh";
      if (startProto === "rdp") {
        return {
          id: crypto.randomUUID(),
          label: "",
          hostname: "",
          port: DEFAULT_RDP_PORT,
          username: "",
          protocol: "rdp",
          tags: [],
          os: "windows",
          authMethod: "password",
          authPolicyVersion: 1,
          distroMode: "auto",
          rdpConfig: { ...DEFAULT_RDP_CONFIG },
          createdAt: Date.now(),
          group: defaultGroup || undefined,
        } as Host;
      }
      if (startProto === "vnc") {
        return {
          id: crypto.randomUUID(),
          label: "",
          hostname: "",
          port: DEFAULT_VNC_PORT,
          username: "",
          protocol: "vnc",
          tags: [],
          os: "linux",
          authMethod: "password",
          authPolicyVersion: 1,
          distroMode: "auto",
          vncConfig: { ...DEFAULT_VNC_CONFIG },
          createdAt: Date.now(),
          group: defaultGroup || undefined,
        } as Host;
      }
      return {
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
        sshInputCompatibility: false,
        charset: groupDefaults?.charset ? undefined : "UTF-8",
        distroMode: "auto",
        createdAt: Date.now(),
        group: defaultGroup || undefined, // Pre-fill with current navigation group
      } as Host;
    },
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
  const [companionCredentialDrafts, setCompanionCredentialDrafts] = useState<{
    rdp?: { username: string; password: string };
    vnc?: { username: string; password: string };
  }>({});
  const [activeProtocolTab, setActiveProtocolTab] = useState<EditableHostProtocol>(() =>
    resolveHostDefaultConnectProtocol(initialData ? normalizePrimaryTelnetState(initialData) : { protocol: initialProtocol ?? "ssh" }),
  );
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
    const protocolOverride =
      isCurrentTabEnabled && (activeProtocolTab === "rdp" || activeProtocolTab === "vnc")
        ? activeProtocolTab
        : undefined;
    void hostConnectionTest.startTest(undefined, protocolOverride);
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
  const originalGroupRef = useRef(initialData ? initialData.group || "" : undefined);
  const createdGroupInputRef = useRef<string | null>(null);

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
    originalGroupRef.current = initialData ? initialData.group || "" : undefined;
    createdGroupInputRef.current = null;
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
    setActiveProtocolTab(resolveHostDefaultConnectProtocol(normalized));
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
    () => applyGroupDefaults(form, effectiveGroupDefaults ?? {}),
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
  const hasHostProxyOverride = form.directProxy === true
    || form.proxyProfileId !== undefined
    || form.proxyConfig !== undefined;
  const displayProxyProfileId = resolveDisplayProxyProfileId(form, effectiveAuthHost.proxyProfileId);
  const displayProxyConfig = form.directProxy
    ? undefined
    : (form.proxyConfig ?? effectiveAuthHost.proxyConfig);
  const selectedProxyProfile = useMemo(
    () => proxyProfiles.find((profile) => profile.id === displayProxyProfileId),
    [displayProxyProfileId, proxyProfiles],
  );
  const hasMissingProxyProfile = Boolean(displayProxyProfileId && !selectedProxyProfile);
  const proxyInherited = !hasHostProxyOverride && Boolean(
    displayProxyProfileId || displayProxyConfig?.host || displayProxyConfig?.command,
  );
  const proxySummaryType = hasMissingProxyProfile
    ? t("hostDetails.proxyPanel.missing")
    : formatProxyConfigType(selectedProxyProfile?.config || displayProxyConfig) || "HTTP";
  const proxySummaryLabel = hasMissingProxyProfile
    ? t("hostDetails.proxyPanel.missingSaved")
    : selectedProxyProfile
      ? selectedProxyProfile.label
      : formatProxyConfigEndpoint(displayProxyConfig);
  const proxySummaryTooltip = hasMissingProxyProfile
    ? t("hostDetails.proxyPanel.missingSaved")
    : selectedProxyProfile
      ? `${selectedProxyProfile.label} - ${formatProxyConfigEndpoint(selectedProxyProfile.config)}`
      : `${formatProxyConfigType(displayProxyConfig)} ${formatProxyConfigEndpoint(displayProxyConfig)}`;

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
        const inheritedConfig = !prev.directProxy
          && prev.proxyProfileId === undefined
          && prev.proxyConfig === undefined
          && effectiveGroupDefaults
          ? applyGroupDefaults(prev, effectiveGroupDefaults).proxyConfig
          : undefined;
        return {
          ...rest,
          proxyConfig: updateProxyConfigField(prev.proxyConfig ?? inheritedConfig, field, value),
        } as Host;
      });
    },
    [effectiveGroupDefaults],
  );

  const clearProxyConfig = useCallback(() => {
    setForm((prev) => {
      const { proxyConfig: _proxyConfig, proxyProfileId: _proxyProfileId, directProxy: _directProxy, ...rest } = prev;
      return rest as Host;
    });
  }, []);

  const selectProxyProfile = useCallback((profileId: string | undefined) => {
    setForm((prev) => nextFormAfterSelectProxyProfile(prev, profileId, effectiveGroupDefaults));
  }, [effectiveGroupDefaults]);

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
        hostIds: [...resolveFormHostChainIds(prev, effectiveGroupDefaults), hostId],
      },
    }));
  };

  const removeHostFromChain = (index: number) => {
    setForm((prev) => nextFormAfterRemoveHostFromChain(prev, index, effectiveGroupDefaults));
  };

  const clearHostChain = useCallback(() => {
    setForm((prev) => nextFormAfterClearHostChain(prev, effectiveGroupDefaults));
  }, [effectiveGroupDefaults]);

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
  const isRemoteDesktopPrimary = isRemoteDesktopProtocol(form.protocol);
  const hasHostname = form.hostname.trim().length > 0;
  const canSaveHost = pluginProtocolActive
    ? pluginConnectionValid && Boolean(sanitizePluginConnection(form.pluginConnection, form.protocol))
    : hasHostname;

  const enabledProtocols: Record<EditableHostProtocol, boolean> = useMemo(() => {
    const list = getHostEnabledProtocols(form);
    return {
      ssh: list.includes("ssh"),
      rdp: list.includes("rdp"),
      vnc: list.includes("vnc"),
      telnet: list.includes("telnet"),
    };
  }, [form]);
  const enabledProtocolCount = (["ssh", "rdp", "vnc", "telnet"] as const).filter(
    (proto) => enabledProtocols[proto],
  ).length;
  const isCurrentTabEnabled = enabledProtocols[activeProtocolTab];
  const defaultConnectProtocol = resolveHostDefaultConnectProtocol(form);
  const effectiveConnectBehavior: "ask" | EditableHostProtocol =
    enabledProtocolCount >= 2 && shouldPromptHostProtocolOnConnect(form)
      ? "ask"
      : defaultConnectProtocol;

  const handleSwitchOnlyProtocol = useCallback(
    (nextProtocol: EditableHostProtocol) => {
      setActiveProtocolTab(nextProtocol);
      setForm((prev) => {
        const nextPort = resolvePrimaryProtocolSwitchPort(
          prev.port,
          nextProtocol,
          Boolean(effectiveGroupDefaults?.telnetPort),
          Boolean(effectiveGroupDefaults?.port),
        );
        const isFreshHost = !initialData;
        if (nextProtocol === "rdp") {
          return {
            ...prev,
            protocol: "rdp",
            port: prev.rdpConfig?.port ?? nextPort ?? DEFAULT_RDP_PORT,
            os: isFreshHost && prev.os === "linux" ? "windows" : prev.os,
            username: isFreshHost && prev.username === "root" ? "" : (prev.username ?? ""),
            authMethod: "password",
            moshEnabled: false,
            etEnabled: false,
            telnetEnabled: false,
            vncConfig: undefined,
            rdpConfig: {
              ...DEFAULT_RDP_CONFIG,
              ...(prev.rdpConfig ?? {}),
              enabled: undefined,
              defaultConnect: undefined,
              tunnelViaHostSsh: undefined,
              tunnelTargetHost: undefined,
            },
          };
        }
        if (nextProtocol === "vnc") {
          return {
            ...prev,
            protocol: "vnc",
            port: prev.vncConfig?.port ?? nextPort ?? DEFAULT_VNC_PORT,
            username: isFreshHost && prev.username === "root" ? "" : (prev.username ?? ""),
            authMethod: "password",
            moshEnabled: false,
            etEnabled: false,
            telnetEnabled: false,
            rdpConfig: undefined,
            vncConfig: {
              ...DEFAULT_VNC_CONFIG,
              ...(prev.vncConfig ?? {}),
              enabled: undefined,
              defaultConnect: undefined,
              tunnelViaHostSsh: undefined,
              tunnelTargetHost: undefined,
            },
          };
        }
        if (nextProtocol === "telnet") {
          return {
            ...prev,
            protocol: "telnet",
            port: nextPort,
            telnetPort: prev.telnetPort ?? nextPort,
            telnetEnabled: true,
            moshEnabled: false,
            etEnabled: false,
            rdpConfig: undefined,
            vncConfig: undefined,
          };
        }
        return {
          ...prev,
          protocol: "ssh",
          port: nextPort,
          telnetEnabled: false,
          rdpConfig: undefined,
          vncConfig: undefined,
          username: isFreshHost && !prev.username && !effectiveGroupDefaults?.username ? "root" : (prev.username ?? ""),
        };
      });
    },
    [effectiveGroupDefaults?.port, effectiveGroupDefaults?.telnetPort, effectiveGroupDefaults?.username, initialData],
  );

  const isUntouchedNewHost = !initialData
    && enabledProtocolCount === 1
    && !form.password
    && !form.identityId
    && !form.identityFileId
    && !form.identityFilePaths?.length
    && !form.telnetPassword
    && !form.telnetIdentityId;

  const handleSelectProtocolTab = useCallback(
    (tab: EditableHostProtocol) => {
      if (isUntouchedNewHost && !enabledProtocols[tab]) {
        handleSwitchOnlyProtocol(tab);
        return;
      }
      setActiveProtocolTab(tab);
    },
    [enabledProtocols, handleSwitchOnlyProtocol, isUntouchedNewHost],
  );

  const handleEnableSecondaryProtocol = useCallback(
    (proto: EditableHostProtocol) => {
      setActiveProtocolTab(proto);
      setForm((prev) => {
        const hasSsh = !prev.protocol || prev.protocol === "ssh" || prev.protocol === "mosh" || prev.protocol === "et";
        if (hasSsh) {
          if (proto === "vnc") {
            return {
              ...prev,
              vncConfig: {
                ...DEFAULT_VNC_CONFIG,
                ...(prev.vncConfig ?? {}),
                enabled: true,
                port: prev.vncConfig?.port ?? DEFAULT_VNC_PORT,
                tunnelViaHostSsh: prev.vncConfig?.tunnelViaHostSsh ?? true,
                useHostCredentials: prev.vncConfig?.identityId ? false : (prev.vncConfig?.useHostCredentials ?? true),
              },
            };
          }
          if (proto === "rdp") {
            return {
              ...prev,
              rdpConfig: {
                ...DEFAULT_RDP_CONFIG,
                ...(prev.rdpConfig ?? {}),
                enabled: true,
                port: prev.rdpConfig?.port ?? DEFAULT_RDP_PORT,
                tunnelViaHostSsh: prev.rdpConfig?.tunnelViaHostSsh ?? true,
                useHostCredentials: prev.rdpConfig?.identityId ? false : (prev.rdpConfig?.useHostCredentials ?? true),
              },
            };
          }
          if (proto === "telnet") {
            return {
              ...prev,
              telnetEnabled: true,
            };
          }
        }
        // Adding SSH to a standalone RDP/VNC/Telnet host: promote host.protocol to SSH
        // while keeping the existing protocol enabled (and default for RDP/VNC).
        if (proto === "ssh") {
          if (prev.protocol === "rdp") {
            return {
              ...prev,
              protocol: "ssh",
              port: effectiveGroupDefaults?.port ? undefined : 22,
              username: prev.username || (effectiveGroupDefaults?.username ? "" : "root"),
              rdpConfig: {
                ...DEFAULT_RDP_CONFIG,
                ...(prev.rdpConfig ?? {}),
                enabled: true,
                defaultConnect: true,
                port: prev.port ?? prev.rdpConfig?.port ?? DEFAULT_RDP_PORT,
                tunnelViaHostSsh: true,
                useHostCredentials: prev.identityId ? false : true,
                ...(prev.identityId ? { identityId: prev.identityId } : {}),
              },
            };
          }
          if (prev.protocol === "vnc") {
            return {
              ...prev,
              protocol: "ssh",
              port: effectiveGroupDefaults?.port ? undefined : 22,
              username: prev.username || (effectiveGroupDefaults?.username ? "" : "root"),
              vncConfig: {
                ...DEFAULT_VNC_CONFIG,
                ...(prev.vncConfig ?? {}),
                enabled: true,
                defaultConnect: true,
                port: prev.port ?? prev.vncConfig?.port ?? DEFAULT_VNC_PORT,
                tunnelViaHostSsh: true,
                useHostCredentials: prev.identityId ? false : true,
                ...(prev.identityId ? { identityId: prev.identityId } : {}),
              },
            };
          }
          if (prev.protocol === "telnet") {
            return {
              ...prev,
              protocol: "ssh",
              port: effectiveGroupDefaults?.port ? undefined : 22,
              telnetPort: prev.telnetPort ?? prev.port ?? 23,
              telnetEnabled: true,
              username: prev.username || (effectiveGroupDefaults?.username ? "" : "root"),
            };
          }
        }
        return prev;
      });
    },
    [effectiveGroupDefaults?.port, effectiveGroupDefaults?.username],
  );

  const handleSetDefaultProtocol = useCallback((proto: EditableHostProtocol) => {
    setForm((prev) => applyHostDefaultConnectProtocol(prev, proto));
  }, []);

  const handleSetConnectBehavior = useCallback((choice: "ask" | EditableHostProtocol) => {
    if (choice === "ask") {
      setForm((prev) => ({
        ...prev,
        connectProtocolBehavior: "ask",
      }));
      return;
    }
    setForm((prev) => applyHostDefaultConnectProtocol(prev, choice));
  }, []);

  const handleRemoveProtocol = useCallback(
    (proto: EditableHostProtocol) => {
      if (enabledProtocolCount <= 1) return;
      const clearAskIfSingle = enabledProtocolCount <= 2
        ? { connectProtocolBehavior: undefined }
        : {};
      if (proto === "vnc") {
        setForm((prev) => ({ ...prev, ...clearAskIfSingle, vncConfig: undefined }));
        setActiveProtocolTab("ssh");
        return;
      }
      if (proto === "rdp") {
        setForm((prev) => ({ ...prev, ...clearAskIfSingle, rdpConfig: undefined }));
        setActiveProtocolTab("ssh");
        return;
      }
      if (proto === "telnet") {
        setForm((prev) => {
          const savedSshPort = prev.protocols?.find((p) => p.protocol === "ssh")?.port;
          const remainingProtocols = prev.protocols?.filter((p) => p.protocol !== "telnet" && p.protocol !== "ssh");
          return {
            ...prev,
            ...clearAskIfSingle,
            telnetEnabled: false,
            ...(prev.protocol === "telnet"
              ? { protocol: "ssh", ...(savedSshPort ? { port: savedSshPort } : {}) }
              : {}),
            ...(prev.protocols ? { protocols: remainingProtocols && remainingProtocols.length > 0 ? remainingProtocols : undefined } : {}),
          };
        });
        setActiveProtocolTab("ssh");
        return;
      }
      if (proto === "ssh") {
        // Promote remaining enabled protocol to standalone primary
        const nextPrimary: EditableHostProtocol =
          form.rdpConfig?.enabled && form.rdpConfig?.defaultConnect
            ? "rdp"
            : form.vncConfig?.enabled && form.vncConfig?.defaultConnect
              ? "vnc"
              : form.rdpConfig?.enabled
                ? "rdp"
                : form.vncConfig?.enabled
                  ? "vnc"
                  : "telnet";
        handleSwitchOnlyProtocol(nextPrimary);
        setForm((prev) => ({
          ...prev,
          connectProtocolBehavior: undefined,
          protocols: prev.protocols?.filter((p) => p.protocol !== "ssh"),
        }));
      }
    },
    [enabledProtocolCount, form.rdpConfig?.defaultConnect, form.rdpConfig?.enabled, form.vncConfig?.defaultConnect, form.vncConfig?.enabled, handleSwitchOnlyProtocol],
  );

  const handleSubmit = async () => {
    if (savingHostRef.current) return;
    savingHostRef.current = true;
    try {
    const flushed = isRemoteDesktopPrimary ? undefined : await totpFlushRef.current?.();
    if (flushed && !flushed.ok) return;
    const hostname = form.hostname.trim()
      || (pluginProtocolActive ? form.label.trim() || form.pluginConnection?.providerId || "plugin" : "");
    if (!hostname || !canSaveHost) return;
    if (!pluginProtocolActive && !isRemoteDesktopPrimary && !hasRequiredHostAuthCredential({ host: effectiveAuthHost, keys: availableKeys, identities })) {
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
      toast.error(t(mapProxySaveErrorKey(proxySave.error)));
      setActiveSubPanel("proxy");
      return;
    }
    const normalizedProxyConfig = proxySave.normalizedProxyConfig;
    let finalLabel = form.label?.trim() || hostname;
    const finalGroup = resolveHostGroupForSave(
      groupInputValue.trim() || form.group || "",
      originalGroupRef.current,
      groupInputValue !== originalGroupRef.current,
    );

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
    if (isRemoteDesktopPrimary) {
      const sanitizedRdp = cleaned.protocol === "rdp"
        ? sanitizeRdpConfig({
            ...(cleaned.rdpConfig ?? {}),
            port: finalPort ?? DEFAULT_RDP_PORT,
            enabled: undefined,
            tunnelViaHostSsh: undefined,
            tunnelTargetHost: undefined,
          })
        : undefined;
      const sanitizedVnc = cleaned.protocol === "vnc"
        ? sanitizeVncConfig({
            ...(cleaned.vncConfig ?? {}),
            port: finalPort ?? DEFAULT_VNC_PORT,
            enabled: undefined,
            tunnelViaHostSsh: undefined,
            tunnelTargetHost: undefined,
          })
        : undefined;
      const hasInlinePassword = !cleaned.identityId && typeof cleaned.password === "string" && cleaned.password.length > 0;
      cleaned = {
        ...cleaned,
        username: typeof cleaned.username === "string" ? cleaned.username.trim() : "",
        tags: Array.isArray(cleaned.tags) ? cleaned.tags : [],
        os: cleaned.os || (cleaned.protocol === "rdp" ? "windows" : "linux"),
        port: finalPort ?? (cleaned.protocol === "rdp" ? DEFAULT_RDP_PORT : DEFAULT_VNC_PORT),
        authMethod: hasInlinePassword || cleaned.identityId ? "password" : undefined,
        authPolicyVersion: 1,
        identityFileId: undefined,
        identityFilePaths: undefined,
        password: cleaned.identityId || cleaned.savePassword === false ? undefined : cleaned.password,
        rdpConfig: sanitizedRdp,
        vncConfig: sanitizedVnc,
        moshEnabled: undefined,
        etEnabled: undefined,
        telnetEnabled: undefined,
      };
    } else if (!pluginProtocolActive) {
      let nextRdpConfig = cleaned.rdpConfig?.enabled ? sanitizeRdpConfig(cleaned.rdpConfig) : undefined;
      let nextVncConfig = cleaned.vncConfig?.enabled ? sanitizeVncConfig(cleaned.vncConfig) : undefined;
      const rdpDraft = companionCredentialDrafts.rdp;
      if (
        nextRdpConfig &&
        onCreateIdentity &&
        rdpDraft &&
        rdpDraft.password.length > 0
      ) {
        const identity: Identity = {
          id: crypto.randomUUID(),
          label: `${finalLabel} RDP`,
          username: rdpDraft.username.trim(),
          ...(nextRdpConfig.domain ? { domain: nextRdpConfig.domain } : {}),
          authMethod: "password",
          password: rdpDraft.password,
          created: Date.now(),
        };
        onCreateIdentity(identity);
        nextRdpConfig = {
          ...nextRdpConfig,
          useHostCredentials: false,
          identityId: identity.id,
          username: undefined,
        };
      }
      const vncDraft = companionCredentialDrafts.vnc;
      if (
        nextVncConfig &&
        onCreateIdentity &&
        vncDraft &&
        vncDraft.password.length > 0
      ) {
        const identity: Identity = {
          id: crypto.randomUUID(),
          label: `${finalLabel} VNC`,
          username: vncDraft.username.trim(),
          authMethod: "password",
          password: vncDraft.password,
          created: Date.now(),
        };
        onCreateIdentity(identity);
        nextVncConfig = {
          ...nextVncConfig,
          useHostCredentials: false,
          identityId: identity.id,
          username: undefined,
        };
      }
      cleaned = {
        ...cleaned,
        rdpConfig: nextRdpConfig,
        vncConfig: nextVncConfig,
      };
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

  const createAndSelectGroup = (value: string) => {
    const fullPath = normalizeGroupTargetPath(value);
    if (!fullPath) return;
    createdGroupInputRef.current = value;
    if (!groups.includes(fullPath)) onCreateGroup?.(fullPath);
    setGroupInputValue(fullPath);
    update("group", fullPath);
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    createAndSelectGroup(`${newGroupParent}/${newGroupName}`);
    setNewGroupName("");
    setNewGroupParent("");
    setActiveSubPanel("none");
  };

  const displayHostChainIds = useMemo(
    () => form.hostChain !== undefined
      ? (form.hostChain.hostIds || [])
      : (effectiveAuthHost.hostChain?.hostIds || []),
    [effectiveAuthHost.hostChain?.hostIds, form.hostChain],
  );
  const hostChainInherited = form.hostChain === undefined && displayHostChainIds.length > 0;
  const canRestoreHostChain = form.hostChain !== undefined
    && !form.hostChain.hostIds?.length
    && resolveFormHostChainIds({ ...form, hostChain: undefined }, effectiveGroupDefaults).length > 0;

  const availableHostsForChain = useMemo(() => {
    const chainedIds = new Set(displayHostChainIds);
    // Chain hops are SSH ProxyJump hops; never offer local/serial/telnet/plugin
    // entries (e.g. saved local shells) as jump hosts.
    return allHosts.filter((h) =>
      h.id !== form.id
      && !chainedIds.has(h.id)
      && canServeAsSshJumpHost(h),
    );
  }, [allHosts, displayHostChainIds, form.id]);

  const chainedHosts = useMemo(() => {
    return displayHostChainIds
      .map((id) => allHosts.find((h) => h.id === id))
      .filter(Boolean) as Host[];
  }, [allHosts, displayHostChainIds]);

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
        ...(prev.protocol === "rdp" && identity.domain
          ? { rdpConfig: { ...(prev.rdpConfig ?? {}), domain: identity.domain } }
          : {}),
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
                // Creation also calls onValueChange with the raw input. Keep that
                // path normalized while preserving a reselected legacy group.
                const groupPath = val === createdGroupInputRef.current
                  ? normalizeGroupTargetPath(val)
                  : resolveHostGroupForSave(val, originalGroupRef.current, val !== originalGroupRef.current);
                createdGroupInputRef.current = null;
                update("group", groupPath);
                setGroupInputValue(groupPath);
              }}
              placeholder={t(isCreating ? "hostDetails.create.ungrouped" : "hostDetails.group.placeholder")}
              ariaLabel={t("hostDetails.create.group")}
              allowCreate={true}
              onCreateNew={createAndSelectGroup}
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
          onSelectPrimaryProtocol={handleSwitchOnlyProtocol}
          activeProtocolTab={activeProtocolTab}
          enabledProtocols={enabledProtocols}
          defaultConnectProtocol={defaultConnectProtocol}
          effectiveConnectBehavior={effectiveConnectBehavior}
          onSelectProtocolTab={handleSelectProtocolTab}
          onEnableSecondaryProtocol={handleEnableSecondaryProtocol}
          onSwitchOnlyProtocol={handleSwitchOnlyProtocol}
          onSetDefaultProtocol={handleSetDefaultProtocol}
          onSetConnectBehavior={handleSetConnectBehavior}
          onRemoveProtocol={handleRemoveProtocol}
          onCreateIdentity={onCreateIdentity}
          companionCredentialDrafts={companionCredentialDrafts}
          onCompanionCredentialDraftChange={(proto: "rdp" | "vnc", draft: { username: string; password: string } | undefined) => {
            setCompanionCredentialDrafts((prev) => ({
              ...prev,
              [proto]: draft,
            }));
          }}
          effectiveTelnetPort={effectiveTelnetPort}
          effectiveTelnetUsername={effectiveTelnetUsername}
          effectiveTelnetPassword={effectiveTelnetPassword}
          effectiveTelnetThemeId={effectiveTelnetThemeId}
          telnetIdentityOptions={telnetIdentityOptions}
          selectedTelnetIdentity={selectedTelnetIdentity}
          updateTelnetIdentity={updateTelnetIdentity}
          showTelnetPassword={showTelnetPassword}
          setShowTelnetPassword={setShowTelnetPassword}
          onOpenTelnetThemeSelect={() => setActiveSubPanel("telnet-theme-select")}
    />
  );

  const protocolControl = (
    <HostCreationProtocolSelect
      value={serialMode ? "serial" : form.protocol === "telnet" || form.protocol === "rdp" || form.protocol === "vnc" ? form.protocol : "ssh"}
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
        handleSwitchOnlyProtocol(protocol);
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
        proxyConfig={displayProxyConfig}
        proxyProfiles={proxyProfiles}
        identities={identities}
        selectedProxyProfileId={displayProxyProfileId}
        directProxy={form.directProxy}
        allowClear={hasHostProxyOverride}
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
            <div className="h-10 w-10 rounded-lg border border-border/60 bg-transparent flex items-center justify-center shrink-0">
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


        {isRemoteDesktopPrimary && isCurrentTabEnabled && (activeProtocolTab === "rdp" || activeProtocolTab === "vnc") ? (
          <RemoteDesktopOptionsSection
            form={form}
            setForm={setForm}
            t={t}
          />
        ) : null}

        {onSnippetsChange && isCurrentTabEnabled && (activeProtocolTab === "ssh" || activeProtocolTab === "telnet") ? (
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
          activeProtocolTab={activeProtocolTab}
          isCurrentTabEnabled={isCurrentTabEnabled}
          effectiveThemeId={effectiveThemeId}
          effectiveTelnetThemeId={effectiveTelnetThemeId}
          onOpenTelnetThemeSelect={() => setActiveSubPanel("telnet-theme-select")}
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
          hostChainInherited={hostChainInherited}
          canRestoreHostChain={canRestoreHostChain}
          setActiveSubPanel={setActiveSubPanel}
          clearHostChain={clearHostChain}
          proxySummaryType={proxySummaryType}
          proxySummaryLabel={proxySummaryLabel}
          proxySummaryTooltip={proxySummaryTooltip}
          proxyInherited={proxyInherited}
          clearProxyConfig={clearProxyConfig}
        />
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
