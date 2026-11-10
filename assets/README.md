# Assets

Everything the scene editor can reference lives here.

- `images/` holds sprite textures (PNG, JPG, SVG, WebP, GIF).
- `audio/` holds sounds (WAV, OGG, MP3, M4A).

Scenes refer to assets by their path relative to this folder, for example `images/crate.svg` in a sprite's `texture` field or `audio/beep.wav` in an audio clip. Assets are copied in with the editor's Import button or by dropping files on the Assets panel.

Renaming or moving a file here does not update scenes that point to it. Rename it in the editor's Assets panel or keep the path the same. The editor warns when a field points at a missing asset.
