#!/bin/sh
# Entrypoint für den Backend-Container.
#
# Das Data-Volume (ff-data) wird von Docker als root angelegt und über /data gemountet.
# Der chown im Dockerfile greift nur auf das Image-Verzeichnis, nicht auf das
# gemountete Volume zu. Daher muss der Datenordner hier vor dem Start nochmal
# dem app-User zugänglich gemacht werden.
#
# Anschließend werden die Privilegien auf den app-User gesenkt und der Server
# als dieser gestartet.
set -e

# Ensure data directories exist; suppress mkdir errors if directory already exists
# with incompatible permissions (common on Windows/WSL2 Docker setups)
mkdir -p /data /data/signaturen || true

# Attempt to fix ownership, but don't fail if we can't (e.g., read-only volume,
# unsupported filesystem, or already correct ownership)
chown -R app:app /data 2>/dev/null || true

exec runuser -u app -- /app/feuerwehrhub