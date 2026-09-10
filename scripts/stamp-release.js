'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const root = path.join(__dirname, '..', 'web');
const sha = process.env.GITHUB_SHA || '';
const run = process.env.GITHUB_RUN_NUMBER || '';
const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
if (!/^\d+\.\d+\.\d+$/.test(version) || (sha && !/^[a-f0-9]{40}$/i.test(sha)) ||
    (run && !/^\d+$/.test(run)) || !/^\d+$/.test(attempt)) throw Error('Invalid release metadata');
const build = sha ? `${sha.slice(0, 7)}${run ? ` · 배포 ${run}.${attempt}` : ''}` : '로컬';
const label = `v${version} · ${build}`;
const assetVersion = sha ? `${version}-${sha}-${run || '0'}-${attempt}` : version;
for (const file of ['index.html', 'flight.html', 'alkkagi.html']) {
  const target = path.join(root, file);
  let html = fs.readFileSync(target, 'utf8');
  if (!html.includes('data-release>')) throw Error(`Missing release label: ${file}`);
  html = html.replace(/(data-release>)[^<]*/, `$1${label}`);
  // Tie executable assets to the displayed build, including repeat deployments.
  html = html.replace(/((?:src|href)="[^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g, `$1?v=${assetVersion}"`);
  fs.writeFileSync(target, html);
}
console.log(`Release: ${label}`);
