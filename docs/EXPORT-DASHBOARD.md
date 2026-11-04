# Game Workshop

Game Workshop is the dashboard for creating games and building them. Open it with the **Game Workshop** launcher in the framework folder or in a game folder. It runs on your computer and nothing is uploaded.

## Look and themes

The sidebar footer has four themes: **Ink** (warm dark), **Paper** (warm light), **Slate** and **Moss**. The choice is remembered in the browser; the first visit follows your system's light or dark setting. The framework dashboard and a game's dashboard use different accent colours and a mode tag so they are easy to tell apart.

The browser tab is titled **Workshop** in the framework, and the game's name in a game.

## Framework folder

- **Games** lists the games next to the framework folder. **Open** starts that game's dashboard in a new tab. A game with older tools is flagged **Update available**; **Update tools** lets you pick which parts to refresh, and add or remove renderers and physics engines (see [Updating a game](UPGRADING.md)).
- **New game** creates a game next to the framework folder. Choose a folder name, a renderer and, if you want one, a physics engine. The choices come from the framework's registries (`src/renderers/registry.json` and `src/physics/registry.json`). Its dashboard opens in a new tab.
- **Maintenance** (sidebar) runs `npm install` or the framework tests, with the output on the same page.

## Game folder

The sidebar has an **Overview**, one page per platform, and the Steam add-on. The coloured dot beside each name is its status.

- **Overview** is a table with one row per platform: status, the next step, and one button for it (install dependencies, play, build, set up a native project). Click a row to open that platform's page. **Play in browser** and **Game details** are in the header.
- **Remove example** is in the Overview's danger zone. It deletes the example game's files, leaves a starter in their place, and keeps your own files. It is refused if you have edited an example file.
- **Platform page** shows the readiness checklist (each missing item says how to fix it), the main action, secondary actions as links, and the live output. **Debug / Release** chooses the build mode. Desktop release builds are labelled **Release (unsigned)**. Android's is **Release (needs signing)** and stays disabled until signing is set up.
- **Job bar** at the bottom shows the running job on every page, with **Show output** and **Stop**.
- **Before a build**, the page checks the game's wiring (renderer and physics files, aliases, packages and imports) along with the platform's prerequisites. Failing checks are listed first. A finished build shows how long it took, its file count and its total size.
- Finished builds show **Open output folder** and download links. Web builds also get a preview link.

Native projects are created once, under `src-tauri/gen/`. Keep your changes there in Git. Setup never overwrites an existing project.

The **Steam** page checks for the Steamworks SDK in `vendor/steamworks/sdk`. See [Steam](integrations/steam.md).

## Terminal alternative

`npm run export:ui` starts the same dashboard from a terminal, on `http://127.0.0.1:4179`. Add `--open` to open your browser. The launcher files do the same thing without a terminal.
