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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![write_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
