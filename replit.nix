{ pkgs }: {
  # Replit "nodejs-22" module already provides Node 22, npm, and corepack.
  # We pin a couple of useful CLIs for the workspace so debugging from the
  # Replit shell (curl, jq, openssl, git) and cleanly running pnpm via
  # corepack works out of the box.
  deps = [
    pkgs.nodejs_22
    pkgs.corepack_22
    pkgs.git
    pkgs.curl
    pkgs.jq
    pkgs.openssl
    pkgs.cacert
  ];
}
