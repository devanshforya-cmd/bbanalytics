import { useEffect, useState } from 'react';
import { fetchFeatureFlagsFromSupabase } from '@/lib/db/feature-flags-service';

export function useFeatureFlag(flagName: string, userId?: string): { isEnabled: boolean; variant: 'A' | 'B'; isLoading: boolean } {
  const [flag, setFlag] = useState<{ isEnabled: boolean; variant: 'A' | 'B'; isLoading: boolean }>({ isEnabled: false, variant: 'A', isLoading: true });
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const flags = await fetchFeatureFlagsFromSupabase();
        const item = flags.find((entry) => entry.name === flagName);
        const allowed = !item?.enabledForUsers?.length || !!userId && item.enabledForUsers.includes(userId);
        if (active) setFlag({ isEnabled: !!item?.isEnabled && allowed, variant: item?.variant || 'A', isLoading: false });
      } catch { if (active) setFlag({ isEnabled: false, variant: 'A', isLoading: false }); }
    };
    setFlag({ isEnabled: false, variant: 'A', isLoading: true });
    void check();
    window.addEventListener('bb-feature-flags-updated', check);
    return () => { active = false; window.removeEventListener('bb-feature-flags-updated', check); };
  }, [flagName, userId]);
  return flag;
}
