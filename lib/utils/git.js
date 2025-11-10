import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function gitClone(repoUrl, targetDir) {
  await execAsync(`git clone ${repoUrl} ${targetDir}`);
}

export async function gitPull(repoDir) {
  await execAsync('git pull', { cwd: repoDir });
}

export async function gitPush(repoDir, message = 'sync files') {
  try {
    // 現在の日時を取得してコミットメッセージに追加
    const now = new Date();
    const timestamp = now.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-');

    const commitMessage = `${message} - ${timestamp}`;

    await execAsync('git add .', { cwd: repoDir });
    await execAsync(`git commit -m "${commitMessage}"`, { cwd: repoDir });
    await execAsync('git push', { cwd: repoDir });
  } catch (error) {
    // Nothing to commit の場合はエラーを無視
    if (!error.message.includes('nothing to commit')) {
      throw error;
    }
  }
}

export async function gitStatus(repoDir) {
  const { stdout } = await execAsync('git status --short', { cwd: repoDir });
  return stdout;
}

export async function isGitRepo(dir) {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: dir });
    return true;
  } catch {
    return false;
  }
}
