import type { PerformanceMode } from '@/types';

export const PERF_STORAGE_KEY = 'drawalong_perf_mode';

/**
 * Checks hardware signals to detect low-end or constrained mobile devices.
 */
export function isLowEndDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return true;
  }

  const nav = window.navigator as unknown as {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  // 2. CPU concurrency (4 cores or fewer is typical for budget chipsets)
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) {
    return true;
  }

  // 3. RAM (2GB or less)
  if (nav.deviceMemory && nav.deviceMemory <= 2) {
    return true;
  }

  // 4. Data Saver mode
  if (nav.connection?.saveData) {
    return true;
  }

  return false;
}

/**
 * Resolves the active rendering tier ('lite' vs 'standard')
 * based on manual preference and hardware detection.
 */
export function resolvePerformanceTier(mode: PerformanceMode = 'auto'): 'lite' | 'standard' {
  if (mode === 'lite') return 'lite';
  if (mode === 'standard') return 'standard';
  return isLowEndDevice() ? 'lite' : 'standard';
}
