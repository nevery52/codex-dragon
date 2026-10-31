import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DragonHistory } from '../runtime/dragon-history.mjs';
import { DragonSettings } from '../runtime/dragon-settings.mjs';
import { newerVersion, verifyRelease } from '../runtime/dragon-update.mjs';
import { CodexQuota } from '../runtime/codex-quota.mjs';

function temp(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dragon-features-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
const token = (at, input, last = input) => ({ type: 'event_msg', timestamp: new Date(at).toISOString(), payload: { type: 'token_count', info: {
  total_token_usage: { input_tokens: input, output_tokens: 0, cached_input_tokens: Math.floor(input / 2) },
  last_token_usage: { input_tokens: last, output_tokens: 0, cached_input_tokens: Math.floor(last / 2) },
} } });
const encode = rows => rows.map(JSON.stringify).join('\n') + '\n';

test('history indexes all files and old dates, persists cursors, deduplicates archives and resumes partial lines', t => {
  const dir = temp(t), sessions = path.join(dir, 'sessions'), archives = path.join(dir, 'archived_sessions'); fs.mkdirSync(sessions); fs.mkdirSync(archives);
  const now = Date.now(), old = now - 60 * 86400000;
  for (let i = 0; i < 270; i++) fs.writeFileSync(path.join(sessions, `rollout-${i}.jsonl`), encode([{ type: 'session_meta', payload: { id: 'id-' + i } }, token(old, 10)]));
  const file = path.join(sessions, 'rollout-live.jsonl');
  fs.writeFileSync(file, encode([{ type: 'session_meta', payload: { id: 'live' } }, { type: 'response_item', payload: { content: 'PRIVATE-CHAT-MUST-NOT-SURVIVE' } }, token(now - 5000, 100)]));
  fs.copyFileSync(file, path.join(archives, 'rollout-copy.jsonl'));
  const options = { codexHome: dir, cacheDir: path.join(dir, 'cache') }; let history = new DragonHistory(options);
  let result = history.scan({ now });
  assert.equal(result.complete, true); assert.equal(result.scannedFiles, 272); assert.equal(result.allTime.total, 2800); assert.equal(result.today, 100);
  history.close(); history = new DragonHistory(options);
  assert.equal(history.scan({ now }).scannedBytes, 0);
  const line = JSON.stringify(token(now - 1000, 150)); fs.appendFileSync(file, line.slice(0, 50));
  assert.equal(history.scan({ now }).allTime.total, 2800);
  history.close(); history = new DragonHistory(options); fs.appendFileSync(file, line.slice(50) + '\n');
  result = history.scan({ now }); assert.equal(result.allTime.total, 2850); assert.equal(result.today, 150); assert.ok(result.scannedBytes < 1024);
  fs.copyFileSync(file, path.join(archives, 'rollout-copy.jsonl')); assert.equal(history.scan({ now }).allTime.total, 2850);
  // Counter resets count only the reported last usage. A truncated log cannot erase accumulated history.
  fs.writeFileSync(file, encode([{ type: 'session_meta', payload: { id: 'live' } }, token(now, 20)]));
  assert.equal(history.scan({ now }).allTime.total, 2870); history.close();
  for (const f of fs.readdirSync(options.cacheDir)) assert.equal(fs.readFileSync(path.join(options.cacheDir, f)).includes(Buffer.from('PRIVATE-CHAT')), false);
});

test('history excludes inherited subagent tokens and identifies missing baselines', t => {
  const dir = temp(t); fs.mkdirSync(path.join(dir, 'sessions')); const now = Date.now();
  fs.writeFileSync(path.join(dir, 'sessions/rollout-sub.jsonl'), encode([{ type: 'session_meta', payload: { id: 'child', subagent_history_start_ordinal: 1 } }, token(now - 1000, 1000), token(now, 50)]));
  const h = new DragonHistory({ codexHome: dir, cacheDir: path.join(dir, 'cache') });
  assert.equal(h.scan({ now }).allTime.total, 50);
  const missing = token(now, 900); delete missing.payload.info.last_token_usage;
  fs.writeFileSync(path.join(dir, 'sessions/rollout-partial.jsonl'), encode([{ type: 'session_meta', payload: { id: 'missing' } }, missing]));
  const r = h.scan({ now }); assert.equal(r.complete, false); assert.equal(r.allTime.total, 50); h.close();
});

test('quota notifications respect threshold, stale values, account/window identity and restart dedupe', t => {
  const dir = temp(t), sent = [], notify = n => sent.push(n), now = Date.now();
  let settings = new DragonSettings({ dataDir: dir, notify });
  const quota = { accountKey: 'account-a', available: true, stale: false, observedAt: now, windows: [{ id: 'primary', label: '5 小时', remainingPercent: 19, resetsAt: now + 600000, stale: false }] };
  settings.quota({ ...quota, stale: true }, now); assert.equal(sent.length, 0);
  settings.quota(quota, now); settings.quota(quota, now); assert.equal(sent.length, 1);
  settings = new DragonSettings({ dataDir: dir, notify }); settings.quota(quota, now); assert.equal(sent.length, 1);
  settings.quota({ ...quota, accountKey: 'account-b' }, now); assert.equal(sent.length, 2);
  settings.save(settings.validate({ threshold: 10 })); settings.quota(quota, now); assert.equal(sent.length, 2);
  quota.windows[0].remainingPercent = 9; settings.quota(quota, now); assert.equal(sent.length, 3);
  settings.quota(quota, now + 600001); assert.equal(sent.length, 3);
  settings.save(settings.validate({ notifications: false })); settings.quota({ ...quota, accountKey: 'new' }, now); assert.equal(sent.length, 3);
  assert.throws(() => settings.validate({ threshold: 0 })); assert.throws(() => settings.validate({ autostart: 'yes' }));
});

test('local update channel validates version, product, archive path and checksum', async t => {
  const dir = temp(t), archive = 'codex-dragon-0.3.0-windows.zip', bytes = Buffer.from('fixture archive'); fs.writeFileSync(path.join(dir, archive), bytes);
  const manifest = { id: 'codex-dragon', version: '0.3.0', archive, sha256: createHash('sha256').update(bytes).digest('hex') };
  const save = m => fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(m)); save(manifest);
  assert.equal((await verifyRelease(dir, '0.2.0')).version, '0.3.0'); assert.equal(await verifyRelease(dir, '0.3.0'), null);
  assert.equal(newerVersion('0.10.0', '0.9.0'), true); assert.equal(newerVersion('invalid', '0.2.0'), false);
  save({ ...manifest, archive: '../escape.zip' }); await assert.rejects(verifyRelease(dir, '0.2.0'), /清单/);
  save({ ...manifest, sha256: '0'.repeat(64) }); await assert.rejects(verifyRelease(dir, '0.2.0'), /校验/);
  save({ ...manifest, id: 'different-app' }); assert.equal(await verifyRelease(dir, '0.2.0'), null);
});

