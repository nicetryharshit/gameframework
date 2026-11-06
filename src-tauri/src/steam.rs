//! Steamworks achievements and stats for desktop builds.
//!
//! The real integration is compiled only with the `steam` feature, which needs the Steamworks SDK
//! (see docs/integrations/steam.md). Without the feature, every command reports that Steam is not
//! enabled, so the same game runs unchanged in a normal build.

use tauri::State;

#[cfg(feature = "steam")]
pub struct SteamState(std::sync::Mutex<Option<steamworks::Client>>);

#[cfg(not(feature = "steam"))]
pub struct SteamState;

impl SteamState {
  /// Starts Steam if this build has it enabled and the Steam client is running.
  /// A failure here is logged and leaves achievements off; it never stops the game.
  #[cfg(feature = "steam")]
  pub fn start() -> Self {
    match steamworks::Client::init() {
      Ok(client) => {
        // Steam delivers its callbacks only when they are run regularly.
        let runner = client.clone();
        std::thread::spawn(move || loop {
          runner.run_callbacks();
          std::thread::sleep(std::time::Duration::from_millis(16));
        });
        SteamState(std::sync::Mutex::new(Some(client)))
      }
      Err(error) => {
        log::warn!("Steam is not running, so achievements are off: {error:?}");
        SteamState(std::sync::Mutex::new(None))
      }
    }
  }

  #[cfg(not(feature = "steam"))]
  pub fn start() -> Self {
    SteamState
  }
}

/// True when Steam is enabled in this build and running.
#[tauri::command]
pub fn steam_available(state: State<'_, SteamState>) -> bool {
  #[cfg(feature = "steam")]
  {
    state.0.lock().map(|guard| guard.is_some()).unwrap_or(false)
  }
  #[cfg(not(feature = "steam"))]
  {
    let _ = state;
    false
  }
}

/// Unlocks an achievement by its Steamworks API name and stores the change.
#[tauri::command]
pub fn steam_unlock_achievement(state: State<'_, SteamState>, name: String) -> Result<(), String> {
  #[cfg(feature = "steam")]
  {
    let guard = state.0.lock().map_err(|_| "Steam state is unavailable".to_string())?;
    let client = guard.as_ref().ok_or("Steam is not running")?;
    let stats = client.user_stats();
    stats.achievement(&name).set().map_err(|_| format!("Could not unlock achievement {name}"))?;
    stats.store_stats().map_err(|_| "Could not store Steam stats".to_string())
  }
  #[cfg(not(feature = "steam"))]
  {
    let _ = (state, name);
    Err("Steam is not enabled in this build".to_string())
  }
}

/// Sets an integer stat by its Steamworks API name and stores the change.
#[tauri::command]
pub fn steam_set_stat_i32(state: State<'_, SteamState>, name: String, value: i32) -> Result<(), String> {
  #[cfg(feature = "steam")]
  {
    let guard = state.0.lock().map_err(|_| "Steam state is unavailable".to_string())?;
    let client = guard.as_ref().ok_or("Steam is not running")?;
    let stats = client.user_stats();
    stats.set_stat_i32(&name, value).map_err(|_| format!("Could not set stat {name}"))?;
    stats.store_stats().map_err(|_| "Could not store Steam stats".to_string())
  }
  #[cfg(not(feature = "steam"))]
  {
    let _ = (state, name, value);
    Err("Steam is not enabled in this build".to_string())
  }
}
