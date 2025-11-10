import { join } from 'path';
import { loadConfig, saveConfig, getRepoDir, resolveBasePath } from '../utils/config.js';
import { gitPull } from '../utils/git.js';
import { loadManifest, copyFileWithDir, calculateFileHash, fileExists } from '../utils/files.js';
import { info, success, warning, bold } from '../utils/prompt.js';

export async function pull() {
  // 設定をロード
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not initialized. Run "gfs init <repo-url>" first.');
  }

  const repoDir = getRepoDir();

  // Git pull実行
  console.log(info('Pulling from GitHub...'));
  try {
    await gitPull(repoDir);
    console.log(success('Pull completed.'));
  } catch (error) {
    throw new Error(`Failed to pull: ${error.message}`);
  }

  // manifestを読み込み
  const manifest = await loadManifest(repoDir);
  if (!manifest.files || manifest.files.length === 0) {
    console.log(warning('No files to sync.'));
    return;
  }

  // ファイルをコピー
  console.log('\n' + bold('Syncing files...'));
  let syncedCount = 0;
  let skippedCount = 0;

  for (const fileEntry of manifest.files) {
    const { id, relativePath, hash: remoteHash } = fileEntry;
    const sourcePath = join(repoDir, 'files', id);
    
    // ローカル設定を優先、なければmanifestの相対パスを使用
    let localRelativePath;
    if (config.localMappings && config.localMappings[id]) {
      // ローカル設定が存在する場合（マシン固有のパス）
      localRelativePath = config.localMappings[id];
    } else {
      // ローカル設定がない場合はmanifestのデフォルトパスを使用
      localRelativePath = relativePath;
    }
    
    const targetPath = resolveBasePath(config, localRelativePath);

    // リポジトリにファイルが存在するかチェック
    if (!fileExists(sourcePath)) {
      console.log(warning(`${id}: File not found in repository, skipping`));
      skippedCount++;
      continue;
    }

    // ローカルファイルが存在し、ハッシュが同じ場合はスキップ
    if (fileExists(targetPath)) {
      const localHash = await calculateFileHash(targetPath);
      const sourceHash = await calculateFileHash(sourcePath);
      
      if (localHash === sourceHash) {
        console.log(`  ✓ ${id}: Already up to date`);
        skippedCount++;
        continue;
      }
    }

    // ファイルをコピー
    try {
      await copyFileWithDir(sourcePath, targetPath);
      console.log(success(`${id} → ${targetPath}`));
      syncedCount++;
      
      // ローカル設定がまだない場合は追加
      if (!config.localMappings) {
        config.localMappings = {};
      }
      if (!config.localMappings[id]) {
        config.localMappings[id] = localRelativePath;
        await saveConfig(config);
      }
    } catch (error) {
      console.log(warning(`${id}: Failed to copy (${error.message})`));
      skippedCount++;
    }
  }

  console.log('\n' + bold('Summary:'));
  console.log(`  ${success(syncedCount + ' files synced')}`);
  console.log(`  ${skippedCount} files skipped`);
}
