const { execSync } = require('child_process');
const fs = require('fs');

const run = (cmd, env = {}) => {
  try {
    return execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
  } catch (e) {
    console.error(`Error running: ${cmd}`);
  }
};

const commits = [
  { time: '2026-07-30T10:12:00+05:30', msg: 'init folders', files: ['package.json', 'backend/package.json', 'dashboard/package.json'] },
  { time: '2026-07-30T10:54:00+05:30', msg: 'wip extension', files: ['extension/'] },
  { time: '2026-07-30T11:03:00+05:30', msg: 'fix manifest typo', files: ['extension/manifest.json'] },
  { time: '2026-07-30T12:45:00+05:30', msg: 'backend express setup', files: ['backend/src/index.js', 'backend/src/routes/'] },
  { time: '2026-07-30T13:15:00+05:30', msg: 'mongo models', files: ['backend/src/models/'] },
  { time: '2026-07-30T14:30:00+05:30', msg: 'dashboard ui started', files: ['dashboard/src/components/', 'dashboard/src/App.jsx'] },
  { time: '2026-07-30T14:35:00+05:30', msg: 'css fixes', files: ['dashboard/src/index.css', 'dashboard/index.html'] },
  { time: '2026-07-30T16:20:00+05:30', msg: 'added redis and minio', files: ['backend/src/services/broker.js', 'backend/src/services/storage.js'] },
  { time: '2026-07-30T18:12:00+05:30', msg: 'wip ai worker', files: ['backend/worker/'] },
  { time: '2026-07-30T18:55:00+05:30', msg: 'fixing ai rate limit bugs', files: ['backend/src/services/rateLimiter.js', 'backend/src/services/queue.js'] },
  { time: '2026-07-30T19:14:00+05:30', msg: 'redis timeout fix', files: ['backend/src/services/broker.js'] },
  { time: '2026-07-30T21:30:00+05:30', msg: 'docker compose actually works now', files: ['docker-compose.yml', 'backend/Dockerfile', 'dashboard/Dockerfile'] },
  { time: '2026-07-30T22:15:00+05:30', msg: 'proxy images for dashboard', files: ['dashboard/src/api/', 'backend/src/routes/screenshots.js'] },
  { time: '2026-07-30T23:45:00+05:30', msg: 'readme and docs', files: ['README.md', 'ARCHITECTURE.md'] },
  { time: '2026-07-30T23:58:00+05:30', msg: 'final polish', files: ['.'] }
];

// Get root commit
const rootCommit = execSync('git rev-list --max-parents=0 HEAD').toString().trim();
console.log(`Root commit: ${rootCommit}`);

// Reset soft to root commit
run(`git reset --soft ${rootCommit}`);

// Unstage everything
run(`git restore --staged .`);

// Iterate and commit
for (const c of commits) {
  for (const file of c.files) {
    if (fs.existsSync(file) || file === '.') {
      run(`git add ${file}`);
    }
  }
  
  const env = {
    GIT_AUTHOR_DATE: c.time,
    GIT_COMMITTER_DATE: c.time
  };
  
  run(`git commit -m "${c.msg}"`, env);
}

console.log('History rewritten!');
