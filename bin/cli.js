#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import commands
import { init } from '../lib/commands/init.js';
import { add } from '../lib/commands/add.js';
import { push } from '../lib/commands/push.js';
import { pull } from '../lib/commands/pull.js';
import { status } from '../lib/commands/status.js';
import { override } from '../lib/commands/override.js';
import { watchCommand } from '../lib/commands/watch.js';

const [,, command, ...args] = process.argv;

// Show help
function showHelp() {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '../package.json'), 'utf-8')
  );
  
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   GitHub Files Sync v${packageJson.version.padEnd(37)}║
║   Simple file synchronization using GitHub as storage   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

\x1b[1mUSAGE:\x1b[0m
  \x1b[36mgfs\x1b[0m <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  \x1b[36minit\x1b[0m <github-repo-url>            Initialize sync with GitHub repository
  \x1b[36madd\x1b[0m <file-path>                   Add file to sync list
  \x1b[36mpush\x1b[0m                              Push local files to GitHub
  \x1b[36mpull\x1b[0m                              Pull files from GitHub to local
  \x1b[36mstatus\x1b[0m                            Show sync status
  \x1b[36mwatch\x1b[0m <start|stop|status>        Watch files and auto-push changes
  \x1b[36mwatch autostart\x1b[0m <enable|disable>  Enable/disable auto-start on login
  \x1b[36moverride\x1b[0m <file-id> <path>         Override file path for this machine
  \x1b[36mhelp\x1b[0m                              Show this help message

\x1b[1mEXAMPLES:\x1b[0m
  \x1b[2m# Initialize with your repository\x1b[0m
  $ gfs init git@github.com:user/sync-storage.git

  \x1b[2m# Add files to sync\x1b[0m
  $ gfs add ~/.zshrc
  $ gfs add ~/.gitconfig

  \x1b[2m# Push changes to GitHub\x1b[0m
  $ gfs push

  \x1b[2m# Pull changes on another machine\x1b[0m
  $ gfs pull

  \x1b[2m# Override path on specific machine\x1b[0m
  $ gfs override home__zshrc ~/my-custom-zshrc

\x1b[1mLEARN MORE:\x1b[0m
  Repository: https://github.com/naoto24kawa/github-files-sync
  Issues:     https://github.com/naoto24kawa/github-files-sync/issues
  `);
}

async function main() {
  try {
    switch(command) {
      case 'init':
        await init(args[0]);
        break;
      case 'add':
        await add(args[0]);
        break;
      case 'push':
        await push();
        break;
      case 'pull':
        await pull();
        break;
      case 'status':
        await status();
        break;
      case 'watch':
        await watchCommand(args[0], args[1]);
        break;
      case 'override':
        await override(args[0], args[1]);
        break;
      case 'help':
      case '--help':
      case '-h':
      case undefined:
        showHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run "gfs help" for usage information.');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
