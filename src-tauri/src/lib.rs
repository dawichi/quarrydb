mod files;
mod menu;
mod redis;
mod secrets;
mod sql;

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(sql::SqlState::default())
        .setup(|app| {
            let menu = menu::build_menu(app)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open-database" => {
                let _ = app.emit("menu:open-database", ());
            }
            "open-sample" => {
                let _ = app.emit("menu:open-sample", ());
            }
            "check-for-updates" => {
                let _ = app.emit("menu:check-for-updates", ());
            }
            "export-diagnostics" => {
                let _ = app.emit("menu:export-diagnostics", ());
            }
            "hard-reset" => {
                let _ = app.emit("menu:hard-reset", ());
            }
            _ => {}
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            files::write_text_file,
            secrets::get_mysql_password,
            secrets::set_mysql_password,
            secrets::delete_mysql_password,
            secrets::get_redis_password,
            secrets::set_redis_password,
            secrets::delete_redis_password,
            sql::sql_connect,
            sql::sql_disconnect,
            sql::sql_select,
            sql::sql_execute,
            redis::redis_connect,
            redis::redis_scan_keys,
            redis::redis_get_key,
            redis::redis_export_keyspace,
            redis::redis_mutate_collection,
            redis::redis_set_string,
            redis::redis_delete_key,
            redis::redis_run_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
