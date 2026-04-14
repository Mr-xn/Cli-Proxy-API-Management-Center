import type { TFunction } from 'i18next';
import type {
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeQuotaState,
  CodexQuotaState,
  GeminiCliQuotaState,
  KimiQuotaState,
} from '@/types';
import { resolveAuthProvider } from '@/utils/quota';
import {
  getAuthFileStatusMessage,
  hasAuthFileStatusIssue,
  normalizeProviderKey,
} from '@/features/authFiles/constants';

export const AUTH_FILES_ENABLED_FILTERS = ['all', 'enabled', 'disabled'] as const;
export const AUTH_FILES_ISSUE_FILTERS = [
  'all',
  'problem',
  'status',
  'quota-error',
  'weekly-limit-zero',
] as const;

export type AuthFilesEnabledFilter = (typeof AUTH_FILES_ENABLED_FILTERS)[number];
export type AuthFilesIssueFilter = (typeof AUTH_FILES_ISSUE_FILTERS)[number];

export type AuthFilesQuotaSnapshot = {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  geminiCliQuota: Record<string, GeminiCliQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
};

export type AuthFileFilterContext = {
  disabled: boolean;
  hasProblem: boolean;
  hasQuotaError: boolean;
  hasStatusIssue: boolean;
  hasWeeklyLimitZero: boolean;
  searchableText: string[];
};

