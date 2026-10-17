# 062 — Video and image modules, media uploads, replication and thumbnails

| Field | Value |
| --- | --- |
| Area | Content |
| Actors | Admin (author), learner |
| Related | [053](053-course-content-and-quizzes.md), [169](169-course-authoring.md) |

Covers the original 062 (video and image modules), 063 (remote media replication) and the thumbnail of 044.

## Model

- Module types `video` and `image` have a **media** content `{kind: 'media', url, replicate}` (and only they do): `url`
  is an uploaded file (`/uploads/<file>`) or a remote `http(s)://` address.
- `media_asset` (spec 191 "MediaAsset"): stored file name, type, size, uploader, original URL (copies).
- `course.thumbnailUrl` (spec 044): card and course page image.

## API

- `POST /api/admin/media` (multipart `file`; images and videos only, up to `MEDIA_MAX_BYTES`, default 512 MB) → 201
  `{id, url, contentType, size}`; files go to `UPLOADS_DIR` (default `./data/uploads`) under a random name.
- `GET /uploads/<file>` (public, byte ranges for video seeking); a name with anything but letters, digits, `_`, `-` and
  one extension → 400 `Invalid filename`. Proxied by both Vite servers.
- Module detail adds `media: {url}`. With `replicate`, the first request downloads the remote file (5 min timeout, size
  limit, temp file then rename) as `<sha256(url)[:16]><ext>` and serves `/uploads/…`; concurrent requests share one
  download; later ones reuse it. If the download fails, the remote URL is served (the original returned a broken path).

## UI

- Lesson page: `<video controls>` or `<img alt=<module name>>`, full width; "Suivant ▸" marks it viewed like a lesson.
- Module editor: types "Vidéo" / "Image" with "URL du média" + "Envoyer un fichier" and "Copier localement".
- Course form: "Vignette" (URL + upload); cards and the course page show it instead of the icon.
- Markdown format (173): `url:` and `replicate:` in the directive of video / image modules.

## Differences from the original

- Upload endpoint added (the original placed files out of band); replication falls back to the remote URL.

## Source

`apps/api/src/services/media.ts`, `apps/api/src/routes/admin/media.ts`, `apps/api/src/app.ts` (`/uploads`),
`packages/shared/src/content.ts`, `apps/admin/src/components/MediaField.tsx`, `apps/app/src/routes/LessonPage.tsx`,
`e2e/media.spec.ts`.
