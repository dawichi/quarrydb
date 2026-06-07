/**
 * Small relational fixture (customers ↔ orders, with a UNIQUE and a FK constraint) — just
 * big enough to exercise WHERE/JOIN/GROUP BY pipelines and edit-mode rollback behavior.
 */
export const SAMPLE_SCHEMA_SQL = `
CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    total REAL NOT NULL,
    status TEXT NOT NULL
);

INSERT INTO customers (id, name, email) VALUES
    (1, 'Alice', 'alice@example.com'),
    (2, 'Bob', 'bob@example.com'),
    (3, 'Carol', 'carol@example.com'),
    (4, 'Dave', 'dave@example.com');

INSERT INTO orders (id, customer_id, total, status) VALUES
    (1, 1, 50.0, 'shipped'),
    (2, 1, 20.0, 'pending'),
    (3, 2, 75.5, 'shipped'),
    (4, 3, 12.25, 'cancelled');
`
