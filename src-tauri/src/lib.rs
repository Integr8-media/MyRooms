#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    // Opens the user guide and privacy policy in the browser.
    .plugin(tauri_plugin_opener::init())
    // Restarts the app after an update is installed.
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Auto-update only in release builds made with `tauri.release.conf.json`
      // (scripts/desktop-release-config.mjs): it holds the update URL and the public key.
      // Without it the app runs as before and never checks for updates.
      #[cfg(desktop)]
      if app.config().plugins.0.contains_key("updater") {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
