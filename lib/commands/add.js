import { resolve } from 'path';
import { homedir } from 'os';
import { loadConfig, saveConfig, getRepoDir, getRelativePath } from '../utils/config.js';
import { fileExists, generateFileId, copyFileWithDir, calculateFileHash, loadManifest, saveManifest } from '../utils/files.js';
import { success, info, warning } from '../utils/prompt.js';

export async function add(filePath) {
  if (!filePath) {
    throw new Error('File path is required');
  }

  // 設定をロード
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not initialized. Run "gfs init <repo-url>" first.');
  }

  // ファイルパスを解決（~を展開）
  const expandedPath = filePath.startsWith('~') 
    ? filePath.replace('~', homedir())
    : filePath;
  const absolutePath = resolve(expandedPath);

  // ファイルの存在確認
  if (!fileExists(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  // ファイルIDを生成
  const fileId = generateFileId(absolutePath);
  
  // 相対パスを計算
  const relativePath = getRelativePath(config, absolutePath);

  // 既に追加されているかチェック
  if (config.localMappings[fileId]) {
    console.log(warning(`File already added: ${absolutePath}`));
    return;
  }

  // リポジトリディレクトリにファイルをコピー
  const repoDir = getRepoDir();
  const destPath = `${repoDir}/files/${fileId}`;
  
  console.log(info('Copying file to sync storage...'));
  await copyFileWithDir(absolutePath, destPath);

  // ハッシュを計算
  const hash = await calculateFileHash(absolutePath);

  // manifestを更新
  const manifest = await loadManifest(repoDir);
  manifest.files = manifest.files || [];
  
  // 既存エントリを削除
  manifest.files = manifest.files.filter(f => f.id !== fileId);
  
  // 新しいエントリを追加（相対パスで保存）
  manifest.files.push({
    id: fileId,
    relativePath: relativePath,
    lastModified: new Date().toISOString(),
    hash: hash
  });
  
  await saveManifest(repoDir, manifest);

  // ローカル設定を更新（相対パスで保存）
  config.localMappings[fileId] = relativePath;
  await saveConfig(config);

  console.log(success(`File added successfully!`));
  console.log(`  File:     ${absolutePath}`);
  console.log(`  ID:       ${fileId}`);
  console.log(`  Relative: ${relativePath}`);
  console.log('\n' + info('Run "gfs push" to upload to GitHub.'));
}
