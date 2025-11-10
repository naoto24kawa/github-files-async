import { join } from 'path';
import { loadConfig, getRepoDir, getConfigPath, resolveBasePath } from '../utils/config.js';
import { loadManifest, calculateFileHash, fileExists } from '../utils/files.js';
import { gitStatus } from '../utils/git.js';
import { bold, colorize, colors, info, success, warning } from '../utils/prompt.js';

export async function status() {
  // 設定をロード
  const config = await loadConfig();
  if (!config) {
    console.log(warning('Not initialized. Run "gfs init <repo-url>" first.'));
    return;
  }

  console.log('\n' + colorize('═'.repeat(60), colors.cyan));
  console.log(bold('  GitHub Files Sync - Status'));
  console.log(colorize('═'.repeat(60), colors.cyan) + '\n');

  console.log(bold('Configuration:'));
  console.log(`  Repository:      ${config.repository}`);
  console.log(`  Base Directory:  ${config.baseDir || '~'}`);
  console.log(`  Config File:     ${getConfigPath()}\n`);

  const repoDir = getRepoDir();

  // Git status
  console.log(bold('Git Status:'));
  try {
    const gitStatusOutput = await gitStatus(repoDir);
    if (gitStatusOutput.trim()) {
      console.log(gitStatusOutput);
    } else {
      console.log(success('Working tree clean\n'));
    }
  } catch (error) {
    console.log(warning('Unable to check git status\n'));
  }

  // manifestを読み込み
  const manifest = await loadManifest(repoDir);
  if (!manifest.files || manifest.files.length === 0) {
    console.log(warning('No files configured for sync.'));
    console.log('\n' + info('Run "gfs add <file>" to add files.\n'));
    return;
  }

  console.log(bold('Files:\n'));

  for (const fileEntry of manifest.files) {
    const { id, relativePath, hash: manifestHash } = fileEntry;
    
    // ローカル設定を優先、なければmanifestの相対パスを使用
    let localRelativePath;
    let pathSource;
    if (config.localMappings && config.localMappings[id]) {
      localRelativePath = config.localMappings[id];
      pathSource = colorize('local override', colors.yellow);
    } else {
      localRelativePath = relativePath;
      pathSource = colorize('default', colors.dim);
    }
    
    const targetPath = resolveBasePath(config, localRelativePath);
    const repoFilePath = join(repoDir, 'files', id);

    console.log(`  ${bold(id)}:`);
    console.log(`    Relative: ${localRelativePath} (${pathSource})`);
    console.log(`    Absolute: ${targetPath}`);

    // ローカルファイルの状態をチェック
    if (!fileExists(targetPath)) {
      console.log(`    Status:   ${warning('Local file not found')}`);
    } else {
      const localHash = await calculateFileHash(targetPath);
      const repoHash = fileExists(repoFilePath) 
        ? await calculateFileHash(repoFilePath) 
        : null;

      if (repoHash && localHash === repoHash) {
        console.log(`    Status:   ${success('Synced')}`);
      } else if (repoHash && localHash !== repoHash) {
        console.log(`    Status:   ${warning('Modified (not pushed)')}`);
      } else {
        console.log(`    Status:   ${warning('Not in repository')}`);
      }
    }
    console.log('');
  }

  console.log(colorize('─'.repeat(60), colors.dim));
  console.log(bold('Commands:'));
  console.log(`  ${colorize('gfs add <file>', colors.cyan)}             - Add a new file`);
  console.log(`  ${colorize('gfs override <id> <path>', colors.cyan)}   - Override file path for this machine`);
  console.log(`  ${colorize('gfs push', colors.cyan)}                   - Push changes to GitHub`);
  console.log(`  ${colorize('gfs pull', colors.cyan)}                   - Pull changes from GitHub`);
  console.log('');
}
