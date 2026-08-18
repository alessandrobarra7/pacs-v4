#!/usr/bin/env bash
set -euo pipefail

VERSION="v0.1.2-pilot"
FILE_NAME="PacsRadiantAssistantSetup.exe"
BASE_URL="https://github.com/alessandrobarra7/pacs-v4/releases/download/${VERSION}"
TARGET_DIR="/var/lib/pacs-radiant-assistant"
TARGET_FILE="${TARGET_DIR}/${FILE_NAME}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

install -d -m 755 "$TARGET_DIR"
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "${TMP_DIR}/${FILE_NAME}" "${BASE_URL}/${FILE_NAME}"
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "${TMP_DIR}/${FILE_NAME}.sha256" "${BASE_URL}/${FILE_NAME}.sha256"
(cd "$TMP_DIR" && sha256sum -c "${FILE_NAME}.sha256")
install -m 644 "${TMP_DIR}/${FILE_NAME}" "$TARGET_FILE"
sha256sum "$TARGET_FILE"
stat -c '%n | %s bytes | %a %U:%G' "$TARGET_FILE"
