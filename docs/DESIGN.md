# Dashboard design

Notes for anyone changing the Game Workshop dashboard (`scripts/export-ui/`).

## Style

The look follows the restraint of [Kanso](https://kanso.botiverse.build/): one ground colour, one ink colour, hairlines instead of boxes, light weights, small radii (8px and 5px), no shadows. Status is shown by shape first (● ready, ◐ needs setup, ⊗ blocked, ◌ not installed) and colour second.

- **Tokens** are CSS variables at the top of `style.css`. Four themes set them: `ink` (warm dark, default), `paper` (warm light), `slate`, `moss`. The theme is stored in `localStorage` and falls back to the system's light or dark setting.
- **Two modes, two accents.** The framework dashboard uses `--fw`, a game dashboard uses `--gm` (`body.game`). The sidebar also shows a `framework` or `game` tag, so the two are never mistaken for each other.
- **Type.** System font stack and a monospace stack for paths, versions and logs. Headings are weight 300; large numerals weight 200.
- **No assets.** No web fonts, images or CDN. Icons are a few inline SVG paths in `app.js`.

## Structure

- Sidebar for navigation, one full page per platform, no side panel. A page shows readiness, one primary action with the rest as text links, and the live output.
- A job bar at the bottom shows the running job on every page.
- One primary button per row or page. Anything else is a link or lives in a dialog.

## Constraints

- The server sends `default-src 'self'; script-src 'self'; style-src 'self'`. That means no inline `<script>` or `style` attributes and no `style=` in generated markup. Use classes.
- Redraws are driven by a signature of state (`draw()` in `app.js`), so inputs must be created once and re-attached, not rebuilt, or typing is lost.
- The page polls `/api/state` every second. Keep `draw()` cheap.

## Mock

`docs/design/workshop-mock.html` is a standalone, clickable mock of the four main screens with the four themes. It uses fake data and is not wired to the server.
