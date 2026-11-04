# gameframework

A starter for browser games made with **PixiJS (2D)**, **Three.js (3D)** or a dependency-free **Canvas 2D** renderer. It includes shared game systems (input, UI, saves, audio, assets, timers, tweens and more), optional physics engines, and a **Game Workshop** dashboard that builds the game for web, desktop and mobile, with no terminal needed after setup.

## Set up

You need one thing installed first: **[Node.js 22 or newer](https://nodejs.org/)**. The launcher checks for it and opens the download page if it's missing. You don't need anything else for web games.

1. **Open Game Workshop.**
   - **Mac:** double-click `Game Workshop.command`. If macOS blocks it, right-click it and choose **Open**.
   - **Windows:** double-click `Game Workshop.bat`. If SmartScreen blocks it, choose **More info → Run anyway**.
   - **Linux:** double-click `Game Workshop.sh`, or run it from a terminal.

   Your browser opens Game Workshop. Keep the launcher's window open while you use it.

   To reopen it later from a terminal, run `npm run workshop` in the framework folder or in a game folder.

2. **Install and test the framework (optional but recommended).** Open **Maintenance** in the sidebar, click **Install dependencies**, then **Run tests**. All tests should pass.

3. **Create a game.** In **Games**, use the **New game** form: enter a name such as `testgame` and choose a renderer (PixiJS, Three.js or Canvas 2D) and, if you want one, a physics engine (Planck or Matter.js). Then click **Create game**. Game Workshop creates the game in a folder next to this one and opens its dashboard in a new tab.

Your game is now a separate project. It contains its own copy of the framework, so you can move or delete this folder afterwards.

## Keep a game up to date

A game keeps its own copy of the framework tools, so it doesn't change when the framework does. In the framework dashboard, **Games** flags a game with older tools as **Update available**. **Update tools** lets you choose which parts to refresh (core, renderers, platform, dashboard, docs) and add renderers such as Three.js or Canvas 2D to an existing game. Your game code is never touched. Details: [Updating games](docs/UPGRADING.md).

## Work on your game

Each game has its own copy of Game Workshop. Open it with the `Game Workshop` launcher inside the game folder, or with **Open** on the game's row in the framework dashboard's **Games** list.

- **Play it:** click **Play in browser** (top right of the overview). Changes you save update the running game. If dependencies are missing, the Web row asks you to install them first.
- **Edit your game:** the code lives in `src/`. The example game (Pocket Flight) can be replaced, file by file. See the game's `README.md`.
- **Game details:** click **Game details** to set the name, version and identifier. Apple and Android use the identifier to tell apps apart.

## Build for platforms

Click a platform in the sidebar or the overview table. Its page shows what's ready and what's missing, and its main button does the next step.

| Platform | What the dashboard does | What you need on your computer |
| --- | --- | --- |
| **Web** | Builds a web game you can host or upload to itch.io, and previews it | Nothing extra |
| **Windows** | Builds a Windows app | Windows, Rust and Visual Studio C++ build tools |
| **macOS** | Builds a Mac app | A Mac, Rust and Xcode command line tools |
| **Linux** | Builds a Linux app | Linux, Rust and WebKitGTK 4.1 |
| **iPhone and iPad** | Sets up an Xcode project, then opens it in Xcode | A Mac, Xcode, Rust, and an Apple developer account for devices |
| **Android** | Sets up an Android project, builds an APK, and opens Android Studio | Android Studio, Java, the Android SDK and NDK, and Rust |

Each build gets its own folder under `Builds/`, with a download link and a build report. The **Test build** and **Release build** switch chooses the mode. Desktop release builds are unsigned, so macOS and Windows may warn before opening them. Release builds for Android need signing, which isn't set up yet.

The dashboard doesn't install Xcode, Android Studio, or Rust for you. Each platform page's checklist says what's missing and how to fix it. Click **Re-check** after installing something to update the status.

### Steam (optional)

Steam is an add-on for desktop builds. Open **Steam** in the sidebar and follow the checklist. You need a Steamworks partner account and the Steamworks SDK, which you download yourself and place in `vendor/steamworks/sdk`. Steam uploads aren't automated yet. The full steps are in `docs/integrations/steam.md`.

## How the project is organised

```text
gameframework/            ← this folder: the framework and Game Workshop
  Game Workshop.command   ← double-click launchers (Mac, Windows, Linux)
  src/framework/          ← shared systems: state, events, UI, input, saves, audio, assets, timers, tweens
  src/renderers/          ← renderers (Pixi, Three, Canvas 2D) and registry.json
  src/physics/            ← optional physics engines (Planck, Matter.js) and registry.json
  scripts/export-ui/      ← the Game Workshop dashboard
  docs/                   ← guides
  testgame/               ← created by New game (sits next to this folder)
    tools/gameframework/  ← a copy of the framework, so the game stands alone
    src/                  ← your game
    src-tauri/            ← desktop and mobile configuration
    Builds/               ← build output (ignored by Git)
```

Use the framework folder to create games and to test the framework. Use each game's folder for everything else.

## Terminal commands (optional)

Everything above can also be done from a terminal, which is useful for scripts or CI. Run these from the matching folder:

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Run the framework tests | `npm test` |
| Check your setup | `npm run doctor` |
| Create a game | `npm run create:game -- ../testgame canvas` (or `pixi` or `three`) |
| Open Game Workshop | `npm run workshop` (or `npm run export:ui` without opening the browser) |
| Play in a browser | `npm run dev` |
| Build for the web | `npm run build` |

## Guides

| Guide | When to read it |
| --- | --- |
| [Game Workshop](docs/EXPORT-DASHBOARD.md) | What each part of the dashboard does |
| [Desktop and mobile builds](docs/PLATFORM-BUILDS.md) | Platform requirements and native project details |
| [Framework API](docs/FRAMEWORK.md) | Shared systems and how to use them in code |
| [Physics](docs/PHYSICS.md) | Optional physics engines and how to use them |
| [Dashboard design](docs/DESIGN.md) | Style, themes and constraints for changing the dashboard |
| [Renderers](docs/RENDERERS.md) | The included renderers, adding one to a game, and alternatives |
| [Steam](docs/integrations/steam.md) | Steamworks setup, step by step |
| [Updating games](docs/UPGRADING.md) | Bringing a newer framework into an existing game |
| [Roadmap](docs/ROADMAP.md) | What's done, what's next, and what hasn't been tested yet |

To check changes to this framework, run the tests from Maintenance, or `npm test`.
