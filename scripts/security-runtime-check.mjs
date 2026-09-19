import fs from 'node:fs';
// Node's official release schedule. Fail closed if the source cannot be checked.
const response = await fetch('https://raw.githubusercontent.com/nodejs/Release/main/schedule.json');
if (!response.ok) throw new Error(`Release schedule unavailable: ${response.status}`);
const schedule = await response.json();
const major = Number(process.versions.node.split('.')[0]);
const entry = schedule[`v${major}`];
const now = new Date();
const daysRemaining = entry ? Math.floor((new Date(entry.end) - now) / 86400000) : -1;
const report = { checkedAt: now.toISOString(), nodeVersion: process.version, endOfLife: entry?.end ?? null,
  daysRemaining, status: daysRemaining < 0 ? 'end-of-life' : daysRemaining <= 90 ? 'upgrade-due' : 'supported' };
fs.mkdirSync('validation', { recursive: true });
fs.writeFileSync('validation/runtime-lifecycle.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (daysRemaining <= 90) process.exitCode = 1;
