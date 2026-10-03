#!/usr/bin/env bash
# Activa los git hooks versionados del repo (carpeta scripts/hooks).
set -e
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath scripts/hooks
echo "✓ Hooks activados (core.hooksPath=scripts/hooks)."
echo "  Para desactivarlos: git config --unset core.hooksPath"
