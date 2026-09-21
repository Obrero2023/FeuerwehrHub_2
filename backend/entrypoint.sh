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

mkdir -p /data
chown -R app:app /data

exec runuser -u app -- /app/feuerwehrhub