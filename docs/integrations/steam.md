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

## 3. Enable Steam for a profile

Add `"steam"` to the `integrations` list in the desktop profiles in `export-profiles.json`, and fill in the App ID. Keep the App ID in the profile, not in code. Steam credentials stay in environment variables and are never written to the repo.

## 4. Development builds

Steam needs the Steam client running to test. For local runs, put a `steam_appid.txt` file next to the built app that contains only your App ID. Do not ship that file in release builds.

## 5. Upload

Steam builds are uploaded with SteamCMD, using the depot build script that the export pipeline generates. The upload needs your Steamworks username and password, or a Steam Guard code, through environment variables. Check the current SteamCMD documentation for the exact commands.

## Platform notes

- **Windows, macOS and Linux** are supported by Steam. Each needs its own depot.
- **Steam Deck** runs the Windows build through Proton, so a Windows build covers it unless you ship a native Linux build.
