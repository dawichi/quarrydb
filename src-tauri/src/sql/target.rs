use serde::Deserialize;
use std::str::FromStr;
use std::time::Duration;

use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlPoolOptions, MySqlSslMode};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::Executor;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
/// Server-side cap for read statements, so an accidental full scan cannot run forever.
const MYSQL_MAX_EXECUTION_MS: u32 = 60_000;

/// Where a SQL connection points. Credentials only ever travel frontend → backend.
#[derive(Deserialize)]
#[serde(tag = "engine", rename_all = "lowercase")]
pub enum SqlTarget {
    Sqlite {
        path: String,
        #[serde(default)]
        create: bool,
    },
    #[serde(rename_all = "camelCase")]
    Mysql {
        connection_id: String,
        host: String,
        port: u16,
        username: String,
        password: String,
        database: Option<String>,
        ssl_mode: Option<String>,
    },
}

impl SqlTarget {
    /// Stable, secret-free handle the frontend uses to address the pool.
    pub fn handle(&self) -> String {
        match self {
            SqlTarget::Sqlite { path, .. } => format!("sqlite:{path}"),
            SqlTarget::Mysql { connection_id, .. } => format!("mysql:{connection_id}"),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        match self {
            SqlTarget::Sqlite { path, .. } => {
                if path.trim().is_empty() || path.contains('\0') {
                    return Err("SQLite path cannot be empty".to_string());
                }
            }
            SqlTarget::Mysql {
                connection_id,
                host,
                port,
                ..
            } => {
                if connection_id.trim().is_empty() {
                    return Err("MySQL connection id cannot be empty".to_string());
                }
                let host = host.trim();
                if host.is_empty()
                    || host.chars().any(char::is_whitespace)
                    || host.contains(['/', '?', '#', '@', '\\', '\0'])
                {
                    return Err("MySQL host must be a non-empty hostname or IP address".to_string());
                }
                if *port == 0 {
                    return Err("MySQL port must be between 1 and 65535".to_string());
                }
            }
        }
        Ok(())
    }
}

pub async fn open_sqlite(path: &str, create: bool) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str("sqlite:")?
        .filename(path)
        .create_if_missing(create)
        .foreign_keys(true)
        .busy_timeout(SQLITE_BUSY_TIMEOUT);
    SqlitePoolOptions::new()
        .max_connections(4)
        .acquire_timeout(CONNECT_TIMEOUT)
        .connect_with(options)
        .await
}

pub async fn open_mysql(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    database: Option<&str>,
    ssl_mode: Option<&str>,
) -> Result<MySqlPool, sqlx::Error> {
    let ssl_mode = match ssl_mode.unwrap_or("preferred") {
        "disabled" => MySqlSslMode::Disabled,
        "required" => MySqlSslMode::Required,
        _ => MySqlSslMode::Preferred,
    };
    let mut options = MySqlConnectOptions::new()
        .host(host.trim())
        .port(port)
        .username(username)
        .password(password)
        .ssl_mode(ssl_mode)
        .charset("utf8mb4");
    if let Some(database) = database.filter(|name| !name.trim().is_empty()) {
        options = options.database(database);
    }
    MySqlPoolOptions::new()
        .max_connections(4)
        .acquire_timeout(CONNECT_TIMEOUT)
        .after_connect(|connection, _| {
            Box::pin(async move {
                // MariaDB names this differently; a failure here must not block the connection.
                let _ = connection
                    .execute(
                        format!("SET SESSION max_execution_time = {MYSQL_MAX_EXECUTION_MS}")
                            .as_str(),
                    )
                    .await;
                Ok(())
            })
        })
        .connect_with(options)
        .await
}