const WEEKLY_TEXT_PATTERN = /(weekly|seven[-\s]?day|7[-\s]?day|周限额|七天)/i;

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const stripHtmlForSearch = (value: string): string =>
  normalizeText(
    value
      .replace(/\bclass\s*=\s*(['"]).*?\1/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
  );

const pushSearchText = (
  target: string[],
  seen: Set<string>,
  ...values: Array<string | number | null | undefined>
) => {
  values.forEach((value) => {
    const normalized = normalizeText(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    target.push(normalized);
  });
};

const isDisabledAuthFile = (file: AuthFileItem): boolean => {
  const raw = (file as { disabled?: unknown }).disabled;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
};

const isWeeklyQuotaLabel = (...values: Array<string | null | undefined>) =>
  values.some((value) => typeof value === 'string' && WEEKLY_TEXT_PATTERN.test(value));

const isCodexOrClaudeWindowExhausted = (
  state: CodexQuotaState | ClaudeQuotaState | undefined
): boolean => {
  if (!state || state.status !== 'success') return false;
  return (state.windows ?? []).some((window) => {
    if (!isWeeklyQuotaLabel(window.id, window.label, window.labelKey)) return false;
    return typeof window.usedPercent === 'number' && window.usedPercent >= 100;
  });
};

const isGeminiCliWeeklyLimitZero = (state: GeminiCliQuotaState | undefined): boolean => {
  if (!state || state.status !== 'success') return false;
  return (state.buckets ?? []).some((bucket) => {
    if (!isWeeklyQuotaLabel(bucket.id, bucket.label, bucket.tokenType)) return false;
    if (typeof bucket.remainingAmount === 'number') return bucket.remainingAmount <= 0;
    if (typeof bucket.remainingFraction === 'number') return bucket.remainingFraction <= 0;
    return false;
  });
};

const isKimiWeeklyLimitZero = (state: KimiQuotaState | undefined): boolean => {
  if (!state || state.status !== 'success') return false;
  return (state.rows ?? []).some((row) => {
    if (!isWeeklyQuotaLabel(row.id, row.label, row.labelKey)) return false;
    if (row.limit <= 0) return true;
    return row.used >= row.limit;
  });
};

const getQuotaState = (file: AuthFileItem, quotaSnapshot: AuthFilesQuotaSnapshot) => {
  const provider = normalizeProviderKey(resolveAuthProvider(file));
  if (provider === 'antigravity') return quotaSnapshot.antigravityQuota[file.name];
  if (provider === 'claude') return quotaSnapshot.claudeQuota[file.name];
  if (provider === 'codex') return quotaSnapshot.codexQuota[file.name];
  if (provider === 'gemini-cli') return quotaSnapshot.geminiCliQuota[file.name];
  if (provider === 'kimi') return quotaSnapshot.kimiQuota[file.name];
  return undefined;
};

export const isAuthFilesEnabledFilter = (value: unknown): value is AuthFilesEnabledFilter =>
  typeof value === 'string' &&
  AUTH_FILES_ENABLED_FILTERS.includes(value as AuthFilesEnabledFilter);

export const isAuthFilesIssueFilter = (value: unknown): value is AuthFilesIssueFilter =>
  typeof value === 'string' && AUTH_FILES_ISSUE_FILTERS.includes(value as AuthFilesIssueFilter);

export const matchesAuthFileIssueFilter = (
  context: Pick<AuthFileFilterContext, 'hasProblem' | 'hasQuotaError' | 'hasStatusIssue' | 'hasWeeklyLimitZero'>,
  filter: AuthFilesIssueFilter
): boolean => {
  if (filter === 'all') return true;
  if (filter === 'problem') return context.hasProblem;
  if (filter === 'status') return context.hasStatusIssue;
  if (filter === 'quota-error') return context.hasQuotaError;
  return context.hasWeeklyLimitZero;
};

export const matchesAuthFileEnabledFilter = (
  context: Pick<AuthFileFilterContext, 'disabled'>,
  filter: AuthFilesEnabledFilter
): boolean => {
  if (filter === 'all') return true;
  return filter === 'disabled' ? context.disabled : !context.disabled;
};

export const buildAuthFileFilterContext = (
  file: AuthFileItem,
  quotaSnapshot: AuthFilesQuotaSnapshot,
  t: TFunction
): AuthFileFilterContext => {
  const searchableText: string[] = [];
  const seen = new Set<string>();
  const statusMessage = getAuthFileStatusMessage(file);
  const statusMessagePlain = statusMessage ? stripHtmlForSearch(statusMessage) : '';
  const disabled = isDisabledAuthFile(file);
  const quotaState = getQuotaState(file, quotaSnapshot);
  const hasStatusIssue = hasAuthFileStatusIssue(file);
  const hasQuotaError = quotaState?.status === 'error';
  const hasWeeklyLimitZero =
    isCodexOrClaudeWindowExhausted(quotaState as CodexQuotaState | ClaudeQuotaState | undefined) ||
    isGeminiCliWeeklyLimitZero(quotaState as GeminiCliQuotaState | undefined) ||
    isKimiWeeklyLimitZero(quotaState as KimiQuotaState | undefined);
  const quotaErrorMessage =
    quotaState && typeof quotaState.error === 'string' ? quotaState.error.trim() : '';

  pushSearchText(
    searchableText,
    seen,
    file.name,
    file.type,
    file.provider,
    file.status,
    statusMessage,
    statusMessagePlain,
    disabled ? t('auth_files.enabled_status_disabled') : t('auth_files.enabled_status_enabled'),
    disabled ? 'disabled' : 'enabled'
  );

  if (quotaState?.status === 'success') {
    if ('groups' in quotaState) {
      quotaState.groups.forEach((group) => {
        pushSearchText(searchableText, seen, group.id, group.label, group.resetTime, ...group.models);
      });
    } else if ('windows' in quotaState) {
      quotaState.windows.forEach((window) => {
        pushSearchText(
          searchableText,
          seen,
          window.id,
          window.label,
          window.labelKey
            ? t(
                window.labelKey,
                'labelParams' in window
                  ? (window.labelParams as Record<string, string | number>)
                  : undefined
              )
            : '',
          window.resetLabel
        );
      });
    } else if ('buckets' in quotaState) {
      quotaState.buckets.forEach((bucket) => {
        pushSearchText(
          searchableText,
          seen,
          bucket.id,
          bucket.label,
          bucket.tokenType,
          bucket.resetTime,
          ...(bucket.modelIds ?? [])
        );
      });
    } else if ('rows' in quotaState) {
      quotaState.rows.forEach((row) => {
        pushSearchText(
          searchableText,
          seen,
          row.id,
          row.label,
          row.labelKey ? t(row.labelKey, row.labelParams as Record<string, string | number>) : '',
          row.resetHint,
          `${row.used} / ${row.limit}`
        );
      });
    }
  }

  if (quotaErrorMessage) {
    pushSearchText(
      searchableText,
      seen,
      quotaErrorMessage,
      t('auth_files.issue_filter_quota_error'),
      'quota error'
    );
  }

  if (hasStatusIssue) {
    pushSearchText(
      searchableText,
      seen,
      t('auth_files.issue_filter_status'),
      t('auth_files.problem_filter_only'),
      'status error'
    );
  }

  if (hasWeeklyLimitZero) {
    pushSearchText(
      searchableText,
      seen,
      t('auth_files.issue_filter_weekly_limit_zero'),
      t('common.weekly_limit'),
      'weekly limit zero'
    );
  }

  return {
    disabled,
    hasProblem: hasStatusIssue || hasQuotaError || hasWeeklyLimitZero,
    hasQuotaError,
    hasStatusIssue,
    hasWeeklyLimitZero,
    searchableText,
  };
};
