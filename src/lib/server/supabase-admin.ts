import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL;
const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

export const hasSupabaseServiceRoleConfig = Boolean(supabaseUrl && serviceRoleKey);

export const supabaseAdmin = hasSupabaseServiceRoleConfig
	? createClient(supabaseUrl as string, serviceRoleKey as string, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		})
	: null;
