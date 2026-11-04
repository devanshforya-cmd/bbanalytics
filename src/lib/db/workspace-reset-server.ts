import { supabaseAdmin } from './supabase-server';
import type { WorkspaceResetState } from '../workspace-reset';

export async function readWorkspaceResetState(): Promise<WorkspaceResetState> {
  const { data, error } = await supabaseAdmin.from('system_settings').select('value').eq('key', 'workspace_reset_state').maybeSingle();
  if (error) throw new Error('Workspace reset status is temporarily unavailable.');
  return { epoch: data?.value?.epoch || process.env.WORKSPACE_DATA_EPOCH || 'initial', resetting: data?.value?.resetting === true };
}
