/**
 * Quota management page - coordinates the four quota sections.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { Select } from '@/components/ui/Select';
import { useAuthStore, useQuotaStore } from '@/stores';
import { authFilesApi, configFileApi } from '@/services/api';
import {
  QuotaSection,
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG
} from '@/components/quota';
import type { AuthFileItem } from '@/types';
import {
  isAuthAccountTypeFilter,
  matchesAuthAccountTypeFilter,
  type AuthAccountTypeFilter,
} from '@/utils/quota';
import styles from './QuotaPage.module.scss';

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const codexQuota = useQuotaStore((state) => state.codexQuota);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<AuthAccountTypeFilter>('all');

  const disableControls = connectionStatus !== 'connected';

  const loadConfig = useCallback(async () => {
    try {
      await configFileApi.fetchConfigYaml();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError((prev) => prev || errorMessage);
    }
  }, [t]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list();
      setFiles(data?.files || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadConfig(), loadFiles()]);
  }, [loadConfig, loadFiles]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    loadFiles();
    loadConfig();
  }, [loadFiles, loadConfig]);

  const accountTypeOptions = useMemo(
    () => [
      { value: 'all', label: t('quota_management.account_type_filter_all') },
      { value: 'free', label: t('quota_management.account_type_free') },
      { value: 'plus', label: t('quota_management.account_type_plus') },
      { value: 'team', label: t('quota_management.account_type_team') }
    ],
    [t]
  );

  const filteredFiles = useMemo(
    () =>
      files.filter((file) =>
        matchesAuthAccountTypeFilter(file, accountTypeFilter, codexQuota[file.name]?.planType)
      ),
    [accountTypeFilter, codexQuota, files]
  );

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('quota_management.title')}</h1>
        <p className={styles.description}>{t('quota_management.description')}</p>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.filtersBar}>
        <div className={styles.filterControl}>
          <label>{t('quota_management.account_type_filter_label')}</label>
          <Select
            value={accountTypeFilter}
            options={accountTypeOptions}
            onChange={(value) => {
              if (!isAuthAccountTypeFilter(value)) return;
              setAccountTypeFilter(value);
            }}
            ariaLabel={t('quota_management.account_type_filter_label')}
            fullWidth
          />
        </div>
      </div>

      <QuotaSection
        config={CLAUDE_CONFIG}
        files={filteredFiles}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={ANTIGRAVITY_CONFIG}
        files={filteredFiles}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={CODEX_CONFIG}
        files={filteredFiles}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={GEMINI_CLI_CONFIG}
        files={filteredFiles}
        loading={loading}
        disabled={disableControls}
      />
      <QuotaSection
        config={KIMI_CONFIG}
        files={filteredFiles}
        loading={loading}
        disabled={disableControls}
      />
    </div>
  );
}
