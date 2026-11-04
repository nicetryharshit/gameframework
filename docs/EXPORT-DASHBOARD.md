# Game Workshop

Game Workshop is the dashboard for creating games and building them. Open it with the **Game Workshop** launcher in the framework folder or in a game folder. It runs on your computer and nothing is uploaded.

## Look and themes

The sidebar footer has four themes: **Ink** (warm dark), **Paper** (warm light), **Slate** and **Moss**. The choice is remembered in the browser; the first visit follows your system's light or dark setting. The framework dashboard and a game's dashboard use different accent colours and a mode tag so they are easy to tell apart.

## Framework folder

- **Games** lists the games next to the framework folder. **Open** starts that game's dashboard in a new tab. A game with older tools is flagged **Update available**; **Update tools** lets you pick which parts to refresh (see [Updating a game](UPGRADING.md)).
- **New game** creates a game next to the framework folder. Choose a folder name and a renderer. The choices come from the framework's renderer registry (`src/renderers/registry.json`). Its dashboard opens in a new tab.
- **Maintenance** (sidebar) runs `npm install` or the framework tests, with the output on the same page.

## Game folder

The sidebar has an **Overview**, one page per platform, and the Steam add-on. The coloured dot beside each name is its status.

- **Overview** is a table with one row per platform: status, the next step, and one button for it (install dependencies, play, build, set up a native project). Click a row to open that platform's page. **Play in browser** and **Game details** are in the header.
- **Platform page** shows the readiness checklist (each missing item says how to fix it), the main action, secondary actions as links, and the live output. **Debug / Release** chooses the build mode. Release builds for Android need signing, which isn't set up yet.
- **Job bar** at the bottom shows the running job on every page, with **Show output** and **Stop**.
- Finished builds show **Open output folder** and download links. Web builds also get a preview link.

Native projects are created once, under `src-tauri/gen/`. Keep your changes there in Git. Setup never overwrites an existing project.

The **Steam** page checks for the Steamworks SDK in `vendor/steamworks/sdk`. See [Steam](integrations/steam.md).

## Terminal alternative

`npm run export:ui` starts the same dashboard from a terminal, on `http://127.0.0.1:4179`. Add `--open` to open your browser. The launcher files do the same thing without a terminal.
