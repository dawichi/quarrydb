import { Injectable } from '@angular/core'
import { appDataDir, join } from '@tauri-apps/api/path'
import Database from '@tauri-apps/plugin-sql'

@Injectable({ providedIn: 'root' })
export class SampleDatabaseService {
    async generate(): Promise<string> {
        const dbPath = await join(await appDataDir(), 'quarry-sample.db')
        const db = await Database.load(`sqlite://${dbPath}`)
        try {
            await this.createTables(db)
            await this.seedIfEmpty(db)
        } finally {
            await db.close()
        }
        return dbPath
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private async createTables(db: Database): Promise<void> {
        await db.execute(`CREATE TABLE IF NOT EXISTS products (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT    NOT NULL,
            category TEXT    NOT NULL,
            price    REAL    NOT NULL,
            stock    INTEGER NOT NULL DEFAULT 0
        )`)
        await db.execute(`CREATE TABLE IF NOT EXISTS customers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            email      TEXT NOT NULL UNIQUE,
            country    TEXT NOT NULL,
            created_at TEXT NOT NULL
        )`)
        await db.execute(`CREATE TABLE IF NOT EXISTS orders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            status      TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            total       REAL    NOT NULL DEFAULT 0
        )`)
        await db.execute(`CREATE TABLE IF NOT EXISTS order_items (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id   INTEGER NOT NULL REFERENCES orders(id),
            product_id INTEGER NOT NULL REFERENCES products(id),
            qty        INTEGER NOT NULL,
            unit_price REAL    NOT NULL
        )`)
    }

    private async seedIfEmpty(db: Database): Promise<void> {
        const [{ count }] = await db.select<[{ count: number }]>('SELECT COUNT(*) as count FROM products')
        if (count > 0) return

        await db.execute(`INSERT INTO products (name, category, price, stock) VALUES
            ('Laptop Pro 15"',                'Electronics',  1299.99, 12),
            ('Wireless Keyboard',             'Electronics',    89.99, 45),
            ('USB-C Hub 7-port',              'Electronics',    49.99, 78),
            ('Mechanical Keyboard',           'Electronics',   149.99, 30),
            ('Monitor 27" 4K',                'Electronics',   499.99,  8),
            ('Noise-Cancelling Headphones',   'Electronics',   279.99, 22),
            ('Clean Code',                    'Books',          34.99, 60),
            ('The Pragmatic Programmer',      'Books',          39.99, 55),
            ('Designing Data-Intensive Apps', 'Books',          44.99, 40),
            ('Developer Hoodie',              'Clothing',       59.99, 80),
            ('Cargo Shorts',                  'Clothing',       39.99, 65),
            ('Laptop Backpack 15"',           'Accessories',    79.99, 35),
            ('Standing Desk Mat',             'Home',           29.99, 50),
            ('Cable Organiser Set',           'Home',            9.99,120)
        `)

        await db.execute(`INSERT INTO customers (name, email, country, created_at) VALUES
            ('Alice Martin',   'alice@example.com',  'France',         '2024-01-15'),
            ('Bob Chen',       'bob@example.com',    'Canada',         '2024-02-03'),
            ('Carol White',    'carol@example.com',  'United Kingdom', '2024-02-18'),
            ('David López',    'david@example.com',  'Spain',          '2024-03-07'),
            ('Eva Schmidt',    'eva@example.com',    'Germany',        '2024-03-22'),
            ('Frank Tanaka',   'frank@example.com',  'Japan',          '2024-04-11'),
            ('Grace Kim',      'grace@example.com',  'South Korea',    '2024-04-28'),
            ('Hiro Nakamura',  'hiro@example.com',   'Japan',          '2024-05-14'),
            ('Irina Petrov',   'irina@example.com',  'Russia',         '2024-05-30'),
            ('James O''Brien', 'james@example.com',  'Ireland',        '2024-06-10')
        `)

        await db.execute(`INSERT INTO orders (customer_id, status, created_at, total) VALUES
            (1,  'delivered', '2024-03-01',  1389.98),
            (1,  'shipped',   '2024-05-10',   179.98),
            (2,  'delivered', '2024-03-15',    84.98),
            (2,  'cancelled', '2024-04-20',   499.99),
            (3,  'delivered', '2024-04-05',    89.98),
            (4,  'delivered', '2024-04-18',   239.97),
            (5,  'shipped',   '2024-05-02',   329.98),
            (5,  'pending',   '2024-06-01',    44.99),
            (6,  'delivered', '2024-05-20',   139.98),
            (7,  'delivered', '2024-04-30',   149.99),
            (8,  'shipped',   '2024-05-25',   549.98),
            (8,  'pending',   '2024-06-05',    79.99),
            (9,  'delivered', '2024-05-08',   239.97),
            (10, 'delivered', '2024-05-15',   119.98),
            (3,  'pending',   '2024-06-08',   499.99)
        `)

        await db.execute(`INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES
            (1,   1, 1, 1299.99),
            (1,   3, 1,   49.99),
            (2,   2, 1,   89.99),
            (2,  10, 1,   59.99),
            (2,  13, 1,   29.99),
            (3,   7, 1,   34.99),
            (3,   8, 1,   39.99),
            (4,   5, 1,  499.99),
            (5,  10, 1,   59.99),
            (5,  13, 1,   29.99),
            (6,   4, 1,  149.99),
            (6,   9, 2,   44.99),
            (7,   2, 1,   89.99),
            (7,   6, 1,  279.99),
            (8,   9, 1,   44.99),
            (9,   6, 1,  279.99),
            (9,   3, 1,   49.99),
            (10,  4, 1,  149.99),
            (11,  1, 1, 1299.99),
            (11, 13, 1,   29.99),
            (11, 14, 2,    9.99),
            (12, 12, 1,   79.99),
            (13,  4, 1,  149.99),
            (13,  7, 2,   34.99),
            (13, 14, 5,    9.99),
            (14, 10, 1,   59.99),
            (14,  8, 1,   39.99),
            (15,  5, 1,  499.99)
        `)
    }
}
