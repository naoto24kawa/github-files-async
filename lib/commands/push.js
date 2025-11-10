import { loadConfig, getRepoDir } from '../utils/config.js';
import { gitPush, gitStatus } from '../utils/git.js';
import { info, success, warning } from '../utils/prompt.js';

export async function push() {
  // 設定をロード
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not initialized. Run "gfs init <repo-url>" first.');
  }

  const repoDir = getRepoDir();

  // 変更があるかチェック
  console.log(info('Checking for changes...'));
  const status = await gitStatus(repoDir);
  
  if (!status.trim()) {
    console.log(warning('No changes to push.'));
    return;
  }

  console.log('\nChanges detected:');
  console.log(status);

  // プッシュ実行
  console.log(info('Pushing to GitHub...'));
  try {
    await gitPush(repoDir);
    console.log(success('Push completed successfully!'));
  } catch (error) {
    throw new Error(`Failed to push: ${error.message}`);
  }
}
