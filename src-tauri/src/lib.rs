use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

const MYSQL_KEYRING_SERVICE: &str = "dev.quarrydb.app.mysql";

fn mysql_keyring_entry(connection_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(MYSQL_KEYRING_SERVICE, connection_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_mysql_password(connection_id: String) -> Result<Option<String>, String> {
    match mysql_keyring_entry(&connection_id)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn set_mysql_password(connection_id: String, password: String) -> Result<(), String> {
    mysql_keyring_entry(&connection_id)?
        .set_password(&password)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_mysql_password(connection_id: String) -> Result<(), String> {
    match mysql_keyring_entry(&connection_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn write_text_file(path: String, content: String, ext: String) -> Result<(), String> {
    // macOS save dialogs hide the extension visually but append it in the returned path.
    // This guard catches the rare case where the OS returns the path without extension.
    let final_path = if !path.ends_with(&format!(".{ext}")) {
        format!("{path}.{ext}")
    } else {
        path
    };
    std::fs::write(final_path, content).map_err(|e| e.to_string())
}

fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(
                app,
                "open-database",
                "Open Database…",
                true,
                Some("CmdOrCtrl+O"),
            )?,
            &MenuItem::with_id(
                app,
                "open-sample",
                "Open Sample Database…",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "check-for-updates",
                "Check for Updates…",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "hard-reset", "Hard Reset…", true, None::<&str>)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    // On macOS the first menu entry is the app menu (shown with the app name).
    // It must include Hide, Services, and Quit for OS HIG compliance.
    #[cfg(target_os = "macos")]
    {
        let quarry_menu = Submenu::with_items(
            app,
            "Quarry",
            true,
            &[
                &PredefinedMenuItem::about(app, None, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        return Menu::with_items(app, &[&quarry_menu, &file_menu, &edit_menu, &window_menu]);
    }

    #[allow(unreachable_code)]
    Menu::with_items(app, &[&file_menu, &edit_menu, &window_menu])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let menu = build_menu(app)?;
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
            "hard-reset" => {
                let _ = app.emit("menu:hard-reset", ());
            }
            _ => {}
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            get_mysql_password,
            set_mysql_password,
            delete_mysql_password
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
