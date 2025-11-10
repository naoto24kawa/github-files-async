# GitHub Files Sync

Simple file synchronization tool using GitHub as storage.

## Features

- Sync scattered files across multiple machines
- Use GitHub as central storage
- Simple CLI interface
- No symbolic links - direct file copy
- Minimal dependencies (Node.js built-ins only)

## Installation

```bash
npm install -g github-files-sync
```

## Usage

### Initialize

```bash
gfs init <github-repo-url>
```

### Add files to sync

```bash
gfs add ~/.zshrc
gfs add ~/scripts/deploy.sh
```

### Push files to GitHub

```bash
gfs push
```

### Pull files from GitHub

```bash
gfs pull
```

### Check status

```bash
gfs status
```

### Auto-sync with file watching

Watch files and automatically push changes to GitHub:

```bash
# Start watching
gfs watch start

# Check watch status
gfs watch status

# Stop watching
gfs watch stop
```

### Override file path on specific machine

If you need a different path for a file on a specific machine:

```bash
gfs override home__zshrc ~/my-custom-zshrc
gfs pull  # Sync file to new location
```

**Note:** Path overrides are stored locally and NOT synced to other machines.

## Configuration

Configuration is stored in `~/.sync-config/config.json`

```json
{
  "repository": "git@github.com:user/sync-storage.git",
  "baseDir": "~",
  "localMappings": {
    "home__zshrc": ".zshrc",
    "home_scripts_deploy_sh": "work/scripts/deploy.sh"
  }
}
```

**Key Features:**
- Files are stored using relative paths from `baseDir` (default: home directory)
- `localMappings` can override paths on a per-machine basis
- Configuration is **local only** and NOT synced to other machines
- This allows different machines to have different file locations for the same synced files

**Example:** On Machine A, `scripts_deploy_sh` → `~/scripts/deploy.sh`, but on Machine B it could be → `~/work/scripts/deploy.sh`

## Repository Structure

```
sync-storage/
├── .sync-manifest.json
└── files/
    ├── home__zshrc
    └── home_scripts_deploy_sh
```

**Manifest format (.sync-manifest.json):**
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

## Auto-start on Boot

### macOS (launchd)

1. Copy the plist file to LaunchAgents:

```bash
cp __docs__/autostart/com.github-files-sync.watch.plist ~/Library/LaunchAgents/
```

2. Load the service:

```bash
launchctl load ~/Library/LaunchAgents/com.github-files-sync.watch.plist
```

3. Start the service:

```bash
launchctl start com.github-files-sync.watch
```

**To stop auto-start:**

```bash
launchctl unload ~/Library/LaunchAgents/com.github-files-sync.watch.plist
```

### Linux (systemd)

1. Copy the service file:

```bash
mkdir -p ~/.config/systemd/user
cp __docs__/autostart/github-files-sync-watch.service ~/.config/systemd/user/
```

2. Enable and start the service:

```bash
systemctl --user enable github-files-sync-watch.service
systemctl --user start github-files-sync-watch.service
```

3. Check status:

```bash
systemctl --user status github-files-sync-watch.service
```

**To stop auto-start:**

```bash
systemctl --user stop github-files-sync-watch.service
systemctl --user disable github-files-sync-watch.service
```

## License

MIT
