import { resolve } from 'path';
import { homedir } from 'os';
import { loadConfig, saveConfig, getRepoDir, getRelativePath, resolveBasePath } from '../utils/config.js';
import { loadManifest, fileExists } from '../utils/files.js';
import { success, info, warning, bold } from '../utils/prompt.js';

export async function override(fileId, newPath) {
  if (!fileId) {
    throw new Error('File ID is required');
  }
  
  if (!newPath) {
    throw new Error('New path is required');
  }

  // 設定をロード
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not initialized. Run "gfs init <repo-url>" first.');
  }

  // manifestをロード
  const repoDir = getRepoDir();
  const manifest = await loadManifest(repoDir);
  
  // ファイルIDが存在するかチェック
  const fileEntry = manifest.files?.find(f => f.id === fileId);
  if (!fileEntry) {
    throw new Error(`File ID not found: ${fileId}\nRun "gfs status" to see available file IDs.`);
  }

  // 新しいパスを解決
  const expandedPath = newPath.startsWith('~') 
    ? newPath.replace('~', homedir())
    : newPath;
  const absolutePath = resolve(expandedPath);

  // 相対パスに変換
  const relativePath = getRelativePath(config, absolutePath);

  // ローカル設定を初期化
  if (!config.localMappings) {
    config.localMappings = {};
  }

  // 以前の設定を表示
  const previousRelativePath = config.localMappings[fileId] || fileEntry.relativePath;
  const previousAbsolutePath = resolveBasePath(config, previousRelativePath);

  console.log('\n' + bold('Path Override:'));
  console.log(`  File ID:  ${fileId}`);
  console.log(`  Previous: ${previousAbsolutePath}`);
  console.log(`  New:      ${absolutePath}`);
  console.log(`  Relative: ${relativePath}`);

  // ローカル設定を更新
  config.localMappings[fileId] = relativePath;
  await saveConfig(config);

  console.log('\n' + success('Path override saved successfully!'));
  console.log(info('This override is local to this machine and will not be synced.'));
  console.log('\n' + info('Run "gfs pull" to sync the file to the new location.'));
}
