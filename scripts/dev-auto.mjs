import { spawn, spawnSync } from 'node:child_process';
import { config } from 'dotenv';

config({ quiet: true });

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (process.env.DATABASE_URL) {
	const push = spawnSync(npmCmd, ['run', 'db:push:auto'], { stdio: 'inherit' });
	if (push.status !== 0) {
		process.exit(push.status ?? 1);
	}
} else {
	console.log('Skipping db:push:auto (DATABASE_URL is not set)');
}

const dev = spawn(npmCmd, ['run', 'dev'], { stdio: 'inherit' });

dev.on('exit', (code) => {
	process.exit(code ?? 0);
});
