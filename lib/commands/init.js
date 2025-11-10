import { existsSync } from 'fs';
import { homedir } from 'os';
import { loadConfig, saveConfig, getRepoDir } from '../utils/config.js';
import { gitClone, isGitRepo } from '../utils/git.js';
import { ensureDir } from '../utils/files.js';
import { 
  createInterface, 
  question, 
  confirm, 
  closeInterface,
  printBox,
  success,
  info,
  warning,
  bold,
  colorize,
  colors
} from '../utils/prompt.js';

export async function init(repoUrl) {
  const rl = createInterface();

  try {
    // ウェルカムメッセージ
    console.log('\n' + colorize('═'.repeat(60), colors.cyan));
    console.log(bold('  GitHub Files Sync - Setup Wizard'));
    console.log(colorize('═'.repeat(60), colors.cyan) + '\n');

    // 既存の設定をチェック
    const existingConfig = await loadConfig();
    if (existingConfig) {
      console.log(warning('Configuration already exists'));
      console.log(info(`Current repository: ${existingConfig.repository}\n`));
      
      const shouldReinit = await confirm(rl, 'Do you want to reinitialize?', false);
      if (!shouldReinit) {
        console.log('\n' + info('Setup cancelled.'));
        closeInterface(rl);
        return;
      }
      console.log('');
    }

    // リポジトリURLの入力
    let repository = repoUrl;
    if (!repository) {
      console.log(bold('Step 1: Repository Configuration\n'));
      console.log('Enter your GitHub repository URL for storing synced files.');
      console.log(colorize('Example: git@github.com:username/sync-storage.git', colors.dim));
      console.log(colorize('      or: https://github.com/username/sync-storage.git\n', colors.dim));
      
      while (!repository) {
        repository = await question(rl, 'Repository URL: ');
        if (!repository) {
          console.log(colorize('Repository URL is required!\n', colors.red));
        }
      }
      console.log('');
    }

    // base directoryの設定
    console.log(bold('Step 2: Base Directory\n'));
    console.log('Set the base directory for relative file paths.');
    console.log(colorize('Default: ~ (home directory)', colors.dim));
    console.log(colorize(`         ${homedir()}\n`, colors.dim));
    
    const customBaseDir = await question(rl, 'Base directory [~]: ');
    const baseDir = customBaseDir || '~';
    console.log('');

    // 確認
    console.log(bold('Configuration Summary:\n'));
    printBox('Settings', 
      `Repository: ${repository}\n` +
      `Base Directory: ${baseDir}\n` +
      `Config Location: ~/.sync-config/`
    );
    console.log('');

    const shouldContinue = await confirm(rl, 'Continue with these settings?', true);
    if (!shouldContinue) {
      console.log('\n' + info('Setup cancelled.'));
      closeInterface(rl);
      return;
    }

    console.log('');
    const repoDir = getRepoDir();

    // 既存のリポジトリディレクトリをチェック
    if (existsSync(repoDir)) {
      const isRepo = await isGitRepo(repoDir);
      if (isRepo) {
        console.log(info('Repository directory already exists. Using existing repository...'));
      }
    } else {
      console.log(info('Cloning repository...'));
      try {
        await gitClone(repository, repoDir);
        console.log(success('Repository cloned successfully.'));
      } catch (error) {
        throw new Error(`Failed to clone repository: ${error.message}`);
      }
    }

    // files ディレクトリを作成
    const filesDir = `${repoDir}/files`;
    await ensureDir(filesDir);

    // 設定を保存
    const config = {
      repository: repository,
      baseDir: baseDir,
      localMappings: {}
    };
    await saveConfig(config);

    console.log('');
    console.log(colorize('═'.repeat(60), colors.green));
    console.log(success('✓ Initialization complete!'));
    console.log(colorize('═'.repeat(60), colors.green));

    console.log('\n' + bold('📘 Quick Start Guide:\n'));

    console.log(bold('Step 1: Add files to sync'));
    console.log('  Add your dotfiles or any files you want to sync:');
    console.log(colorize('  $ gfs add ~/.zshrc', colors.cyan));
    console.log(colorize('  $ gfs add ~/.gitconfig', colors.cyan));
    console.log(colorize('  $ gfs add ~/scripts/deploy.sh\n', colors.cyan));

    console.log(bold('Step 2: Check what will be synced'));
    console.log('  Verify the files are added correctly:');
    console.log(colorize('  $ gfs status\n', colors.cyan));

    console.log(bold('Step 3: Push to GitHub'));
    console.log('  Upload your files to the repository:');
    console.log(colorize('  $ gfs push\n', colors.cyan));

    console.log(colorize('─'.repeat(60), colors.dim));
    console.log(bold('🔄 Auto-Sync (Optional):\n'));

    console.log('  Enable automatic push when files change:');
    console.log(colorize('  $ gfs watch start', colors.cyan));
    console.log('  → Files will be automatically pushed to GitHub on save\n');

    console.log('  Check watch status:');
    console.log(colorize('  $ gfs watch status\n', colors.cyan));

    console.log('  Stop watching:');
    console.log(colorize('  $ gfs watch stop\n', colors.cyan));

    console.log(colorize('─'.repeat(60), colors.dim));
    console.log(bold('💻 On Another Machine:\n'));

    console.log('  1. Initialize with the same repository:');
    console.log(colorize(`     $ gfs init ${repository}\n`, colors.cyan));

    console.log('  2. Pull your files:');
    console.log(colorize('     $ gfs pull\n', colors.cyan));

    console.log('  3. (Optional) Override paths if different:');
    console.log(colorize('     $ gfs override home__zshrc ~/custom-path/.zshrc\n', colors.cyan));

    console.log(colorize('─'.repeat(60), colors.dim));
    console.log(bold('📖 Common Workflows:\n'));

    console.log(colorize('  • Sync a config file:', colors.dim));
    console.log('    $ gfs add ~/.vimrc && gfs push\n');

    console.log(colorize('  • Update synced file:', colors.dim));
    console.log('    Edit file → $ gfs add ~/.vimrc → $ gfs push\n');

    console.log(colorize('  • Pull latest changes:', colors.dim));
    console.log('    $ gfs pull\n');

    console.log(colorize('═'.repeat(60), colors.green));
    console.log(info('📚 For more help, visit: https://github.com/naoto24kawa/github-files-sync'));
    console.log(colorize('═'.repeat(60), colors.green) + '\n');

  } finally {
    closeInterface(rl);
  }
}

