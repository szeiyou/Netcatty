import { useCallback, useEffect, useState } from 'react';
import { Host, SSHKey, Snippet } from '../../domain/models';
import { normalizeDistroId, sanitizeHost } from '../../domain/host';
import { INITIAL_HOSTS, INITIAL_SNIPPETS } from '../../infrastructure/config/defaultData';
import {
  STORAGE_KEY_GROUPS,
  STORAGE_KEY_HOSTS,
  STORAGE_KEY_KEYS,
  STORAGE_KEY_SNIPPET_PACKAGES,
  STORAGE_KEY_SNIPPETS,
} from '../../infrastructure/config/storageKeys';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';

type ExportableVaultData = {
  hosts: Host[];
  keys: SSHKey[];
  snippets: Snippet[];
  customGroups: string[];
};

export const useVaultState = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [keys, setKeys] = useState<SSHKey[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [snippetPackages, setSnippetPackages] = useState<string[]>([]);

  const updateHosts = useCallback((data: Host[]) => {
    const cleaned = data.map(sanitizeHost);
    setHosts(cleaned);
    localStorageAdapter.write(STORAGE_KEY_HOSTS, cleaned);
  }, []);

  const updateKeys = useCallback((data: SSHKey[]) => {
    setKeys(data);
    localStorageAdapter.write(STORAGE_KEY_KEYS, data);
  }, []);

  const updateSnippets = useCallback((data: Snippet[]) => {
    setSnippets(data);
    localStorageAdapter.write(STORAGE_KEY_SNIPPETS, data);
  }, []);

  const updateSnippetPackages = useCallback((data: string[]) => {
    setSnippetPackages(data);
    localStorageAdapter.write(STORAGE_KEY_SNIPPET_PACKAGES, data);
  }, []);

  const updateCustomGroups = useCallback((data: string[]) => {
    setCustomGroups(data);
    localStorageAdapter.write(STORAGE_KEY_GROUPS, data);
  }, []);

  useEffect(() => {
    const savedHosts = localStorageAdapter.read<Host[]>(STORAGE_KEY_HOSTS);
    const savedKeys = localStorageAdapter.read<SSHKey[]>(STORAGE_KEY_KEYS);
    const savedGroups = localStorageAdapter.read<string[]>(STORAGE_KEY_GROUPS);
    const savedSnippets = localStorageAdapter.read<Snippet[]>(STORAGE_KEY_SNIPPETS);
    const savedSnippetPackages = localStorageAdapter.read<string[]>(STORAGE_KEY_SNIPPET_PACKAGES);

    if (savedHosts?.length) {
      const sanitized = savedHosts.map(sanitizeHost);
      setHosts(sanitized);
      localStorageAdapter.write(STORAGE_KEY_HOSTS, sanitized);
    } else {
      updateHosts(INITIAL_HOSTS);
    }

    if (savedKeys) setKeys(savedKeys);
    if (savedSnippets) setSnippets(savedSnippets);
    else updateSnippets(INITIAL_SNIPPETS);

    if (savedGroups) setCustomGroups(savedGroups);
    if (savedSnippetPackages) setSnippetPackages(savedSnippetPackages);
  }, [updateHosts, updateSnippets]);

  const updateHostDistro = useCallback((hostId: string, distro: string) => {
    const normalized = normalizeDistroId(distro);
    setHosts(prev => {
      const next = prev.map(h => h.id === hostId ? { ...h, distro: normalized } : h);
      localStorageAdapter.write(STORAGE_KEY_HOSTS, next);
      return next;
    });
  }, []);

  const exportData = useCallback((): ExportableVaultData => ({
    hosts,
    keys,
    snippets,
    customGroups,
  }), [hosts, keys, snippets, customGroups]);

  const importData = useCallback((payload: Partial<ExportableVaultData>) => {
    if (payload.hosts) updateHosts(payload.hosts);
    if (payload.keys) updateKeys(payload.keys);
    if (payload.snippets) updateSnippets(payload.snippets);
    if (payload.customGroups) updateCustomGroups(payload.customGroups);
  }, [updateHosts, updateKeys, updateSnippets, updateCustomGroups]);

  const importDataFromString = useCallback((jsonString: string) => {
    const data = JSON.parse(jsonString);
    importData(data);
  }, [importData]);

  return {
    hosts,
    keys,
    snippets,
    customGroups,
    snippetPackages,
    updateHosts,
    updateKeys,
    updateSnippets,
    updateSnippetPackages,
    updateCustomGroups,
    updateHostDistro,
    exportData,
    importDataFromString,
  };
};
