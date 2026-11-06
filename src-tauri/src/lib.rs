mod steam;

#[tauri::command]
fn platform_kind() -> &'static str {
  if cfg!(mobile) { "mobile" } else { "desktop" }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(steam::SteamState::start())
    .invoke_handler(tauri::generate_handler![
      platform_kind,
      steam::steam_available,
      steam::steam_unlock_achievement,
      steam::steam_set_stat_i32
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
