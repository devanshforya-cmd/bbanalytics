'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getExperimentVariant,
  trackExperimentConversion,
  getExperimentAnalytics,
  ExperimentAnalytics,
} from '@/lib/ab-testing';

export function useExperiment<T extends string = string>(
  experimentId: string,
  userId?: string
) {
  const [variant, setVariant] = useState<T>(() => getExperimentVariant<T>(experimentId, userId));
  const [analytics, setAnalytics] = useState<ExperimentAnalytics | null>(null);

  useEffect(() => {
    // Re-evaluate variant in client-side effect to handle hydration
    const assigned = getExperimentVariant<T>(experimentId, userId);
    setVariant(assigned);
    setAnalytics(getExperimentAnalytics(experimentId));
  }, [experimentId, userId]);

  const trackConversion = useCallback(
    (goalName: string, metadata?: Record<string, any>) => {
      trackExperimentConversion(experimentId, goalName, metadata, userId);
      setAnalytics(getExperimentAnalytics(experimentId));
    },
    [experimentId, userId]
  );

  return {
    variant,
    isControl: variant === 'control',
    trackConversion,
    analytics,
  };
}
