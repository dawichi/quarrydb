//! Native SQL access for SQLite and MySQL.
//!
//! The frontend opens a connection once and addresses it by a secret-free handle. Pools live
//! here, so a batch of statements always runs on one connection (real transactions), every
//! statement is bounded by a timeout, and values are decoded by their engine type.

mod target;
mod value;

use std::collections::HashMap;
use std::time::{Duration, Instant};

use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use sqlx::mysql::MySqlPool;
use sqlx::sqlite::SqlitePool;
use sqlx::{Column, Executor, Row};
use tokio::sync::RwLock;

pub use target::SqlTarget;
use value::bind_params;

const STATEMENT_TIMEOUT: Duration = Duration::from_secs(60);
/// Hard ceiling for one select, whatever the caller asks for. Exports stay well under it.
const MAX_ROWS: usize = 200_000;

#[derive(Clone)]
enum Pool {
    Sqlite(SqlitePool),
    MySql(MySqlPool),
}

#[derive(Default)]
pub struct SqlState {
    pools: RwLock<HashMap<String, Pool>>,
}

impl SqlState {
    async fn pool(&self, handle: &str) -> Result<Pool, String> {
        self.pools
            .read()
            .await
            .get(handle)
            .cloned()
            .ok_or_else(|| "This connection is closed. Reconnect and try again.".to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlRows {
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
    truncated: bool,
    duration_ms: u64,
}

#[derive(Deserialize)]
pub struct SqlStatement {
    sql: String,
    #[serde(default)]
    params: Vec<serde_json::Value>,
    /// Fail (and roll back) when the statement touches no rows, e.g. a stale edit target.
    #[serde(default, rename = "expectRows")]
    expect_rows: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlExecResult {
    rows_affected: u64,
    last_insert_id: Option<i64>,
}

fn describe_error(error: sqlx::Error) -> String {
    match error {
        sqlx::Error::Database(error) => error.message().to_string(),
        sqlx::Error::PoolTimedOut => "Timed out waiting for a database connection".to_string(),
        other => other.to_string(),
    }
}

async fn with_timeout<T>(
    future: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    tokio::time::timeout(STATEMENT_TIMEOUT, future)
        .await
        .map_err(|_| {
            format!(
                "Query timed out after {} seconds",
                STATEMENT_TIMEOUT.as_secs()
            )
        })?
}

/// Opens (or reuses) a pool and returns its handle.
#[tauri::command]
pub async fn sql_connect(
    state: tauri::State<'_, SqlState>,
    target: SqlTarget,
) -> Result<String, String> {
    target.validate()?;
    let handle = target.handle();
    let pool = match &target {
        SqlTarget::Sqlite { path, create } => {
            if let Some(Pool::Sqlite(existing)) = state.pools.read().await.get(&handle) {
                if !existing.is_closed() {
                    return Ok(handle);
                }
            }
            Pool::Sqlite(
                target::open_sqlite(path, *create)
                    .await
                    .map_err(describe_error)?,
            )
        }
        SqlTarget::Mysql {
            host,
            port,
            username,
            password,
            database,
            ssl_mode,
            ..
        } => Pool::MySql(
            target::open_mysql(
                host,
                *port,
                username,
                password,
                database.as_deref(),
                ssl_mode.as_deref(),
            )
            .await
            .map_err(describe_error)?,
        ),
    };
    // MySQL credentials may have changed, so a reconnect always replaces the old pool.
    if let Some(previous) = state.pools.write().await.insert(handle.clone(), pool) {
        close_pool(previous).await;
    }
    Ok(handle)
}

#[tauri::command]
pub async fn sql_disconnect(
    state: tauri::State<'_, SqlState>,
    handle: String,
) -> Result<(), String> {
    if let Some(pool) = state.pools.write().await.remove(&handle) {
        close_pool(pool).await;
    }
    Ok(())
}

async fn close_pool(pool: Pool) {
    match pool {
        Pool::Sqlite(pool) => pool.close().await,
        Pool::MySql(pool) => pool.close().await,
    }
}

type Selected = (Vec<String>, Vec<Vec<serde_json::Value>>, bool);

macro_rules! engine_select {
    ($name:ident, $pool:ty, $cell:path) => {
        async fn $name(
            pool: &$pool,
            sql: &str,
            params: &[serde_json::Value],
            max_rows: usize,
        ) -> Result<Selected, String> {
            let mut connection = pool.acquire().await.map_err(describe_error)?;
            let mut columns: Vec<String> = Vec::new();
            let mut rows = Vec::new();
            let mut truncated = false;
            {
                let mut stream = if params.is_empty() {
                    connection.fetch(sql)
                } else {
                    bind_params!(sqlx::query(sql), params).fetch(&mut *connection)
                };
                while let Some(row) = stream.try_next().await.map_err(describe_error)? {
                    if columns.is_empty() {
                        columns = row.columns().iter().map(|c| c.name().to_string()).collect();
                    }
                    if rows.len() >= max_rows {
                        truncated = true;
                        break;
                    }
                    rows.push((0..row.len()).map(|index| $cell(&row, index)).collect());
                }
            }
            if columns.is_empty() {
                // Empty results still have a shape; the pipeline shows headers for zero rows.
                if let Ok(described) = connection.describe(sql).await {
                    columns = described
                        .columns()
                        .iter()
                        .map(|c| c.name().to_string())
                        .collect();
                }
            }
            Ok((columns, rows, truncated))
        }
    };
}

engine_select!(select_sqlite, SqlitePool, value::sqlite_cell);
engine_select!(select_mysql, MySqlPool, value::mysql_cell);

/// Runs one row-returning statement and returns at most `max_rows` rows.
#[tauri::command]
pub async fn sql_select(
    state: tauri::State<'_, SqlState>,
    handle: String,
    sql: String,
    params: Option<Vec<serde_json::Value>>,
    max_rows: Option<usize>,
) -> Result<SqlRows, String> {
    let pool = state.pool(&handle).await?;
    let params = params.unwrap_or_default();
    let max_rows = max_rows.unwrap_or(MAX_ROWS).min(MAX_ROWS);
    let started = Instant::now();
    let (columns, rows, truncated) = with_timeout(async {
        match &pool {
            Pool::Sqlite(pool) => select_sqlite(pool, &sql, &params, max_rows).await,
            Pool::MySql(pool) => select_mysql(pool, &sql, &params, max_rows).await,
        }
    })
    .await?;
    Ok(SqlRows {
        columns,
        rows,
        truncated,
        duration_ms: u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
    })
}

macro_rules! engine_batch {
    ($run_one:ident, $batch:ident, $pool:ty, $connection:ty, $result:ty, $last_id:expr) => {
        async fn $run_one(
            connection: &mut $connection,
            statement: &SqlStatement,
        ) -> Result<SqlExecResult, String> {
            let result: $result = if statement.params.is_empty() {
                connection.execute(statement.sql.as_str()).await
            } else {
                bind_params!(sqlx::query(&statement.sql), statement.params)
                    .execute(&mut *connection)
                    .await
            }
            .map_err(describe_error)?;
            if statement.expect_rows && result.rows_affected() == 0 {
                return Err(
                    "The target row was not found; it may have changed. Refresh and retry."
                        .to_string(),
                );
            }
            Ok(SqlExecResult {
                rows_affected: result.rows_affected(),
                last_insert_id: $last_id(&result),
            })
        }

        async fn $batch(
            pool: &$pool,
            statements: &[SqlStatement],
            transactional: bool,
            on_error: &[SqlStatement],
        ) -> Result<Vec<SqlExecResult>, String> {
            let mut connection = pool.acquire().await.map_err(describe_error)?;
            let mut results = Vec::with_capacity(statements.len());
            if transactional {
                let mut transaction = sqlx::Connection::begin(&mut *connection)
                    .await
                    .map_err(describe_error)?;
                for statement in statements {
                    results.push($run_one(&mut transaction, statement).await?);
                }
                transaction.commit().await.map_err(describe_error)?;
            } else {
                for statement in statements {
                    match $run_one(&mut connection, statement).await {
                        Ok(result) => results.push(result),
                        Err(error) => {
                            // Restore connection state (open transaction, pragmas) before the
                            // connection goes back to the pool. Cleanup failures are secondary.
                            for cleanup in on_error {
                                let _ = $run_one(&mut connection, cleanup).await;
                            }
                            return Err(error);
                        }
                    }
                }
            }
            Ok(results)
        }
    };
}

engine_batch!(
    run_sqlite_statement,
    execute_sqlite_batch,
    SqlitePool,
    sqlx::SqliteConnection,
    sqlx::sqlite::SqliteQueryResult,
    |result: &sqlx::sqlite::SqliteQueryResult| Some(result.last_insert_rowid())
);

engine_batch!(
    run_mysql_statement,
    execute_mysql_batch,
    MySqlPool,
    sqlx::MySqlConnection,
    sqlx::mysql::MySqlQueryResult,
    |result: &sqlx::mysql::MySqlQueryResult| i64::try_from(result.last_insert_id())
        .ok()
        .filter(|id| *id > 0)
);

/// Runs statements in order on a single connection; with `transactional` they commit
/// together or not at all (an error drops the transaction, which rolls it back).
/// Without a transaction, `on_error` statements run on the same connection after a failure.
#[tauri::command]
pub async fn sql_execute(
    state: tauri::State<'_, SqlState>,
    handle: String,
    statements: Vec<SqlStatement>,
    transactional: Option<bool>,
    on_error: Option<Vec<SqlStatement>>,
) -> Result<Vec<SqlExecResult>, String> {
    if statements.is_empty() {
        return Ok(Vec::new());
    }
    let pool = state.pool(&handle).await?;
    let transactional = transactional.unwrap_or(true);
    let on_error = on_error.unwrap_or_default();
    with_timeout(async {
        match &pool {
            Pool::Sqlite(pool) => {
                execute_sqlite_batch(pool, &statements, transactional, &on_error).await
            }
            Pool::MySql(pool) => {
                execute_mysql_batch(pool, &statements, transactional, &on_error).await
            }
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::value::sqlite_cell;
    use futures_util::TryStreamExt;
    use serde_json::json;
    use sqlx::sqlite::SqlitePool;
    use sqlx::{Executor, Row};

    #[tokio::test]
    async fn decodes_sqlite_values_by_storage_class() {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("in-memory SQLite");
        let mut connection = pool.acquire().await.expect("connection");
        connection
            .execute("CREATE TABLE t (i INTEGER, r REAL, s TEXT, b BLOB, n NUMERIC)")
            .await
            .expect("schema");
        connection
            .execute("INSERT INTO t VALUES (1, 2.5, 'x', X'FF00', '10')")
            .await
            .expect("row");
        let row = sqlx::query("SELECT * FROM t")
            .fetch(&mut *connection)
            .try_next()
            .await
            .expect("query")
            .expect("one row");
        let cells: Vec<_> = (0..row.len())
            .map(|index| sqlite_cell(&row, index))
            .collect();
        assert_eq!(
            cells,
            vec![
                json!(1),
                json!(2.5),
                json!("x"),
                json!({"encoding": "base64", "data": "/wA="}),
                json!(10),
            ]
        );
    }

    /// Runs against the Docker MySQL from `bun run test:mysql`.
    #[tokio::test]
    async fn decodes_mysql_values_and_rolls_back_failed_batches() {
        if std::env::var("QUARRY_MYSQL_INTEGRATION").as_deref() != Ok("1") {
            return;
        }
        let port = std::env::var("QUARRY_MYSQL_PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(3306);
        let pool = super::target::open_mysql(
            "127.0.0.1",
            port,
            "root",
            "quarry",
            Some("quarry_demo"),
            Some("disabled"),
        )
        .await
        .expect("MySQL connection");
        super::execute_mysql_batch(
            &pool,
            &[
                statement("DROP TABLE IF EXISTS quarry_native_types"),
                statement(
                    "CREATE TABLE quarry_native_types (id INT PRIMARY KEY, price DECIMAL(10,2), \
                     born DATE, seen DATETIME, flag TINYINT(1), raw VARBINARY(4), doc JSON)",
                ),
                statement(
                    "INSERT INTO quarry_native_types VALUES \
                     (1, 1299.99, '2024-01-31', '2024-01-31 10:20:30', 1, X'FF00', '{\"a\": 1}'), \
                     (2, 79.99, NULL, NULL, 0, 'ab', NULL)",
                ),
            ],
            false,
            &[],
        )
        .await
        .expect("fixture");

        for (sql, params) in [
            (
                "SELECT * FROM quarry_native_types ORDER BY price DESC",
                vec![],
            ),
            (
                "SELECT * FROM quarry_native_types WHERE id >= ? ORDER BY price DESC",
                vec![json!(1)],
            ),
        ] {
            let (columns, rows, truncated) = super::select_mysql(&pool, sql, &params, 10)
                .await
                .expect("select");
            assert_eq!(
                columns,
                vec!["id", "price", "born", "seen", "flag", "raw", "doc"]
            );
            assert!(!truncated);
            assert_eq!(
                rows,
                vec![
                    vec![
                        json!(1),
                        json!(1299.99),
                        json!("2024-01-31"),
                        json!("2024-01-31 10:20:30"),
                        json!(1),
                        json!({"encoding": "base64", "data": "/wA="}),
                        json!({"a": 1}),
                    ],
                    vec![
                        json!(2),
                        json!(79.99),
                        json!(null),
                        json!(null),
                        json!(0),
                        json!("ab"),
                        json!(null),
                    ],
                ]
            );
        }

        let failed = super::execute_mysql_batch(
            &pool,
            &[
                statement("UPDATE quarry_native_types SET price = 1 WHERE id = 1"),
                super::SqlStatement {
                    sql: "DELETE FROM quarry_native_types WHERE id = ?".to_string(),
                    params: vec![json!(404)],
                    expect_rows: true,
                },
            ],
            true,
            &[],
        )
        .await;
        assert!(failed.is_err());
        let (_, rows, _) = super::select_mysql(
            &pool,
            "SELECT price FROM quarry_native_types WHERE id = 1",
            &[],
            1,
        )
        .await
        .expect("select after rollback");
        assert_eq!(rows, vec![vec![json!(1299.99)]]);

        super::execute_mysql_batch(
            &pool,
            &[statement("DROP TABLE quarry_native_types")],
            false,
            &[],
        )
        .await
        .expect("cleanup");
    }

    fn statement(sql: &str) -> super::SqlStatement {
        super::SqlStatement {
            sql: sql.to_string(),
            params: Vec::new(),
            expect_rows: false,
        }
    }
}
