#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

cd -- "$(dirname -- "$0")"
umask 077
env_file=/etc/variation-desk.env
app=variation-desk

start_app() {
  if docker container inspect "$app" >/dev/null 2>&1; then
    docker rm -f "$app" >/dev/null
  fi
  docker run -d --name "$app" --restart unless-stopped --init     --security-opt no-new-privileges --env-file "$env_file"     -p 80:3000 -v variation-desk-data:/data "$app:local" >/dev/null

  for _ in {1..30}; do
    if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then
      echo 'Variation Desk is running. Open http://<your VM public IPv4> in a browser.'
      return
    fi
    sleep 1
  done
  docker logs "$app" >&2
  return 1
}

case "${1:-install}" in
  install)
    if ! command -v docker >/dev/null || ! command -v curl >/dev/null; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y docker.io curl
    fi
    systemctl enable --now docker
    [[ -e "$env_file" ]] || touch "$env_file"
    docker build -t "$app:local" .
    start_app
    ;;
  configure-inference)
    if ! docker image inspect "$app:local" >/dev/null 2>&1; then
      echo 'Install Variation Desk before configuring inference.' >&2
      exit 1
    fi
    read -rs -p 'Paste the Serverless Inference API key, then press Enter: ' inference_key </dev/tty
    echo
    if [[ -z "$inference_key" || "$inference_key" =~ [[:space:]] ]]; then
      echo 'Provide a single non-empty inference key.' >&2
      exit 1
    fi
    printf 'VULTR_INFERENCE_API_KEY=%s\n' "$inference_key" > "$env_file"
    unset inference_key
    start_app
    ;;
  *)
    echo 'Usage: deploy-vultr.sh [install|configure-inference]' >&2
    exit 2
    ;;
esac
