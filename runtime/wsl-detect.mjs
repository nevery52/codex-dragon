import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { listWslDistributions, validateWslConnection } from './wsl-source.mjs';

const run = promisify(execFile);
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";

// 本机直连模式：Windows 上的 codex.exe 同样提供 app-server，不必绕 WSL。
// 采集代理用 Electron 自带的 Node（ELECTRON_RUN_AS_NODE），因此不需要另装 Node。
export function detectLocalConnection({ root }) {
  const agentPath = path.join(root, 'runtime', 'wsl-agent.mjs');
  const nodePath = path.join(root, 'desktop-runtime', 'windows', 'electron', 'dist', 'electron.exe');
  if (!fs.existsSync(agentPath)) throw new Error('采集代理缺失');
  if (!fs.existsSync(nodePath)) throw new Error('Electron 运行时缺失');
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  if (!fs.existsSync(codexHome)) throw new Error('本机没有 Codex 数据目录');
  const candidates = [];
  const binDir = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (fs.existsSync(binDir)) {
    for (const item of fs.readdirSync(binDir, { withFileTypes: true })) {
      if (item.isFile() && /^codex\.exe$/i.test(item.name)) candidates.push(path.join(binDir, item.name));
      else if (item.isDirectory()) { const nested = path.join(binDir, item.name, 'codex.exe'); if (fs.existsSync(nested)) candidates.push(nested); }
    }
  }
  candidates.push(path.join(codexHome, 'plugins', '.plugin-appserver', 'codex.exe'));
  for (const entry of String(process.env.PATH || '').split(path.delimiter)) {
    if (entry) { const exe = path.join(entry, 'codex.exe'); if (fs.existsSync(exe)) candidates.push(exe); }
  }
  const codexBin = candidates.find(file => { try { return fs.statSync(file).isFile(); } catch { return false; } });
  if (!codexBin) throw new Error('未找到本机 codex.exe');
  return validateWslConnection({ distribution: 'local', user: os.userInfo().username, agentPath, nodePath, codexBin, codexHome });
}

export async function detectWslConnection({ root, distribution = '' }) {
  // 首选本机直连（无需 WSL）；不可用时才回落到 WSL 探测。
  if (!distribution || distribution === 'local') {
    try { return detectLocalConnection({ root }); } catch { /* 继续尝试 WSL */ }
  }
  const distributions = distribution && distribution !== 'local' ? [distribution] : await listWslDistributions();
  if (!distributions.length) throw new Error('未发现 WSL 发行版，请先安装并启动 WSL');
  const probe = `const fs=require('node:fs'),os=require('node:os');
    if(process.platform!=='linux'||Number(process.versions.node.split('.')[0])<24)process.exit(2);
    const [codexBin,codexHome]=process.argv.slice(1);if(!codexBin||!fs.existsSync(codexHome))process.exit(3);
    console.log(JSON.stringify({user:os.userInfo().username,nodePath:process.execPath,codexBin,codexHome}));`;
  const script = `export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
    dragon_node=$(command -v node || true)
    if [ -z "$dragon_node" ]; then for dragon_candidate in "$HOME"/.nvm/versions/node/*/bin/node; do if [ -x "$dragon_candidate" ]; then dragon_node="$dragon_candidate"; fi; done; fi
    dragon_codex=$(command -v codex || true)
    if [ -z "$dragon_codex" ] && [ -n "$dragon_node" ]; then dragon_codex="$(dirname "$dragon_node")/codex"; fi
    [ -x "$dragon_node" ] && [ -x "$dragon_codex" ] || exit 4
    "$dragon_node" -e ${quote(probe)} "$dragon_codex" "\${CODEX_HOME:-$HOME/.codex}"`;
  for (const name of distributions) {
    try {
      const options = { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 };
      const { stdout } = await run('wsl.exe', ['--distribution', name, '--exec', '/bin/sh', '-lc', script], options);
      const info = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
      const agent = await run('wsl.exe', ['--distribution', name, '--user', info.user, '--exec', 'wslpath', '-u', path.join(root, 'runtime', 'wsl-agent.mjs')], options);
      return validateWslConnection({ ...info, distribution: name, agentPath: agent.stdout.trim() });
    } catch { /* Try the next installed distribution; advanced fields remain available. */ }
  }
  throw new Error('未找到可用的 Codex 和 Node 24，请在高级连接设置中指定路径');
}
