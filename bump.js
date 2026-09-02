#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const type = process.argv[2] || 'patch'; // patch, minor, major, or x.y.z
const message = process.argv[3] || 'Release bump';

const pkgPath = path.join(__dirname, 'package.json');
const changelogPath = path.join(__dirname, 'CHANGELOG.md');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const oldVersion = pkg.version;
const parts = oldVersion.split('.').map(n => parseInt(n, 10));

let newVersion = '';
if (type === 'major') {
  newVersion = `${parts[0] + 1}.0.0`;
} else if (type === 'minor') {
  newVersion = `${parts[0]}.${parts[1] + 1}.0`;
} else if (type === 'patch') {
  newVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
} else if (/^\d+\.\d+\.\d+$/.test(type)) {
  newVersion = type;
} else {
  console.error(`Invalid version bump type "${type}". Use patch, minor, major, or explicit X.Y.Z`);
  process.exit(1);
}

// 1. Update package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updated package.json: ${oldVersion} -> ${newVersion}`);

// 2. Update CHANGELOG.md
const today = new Date().toISOString().split('T')[0];
if (fs.existsSync(changelogPath)) {
  let cl = fs.readFileSync(changelogPath, 'utf-8');
  const entry = `\n## [${newVersion}] - ${today}\n\n### Changed\n- ${message}\n`;
  const insertIndex = cl.indexOf('## [');
  if (insertIndex !== -1) {
    cl = cl.slice(0, insertIndex) + entry + '\n' + cl.slice(insertIndex);
  } else {
    cl += entry;
  }
  fs.writeFileSync(changelogPath, cl);
  console.log(`Updated CHANGELOG.md with entry for [${newVersion}]`);
}

// 3. Git commit & tag
try {
  execSync(`git add -A`, { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): v${newVersion} - ${message}"`, { stdio: 'inherit' });
  execSync(`git tag -a "v${newVersion}" -m "Release v${newVersion}"`, { stdio: 'inherit' });
  console.log(`Created Git commit and tag v${newVersion}`);
} catch (e) {
  console.warn(`Git step failed or no changes:`, e.message);
}

// 4. Reload systemd service if running
try {
  execSync(`systemctl --user restart grima.service`, { stdio: 'ignore' });
  console.log(`Restarted grima.service with v${newVersion}`);
} catch (e) {}

console.log(`\nSuccessfully bumped Grima to v${newVersion}!`);
