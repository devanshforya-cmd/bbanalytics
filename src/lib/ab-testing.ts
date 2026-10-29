/**
 * A/B Testing & Feature Experimentation Engine
 * Provides deterministic variant assignment, persistent hashing, event tracking, and conversion analytics.
 */

export interface ExperimentVariant<T = string> {
  id: T;
  name: string;
  weight?: number; // 0 to 1, default evenly split
}

export interface ExperimentConfig<T extends string = string> {
  id: string;
  name: string;
  description: string;
  variants: ExperimentVariant<T>[];
  status: 'active' | 'paused' | 'concluded';
  winningVariant?: T;
}

export interface ExperimentEvent {
  experimentId: string;
  variantId: string;
  userId: string;
  eventName: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ExperimentAnalytics {
  experimentId: string;
  totalImpressions: number;
  variants: {
    variantId: string;
    impressions: number;
    conversions: number;
    conversionRate: number; // percentage (0-100)
  }[];
}

const STORAGE_KEY_PREFIX = 'bb_ab_assigned_';
const EVENTS_STORAGE_KEY = 'bb_ab_events_v1';

// Pre-configured experiments
export const ACTIVE_EXPERIMENTS: Record<string, ExperimentConfig> = {
  'premium-nav-style': {
    id: 'premium-nav-style',
    name: 'Premium Glass Navigation Header',
    description: 'Compares crisp frosted glass header against solid border navigation',
    variants: [
      { id: 'control', name: 'Classic Minimalist' },
      { id: 'glass_premium', name: 'Ultra-Premium Frosted Glass' },
    ],
    status: 'active',
  },
  'dashboard-kpi-layout': {
    id: 'dashboard-kpi-layout',
    name: 'Dashboard KPI Card Visual Density',
    description: 'Tests compact high-density KPI cards vs standard cards for manager throughput',
    variants: [
      { id: 'control', name: 'Standard Spaced' },
      { id: 'compact_pro', name: 'Compact Executive Metrics' },
    ],
    status: 'active',
  },
};

/**
 * Simple deterministic string hash algorithm (djb2)
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

/**
 * Retrieves or initializes an anonymous client device ID
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_session';
  try {
    const key = 'bb_device_uuid';
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'fallback_session';
  }
}

/**
 * Assigns or retrieves a deterministic variant for a user/device
 */
export function getExperimentVariant<T extends string = string>(
  experimentId: string,
  userId?: string
): T {
  const config = ACTIVE_EXPERIMENTS[experimentId] as ExperimentConfig<T> | undefined;

  // 1. Fallback if experiment unknown or concluded
  if (!config) return 'control' as T;
  if (config.status === 'concluded' && config.winningVariant) {
    return config.winningVariant;
  }
  if (config.status === 'paused') {
    return (config.variants[0]?.id || 'control') as T;
  }

  // 2. Allow URL query override for QA testing: ?ab_{experimentId}=variant_id
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const forcedVariant = urlParams.get(`ab_${experimentId}`);
      if (forcedVariant && config.variants.some((v) => v.id === forcedVariant)) {
        return forcedVariant as T;
      }
    } catch {
      // Ignore query param errors in non-browser environments
    }
  }

  // 3. Check persistent cached assignment
  const targetId = userId || getOrCreateDeviceId();
  const cacheKey = `${STORAGE_KEY_PREFIX}${experimentId}_${targetId}`;

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached && config.variants.some((v) => v.id === cached)) {
        return cached as T;
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  // 4. Deterministic assignment based on hash(targetId + experimentId)
  const hash = hashString(`${targetId}::${experimentId}`);
  const totalVariants = config.variants.length;
  if (totalVariants === 0) return 'control' as T;

  const selectedIndex = hash % totalVariants;
  const assigned = config.variants[selectedIndex].id;

  // Persist assignment
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(cacheKey, assigned);
      trackExperimentImpression(experimentId, assigned, targetId);
    } catch {
      // Ignore localStorage errors
    }
  }

  return assigned;
}

/**
 * Tracks an impression for the assigned variant
 */
export function trackExperimentImpression(
  experimentId: string,
  variantId: string,
  userId?: string
): void {
  trackExperimentEvent(experimentId, 'impression', { variantId }, userId);
}

/**
 * Records an A/B test conversion event
 */
export function trackExperimentConversion(
  experimentId: string,
  conversionGoal: string,
  metadata?: Record<string, any>,
  userId?: string
): void {
  trackExperimentEvent(experimentId, `conversion:${conversionGoal}`, metadata, userId);
}

/**
 * Internal event logger
 */
export function trackExperimentEvent(
  experimentId: string,
  eventName: string,
  metadata?: Record<string, any>,
  userId?: string
): void {
  if (typeof window === 'undefined') return;

  const targetId = userId || getOrCreateDeviceId();
  const variant = metadata?.variantId || getExperimentVariant(experimentId, targetId);

  const event: ExperimentEvent = {
    experimentId,
    variantId: variant,
    userId: targetId,
    eventName,
    timestamp: new Date().toISOString(),
    metadata,
  };

  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    const events: ExperimentEvent[] = raw ? JSON.parse(raw) : [];
    // Keep max last 500 events to prevent unbounded storage
    events.push(event);
    if (events.length > 500) {
      events.splice(0, events.length - 500);
    }
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
  } catch (err) {
    console.warn('A/B tracking write error:', err);
  }
}

/**
 * Computes live conversion analytics for any experiment
 */
export function getExperimentAnalytics(experimentId: string): ExperimentAnalytics {
  const config = ACTIVE_EXPERIMENTS[experimentId];
  const variants = config?.variants.map((v) => v.id) || ['control', 'variant_b'];

  const stats: Record<string, { impressions: number; conversions: number }> = {};
  variants.forEach((v) => {
    stats[v] = { impressions: 0, conversions: 0 };
  });

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
      const events: ExperimentEvent[] = raw ? JSON.parse(raw) : [];
      events
        .filter((e) => e.experimentId === experimentId)
        .forEach((e) => {
          if (!stats[e.variantId]) {
            stats[e.variantId] = { impressions: 0, conversions: 0 };
          }
          if (e.eventName === 'impression') {
            stats[e.variantId].impressions++;
          } else if (e.eventName.startsWith('conversion:')) {
            stats[e.variantId].conversions++;
          }
        });
    } catch {
      // Return defaults on error
    }
  }

  const totalImpressions = Object.values(stats).reduce((acc, s) => acc + s.impressions, 0);

  return {
    experimentId,
    totalImpressions,
    variants: variants.map((v) => {
      const imp = stats[v]?.impressions || 0;
      const conv = stats[v]?.conversions || 0;
      const rate = imp > 0 ? (conv / imp) * 100 : 0;
      return {
        variantId: v,
        impressions: imp,
        conversions: conv,
        conversionRate: Math.round(rate * 10) / 10,
      };
    }),
  };
}
