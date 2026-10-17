const MYSQL_KEYRING_SERVICE: &str = "dev.quarrydb.app.mysql";
const REDIS_KEYRING_SERVICE: &str = "dev.quarrydb.app.redis";

fn mysql_keyring_entry(connection_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(MYSQL_KEYRING_SERVICE, connection_id).map_err(|error| error.to_string())
}

fn redis_keyring_entry(connection_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(REDIS_KEYRING_SERVICE, connection_id).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn get_mysql_password(connection_id: String) -> Result<Option<String>, String> {
    match mysql_keyring_entry(&connection_id)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command(async)]
pub fn set_mysql_password(connection_id: String, password: String) -> Result<(), String> {
    mysql_keyring_entry(&connection_id)?
        .set_password(&password)
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn delete_mysql_password(connection_id: String) -> Result<(), String> {
    match mysql_keyring_entry(&connection_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command(async)]
pub fn get_redis_password(connection_id: String) -> Result<Option<String>, String> {
    match redis_keyring_entry(&connection_id)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command(async)]
pub fn set_redis_password(connection_id: String, password: String) -> Result<(), String> {
    redis_keyring_entry(&connection_id)?
        .set_password(&password)
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn delete_redis_password(connection_id: String) -> Result<(), String> {
    match redis_keyring_entry(&connection_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