test('quota subprocess reconnects automatically after exit and closes cleanly', async t => {
  const dir = temp(t), binary = path.join(dir, 'codex-stub');
  fs.writeFileSync(binary, `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');const mark=path.join(__dirname,'started');
if(!fs.existsSync(mark)){fs.writeFileSync(mark,'yes');process.exit(1);}
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);let result;
if(m.method==='initialize')result={};if(m.method==='account/read')result={account:{type:'chatgpt',planType:'pro'}};
if(m.method==='account/rateLimits/read')result={rateLimits:{primary:{usedPercent:12,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600}}};
if(result)console.log(JSON.stringify({id:m.id,result}));});`, { mode: 0o700 });
  const snapshots = [], quota = new CodexQuota({ binary, spawnProcess: (file, args, options) => spawn(process.execPath, [file, ...args], { ...options, windowsHide: true }), codexHome: dir, onSnapshot: value => snapshots.push(value), timeoutMs: 1000 });
  t.after(() => quota.close()); await quota.start();
  const end = Date.now() + 8000;
  while (!snapshots.some(s => s.available) && Date.now() < end) await new Promise(r => setTimeout(r, 50));
  assert.equal(snapshots.at(-1).windows[0]?.remainingPercent, 88); await quota.close();
  assert.ok(quota.child.exitCode !== null || quota.child.signalCode !== null);
});
import vm from 'node:vm';
import { execFileSync, spawn } from 'node:child_process';
import { validateWindowShape, EMPTY_SHAPE } from '../desktop/window-shape.cjs';

