// Starts the backend (auto-restarts on change) and the Vite app together: `npm run dev`
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const procs = [];

function run(name, cmd, args, shell = false) {
  const p = spawn(cmd, args, { stdio: 'inherit', shell });
  p.on('exit', (code) => {
    if (!shuttingDown) console.log(`\n[${name}] exited with code ${code}`);
  });
  procs.push(p);
}

let shuttingDown = false;
function shutdown() {
  shuttingDown = true;
  for (const p of procs) {
    try { p.kill(); } catch {}
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Starting backend on http://localhost:' + (process.env.PORT || 5000) + ' and the app...\n');
run('server', process.execPath, ['--watch', 'server/index.js']); // no shell: path may contain spaces
run('web', isWin ? 'npx.cmd' : 'npx', ['vite'], isWin);          // shell on Windows so .cmd resolves
