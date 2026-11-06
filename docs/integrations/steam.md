# Steam integration (manual checklist)

Players only need the Steam client. This checklist is for you, the developer, and only applies if you enable Steam for a profile.

The steps below are a summary. Check the current Steamworks documentation and fee terms before you start, since they can change.

## 1. Accounts and app

1. Create a Steamworks partner account at the Steamworks partner site.
2. Create an app. Steam charges a per-app fee to publish a game. Check the current amount on the partner site.
3. Note your **App ID** and the **depot IDs** Steam assigns to each platform. You'll need them for uploads.

## 2. Install the SDK

1. Download the Steamworks SDK from the partner site and accept its license terms.
2. Copy the SDK into this project so the layout looks like this:

   ```text
   vendor/steamworks/sdk/
     public/steam/          (headers)
     redistributable_bin/   (runtime libraries for each OS)
   ```

3. Run `npm run doctor`. The `steam` row should move from `missing` to `ready`.

Do not commit anything in `vendor/`. It is ignored by Git on purpose.

## 3. Build with Steam enabled

Steam support is off by default, so a normal build has no Steam code and needs no SDK. To turn it on in Game Workshop, open the **Steam** page, enter your App ID, and tick **Build desktop games with Steam**. Desktop builds then include the `steam` feature. Game Workshop checks the SDK, the App ID and the feature flag first, and shows what is missing.

The command-line equivalent is:

```sh
npx tauri dev --features steam
npx tauri build --features steam --no-sign
```

Games made before Steam support existed do not have the Steam code yet. Open the **Steam** page and click **Add Steam support to this game**. It adds the Rust and TypeScript pieces and keeps each original file as a `.before-steam` copy. Running it again changes nothing.

The game's Rust code (`src-tauri/src/steam.rs`) then unlocks achievements and sets integer stats through Steamworks. In the game, `createSteamControls()` from `gameframework/desktop` returns those calls. It is undefined on web and mobile, and a failed Steam call returns `false` instead of stopping the game.

The build needs the SDK in `vendor/steamworks/sdk` (step 2). Steam must be running for achievements to work. Otherwise Steam is reported as unavailable and the game carries on without it.

Keep Steam credentials in environment variables, never in the repo.

The game cannot check achievement or stat names against Steamworks, so they must match the ones you define in the partner site exactly.

## 4. Development builds

Steam needs the Steam client running to test. Game Workshop writes a `steam_appid.txt` file containing your App ID into `src-tauri/target/debug` before each development build with Steam, so the debug app finds Steam. If you run the app by hand from another folder, copy that file next to it yourself. Release builds never get the file, and you should not ship it.

### Test panel

Debug builds show a small **Steam test** panel in the bottom-right corner. It says whether Steam is connected and has two buttons: unlock a test achievement and set a test stat. It never appears in release builds.

To test without your own app, use App ID **480** (Valve's SpaceWar example). The panel uses `ACH_WIN_ONE_GAME` and `NumGames`, which we believe are that example's names. If an unlock fails, check the SpaceWar sample code in the SDK for the exact names. Change `STEAM_TEST_ACHIEVEMENT` and `STEAM_TEST_STAT` in `gameframework/desktop` to your own names once your app exists.

1. Start the Steam client and sign in.
2. On the Steam page, check that all rows are green. If **Steam code up to date** is not, click **Update Steam support**.
3. Run a Windows debug build from Game Workshop, or `npx tauri dev --features steam` from the game folder.
4. The panel should say **Steam: connected**. Click the buttons and read the result under them.

Debug builds made from a terminal show the panel only when `VITE_GAME_DEBUG_BUILD=1` is set. Game Workshop sets it for you.

## 5. Upload

Uploads are not automated yet. Upload your builds with SteamCMD, following its current documentation, and supply your Steamworks login through environment variables, not in the repo.

## Platform notes

- **Windows, macOS and Linux** are supported by Steam. Each needs its own depot.
- **Steam Deck** runs the Windows build through Proton, so a Windows build covers it unless you ship a native Linux build.
