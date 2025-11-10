import { homedir } from 'os';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.sync-config');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export async function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

export async function loadConfig() {
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveConfig(config) {
  await ensureConfigDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfigPath() {
  return CONFIG_FILE;
}

export function getConfigDir() {
  return CONFIG_DIR;
}

export function getRepoDir() {
  return join(CONFIG_DIR, 'repo');
}

export function resolveBasePath(config, relativePath) {
  const baseDir = config.baseDir || '~';
  const expandedBase = baseDir === '~' ? homedir() : baseDir;
  return join(expandedBase, relativePath);
}

export function getRelativePath(config, absolutePath) {
  const baseDir = config.baseDir || '~';
  const expandedBase = baseDir === '~' ? homedir() : baseDir;
  
  // 絶対パスから基底ディレクトリを取り除く
  if (absolutePath.startsWith(expandedBase)) {
    return absolutePath.slice(expandedBase.length + 1); // +1 for the separator
  }
  
  // 基底ディレクトリ外の場合はそのまま返す
  return absolutePath;
}
