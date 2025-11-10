import readline from 'readline';

export function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

export function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function confirm(rl, prompt, defaultValue = false) {
  const defaultStr = defaultValue ? 'Y/n' : 'y/N';
  const answer = await question(rl, `${prompt} (${defaultStr}): `);
  
  if (!answer) return defaultValue;
  
  const normalized = answer.toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

export async function select(rl, prompt, choices) {
  console.log(prompt);
  choices.forEach((choice, index) => {
    console.log(`  ${index + 1}. ${choice.label}`);
  });
  
  while (true) {
    const answer = await question(rl, '\nSelect (1-' + choices.length + '): ');
    const index = parseInt(answer) - 1;
    
    if (index >= 0 && index < choices.length) {
      return choices[index].value;
    }
    
    console.log('Invalid selection. Please try again.');
  }
}

export function closeInterface(rl) {
  rl.close();
}

// カラー出力用のヘルパー
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

export function colorize(text, color) {
  return `${color}${text}${colors.reset}`;
}

export function bold(text) {
  return colorize(text, colors.bright);
}

export function success(text) {
  return colorize(`✓ ${text}`, colors.green);
}

export function error(text) {
  return colorize(`✗ ${text}`, colors.red);
}

export function info(text) {
  return colorize(`ℹ ${text}`, colors.cyan);
}

export function warning(text) {
  return colorize(`⚠ ${text}`, colors.yellow);
}

export function printBox(title, content) {
  const lines = content.split('\n');
  const maxLength = Math.max(title.length, ...lines.map(l => l.length));
  const width = maxLength + 4;
  
  console.log('┌' + '─'.repeat(width) + '┐');
  console.log('│ ' + bold(title) + ' '.repeat(width - title.length - 1) + '│');
  console.log('├' + '─'.repeat(width) + '┤');
  
  lines.forEach(line => {
    console.log('│ ' + line + ' '.repeat(width - line.length - 1) + '│');
  });
  
  console.log('└' + '─'.repeat(width) + '┘');
}
