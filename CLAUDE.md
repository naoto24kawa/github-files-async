# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

GitHub Files Sync (gfs) は、GitHubをストレージとして使用するシンプルなファイル同期ツールです。複数のマシン間でドットファイルやスクリプトなどを同期でき、ファイル監視による自動プッシュ機能も備えています。

## 開発環境のセットアップ

### ローカル開発

```bash
# プロジェクトディレクトリで
npm link

# gfsコマンドが利用可能になります
gfs help
```

### 動作要件

- Node.js >= 18.0.0
- Git
- GitHubアカウントとリポジトリ

### 開発時のテスト

```bash
# ローカルでリンクした後、実際のコマンドをテスト
gfs init git@github.com:username/test-repo.git
gfs add ~/test.txt
gfs push
```

## アーキテクチャ

### ディレクトリ構造

```
bin/cli.js              # CLIエントリーポイント
lib/
  commands/             # 各コマンドの実装
    init.js             # リポジトリ初期化
    add.js              # ファイル追加
    push.js             # GitHub へのプッシュ
    pull.js             # GitHub からのプル
    status.js           # 同期状態の確認
    watch.js            # ファイル監視、自動プッシュ、自動起動設定の管理
    override.js         # マシン固有のパス設定
  utils/
    config.js           # 設定ファイルの読み書き
    git.js              # Git操作のラッパー
    files.js            # ファイル操作とマニフェスト管理
    prompt.js           # コンソール出力のフォーマット
autostart/              # 自動起動設定ファイル
  com.github-files-sync.watch.plist  # macOS用 (launchd)
  github-files-sync-watch.service    # Linux用 (systemd)
```

### コア設計原則

#### 1. 相対パスベースの設計

ファイルは絶対パスではなく`baseDir`からの相対パスで管理されます。これにより、異なるユーザー名やディレクトリ構造を持つマシン間でも設定を共有できます。

- **ローカル設定**: `~/.sync-config/config.json` (マシン固有、同期されない)
- **リポジトリ**: `~/.sync-config/repo/` (GitHubから clone)
- **マニフェスト**: `repo/.sync-manifest.json` (同期されるファイルのメタデータ)

#### 2. ファイルID生成

`lib/utils/files.js:generateFileId()` は、ファイルパスからユニークで安全なIDを生成します：

```javascript
// 例: ~/.zshrc → home__zshrc
//    ~/scripts/deploy.sh → home_scripts_deploy_sh
```

このIDはファイルの一意な識別子として使用され、`localMappings`でマシン固有のパスにマッピングできます。

#### 3. ファイル監視とデーモン

`lib/commands/watch.js` は2つのモードで動作します：

- **コマンドモード**: `watch start/stop/status` でデーモンを制御
- **デーモンモード**: `--daemon` フラグでバックグラウンドプロセスとして起動し、ファイル変更を監視

デーモンは：
- PIDを `~/.sync-config/watch.pid` に保存
- ログを `~/.sync-config/watch.log` に記録
- 変更検知から500msのデバウンス後に自動プッシュ

#### 4. Git操作の抽象化

`lib/utils/git.js` は `child_process.exec` をラップし、Promise化されたGit操作を提供します。タイムスタンプ付きのコミットメッセージを自動生成します。

#### 5. マシン間の互換性

- `baseDir: "~"` により、異なるホームディレクトリパスに対応
- `localMappings` により、同じファイルIDを異なるパスにマッピング可能
- 設定ファイルはローカルのみで、リポジトリには含まれない

### データフロー

#### Push フロー

1. ユーザーが `gfs add ~/file` を実行
2. `add.js`: ファイルをマニフェストに追加、repo/files/ にコピー
3. ユーザーが `gfs push` を実行
4. `push.js`: gitPush() を呼び出し
5. `git.js`: add, commit, push を実行

#### Pull フロー

1. ユーザーが `gfs pull` を実行
2. `pull.js`: gitPull() でリポジトリを更新
3. マニフェストを読み込み
4. 各ファイルのハッシュを比較
5. 変更があればローカルにコピー

#### Watch フロー

1. `gfs watch start` でデーモン起動
2. `fs.watch()` で各ファイルを監視
3. 変更検知 → デバウンス → `gitPush()`
4. ログファイルに記録

## 開発時の注意点

### ESM (ES Modules) を使用

- `package.json` に `"type": "module"` が設定されています
- `import/export` 構文を使用してください
- `require()` は使えません
- ファイル拡張子 `.js` を明示的に指定する必要があります

### ファイル操作

- `fs/promises` の async/await API を使用
- `existsSync` は同期的にチェックする必要がある場合のみ使用

### エラーハンドリング

- コマンドレベルでエラーをキャッチし、わかりやすいメッセージを表示
- `lib/utils/prompt.js` の `error()`, `warning()` を使用

### デバッグ

ファイル監視のログを確認：

```bash
tail -f ~/.sync-config/watch.log
```

## 自動起動の仕組み

### コマンドラインからの設定（推奨）

`gfs watch autostart` コマンドを使用することで、簡単に自動起動を設定できます：

```bash
# 自動起動を有効化
gfs watch autostart enable

# 状態確認
gfs watch autostart status

# 自動起動を無効化
gfs watch autostart disable
```

**実装の詳細 (lib/commands/watch.js:240-545):**
- `watch` コマンド配下に `autostart` サブコマンドを統合
- プラットフォーム検出（macOS/Linux）
- 設定ファイルの自動コピー
- システムサービスへの登録/解除を自動実行
- プラットフォーム固有のコマンド（launchctl/systemctl）を抽象化

**設計の利点:**
- watch 関連の機能がすべて `gfs watch` 配下に集約
- 階層的なコマンド構造で機能が分かりやすい
- 手動での watch 操作（start/stop/status）と自動起動設定を同じコマンド体系で管理

### 手動設定（古い方法）

#### macOS (launchd)

`autostart/com.github-files-sync.watch.plist` を `~/Library/LaunchAgents/` に配置することで、ログイン時に自動的に `gfs watch start` が実行されます。

#### Linux (systemd)

`autostart/github-files-sync-watch.service` を `~/.config/systemd/user/` に配置し、`systemctl --user enable` することで同様の動作を実現します。

## 将来の拡張ポイント

- 現在テストがないため、テストの追加が推奨されます
- コンフリクト解決の仕組みが未実装です
- バイナリファイルの扱いについて改善の余地があります
