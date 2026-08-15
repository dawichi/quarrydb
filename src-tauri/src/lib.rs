use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
fn redis_key_details(
    connection: &mut redis::Connection,
    key: &str,
) -> Result<RedisKeyDetails, String> {
    if key.is_empty() {
        return Err("Redis key cannot be empty".to_string());
    }
    let kind: String = redis::cmd("TYPE")
        .arg(&key)
        .query(connection)
        .map_err(|error| format!("Redis TYPE failed: {error}"))?;
    let ttl_ms: i64 = redis::cmd("PTTL")
        .arg(&key)
        .query(connection)
        .map_err(|error| format!("Redis PTTL failed: {error}"))?;
    let value = redis_read_value(connection, key, &kind)?;
    Ok(RedisKeyDetails {
        key: key.to_string(),
        kind,
        ttl_ms,
        value,
    })
}

#[tauri::command]
fn redis_get_key(target: RedisConnectionTarget, key: String) -> Result<RedisKeyDetails, String> {
    let mut connection = redis_connection(&target)?;
    redis_key_details(&mut connection, &key)
}

#[tauri::command]
fn redis_export_keyspace(
    target: RedisConnectionTarget,
    pattern: Option<String>,
    max_keys: u32,
) -> Result<Vec<RedisKeyDetails>, String> {
    if max_keys == 0 {
        return Err("Redis export limit must be positive".to_string());
    }
    let safe_max_keys = max_keys.clamp(1, 500) as usize;
    let pattern = pattern.filter(|value| !value.is_empty());
    let mut connection = redis_connection(&target)?;
    let mut cursor = 0;
    let mut seen = HashSet::new();
    let mut details = Vec::new();

    loop {
        let mut command = redis::cmd("SCAN");
        command.arg(cursor).arg("COUNT").arg(100);
        if let Some(pattern) = &pattern {
            command.arg("MATCH").arg(pattern);
        }
        let (next_cursor, keys) = command
            .query::<(u64, Vec<String>)>(&mut connection)
            .map_err(|error| format!("Redis key export scan failed: {error}"))?;

        for key in keys {
            if details.len() >= safe_max_keys {
                break;
            }
            if seen.insert(key.clone()) {
                details.push(redis_key_details(&mut connection, &key)?);
            }
        }

        if details.len() >= safe_max_keys || next_cursor == 0 {
            break;
        }
        cursor = next_cursor;
    }

    details.sort_by(|left, right| left.key.cmp(&right.key));
    Ok(details)
}

