use tauri::Manager;

mod bootstrap;
mod scm_auth;

#[allow(clippy::missing_panics_doc)]
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::missing_panics_doc)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            bootstrap::bootstrap_local_stack,
            bootstrap::bootstrap_probe,
            scm_auth::delete_scm_connection,
            scm_auth::list_scm_connections,
            scm_auth::prepare_scm_provisioning,
            scm_auth::save_scm_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running CTO Desktop");
}
