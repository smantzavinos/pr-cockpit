{
  description = "PR Cockpit Linux package and development environments";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs, ... }:
  let
    linux = [ "x86_64-linux" "aarch64-linux" ];
  in {
    packages = nixpkgs.lib.genAttrs linux (system:
      let pkgs = import nixpkgs { inherit system; };
      in {
        default = pkgs.callPackage ./nix/package.nix {
          src = ./.;
          revision = self.shortRev or "0+local";
        };
      });
    devShells = nixpkgs.lib.genAttrs (linux ++ [ "aarch64-darwin" ]) (system:
      let
        pkgs = import nixpkgs { inherit system; };
        tools = with pkgs; [ bash bun nodejs_22 git gh curl ffmpeg ];
      in {
        headless = pkgs.mkShellNoCC { packages = tools; };
        default = pkgs.mkShellNoCC {
          packages = tools ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.electron ];
        };
      });
  };
}
