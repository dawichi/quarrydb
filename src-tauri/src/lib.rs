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

/// Calls the SQL commands through Tauri's IPC layer with the exact JSON the frontend sends
/// (`src/app/core/native/sql-client.ts`), so argument names cannot drift apart unnoticed.
#[cfg(test)]
mod ipc_tests {
    use serde_json::{json, Value};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;

    fn invoke(
        webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
        cmd: &str,
        args: Value,
    ) -> Result<Value, Value> {
        get_ipc_response(
            webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    #[test]
    fn sql_commands_round_trip_through_ipc() {
        let app = mock_builder()
            .manage(crate::sql::SqlState::default())
            .invoke_handler(tauri::generate_handler![
                crate::sql::sql_connect,
                crate::sql::sql_select,
                crate::sql::sql_execute,
                crate::sql::sql_disconnect
            ])
            .build(mock_context(noop_assets()))
            .expect("mock app");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview");
        let path = std::env::temp_dir().join(format!("quarry-ipc-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);

        let handle = invoke(
            &webview,
            "sql_connect",
            json!({ "target": { "engine": "sqlite", "path": path.to_string_lossy(), "create": true } }),
        )
        .expect("connect");
        let handle = handle.as_str().expect("handle string").to_string();

        let results = invoke(
            &webview,
            "sql_execute",
            json!({
                "handle": handle,
                "statements": [
                    { "sql": "CREATE TABLE t (id INTEGER PRIMARY KEY, price REAL)" },
                    { "sql": "INSERT INTO t (price) VALUES (?), (?)", "params": [79.99, 1299.99] }
                ],
                "transactional": true,
                "onError": []
            }),
        )
        .expect("execute");
        assert_eq!(results[1], json!({ "rowsAffected": 2, "lastInsertId": 2 }));

        let failed = invoke(
            &webview,
            "sql_execute",
            json!({
                "handle": handle,
                "statements": [
                    { "sql": "UPDATE t SET price = 0" },
                    { "sql": "DELETE FROM t WHERE id = ?", "params": [99], "expectRows": true }
                ]
            }),
        );
        assert!(
            failed.is_err(),
            "a vanished edit target must fail the batch"
        );

        let rows = invoke(
            &webview,
            "sql_select",
            json!({ "handle": handle, "sql": "SELECT * FROM t ORDER BY price DESC", "params": [], "maxRows": 1 }),
        )
        .expect("select");
        assert_eq!(rows["columns"], json!(["id", "price"]));
        assert_eq!(rows["rows"], json!([[2, 1299.99]]));
        assert_eq!(rows["truncated"], json!(true));

        invoke(&webview, "sql_disconnect", json!({ "handle": handle })).expect("disconnect");
        assert!(invoke(
            &webview,
            "sql_select",
            json!({ "handle": handle, "sql": "SELECT 1" })
        )
        .is_err());
        let _ = std::fs::remove_file(&path);
    }

    /// Serves every app command over `http://127.0.0.1:1430/invoke` so the Angular UI can run
    /// in a browser against the real Rust layer (`e2e/native-bridge.ts`). Manual use only:
    /// `cargo test --lib ui_bridge -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn ui_bridge() {
        use std::io::{BufRead, BufReader, Read, Write};

        let app = mock_builder()
            .manage(crate::sql::SqlState::default())
            .invoke_handler(tauri::generate_handler![
                crate::files::write_text_file,
                crate::sql::sql_connect,
                crate::sql::sql_disconnect,
                crate::sql::sql_select,
                crate::sql::sql_execute,
                crate::redis::redis_connect,
                crate::redis::redis_scan_keys,
                crate::redis::redis_get_key,
                crate::redis::redis_export_keyspace,
                crate::redis::redis_mutate_collection,
                crate::redis::redis_set_string,
                crate::redis::redis_delete_key,
                crate::redis::redis_run_command
            ])
            .build(mock_context(noop_assets()))
            .expect("mock app");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview");

        let listener = std::net::TcpListener::bind("127.0.0.1:1430").expect("bind 1430");
        println!("ui bridge listening on http://127.0.0.1:1430/invoke");
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut reader = BufReader::new(stream.try_clone().expect("clone stream"));
            let mut request_line = String::new();
            if reader.read_line(&mut request_line).is_err() {
                continue;
            }
            let mut length = 0;
            loop {
                let mut header = String::new();
                if reader.read_line(&mut header).is_err() || header.trim().is_empty() {
                    break;
                }
                if let Some((name, value)) = header.split_once(':') {
                    if name.eq_ignore_ascii_case("content-length") {
                        length = value.trim().parse().unwrap_or(0);
                    }
                }
            }
            let mut body = vec![0; length];
            let _ = reader.read_exact(&mut body);

            let reply = if request_line.starts_with("POST") {
                let request: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
                let cmd = request["cmd"].as_str().unwrap_or_default();
                match invoke(&webview, cmd, request["args"].clone()) {
                    Ok(value) => json!({ "ok": value }),
                    Err(error) => json!({ "err": error }),
                }
                .to_string()
            } else {
                String::new()
            };
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                reply.len(),
                reply
            );
        }
    }
}
