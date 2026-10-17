#[tauri::command(async)]
pub fn write_text_file(path: String, content: String, ext: String) -> Result<(), String> {
    if !matches!(ext.as_str(), "csv" | "json" | "sql" | "md") {
        return Err("Unsupported export extension".to_string());
    }
    if path.trim().is_empty() {
        return Err("Export path cannot be empty".to_string());
    }
    // macOS save dialogs hide the extension visually but append it in the returned path.
    // This guard catches the rare case where the OS returns the path without extension.
    let final_path = if !path.ends_with(&format!(".{ext}")) {
        format!("{path}.{ext}")
    } else {
        path
    };
    std::fs::write(final_path, content).map_err(|e| e.to_string())
}
