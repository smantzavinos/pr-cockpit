{ lib, stdenvNoCC, stdenv, makeWrapper, makeDesktopItem, copyDesktopItems, bash, bun
, nodejs_22, git, gh, curl, coreutils, procps, util-linux, ffmpeg, electron, cacert
, src, revision }:

let
  # Download only the frozen dependencies in the fixed-output build. Installing
  # all Linux optional binaries makes the dependency tree independent of CPU.
  deps = stdenvNoCC.mkDerivation {
    name = "pr-cockpit-bun-dependencies";
    src = lib.fileset.toSource {
      root = src;
      fileset = lib.fileset.unions [
        (src + "/package.json") (src + "/bun.lock")
        (src + "/ui/package.json") (src + "/ui/bun.lock")
      ];
    };
    nativeBuildInputs = [ bun cacert ];
    dontConfigure = true;
    dontFixup = true;
    outputHashMode = "recursive";
    outputHash = "sha256-tY37NRIZziCboDHvXw+JIpl5oyvm0qOOZlyVbTqPe4A=";
    buildPhase = ''
      runHook preBuild
      export HOME="$TMPDIR/home"
      mkdir -p "$HOME"
      bun install --frozen-lockfile --production --ignore-scripts --backend=copyfile --os=linux --cpu='*'
      (cd ui && bun install --frozen-lockfile --ignore-scripts --backend=copyfile --os=linux --cpu='*')
      runHook postBuild
    '';
    installPhase = ''
      mkdir -p "$out/ui"
      mv node_modules "$out/"
      mv ui/node_modules "$out/ui/"
    '';
  };
  runtimePath = lib.makeBinPath [ bun git gh curl coreutils procps util-linux ffmpeg ];
in
stdenvNoCC.mkDerivation {
  pname = "pr-cockpit";
  version = revision;
  inherit src;
  nativeBuildInputs = [ nodejs_22 makeWrapper copyDesktopItems ];
  desktopItems = [
    (makeDesktopItem {
      # Keep the desktop file ID and StartupWMClass aligned with shell/platformPolicy.js.
      name = "app.pr-cockpit";
      desktopName = "PR Cockpit";
      exec = "pr-cockpit-desktop";
      icon = "app.pr-cockpit";
      startupWMClass = "app.pr-cockpit";
      categories = [ "Development" ];
    })
  ];
  dontConfigure = true;
  buildPhase = ''
    runHook preBuild
    ln -s ${deps}/ui/node_modules ui/node_modules
    export LD_LIBRARY_PATH=${lib.makeLibraryPath [ stdenv.cc.cc.lib ]}
    (cd ui && node node_modules/vite/bin/vite.js build)
    test -s static/index.html
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    app="$out/libexec/pr-cockpit"
    mkdir -p "$app/scripts" "$app/ui/src" "$out/bin"
    cp -r server shared shell assets static "$app/"
    # The backend also imports shared helpers under ui/src/lib.
    cp -r ui/src/lib "$app/ui/src/"
    cp scripts/{pr-cockpit,private-bun.sh} "$app/scripts/"
    install -Dm644 LICENSE "$out/share/licenses/pr-cockpit/LICENSE"
    ln -s ${deps}/node_modules "$app/node_modules"
    install -Dm644 assets/icon.svg "$out/share/icons/hicolor/scalable/apps/app.pr-cockpit.svg"

    wrap() {
      makeWrapper ${bash}/bin/bash "$out/bin/$1" \
        --add-flags "$app/scripts/nix-launch $2" \
        --set COCKPIT_PACKAGE_ROOT "$app" \
        --set COCKPIT_RELEASE_REVISION ${lib.escapeShellArg revision} \
        --set COCKPIT_ELECTRON ${electron}/bin/electron \
        --prefix PATH : ${runtimePath}
    }
    cp ${./nix-launch} "$app/scripts/nix-launch"
    wrap pr-cockpit cli
    wrap pr-cockpit-server server
    wrap pr-cockpit-desktop desktop
    runHook postInstall
  '';
  meta = {
    description = "Local pull request cockpit for GitHub";
    license = lib.licenses.mit;
    mainProgram = "pr-cockpit-desktop";
    platforms = [ "x86_64-linux" "aarch64-linux" ];
  };
}
