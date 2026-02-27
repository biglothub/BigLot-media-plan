import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config();

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/db/schema.ts',
	out: './supabase/migrations',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? ''
	},
	verbose: true,
	strict: true
});
