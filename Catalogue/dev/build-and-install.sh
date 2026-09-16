#!/usr/bin/env bash
# Compile le plugin et le copie dans dev/plugins/Catalogue pour que le conteneur
# Jellyfin local (docker-compose.yml) le ramasse au prochain redémarrage.
set -euo pipefail

cd "$(dirname "$0")/.."

dotnet build -c Release

DEST="dev/plugins/Catalogue"
mkdir -p "$DEST"
cp bin/Release/net10.0/Jellyfin.Plugin.Catalogue.dll "$DEST/"

echo "Plugin copié dans $DEST"
echo "Redémarrez le conteneur pour charger la nouvelle version : docker compose -f dev/docker-compose.yml restart jellyfin"
