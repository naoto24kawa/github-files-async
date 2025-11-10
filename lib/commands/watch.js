import { watch } from 'fs';
import { spawn, exec } from 'child_process';
import { writeFile, readFile, unlink, copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { loadConfig, getConfigDir, getRepoDir, resolveBasePath } from '../utils/config.js';
import { loadManifest } from '../utils/files.js';
import { success, info, warning, error, bold } from '../utils/prompt.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// ========================================
// Autostart 機能
// ========================================

// プラットフォーム別の設定
const PLATFORMS = {
  darwin: {
    name: 'macOS',
    serviceFile: 'com.github-files-sync.watch.plist',
    targetDir: join(homedir(), 'Library', 'LaunchAgents'),
    get targetPath() {
      return join(this.targetDir, this.serviceFile);
    },
    async enable(sourcePath, targetPath) {
      // LaunchAgents ディレクトリを作成
      await mkdir(dirname(targetPath), { recursive: true });

      // plist ファイルをコピー
      await copyFile(sourcePath, targetPath);

      // サービスを登録
      await execAsync(`launchctl load "${targetPath}"`);

      // サービスを開始
      try {
        await execAsync('launchctl start com.github-files-sync.watch');
      } catch (err) {
        // 既に起動している場合はエラーを無視
      }
    },
    async disable(targetPath) {
      try {
        // サービスを停止
        await execAsync('launchctl stop com.github-files-sync.watch').catch(() => {});

        // サービスを登録解除
        await execAsync(`launchctl unload "${targetPath}"`);
      } catch (err) {
        // 既に停止している場合はエラーを無視
      }

      // ファイルを削除
      if (existsSync(targetPath)) {
        await unlink(targetPath);
      }
    },
    async status(targetPath) {
      if (!existsSync(targetPath)) {
        return { enabled: false };
      }

      try {
        const { stdout } = await execAsync('launchctl list | grep github-files-sync');
        return {
          enabled: true,
          running: stdout.trim().length > 0
        };
      } catch {
        return { enabled: true, running: false };
      }
    }
  },
  linux: {
    name: 'Linux',
    serviceFile: 'github-files-sync-watch.service',
    targetDir: join(homedir(), '.config', 'systemd', 'user'),
    get targetPath() {
      return join(this.targetDir, this.serviceFile);
    },
    async enable(sourcePath, targetPath) {
      // systemd/user ディレクトリを作成
      await mkdir(dirname(targetPath), { recursive: true });

      // service ファイルをコピー
      await copyFile(sourcePath, targetPath);

      // デーモンをリロード
      await execAsync('systemctl --user daemon-reload');

      // サービスを有効化
      await execAsync('systemctl --user enable github-files-sync-watch.service');

      // サービスを開始
      try {
        await execAsync('systemctl --user start github-files-sync-watch.service');
      } catch (err) {
        // 既に起動している場合はエラーを無視
      }
    },
    async disable(targetPath) {
      try {
        // サービスを停止
        await execAsync('systemctl --user stop github-files-sync-watch.service').catch(() => {});

        // サービスを無効化
        await execAsync('systemctl --user disable github-files-sync-watch.service').catch(() => {});
      } catch (err) {
        // エラーを無視
      }

      // ファイルを削除
      if (existsSync(targetPath)) {
        await unlink(targetPath);
      }

      // デーモンをリロード
      try {
        await execAsync('systemctl --user daemon-reload');
      } catch {
        // エラーを無視
      }
    },
    async status(targetPath) {
      if (!existsSync(targetPath)) {
        return { enabled: false };
      }

      try {
        const { stdout } = await execAsync('systemctl --user is-enabled github-files-sync-watch.service');
        const enabled = stdout.trim() === 'enabled';

        let running = false;
        try {
          const { stdout: activeStdout } = await execAsync('systemctl --user is-active github-files-sync-watch.service');
          running = activeStdout.trim() === 'active';
        } catch {
          running = false;
        }

        return { enabled, running };
      } catch {
        return { enabled: false };
      }
    }
  }
};

function getPlatformConfig() {
  const currentPlatform = platform();

  if (currentPlatform === 'darwin') {
    return PLATFORMS.darwin;
  } else if (currentPlatform === 'linux') {
    return PLATFORMS.linux;
  } else {
    throw new Error(`Unsupported platform: ${currentPlatform}. Auto-start is only supported on macOS and Linux.`);
  }
}

function getSourcePath() {
  // autostart ディレクトリのパスを取得
  // __dirname は lib/commands/ なので、2階層上がって autostart/ に移動
  return join(__dirname, '..', '..', 'autostart');
}

async function enableAutostart() {
  const platformConfig = getPlatformConfig();
  const sourcePath = join(getSourcePath(), platformConfig.serviceFile);
  const targetPath = platformConfig.targetPath;

  // ソースファイルが存在するか確認
  if (!existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  // 既に有効化されているか確認
  if (existsSync(targetPath)) {
    console.log(warning('Auto-start is already enabled.'));
    console.log(info('Run "gfs watch autostart disable" to disable it first.'));
    return;
  }

  console.log(info(`Enabling auto-start on ${platformConfig.name}...`));

  try {
    await platformConfig.enable(sourcePath, targetPath);

    console.log(success('Auto-start enabled successfully!'));
    console.log(info(`Service file: ${targetPath}`));
    console.log('\n' + bold('What happens now:'));
    console.log('  ✓ File watching will start automatically when you log in');
    console.log('  ✓ Your files will be synced to GitHub automatically');
    console.log('\n' + info('Run "gfs watch autostart status" to check the status.'));
  } catch (err) {
    throw new Error(`Failed to enable auto-start: ${err.message}`);
  }
}

async function disableAutostart() {
  const platformConfig = getPlatformConfig();
  const targetPath = platformConfig.targetPath;

  if (!existsSync(targetPath)) {
    console.log(warning('Auto-start is not enabled.'));
    return;
  }

  console.log(info(`Disabling auto-start on ${platformConfig.name}...`));

  try {
    await platformConfig.disable(targetPath);

    console.log(success('Auto-start disabled successfully!'));
    console.log(info('File watching will no longer start automatically on login.'));
    console.log('\n' + info('You can still use "gfs watch start" to manually start watching.'));
  } catch (err) {
    throw new Error(`Failed to disable auto-start: ${err.message}`);
  }
}

async function statusAutostart() {
  const platformConfig = getPlatformConfig();
  const targetPath = platformConfig.targetPath;

  console.log(bold(`Auto-start Status (${platformConfig.name}):`));
  console.log(info(`Service file: ${targetPath}`));

  const status = await platformConfig.status(targetPath);

  if (!status.enabled) {
    console.log('\n' + info('Status: ') + warning('Not enabled'));
    console.log('\n' + info('Run "gfs watch autostart enable" to enable auto-start.'));
  } else {
    console.log('\n' + info('Status: ') + success('Enabled'));

    if (status.running !== undefined) {
      if (status.running) {
        console.log(info('Service: ') + success('Running'));
      } else {
        console.log(info('Service: ') + warning('Not running'));
      }
    }

    console.log('\n' + bold('What this means:'));
    console.log('  ✓ File watching will start automatically when you log in');
    console.log('  ✓ Your files will be synced to GitHub automatically');
    console.log('\n' + info('Run "gfs watch autostart disable" to disable auto-start.'));
  }
}

export async function watchCommand(subCommand, ...args) {
  try {
    // デーモンモード（内部使用）
    if (subCommand === '--daemon') {
      await runDaemon();
      return;
    }

    // autostart サブコマンド
    if (subCommand === 'autostart') {
      const autostartSubCommand = args[0];
      switch (autostartSubCommand) {
        case 'enable':
          await enableAutostart();
          break;
        case 'disable':
          await disableAutostart();
          break;
        case 'status':
          await statusAutostart();
          break;
        case undefined:
        case 'help':
          console.log(bold('Usage:'));
          console.log('  gfs watch autostart enable   - Enable auto-start on login');
          console.log('  gfs watch autostart disable  - Disable auto-start');
          console.log('  gfs watch autostart status   - Check auto-start status');
          console.log('\n' + info('Auto-start is supported on macOS and Linux.'));
          break;
        default:
          console.log(warning(`Unknown autostart subcommand: ${autostartSubCommand}`));
          console.log('Run "gfs watch autostart help" for usage information.');
      }
      return;
    }

    // 通常の watch コマンド
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
        console.log('  gfs watch start              - Start watching files');
        console.log('  gfs watch stop               - Stop watching files');
        console.log('  gfs watch status             - Check watch status');
        console.log('  gfs watch autostart enable   - Enable auto-start on login');
        console.log('  gfs watch autostart disable  - Disable auto-start');
        console.log('  gfs watch autostart status   - Check auto-start status');
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
