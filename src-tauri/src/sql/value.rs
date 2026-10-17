//! Converts driver values to JSON for the frontend and JSON parameters back to bound values.
//!
//! Decoding is driven by the runtime type of each value, so every engine type reaches the UI
//! with its real shape: numbers as numbers, dates as ISO-like strings, and binary data as
//! UTF-8 text when it is valid or as a base64 envelope when it is not.

use base64::Engine as _;
use serde_json::{json, Value};
use sqlx::mysql::{MySql, MySqlRow};
use sqlx::sqlite::{Sqlite, SqliteRow};
use sqlx::types::chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use sqlx::{Decode, Row, TypeInfo, ValueRef};

pub fn bytes_json(bytes: Vec<u8>) -> Value {
    match String::from_utf8(bytes) {
        Ok(text) => Value::String(text),
        Err(error) => json!({
            "encoding": "base64",
            "data": base64::engine::general_purpose::STANDARD.encode(error.as_bytes()),
        }),
    }
}

/// Keeps a decimal exact: emitted as a JSON number only when that loses nothing.
fn decimal_json(text: String) -> Value {
    match text.parse::<f64>() {
        Ok(number) if number.is_finite() && format_number(number) == normalize_decimal(&text) => {
            json!(number)
        }
        _ => Value::String(text),
    }
}

fn format_number(number: f64) -> String {
    let text = number.to_string();
    normalize_decimal(&text)
}

fn normalize_decimal(text: &str) -> String {
    if text.contains('.') {
        text.trim_end_matches('0').trim_end_matches('.').to_string()
    } else {
        text.to_string()
    }
}

fn decode<'r, T: Decode<'r, DB>, DB: sqlx::Database>(
    value: <DB as sqlx::Database>::ValueRef<'r>,
) -> Option<T> {
    T::decode(value).ok()
}

pub fn sqlite_cell(row: &SqliteRow, index: usize) -> Value {
    let Ok(raw) = row.try_get_raw(index) else {
        return Value::Null;
    };
    if raw.is_null() {
        return Value::Null;
    }
    let kind = raw.type_info().name().to_string();
    match kind.as_str() {
        "INTEGER" | "BOOLEAN" => decode::<i64, Sqlite>(raw).map_or(Value::Null, |v| json!(v)),
        "REAL" => decode::<f64, Sqlite>(raw).map_or(Value::Null, |v| json!(v)),
        "BLOB" => decode::<Vec<u8>, Sqlite>(raw).map_or(Value::Null, bytes_json),
        _ => decode::<String, Sqlite>(raw).map_or(Value::Null, Value::String),
    }
}

pub fn mysql_cell(row: &MySqlRow, index: usize) -> Value {
    let Ok(raw) = row.try_get_raw(index) else {
        return Value::Null;
    };
    if raw.is_null() {
        return Value::Null;
    }
    let kind = raw.type_info().name().to_string();
    let value = match kind.as_str() {
        "BOOLEAN" | "TINYINT" | "SMALLINT" | "INT" | "MEDIUMINT" | "BIGINT" => {
            decode::<i64, MySql>(raw).map(|v| json!(v))
        }
        "TINYINT UNSIGNED" | "SMALLINT UNSIGNED" | "INT UNSIGNED" | "MEDIUMINT UNSIGNED"
        | "BIGINT UNSIGNED" | "BIT" => decode::<u64, MySql>(raw).map(|v| json!(v)),
        "YEAR" => decode::<u16, MySql>(raw).map(|v| json!(v)),
        "FLOAT" => decode::<f32, MySql>(raw).map(|v| json!(f64::from(v))),
        "DOUBLE" => decode::<f64, MySql>(raw).map(|v| json!(v)),
        "DECIMAL" => decode::<String, MySql>(raw).map(decimal_json),
        "DATE" => decode::<NaiveDate, MySql>(raw).map(|v| json!(v.to_string())),
        "DATETIME" => decode::<NaiveDateTime, MySql>(raw).map(|v| json!(v.to_string())),
        "TIMESTAMP" => {
            decode::<DateTime<Utc>, MySql>(raw).map(|v| json!(v.naive_utc().to_string()))
        }
        "TIME" => decode::<sqlx::mysql::types::MySqlTime, MySql>(raw).map(|v| json!(v.to_string())),
        "JSON" => decode::<String, MySql>(raw)
            .map(|text| serde_json::from_str(&text).unwrap_or(Value::String(text))),
        "BINARY" | "VARBINARY" | "TINYBLOB" | "BLOB" | "MEDIUMBLOB" | "LONGBLOB" | "GEOMETRY" => {
            decode::<Vec<u8>, MySql>(raw).map(bytes_json)
        }
        _ => decode::<String, MySql>(raw).map(Value::String),
    };
    // Zero dates and other values the typed decoders reject still reach the UI as text.
    value
        .or_else(|| {
            row.try_get_raw(index)
                .ok()
                .and_then(decode::<Vec<u8>, MySql>)
                .map(bytes_json)
        })
        .unwrap_or(Value::Null)
}

/// A JSON parameter in the shape both drivers can bind.
pub enum Param {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Text(String),
}

impl From<&Value> for Param {
    fn from(value: &Value) -> Self {
        match value {
            Value::Null => Param::Null,
            Value::Bool(flag) => Param::Bool(*flag),
            Value::Number(number) => number
                .as_i64()
                .map(Param::Int)
                .or_else(|| number.as_f64().map(Param::Float))
                .unwrap_or_else(|| Param::Text(number.to_string())),
            Value::String(text) => Param::Text(text.clone()),
            other => Param::Text(other.to_string()),
        }
    }
}

macro_rules! bind_params {
    ($query:expr, $params:expr) => {{
        let mut query = $query;
        for param in $params.iter().map($crate::sql::value::Param::from) {
            query = match param {
                $crate::sql::value::Param::Null => query.bind(None::<String>),
                $crate::sql::value::Param::Bool(flag) => query.bind(flag),
                $crate::sql::value::Param::Int(number) => query.bind(number),
                $crate::sql::value::Param::Float(number) => query.bind(number),
                $crate::sql::value::Param::Text(text) => query.bind(text),
            };
        }
        query
    }};
}

pub(crate) use bind_params;

#[cfg(test)]
mod tests {
    use super::decimal_json;
    use serde_json::json;

    #[test]
    fn keeps_decimals_exact() {
        assert_eq!(decimal_json("1299.99".to_string()), json!(1299.99));
        assert_eq!(decimal_json("10.50".to_string()), json!(10.5));
        assert_eq!(
            decimal_json("12345678901234567890.12".to_string()),
            json!("12345678901234567890.12")
        );
    }
}
