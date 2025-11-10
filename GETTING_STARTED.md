# Getting Started

## Prerequisites

- Node.js >= 18.0.0
- Git
- GitHub account and repository

## Installation

### Local Development

```bash
cd /Users/nishikawa/projects/naoto24kawa/github-files-async
npm link
```

### From npm (when published)

```bash
npm install -g github-files-sync
```

## Quick Start

### 1. Create a GitHub repository for storage

Go to GitHub and create a new repository (e.g., `my-sync-storage`)

### 2. Initialize

```bash
gfs init git@github.com:username/my-sync-storage.git
```

This will:
- Clone the repository to `~/.sync-config/repo`
- Create initial configuration at `~/.sync-config/config.json`

### 3. Add files to sync

```bash
gfs add ~/.zshrc
gfs add ~/.gitconfig
gfs add ~/scripts/deploy.sh
```

### 4. Push to GitHub

```bash
gfs push
```

### 5. On another machine

```bash
# Initialize with the same repository
gfs init git@github.com:username/my-sync-storage.git

# Pull files
gfs pull
```

## Example Workflow

### First machine setup

```bash
# Initialize
gfs init git@github.com:naoto/dotfiles-storage.git

# Add your dotfiles
gfs add ~/.zshrc
gfs add ~/.vimrc
gfs add ~/.gitconfig

# Check status
gfs status

# Push to GitHub
gfs push
```

### Second machine setup

```bash
# Initialize with same repo
gfs init git@github.com:naoto/dotfiles-storage.git

# Pull files
gfs pull

# Your files are now synced!
```

### Regular usage

```bash
# After modifying files on machine A
gfs add ~/.zshrc  # Re-add if changed
gfs push

# On machine B
gfs pull
```

### Machine-specific paths

If you need different paths on different machines:

```bash
# On Machine A (default paths)
gfs pull  # Files sync to default locations

# On Machine B (custom paths)
gfs override home__zshrc ~/custom/.zshrc
gfs override scripts_deploy /opt/scripts/deploy.sh
gfs pull  # Files sync to custom locations
```

The override settings are stored locally and won't affect other machines.

## Configuration

### Local config: `~/.sync-config/config.json`

```json
{
  "repository": "git@github.com:username/sync-storage.git",
  "baseDir": "~",
  "localMappings": {
    "home__zshrc": ".zshrc",
    "home__gitconfig": ".gitconfig"
  }
}
```

**Key points:**
- `baseDir`: Base directory for relative paths (default: `~` = home directory)
- `localMappings`: Maps file IDs to relative paths from baseDir
- This allows the same config to work on different machines with different usernames

### Repository structure: `~/.sync-config/repo/`

```
repo/
├── .sync-manifest.json
└── files/
    ├── home__zshrc
    └── home__gitconfig
```

### Manifest: `.sync-manifest.json`

```json
{
  "files": [
    {
      "id": "home__zshrc",
      "relativePath": ".zshrc",
      "lastModified": "2025-11-10T10:00:00Z",
      "hash": "abc123..."
    }
  ]
}
```

**Key points:**
- `relativePath`: Path relative to baseDir (not absolute path)
- Works across different machines regardless of username
- Allows flexible base directory configuration

## Troubleshooting

### Permission denied (publickey)

Make sure your SSH key is added to GitHub:

```bash
ssh-add ~/.ssh/id_rsa
ssh -T git@github.com
```

### Files not syncing

Check status:

```bash
gfs status
```

Re-add the file:

```bash
gfs add ~/.zshrc
gfs push
```

### Reset configuration

```bash
rm -rf ~/.sync-config
gfs init git@github.com:username/sync-storage.git
```

## Tips

- Use `gfs status` regularly to check sync state
- Commit messages are automatically generated
- Files are compared by hash to avoid unnecessary copies
- Original directory structure is not preserved (files are flattened)

## Cross-Machine Compatibility

The tool uses relative paths and local configuration to ensure compatibility across different machines:

### Same user, different username

Machine A (macOS):
- Username: `john`
- Home: `/Users/john`
- File: `/Users/john/.zshrc`

Machine B (Linux):
- Username: `jane`  
- Home: `/home/jane`
- File: `/home/jane/.zshrc`

Both machines use the same relative path `.zshrc` and `baseDir: "~"`, so the configuration is portable.

### Different file locations per machine

Machine A:
```json
{
  "localMappings": {
    "scripts_deploy": "scripts/deploy.sh"
  }
}
```
Resolves to: `/Users/john/scripts/deploy.sh`

Machine B:
```json
{
  "localMappings": {
    "scripts_deploy": "work/deploy.sh"
  }
}
```
Resolves to: `/home/jane/work/deploy.sh`

Use `gfs override <file-id> <new-path>` to set machine-specific paths.

### Custom base directory

You can also set a custom base directory by editing `~/.sync-config/config.json`:

```json
{
  "baseDir": "/path/to/project",
  "localMappings": {
    "config_file": "config/settings.json"
  }
}
```

This will resolve to `/path/to/project/config/settings.json`.
