# Security

## Reporting a vulnerability

Please report security problems privately, through GitHub's **Report a vulnerability** button on this repository's Security tab. Don't open a public issue for them. You'll get a reply and a fix before anything is published.

## What the framework protects

Game Workshop is a dashboard that runs on your own computer. Its security model:

- **Local only.** The dashboard server listens on `127.0.0.1`, never on the network.
- **Token and origin checks.** Every API request needs a random per-session token in a header, and POST requests must come from the dashboard's own origin. Host headers are checked to block DNS rebinding.
- **Validated input.** Platform, build mode, version, bundle identifier, app name and iOS settings are validated before they reach a build. App and display names can't contain quotes, backslashes or control characters, because they're written into project files.
- **No shell for user values.** Build steps run without a shell. The only exception is `npm` on Windows, which is called with fixed arguments.
- **File access is limited.** Preview and artifact downloads resolve symlinks and must stay inside the build's output folder.
- **Credentials stay out of the repo.** Steam and store credentials come from environment variables, not files. The Steamworks SDK goes in `vendor/` and is never committed.

## Things to know

- Desktop release builds are unsigned, and Android release builds need your own signing key. Keep keystores and certificates out of Git.
- The desktop shell's Content Security Policy allows inline styles. Scripts are limited to the app's own files.
- Dependencies are checked with `npm audit`. Keep them up to date before you release.
