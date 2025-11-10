import { watch } from 'fs';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, getConfigDir, getRepoDir, resolveBasePath } from '../utils/config.js';
import { loadManifest } from '../utils/files.js';
import { success, info, warning, error, bold } from '../utils/prompt.js';

const PID_FILE = join(getConfigDir(), 'watch.pid');
const LOG_FILE = join(getConfigDir(), 'watch.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  // コンソールとログファイルの両方に出力
  console.log(message);

  // ログファイルに追記（非同期で、エラーは無視）
  import('fs/promises').then(({ appendFile }) => {
    appendFile(LOG_FILE, logMessage).catch(() => {});
  });
}

async function startWatch() {
  // 既に起動しているかチェック
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(await readFile(PID_FILE, 'utf-8'));
      // プロセスが実際に動いているか確認
      process.kill(pid, 0);
      console.log(warning('Watch is already running.'));
      console.log(info(`PID: ${pid}`));
      console.log(info('Run "gfs watch stop" to stop it.'));
      return;
    } catch (err) {
      // プロセスが存在しない場合はPIDファイルを削除
      await unlink(PID_FILE).catch(() => {});
    }
  }

  // 設定をロード
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not initialized. Run "gfs init <repo-url>" first.');
  }

  const repoDir = getRepoDir();
  const manifest = await loadManifest(repoDir);

  if (!manifest.files || manifest.files.length === 0) {
    console.log(warning('No files to watch.'));
    console.log(info('Run "gfs add <file>" to add files.'));
    return;
  }

  // バックグラウンドで起動
  const child = spawn(process.argv[0], [process.argv[1], 'watch', '--daemon'], {
    detached: true,
    stdio: 'ignore'
  });

  child.unref();

  // PIDを保存
  await writeFile(PID_FILE, child.pid.toString());

  console.log(success('File watching started!'));
  console.log(info(`PID: ${child.pid}`));
  console.log(info(`Watching ${manifest.files.length} file(s)`));
  console.log(info(`Log: ${LOG_FILE}`));
  console.log('\n' + bold('Monitored files:'));

  for (const fileEntry of manifest.files) {
    const relativePath = config.localMappings[fileEntry.id] || fileEntry.relativePath;
    const absolutePath = resolveBasePath(config, relativePath);
    console.log(`  - ${absolutePath}`);
  }

  console.log('\n' + info('Run "gfs watch stop" to stop watching.'));
}

async function stopWatch() {
  if (!existsSync(PID_FILE)) {
    console.log(warning('Watch is not running.'));
    return;
  }

  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf-8'));

    // プロセスを終了
    process.kill(pid, 'SIGTERM');

    // PIDファイルを削除
    await unlink(PID_FILE);

    console.log(success('File watching stopped.'));
  } catch (err) {
    if (err.code === 'ESRCH') {
      // プロセスが既に存在しない
      await unlink(PID_FILE).catch(() => {});
      console.log(warning('Watch process was not running.'));
    } else {
      throw err;
    }
  }
}

async function statusWatch() {
  if (!existsSync(PID_FILE)) {
    console.log(info('Watch status: ') + warning('Not running'));
    console.log('\n' + info('Run "gfs watch start" to start watching.'));
    return;
  }

  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf-8'));

    // プロセスが動いているか確認
    process.kill(pid, 0);

    console.log(info('Watch status: ') + success('Running'));
    console.log(info(`PID: ${pid}`));
    console.log(info(`Log: ${LOG_FILE}`));

    // 監視中のファイルリストを表示
    const config = await loadConfig();
    const repoDir = getRepoDir();
    const manifest = await loadManifest(repoDir);

    console.log('\n' + bold('Monitored files:'));
    for (const fileEntry of manifest.files) {
      const relativePath = config.localMappings[fileEntry.id] || fileEntry.relativePath;
      const absolutePath = resolveBasePath(config, relativePath);
      console.log(`  - ${absolutePath}`);
    }
  } catch (err) {
    if (err.code === 'ESRCH') {
      // プロセスが存在しない
      await unlink(PID_FILE).catch(() => {});
      console.log(info('Watch status: ') + warning('Not running (stale PID file removed)'));
    } else {
      throw err;
    }
  }
}

async function runDaemon() {
  log('File watching daemon started');

  const config = await loadConfig();
  const repoDir = getRepoDir();
  const manifest = await loadManifest(repoDir);

  const watchers = new Map();
  let pushTimeout = null;
  let isProcessing = false;

  // 変更検知時のハンドラ（デバウンス付き）
  const handleChange = (filePath) => {
    if (isProcessing) return;

    log(`File changed: ${filePath}`);

    // 連続した変更をまとめるため、500msのデバウンス
    if (pushTimeout) {
      clearTimeout(pushTimeout);
    }

    pushTimeout = setTimeout(async () => {
      isProcessing = true;
      log('Pushing changes to GitHub...');

      try {
        // gfs push を実行
        const { gitPush } = await import('../utils/git.js');
        await gitPush(repoDir);
        log('Push completed successfully');
      } catch (err) {
        log(`Push failed: ${err.message}`);
      } finally {
        isProcessing = false;
      }
    }, 500);
  };

  // 各ファイルを監視
  for (const fileEntry of manifest.files) {
    const relativePath = config.localMappings[fileEntry.id] || fileEntry.relativePath;
    const absolutePath = resolveBasePath(config, relativePath);

    if (existsSync(absolutePath)) {
      try {
        const watcher = watch(absolutePath, (eventType) => {
          if (eventType === 'change') {
            handleChange(absolutePath);
          }
        });

        watchers.set(fileEntry.id, watcher);
        log(`Watching: ${absolutePath}`);
      } catch (err) {
        log(`Failed to watch ${absolutePath}: ${err.message}`);
      }
    } else {
      log(`File not found: ${absolutePath}`);
    }
  }

  // 終了シグナルのハンドリング
  const cleanup = () => {
    log('Stopping file watching daemon');

    // すべてのwatcherを停止
    for (const watcher of watchers.values()) {
      watcher.close();
    }

    // PIDファイルを削除
    unlink(PID_FILE).catch(() => {});

    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  log(`Watching ${watchers.size} file(s)`);
}

export async function watchCommand(subCommand) {
  try {
    // デーモンモード（内部使用）
    if (subCommand === '--daemon') {
      await runDaemon();
      return;
    }

    // ユーザーコマンド
    switch (subCommand) {
      case 'start':
        await startWatch();
        break;
      case 'stop':
        await stopWatch();
        break;
      case 'status':
        await statusWatch();
        break;
      case undefined:
      case 'help':
        console.log(bold('Usage:'));
        console.log('  gfs watch start   - Start watching files');
        console.log('  gfs watch stop    - Stop watching files');
        console.log('  gfs watch status  - Check watch status');
        break;
      default:
        console.log(warning(`Unknown subcommand: ${subCommand}`));
        console.log('Run "gfs watch help" for usage information.');
    }
  } catch (err) {
    console.error(error('Error:'), err.message);
    process.exit(1);
  }
}
