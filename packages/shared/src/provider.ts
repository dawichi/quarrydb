export type ProviderId = 'sqlite'

export type ProviderKind = 'relational'

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
