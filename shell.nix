{pkgs ? import <nixpkgs> {}}:
pkgs.mkShell {
  packages = [
    pkgs.nodejs_24
    # pnpm 10 switches itself to the version pinned in package.json's packageManager.
    pkgs.pnpm_10
  ];

  # Agent sandboxes can write ~/.cache but not ~/Library, where pnpm keeps both by default.
  # One shared store also lets every worktree reuse the same downloads.
  shellHook = ''
    export PNPM_HOME="$HOME/.cache/pnpm"
    export npm_config_store_dir="$HOME/.cache/pnpm/store"
  '';
}