#[tauri::command]
fn redis_mutate_collection(
    target: RedisConnectionTarget,
    key: String,
    kind: String,
    operation: String,
    field: Option<String>,
    value: Option<String>,
    score: Option<f64>,
) -> Result<i64, String> {
    if key.is_empty() {
        return Err("Redis key cannot be empty".to_string());
    }
    if kind != "list" && kind != "set" && kind != "zset" && kind != "hash" && kind != "stream" {
        return Err("Redis collection mutation type is not supported".to_string());
    }
    if key.len() > 64 * 1024 {
        return Err("Redis key is too large".to_string());
    }
    let value = value.filter(|item| item.len() <= 64 * 1024);
    let field = field.filter(|item| item.len() <= 64 * 1024);
    match (kind.as_str(), operation.as_str()) {
        ("list", "push_left") | ("list", "push_right") | ("set", "add") | ("set", "remove")
            if value.is_some() => {}
        ("zset", "upsert") if value.is_some() && score.is_some_and(f64::is_finite) => {}
        ("zset", "remove") if value.is_some() => {}
        ("hash", "set") if field.is_some() && value.is_some() => {}
        ("hash", "remove") if field.is_some() => {}
        ("stream", "append") if field.is_some() && value.is_some() => {}
        _ => return Err("Redis collection mutation arguments are invalid".to_string()),
    }
    let mut connection = redis_connection(&target)?;

    let result =
        match (kind.as_str(), operation.as_str()) {
            ("list", "push_left") | ("list", "push_right") => {
                let value = value
                    .ok_or_else(|| "Redis list value cannot be empty or too large".to_string())?;
                let command_name = if operation == "push_left" {
                    "LPUSH"
                } else {
                    "RPUSH"
                };
                redis::cmd(command_name)
                    .arg(&key)
                    .arg(value)
                    .query::<i64>(&mut connection)
                    .map_err(|error| format!("Redis list mutation failed: {error}"))?
            }
            ("set", "add") | ("set", "remove") => {
                let value = value
                    .ok_or_else(|| "Redis set member cannot be empty or too large".to_string())?;
                let command_name = if operation == "add" { "SADD" } else { "SREM" };
                redis::cmd(command_name)
                    .arg(&key)
                    .arg(value)
                    .query::<i64>(&mut connection)
                    .map_err(|error| format!("Redis set mutation failed: {error}"))?
            }
            ("zset", "upsert") | ("zset", "remove") => {
                let member = value.ok_or_else(|| {
                    "Redis sorted-set member cannot be empty or too large".to_string()
                })?;
                let command_name = if operation == "upsert" {
                    "ZADD"
                } else {
                    "ZREM"
                };
                let mut command = redis::cmd(command_name);
                command.arg(&key);
                if operation == "upsert" {
                    let score = score.filter(|item| item.is_finite()).ok_or_else(|| {
                        "Redis sorted-set score must be a finite number".to_string()
                    })?;
                    command.arg(score);
                }
                command
                    .arg(member)
                    .query::<i64>(&mut connection)
                    .map_err(|error| format!("Redis sorted-set mutation failed: {error}"))?
            }
            ("hash", "set") | ("hash", "remove") => {
                let field = field
                    .ok_or_else(|| "Redis hash field cannot be empty or too large".to_string())?;
                let command_name = if operation == "set" { "HSET" } else { "HDEL" };
                let mut command = redis::cmd(command_name);
                command.arg(&key).arg(field);
                if operation == "set" {
                    command.arg(value.ok_or_else(|| {
                        "Redis hash value cannot be empty or too large".to_string()
                    })?);
                }
                command
                    .query::<i64>(&mut connection)
                    .map_err(|error| format!("Redis hash mutation failed: {error}"))?
            }
            ("stream", "append") => {
                let field = field
                    .ok_or_else(|| "Redis stream field cannot be empty or too large".to_string())?;
                let value = value
                    .ok_or_else(|| "Redis stream value cannot be empty or too large".to_string())?;
                redis::cmd("XADD")
                    .arg(&key)
                    .arg("*")
                    .arg(field)
                    .arg(value)
                    .query::<String>(&mut connection)
                    .map(|_| 1)
                    .map_err(|error| format!("Redis stream mutation failed: {error}"))?
            }
            _ => return Err("Redis collection mutation operation is not supported".to_string()),
        };

    Ok(result)
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
            redis_export_keyspace,
            redis_mutate_collection,
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
        redis_connect, redis_delete_key, redis_export_keyspace, redis_get_key,
        redis_mutate_collection, redis_run_command, redis_scan_keys, redis_set_string, redis_url,
        RedisConnectionTarget,
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
    fn rejects_invalid_mutation_and_command_inputs_before_connecting() {
        let target = target();
        assert!(
            redis_set_string(target.clone(), String::new(), "value".to_string(), None).is_err()
        );
        assert!(redis_set_string(
            target.clone(),
            "key".to_string(),
            "value".to_string(),
            Some(0)
        )
        .is_err());
        assert!(redis_delete_key(target.clone(), String::new()).is_err());
        assert!(redis_run_command(target, Vec::new()).is_err());
    }

    #[test]
    fn rejects_empty_keyspace_export_limits_before_connecting() {
        assert!(redis_export_keyspace(target(), None, 0).is_err());
    }

    #[test]
    fn rejects_unsupported_collection_mutations_before_connecting() {
        assert!(redis_mutate_collection(
            target(),
            "key".to_string(),
            "string".to_string(),
            "set".to_string(),
            None,
            Some("value".to_string()),
            None,
        )
        .is_err());
        assert!(redis_mutate_collection(
            target(),
            "key".to_string(),
            "zset".to_string(),
            "upsert".to_string(),
            None,
            Some("member".to_string()),
            Some(f64::NAN),
        )
        .is_err());
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

        let list_key = "quarry:native:list";
        let set_key = "quarry:native:set";
        let zset_key = "quarry:native:zset";
        let hash_key = "quarry:native:hash";
        let stream_key = "quarry:native:stream";
        let mut connection =
            super::redis_connection(&target).expect("Redis connection should work");
        let _: i64 = redis::cmd("DEL")
            .arg(&[list_key, set_key, zset_key, hash_key, stream_key])
            .query(&mut connection)
            .expect("fixture cleanup should work");
        let _: i64 = redis::cmd("RPUSH")
            .arg(list_key)
            .arg("first")
            .arg("second")
            .query(&mut connection)
            .expect("RPUSH should work");
        let _: i64 = redis::cmd("SADD")
            .arg(set_key)
            .arg("alpha")
            .arg("beta")
            .query(&mut connection)
            .expect("SADD should work");
        let _: i64 = redis::cmd("ZADD")
            .arg(zset_key)
            .arg(1.5)
            .arg("first")
            .arg(2.5)
            .arg("second")
            .query(&mut connection)
            .expect("ZADD should work");
        let _: i64 = redis::cmd("HSET")
            .arg(hash_key)
            .arg("field")
            .arg("value")
            .query(&mut connection)
            .expect("HSET should work");
        let _: String = redis::cmd("XADD")
            .arg(stream_key)
            .arg("*")
            .arg("field")
            .arg("value")
            .query(&mut connection)
            .expect("XADD should work");

        assert_eq!(
            redis_mutate_collection(
                target.clone(),
                list_key.to_string(),
                "list".to_string(),
                "push_right".to_string(),
                None,
                Some("third".to_string()),
                None,
            )
            .expect("list mutation should work"),
            3
        );
        assert_eq!(
            redis_mutate_collection(
                target.clone(),
                set_key.to_string(),
                "set".to_string(),
                "add".to_string(),
                None,
                Some("gamma".to_string()),
                None,
            )
            .expect("set add should work"),
            1
        );
        assert_eq!(
            redis_mutate_collection(
                target.clone(),
                set_key.to_string(),
                "set".to_string(),
                "remove".to_string(),
                None,
                Some("gamma".to_string()),
                None,
            )
            .expect("set remove should work"),
            1
        );
        assert_eq!(
            redis_mutate_collection(
                target.clone(),
                zset_key.to_string(),
                "zset".to_string(),
                "upsert".to_string(),
                None,
                Some("third".to_string()),
                Some(3.5),
            )
            .expect("sorted-set upsert should work"),
            1
        );
        assert_eq!(
            redis_mutate_collection(
                target.clone(),
                zset_key.to_string(),
                "zset".to_string(),
                "remove".to_string(),
                None,
                Some("third".to_string()),
                None,
            )
            .expect("sorted-set remove should work"),
            1
        );
        assert_eq!(
            redis_mutate_collection(
                target.clone(),
                hash_key.to_string(),
                "hash".to_string(),
                "set".to_string(),
                Some("other".to_string()),
                Some("value".to_string()),
                None,
            )
            .expect("hash set should work"),
            1
        );
        assert_eq!(
            redis_mutate_collection(
                target.clone(),
                hash_key.to_string(),
                "hash".to_string(),
                "remove".to_string(),
                Some("other".to_string()),
                None,
                None,
            )
            .expect("hash remove should work"),
            1
        );
        assert_eq!(
            redis_mutate_collection(
                target.clone(),
                stream_key.to_string(),
                "stream".to_string(),
                "append".to_string(),
                Some("second".to_string()),
                Some("value".to_string()),
                None,
            )
            .expect("stream append should work"),
            1
        );

        let list = redis_get_key(target.clone(), list_key.to_string()).expect("LRANGE should work");
        assert_eq!(list.kind, "list");
        assert_eq!(list.value, serde_json::json!(["first", "second", "third"]));

        let set = redis_get_key(target.clone(), set_key.to_string()).expect("SMEMBERS should work");
        assert_eq!(set.kind, "set");
        assert_eq!(set.value.as_array().map(Vec::len), Some(2));

        let zset = redis_get_key(target.clone(), zset_key.to_string()).expect("ZRANGE should work");
        assert_eq!(zset.kind, "zset");
        assert_eq!(zset.value.as_array().map(Vec::len), Some(4));

        let hash =
            redis_get_key(target.clone(), hash_key.to_string()).expect("HGETALL should work");
        assert_eq!(hash.kind, "hash");
        assert_eq!(hash.value, serde_json::json!(["field", "value"]));

        let stream =
            redis_get_key(target.clone(), stream_key.to_string()).expect("XRANGE should work");
        assert_eq!(stream.kind, "stream");
        assert_eq!(stream.value.as_array().map(Vec::len), Some(2));

        let scan = redis_scan_keys(target.clone(), 0, Some("quarry:native:*".to_string()), 100)
            .expect("SCAN should work");
        assert!(scan.keys.contains(&key));
        let output = redis_run_command(target.clone(), vec!["PING".to_string()])
            .expect("command should work");
        assert_eq!(output, serde_json::json!("PONG"));
        assert_eq!(redis_delete_key(target, key).expect("DEL should work"), 1);
        assert_eq!(
            redis::cmd("DEL")
                .arg(&[
                    list_key.to_string(),
                    set_key.to_string(),
                    zset_key.to_string(),
                    hash_key.to_string(),
                    stream_key.to_string()
                ])
                .query::<i64>(&mut connection)
                .expect("fixture cleanup should work"),
            5
        );
    }
}
