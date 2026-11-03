# Game Workshop

Game Workshop is the dashboard for creating games and building them. Open it with the **Game Workshop** launcher in the framework folder or in a game folder. It runs on your computer and nothing is uploaded.

## Framework folder

- **New game** creates a game next to the framework folder. Choose a name and 2D or 3D. The new game's dashboard opens in a new tab.
- **Open game** opens the dashboard for a game folder next to the framework folder.
- **Install and test** runs `npm install` or the framework tests. Results appear in the panel, with a log under **Show details**.

## Game folder

Each platform has a card:

- **Status** shows **Ready**, **Setup needed**, **Not set up yet**, or **Needs a Mac/Windows/Linux computer**.
- **Main button** does the next step: install dependencies, play in browser, build, set up a native project, or open it in Xcode or Android Studio.
- **See what's needed** opens a checklist. Each missing item says how to fix it.

In the panel:

- **Test build** and **Release build** choose the build mode. Release builds for Android need signing, which isn't set up yet.
- **Show details** shows the full log. **Stop** cancels a running job.
- Finished builds show an **Open output folder** button and download links. Web builds also get a preview link.

Native projects are created once, under `src-tauri/gen/`. Keep your changes there in Git. Setup never overwrites an existing project.

The **Steam** card checks for the Steamworks SDK in `vendor/steamworks/sdk`. See [Steam](integrations/steam.md).

## Terminal alternative

`npm run export:ui` starts the same dashboard from a terminal, on `http://127.0.0.1:4179`. Add `--open` to open your browser. The launcher files do the same thing without a terminal.
