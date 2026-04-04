# Studio Integration

- [x] Audit revamp frontend and backend schema/API mismatches
- [x] Extend frontend types and API for mix settings and richer clip fields
- [x] Extend shared player state for playback rate and track gain controls
- [x] Rebuild `studio/edit` into a stable real-data editor
- [x] Upgrade `studio` with real mixer controls backed by saved settings
- [x] Restart services and verify `/`, `/nexus`, `/studio`, and `/studio/edit`

## Verification

- `python3 -m compileall backend/app`
- `npm run build`
- `curl -s http://127.0.0.1:8000/api/health`
- `curl -s http://localhost:3000/api/tracks`
- `curl -s http://localhost:3000/api/clips?trackId=17cc6f9f-f4ee-4971-8ca7-897acfb8e7d3`

# Repo Health Pass

- [x] Audit frontend/backend manifests and runtime versions
- [x] Run frontend verification (`lint`, `build`) and backend sanity checks
- [x] Diagnose dependency drift or code mismatches causing failures
- [x] Apply only necessary fixes to keep frontend/backend in sync
- [x] Re-run verification and document residual risks

## Verification

- `npm run lint`
- `npm run build`
- `npm audit --json`
- `./venv/bin/pip check`
- `./venv/bin/python - <<'PY' ... compile(path.read_text(), str(path), 'exec') ... PY`
- `curl -s http://127.0.0.1:8000/api/health`

# Playback Reliability

- [x] Fix `yt-dlp` Python API runtime config to match the working CLI setup
- [x] Restart backend on the Python 3.13 venv and retest YouTube-backed audio endpoint
- [x] Retest Spotify-matched audio endpoint
- [x] Confirm frontend playback works against the repaired backend

## Verification

- `./venv/bin/python - <<'PY' ... yt_dlp option probe ... PY`
- `curl -s http://127.0.0.1:8000/api/health`
- `curl -D - http://localhost:3000/api/audio/<youtube_track_id> -o /dev/null`
- `curl -D - http://localhost:3000/api/audio/<spotify_track_id> -o /dev/null`
