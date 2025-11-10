import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

export async function calculateFileHash(filePath) {
  try {
    const content = await readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    return null;
  }
}

export async function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function copyFileWithDir(src, dest) {
  await ensureDir(dirname(dest));
  await copyFile(src, dest);
}

export function fileExists(filePath) {
  return existsSync(filePath);
}

export async function loadManifest(repoDir) {
  const manifestPath = join(repoDir, '.sync-manifest.json');
  try {
    const data = await readFile(manifestPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { files: [] };
    }
    throw error;
  }
}

export async function saveManifest(repoDir, manifest) {
  const manifestPath = join(repoDir, '.sync-manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export function generateFileId(filePath) {
  // ファイルパスから安全なIDを生成
  return filePath
    .replace(/^\//, '')
    .replace(/^~\//, 'home_')
    .replace(/\//g, '_')
    .replace(/\./g, '_');
}
