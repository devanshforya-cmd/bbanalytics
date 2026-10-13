import { useEffect, useState } from 'react';
import { supabase } from '@/lib/db/supabase-client';
import { getFeatureFlagByName } from '@/lib/db/feature-flags-service';

/**
 * useFeatureFlag hook for feature flagging and A/B variant testing.
 * Checks global on/off status, user assignment filters, and variant A/B.
 */
export function useFeatureFlag(
  flagName: string,
  userId?: string
): {
  isEnabled: boolean;
  variant: 'A' | 'B';
  isLoading: boolean;
} {
  const [flag, setFlag] = useState<{
    isEnabled: boolean;
    variant: 'A' | 'B';
    isLoading: boolean;
  }>({ isEnabled: false, variant: 'A', isLoading: true });

  useEffect(() => {
    async function checkFlag() {
      try {
        const { data, error } = await supabase
          .from('feature_flags')
          .select('*')
          .eq('name', flagName)
          .single();

        if (error || !data) {
          // Fall back to in-memory service
          const local = getFeatureFlagByName(flagName);
          if (!local || !local.isEnabled) {
            setFlag({ isEnabled: false, variant: 'A', isLoading: false });
            return;
          }
          const isForThisUser =
            !local.enabledForUsers ||
            local.enabledForUsers.length === 0 ||
            (userId ? local.enabledForUsers.includes(userId) : true);

          setFlag({
            isEnabled: isForThisUser,
            variant: local.variant || 'A',
            isLoading: false,
          });
          return;
        }

        if (!data.is_enabled) {
          setFlag({ isEnabled: false, variant: 'A', isLoading: false });
          return;
        }

        const isForThisUser =
          !data.enabled_for_users ||
          data.enabled_for_users.length === 0 ||
          (userId ? data.enabled_for_users.includes(userId) : true);

        setFlag({
          isEnabled: isForThisUser,
          variant: (data.variant || 'A') as 'A' | 'B',
          isLoading: false,
        });
      } catch {
        const local = getFeatureFlagByName(flagName);
        if (local && local.isEnabled) {
          const isForThisUser =
            !local.enabledForUsers ||
            local.enabledForUsers.length === 0 ||
            (userId ? local.enabledForUsers.includes(userId) : true);
          setFlag({ isEnabled: isForThisUser, variant: local.variant, isLoading: false });
        } else {
          setFlag({ isEnabled: false, variant: 'A', isLoading: false });
        }
      }
    }
    checkFlag();
  }, [flagName, userId]);

  return flag;
}
