{pkgs ? import <nixpkgs> {}}:
pkgs.mkShell {
  packages = [
    pkgs.nodejs_24
    # pnpm 11 switches itself to the version pinned in package.json's packageManager.
    pkgs.pnpm_11
  ];

  # Agent sandboxes can write ~/.cache but not ~/Library, where pnpm keeps both by default.
  # One shared store also lets every worktree reuse the same downloads.
  # pnpm 11 reads only pnpm_config_* variables, not npm_config_*.
  shellHook = ''
    export PNPM_HOME="$HOME/.cache/pnpm"
    export pnpm_config_store_dir="$HOME/.cache/pnpm/store"
  '';
}
