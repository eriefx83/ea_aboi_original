# Aboi Original — Vercel version

The landing page remains static. The former `capi.php` endpoint is now the
Vercel Function at `/api/capi`.

## Deploy

1. Import this folder as a new Vercel project.
2. In **Project Settings → Environment Variables**, add:
   - `META_PIXEL_ID`
   - `META_ACCESS_TOKEN`
   - `META_GRAPH_VERSION` (optional; defaults to `v22.0`)
   - `META_TEST_EVENT_CODE` (optional; use only for Meta test events)
3. Deploy the project.
4. In Meta Events Manager, verify that browser and server events share the same
   event ID and are deduplicated.

Do not commit the real Meta access token. The token from the old PHP source was
embedded in plain text and should be revoked/replaced in Meta Business settings.
