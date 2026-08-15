export type ProviderId = 'sqlite' | 'mysql' | 'redis'

export type ProviderKind = 'relational' | 'key-value'

export type ProviderCapability =
    | 'recent_items'
    | 'server_connection'
    | 'relational_schema_browser'
    | 'sql_query_runner'
    | 'visual_sql_pipeline'
    | 'row_editor'
    | 'ddl_manager'
    | 'query_history'
    | 'export_results'
    | 'key_value_browser'
    | 'key_value_editor'
    | 'redis_command_runner'
