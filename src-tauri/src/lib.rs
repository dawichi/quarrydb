use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

const MYSQL_KEYRING_SERVICE: &str = "dev.quarrydb.app.mysql";
const REDIS_KEYRING_SERVICE: &str = "dev.quarrydb.app.redis";

fn mysql_keyring_entry(connection_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(MYSQL_KEYRING_SERVICE, connection_id).map_err(|error| error.to_string())
}

fn redis_keyring_entry(connection_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(REDIS_KEYRING_SERVICE, connection_id).map_err(|error| error.to_string())
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
fn get_redis_password(connection_id: String) -> Result<Option<String>, String> {
    match redis_keyring_entry(&connection_id)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn set_redis_password(connection_id: String, password: String) -> Result<(), String> {
    redis_keyring_entry(&connection_id)?
        .set_password(&password)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_redis_password(connection_id: String) -> Result<(), String> {
    match redis_keyring_entry(&connection_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[derive(Clone, Deserialize)]
struct RedisConnectionTarget {
    host: String,
    port: u16,
    database: u8,
    tls: bool,
    username: Option<String>,
    password: Option<String>,
}

#[derive(Serialize)]
struct RedisConnectionInfo {
    server_version: Option<String>,
    database_size: i64,
}

#[derive(Serialize)]
struct RedisScanResult {
    cursor: u64,
    keys: Vec<String>,
}

#[derive(Serialize)]
struct RedisKeyDetails {
    key: String,
    kind: String,
    ttl_ms: i64,
    value: serde_json::Value,
}

fn redis_url(target: &RedisConnectionTarget) -> Result<String, String> {
    let host = target.host.trim();
    if host.is_empty()
        || host.bytes().any(|byte| byte == 0)
        || host.chars().any(char::is_whitespace)
    {
        return Err("Redis host must be a non-empty hostname or IP address".to_string());
    }
    if host.contains(['/', '?', '#', '@', '\\']) {
        return Err("Redis host contains an invalid URL character".to_string());
    }
    if target.port == 0 {
        return Err("Redis port must be between 1 and 65535".to_string());
    }

    let host_for_url = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    let scheme = if target.tls { "rediss" } else { "redis" };
    let mut url = url::Url::parse(&format!(
        "{scheme}://{host_for_url}:{}/{}",
        target.port, target.database
    ))
    .map_err(|error| format!("Invalid Redis connection target: {error}"))?;
    if target.username.is_some() || target.password.is_some() {
        url.set_username(target.username.as_deref().unwrap_or(""))
            .map_err(|_| "Redis username could not be encoded".to_string())?;
        url.set_password(target.password.as_deref())
            .map_err(|_| "Redis password could not be encoded".to_string())?;
    }
    Ok(url.to_string())
}

fn redis_connection(target: &RedisConnectionTarget) -> Result<redis::Connection, String> {
    let client = redis::Client::open(redis_url(target)?)
        .map_err(|error| "Redis client setup failed: ".to_string() + &error.to_string())?;
    client
        .get_connection_with_timeout(Duration::from_secs(10))
        .map_err(|error| "Redis connection failed: ".to_string() + &error.to_string())
}

fn redis_value_json(value: redis::Value) -> serde_json::Value {
    match value {
        redis::Value::Nil => serde_json::Value::Null,
        redis::Value::Int(value) => serde_json::json!(value),
        redis::Value::Double(value) => serde_json::json!(value),
        redis::Value::Boolean(value) => serde_json::json!(value),
        redis::Value::Okay => serde_json::json!("OK"),
        redis::Value::SimpleString(value) => serde_json::json!(value),
        redis::Value::BulkString(value) => redis_bytes_json(value),
        redis::Value::Array(values) | redis::Value::Set(values) => {
            serde_json::Value::Array(values.into_iter().map(redis_value_json).collect())
        }
        redis::Value::Map(values) => serde_json::Value::Object(
            values
                .into_iter()
                .filter_map(|(key, value)| {
                    redis_value_json(key)
                        .as_str()
                        .map(str::to_owned)
                        .map(|key| (key, redis_value_json(value)))
                })
                .collect(),
        ),
        redis::Value::Attribute { data, .. } => redis_value_json(*data),
        redis::Value::VerbatimString { text, .. } => serde_json::json!(text),
        redis::Value::BigNumber(value) => redis_bytes_json(value),
        _ => serde_json::Value::Null,
    }
}

fn redis_bytes_json(value: Vec<u8>) -> serde_json::Value {
    match String::from_utf8(value) {
        Ok(value) => serde_json::json!(value),
        Err(error) => serde_json::json!({
            "encoding": "base64",
            "data": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, error.as_bytes()),
        }),
    }
}

fn redis_info_value(info: &str, key: &str) -> Option<String> {
    info.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        (name == key).then(|| value.to_string())
    })
}

fn redis_read_value(
    connection: &mut redis::Connection,
    key: &str,
    kind: &str,
) -> Result<serde_json::Value, String> {
    let mut command = match kind {
        "string" => redis::cmd("GET"),
        "list" => redis::cmd("LRANGE"),
        "set" => redis::cmd("SMEMBERS"),
        "zset" => redis::cmd("ZRANGE"),
        "hash" => redis::cmd("HGETALL"),
        "stream" => redis::cmd("XRANGE"),
        _ => {
            return Ok(
                serde_json::json!({"message": "Value preview is not available for this Redis type"}),
            )
        }
    };
    match kind {
        "string" | "set" | "hash" => {
            command.arg(key);
        }
        "list" | "zset" => {
            command.arg(key).arg(0).arg(99);
            if kind == "zset" {
                command.arg("WITHSCORES");
            }
        }
        "stream" => {
            command.arg(key).arg("-").arg("+").arg("COUNT").arg(100);
        }
        _ => unreachable!(),
    }
    let value = command
        .query::<redis::Value>(connection)
        .map_err(|error| format!("Redis value read failed: {error}"))?;
    Ok(redis_value_json(value))
}

#[tauri::command]
fn redis_connect(target: RedisConnectionTarget) -> Result<RedisConnectionInfo, String> {
    let mut connection = redis_connection(&target)?;
    let _: String = redis::cmd("PING")
        .query(&mut connection)
        .map_err(|error| format!("Redis PING failed: {error}"))?;
    let info: String = redis::cmd("INFO")
        .arg("server")
        .query(&mut connection)
        .map_err(|error| format!("Redis INFO failed: {error}"))?;
    let database_size: i64 = redis::cmd("DBSIZE")
        .query(&mut connection)
        .map_err(|error| format!("Redis DBSIZE failed: {error}"))?;
    Ok(RedisConnectionInfo {
        server_version: redis_info_value(&info, "redis_version"),
        database_size,
    })
}

#[tauri::command]
fn redis_scan_keys(
    target: RedisConnectionTarget,
    cursor: u64,
    pattern: Option<String>,
    count: u32,
) -> Result<RedisScanResult, String> {
    let mut connection = redis_connection(&target)?;
    let safe_count = count.clamp(1, 500);
    let mut command = redis::cmd("SCAN");
    command.arg(cursor).arg("COUNT").arg(safe_count);
    if let Some(pattern) = pattern.filter(|pattern| !pattern.is_empty()) {
        command.arg("MATCH").arg(pattern);
    }
    let (next_cursor, keys) = command
        .query::<(u64, Vec<String>)>(&mut connection)
        .map_err(|error| format!("Redis key scan failed: {error}"))?;
    Ok(RedisScanResult {
        cursor: next_cursor,
        keys,
    })
}

#[tauri::command]
fn redis_get_key(target: RedisConnectionTarget, key: String) -> Result<RedisKeyDetails, String> {
    if key.is_empty() {
        return Err("Redis key cannot be empty".to_string());
    }
    let mut connection = redis_connection(&target)?;
    let kind: String = redis::cmd("TYPE")
        .arg(&key)
        .query(&mut connection)
        .map_err(|error| format!("Redis TYPE failed: {error}"))?;
    let ttl_ms: i64 = redis::cmd("PTTL")
        .arg(&key)
        .query(&mut connection)
        .map_err(|error| format!("Redis PTTL failed: {error}"))?;
    let value = redis_read_value(&mut connection, &key, &kind)?;
    Ok(RedisKeyDetails {
        key,
        kind,
        ttl_ms,
        value,
    })
}

#[tauri::command]
fn redis_set_string(
    target: RedisConnectionTarget,
    key: String,
    value: String,
    ttl_ms: Option<i64>,
) -> Result<(), String> {
    if key.is_empty() {
        return Err("Redis key cannot be empty".to_string());
    }
    if ttl_ms.is_some_and(|ttl| ttl <= 0) {
        return Err("Redis TTL must be a positive number of milliseconds".to_string());
    }
    let mut connection = redis_connection(&target)?;
    let mut command = redis::cmd("SET");
    command.arg(key).arg(value);
    if let Some(ttl) = ttl_ms {
        command.arg("PX").arg(ttl);
    }
    command
        .query::<String>(&mut connection)
        .map_err(|error| format!("Redis SET failed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn redis_delete_key(target: RedisConnectionTarget, key: String) -> Result<i64, String> {
    if key.is_empty() {
        return Err("Redis key cannot be empty".to_string());
    }
    let mut connection = redis_connection(&target)?;
    redis::cmd("DEL")
        .arg(key)
        .query(&mut connection)
        .map_err(|error| format!("Redis DEL failed: {error}"))
}

#[tauri::command]
fn redis_run_command(
    target: RedisConnectionTarget,
    args: Vec<String>,
) -> Result<serde_json::Value, String> {
    if args.is_empty() || args[0].trim().is_empty() {
        return Err("Redis command cannot be empty".to_string());
    }
    if args.len() > 64 || args.iter().map(String::len).sum::<usize>() > 64 * 1024 {
        return Err("Redis command is too large".to_string());
    }
    let mut connection = redis_connection(&target)?;
    let mut command = redis::cmd(&args[0]);
    for arg in args.iter().skip(1) {
        command.arg(arg);
    }
    let value = command
        .query::<redis::Value>(&mut connection)
        .map_err(|error| format!("Redis command failed: {error}"))?;
    Ok(redis_value_json(value))
}

#[tauri::command]
fn write_text_file(path: String, content: String, ext: String) -> Result<(), String> {
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
            delete_mysql_password,
            get_redis_password,
            set_redis_password,
            delete_redis_password,
            redis_connect,
            redis_scan_keys,
            redis_get_key,
            redis_set_string,
            redis_delete_key,
            redis_run_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}

#[cfg(test)]
mod tests {
    use super::{
        redis_connect, redis_delete_key, redis_get_key, redis_run_command, redis_scan_keys,
        redis_set_string, redis_url, RedisConnectionTarget,
    };
    use std::env;

    fn target() -> RedisConnectionTarget {
        RedisConnectionTarget {
            host: "127.0.0.1".to_string(),
            port: 6379,
            database: 2,
            tls: false,
            username: Some("default user".to_string()),
            password: Some("p@ss word".to_string()),
        }
    }

    #[test]
    fn builds_an_encoded_redis_url_without_exposing_password_in_host_position() {
        let url = redis_url(&target()).expect("valid Redis target");
        assert_eq!(url, "redis://default%20user:p%40ss%20word@127.0.0.1:6379/2");
    }

    #[test]
    fn builds_tls_urls_and_supports_ipv6_hosts() {
        let mut target = target();
        target.host = "::1".to_string();
        target.tls = true;
        assert_eq!(
            redis_url(&target).expect("valid Redis target"),
            "rediss://default%20user:p%40ss%20word@[::1]:6379/2"
        );
    }

    #[test]
    fn rejects_url_injection_and_invalid_ports() {
        let mut target = target();
        target.host = "127.0.0.1/other".to_string();
        assert!(redis_url(&target).is_err());
        target.host = "127.0.0.1".to_string();
        target.port = 0;
        assert!(redis_url(&target).is_err());
    }

    #[test]
    fn exercises_the_native_provider_against_a_live_server_when_requested() {
        if env::var("QUARRY_REDIS_INTEGRATION").as_deref() != Ok("1") {
            return;
        }
        let target = RedisConnectionTarget {
            host: env::var("QUARRY_REDIS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: env::var("QUARRY_REDIS_PORT")
                .ok()
                .and_then(|port| port.parse().ok())
                .unwrap_or(6379),
            database: 0,
            tls: false,
            username: None,
            password: None,
        };
        let _ = redis_connect(target.clone()).expect("Redis should accept PING");
        let key = "quarry:native:test".to_string();
        redis_set_string(
            target.clone(),
            key.clone(),
            "hello".to_string(),
            Some(60_000),
        )
        .expect("SET should work");
        let details = redis_get_key(target.clone(), key.clone()).expect("GET should work");
        assert_eq!(details.kind, "string");
        assert_eq!(details.value, serde_json::json!("hello"));
        let scan = redis_scan_keys(target.clone(), 0, Some("quarry:native:*".to_string()), 100)
            .expect("SCAN should work");
        assert!(scan.keys.contains(&key));
        let output = redis_run_command(target.clone(), vec!["PING".to_string()])
            .expect("command should work");
        assert_eq!(output, serde_json::json!("PONG"));
        assert_eq!(redis_delete_key(target, key).expect("DEL should work"), 1);
    }
}