const anchorSource = fs.readFileSync(new URL('../desktop/ui/dragon-avatar.js', import.meta.url), 'utf8').split(/\(\(\) => \{\r?\n  'use strict';/)[0];
function anchorMath() { const box = {}; vm.runInNewContext(anchorSource, box); return box.DragonAnchor; }
test('normalized anchors preserve corners and ratios through resize; undersized clients stay finite', () => {
  const a = anchorMath();
  for (const ax of [0, 0.25, 1]) for (const ay of [0, 0.6, 1]) {
    const p = a.position({ax,ay},1000,800,200,200);
    assert.equal(p.x, ax*800); assert.equal(p.y, ay*600);
    const q = a.position({ax,ay},600,400,200,200);
    assert.equal(q.x, ax*400); assert.equal(q.y, ay*200);
  }
  assert.equal(a.position({ax:1,ay:1},100,100,200,200).x,0);
  const c = a.normalize({anchor:{ax:-2,ay:4},snapDistance:'bad',flipOnTop:'yes'});
  assert.equal(c.anchor.ax,0); assert.equal(c.anchor.ay,1); assert.equal(c.snapDistance,24); assert.equal(c.flipOnTop,false);
});
test('magnet uses strict DIP threshold, nearest edge and zero-travel protection', () => {
  const a=anchorMath();
  assert.equal(a.drop(23,577,1000,800,200,200,24).ax,0);
  assert.equal(a.drop(23,577,1000,800,200,200,24).ay,1);
  assert.equal(a.drop(24,576,1000,800,200,200,24).ax,24/800);
  assert.equal(a.drop(24,576,1000,800,200,200,24).ay,576/600);
  assert.equal(a.drop(15,0,220,200,200,200,24).ax,1);
  assert.equal(a.drop(0,0,100,100,200,200,24).ay,0);
});
test('empty sprite region retains safe one-pixel shape', () => {
  assert.deepEqual(validateWindowShape([],{width:800,height:600}),EMPTY_SHAPE);
});
test('native whitelist defaults, invalid configuration, disabled rules and session boundary', {skip:process.platform!=='win32'}, t => {
  const dir=temp(t), cfg=path.join(dir,'dragon.json');
  const source=path.resolve('desktop/WindowApi.cs');
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  const script=`$ErrorActionPreference='Stop'
Add-Type -TypeDefinition (Get-Content -LiteralPath ${quote(source)} -Raw)
$f=${quote(cfg)}
$s=[Diagnostics.Process]::GetCurrentProcess().SessionId
$p='C:\\Program Files\\WindowsApps\\OpenAI.Codex_test\\app\\Codex.exe'
function Check($expected,$image,$name,$session) { if([WhaleWindows]::MatchesAnyRule($image,$name,$session) -ne $expected){throw 'Rule assertion failed'} }
foreach($text in @('{}','{broken','{"hostRules":42}','{"hostRules":[{"enabled":"yes"}]}')) {
 [IO.File]::WriteAllText($f,$text); [WhaleWindows]::ConfigureHosts($f)
 Check $true $p 'Codex.exe' $s
 Check $false 'C:\\evil\\Codex.exe' 'Codex.exe' $s
 Check $false $p 'Codex.exe' ($s+1)
}
[IO.File]::WriteAllText($f,'{"hostRules":[{"name":"browser","enabled":true,"sameSession":true,"processNames":["chrome.exe"],"imageContains":"","imageEndsWith":[]}]}')
[WhaleWindows]::ConfigureHosts($f)
Check $true 'C:\\Chrome\\chrome.exe' 'CHROME.EXE' $s
Check $false $p 'Codex.exe' $s
[IO.File]::WriteAllText($f,'{"hostRules":[{"name":"browser","enabled":false,"sameSession":true,"processNames":["chrome.exe"],"imageContains":"","imageEndsWith":[]}]}')
[WhaleWindows]::ConfigureHosts($f)
Check $false 'C:\\Chrome\\chrome.exe' 'chrome.exe' $s
'PASS'
`;
  const file=path.join(dir,'rules.ps1');fs.writeFileSync(file,script);
  assert.match(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',windowsHide:true}),/PASS/);
});
