import { Injectable } from '@angular/core'
import Database from '@tauri-apps/plugin-sql'

@Injectable({ providedIn: 'root' })
export class MysqlSampleDataService {
    async seed(db: Database, schemaName: string): Promise<boolean> {
        await db.execute(`USE ${this.quoteIdentifier(schemaName)}`)
        await this.createTables(db)

        const [{ count }] = await db.select<Array<{ count: number }>>('SELECT COUNT(*) as count FROM products')
        if (count > 0) {
            return false
        }

        for (const sql of this.seedStatements()) {
            await db.execute(sql)
        }

        return true
    }

    buildCreateTableStatements(): string[] {
        return [
            `CREATE TABLE IF NOT EXISTS products (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(255) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                stock INT NOT NULL DEFAULT 0
            )`,
            `CREATE TABLE IF NOT EXISTS customers (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                country VARCHAR(255) NOT NULL,
                created_at DATETIME NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS orders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                customer_id INT NOT NULL,
                status VARCHAR(64) NOT NULL,
                created_at DATETIME NOT NULL,
                total DECIMAL(10, 2) NOT NULL DEFAULT 0,
                CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
            )`,
            `CREATE TABLE IF NOT EXISTS order_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NOT NULL,
                product_id INT NOT NULL,
                qty INT NOT NULL,
                unit_price DECIMAL(10, 2) NOT NULL,
                CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
                CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id)
            )`,
        ]
    }

    private async createTables(db: Database): Promise<void> {
        for (const sql of this.buildCreateTableStatements()) {
            await db.execute(sql)
        }
    }

    private seedStatements(): string[] {
        return [
            `INSERT INTO products (name, category, price, stock) VALUES
                ('Laptop Pro 15"', 'Electronics', 1299.99, 12),
                ('Wireless Keyboard', 'Electronics', 89.99, 45),
                ('USB-C Hub 7-port', 'Electronics', 49.99, 78),
                ('Mechanical Keyboard', 'Electronics', 149.99, 30),
                ('Monitor 27" 4K', 'Electronics', 499.99, 8),
                ('Noise-Cancelling Headphones', 'Electronics', 279.99, 22),
                ('Clean Code', 'Books', 34.99, 60),
                ('The Pragmatic Programmer', 'Books', 39.99, 55),
                ('Designing Data-Intensive Apps', 'Books', 44.99, 40),
                ('Developer Hoodie', 'Clothing', 59.99, 80),
                ('Cargo Shorts', 'Clothing', 39.99, 65),
                ('Laptop Backpack 15"', 'Accessories', 79.99, 35),
                ('Standing Desk Mat', 'Home', 29.99, 50),
                ('Cable Organiser Set', 'Home', 9.99, 120)`,
            `INSERT INTO customers (name, email, country, created_at) VALUES
                ('Alice Martin', 'alice@example.com', 'France', '2024-01-15 00:00:00'),
                ('Bob Chen', 'bob@example.com', 'Canada', '2024-02-03 00:00:00'),
                ('Carol White', 'carol@example.com', 'United Kingdom', '2024-02-18 00:00:00'),
                ('David López', 'david@example.com', 'Spain', '2024-03-07 00:00:00'),
                ('Eva Schmidt', 'eva@example.com', 'Germany', '2024-03-22 00:00:00'),
                ('Frank Tanaka', 'frank@example.com', 'Japan', '2024-04-11 00:00:00'),
                ('Grace Kim', 'grace@example.com', 'South Korea', '2024-04-28 00:00:00'),
                ('Hiro Nakamura', 'hiro@example.com', 'Japan', '2024-05-14 00:00:00'),
                ('Irina Petrov', 'irina@example.com', 'Russia', '2024-05-30 00:00:00'),
                ('James O''Brien', 'james@example.com', 'Ireland', '2024-06-10 00:00:00')`,
            `INSERT INTO orders (customer_id, status, created_at, total) VALUES
                (1, 'delivered', '2024-03-01 00:00:00', 1389.98),
                (1, 'shipped', '2024-05-10 00:00:00', 179.98),
                (2, 'delivered', '2024-03-15 00:00:00', 84.98),
                (2, 'cancelled', '2024-04-20 00:00:00', 499.99),
                (3, 'delivered', '2024-04-05 00:00:00', 89.98),
                (4, 'delivered', '2024-04-18 00:00:00', 239.97),
                (5, 'shipped', '2024-05-02 00:00:00', 329.98),
                (5, 'pending', '2024-06-01 00:00:00', 44.99),
                (6, 'delivered', '2024-05-20 00:00:00', 139.98),
                (7, 'delivered', '2024-04-30 00:00:00', 149.99),
                (8, 'shipped', '2024-05-25 00:00:00', 549.98),
                (8, 'pending', '2024-06-05 00:00:00', 79.99),
                (9, 'delivered', '2024-05-08 00:00:00', 239.97),
                (10, 'delivered', '2024-05-15 00:00:00', 119.98),
                (3, 'pending', '2024-06-08 00:00:00', 499.99)`,
            `INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES
                (1, 1, 1, 1299.99),
                (1, 3, 1, 49.99),
                (2, 2, 1, 89.99),
                (2, 10, 1, 59.99),
                (2, 13, 1, 29.99),
                (3, 7, 1, 34.99),
                (3, 8, 1, 39.99),
                (4, 5, 1, 499.99),
                (5, 10, 1, 59.99),
                (5, 13, 1, 29.99),
                (6, 4, 1, 149.99),
                (6, 9, 2, 44.99),
                (7, 2, 1, 89.99),
                (7, 6, 1, 279.99),
                (8, 9, 1, 44.99),
                (9, 6, 1, 279.99),
                (9, 3, 1, 49.99),
                (10, 4, 1, 149.99),
                (11, 1, 1, 1299.99),
                (11, 13, 1, 29.99),
                (11, 14, 2, 9.99),
                (12, 12, 1, 79.99),
                (13, 4, 1, 149.99),
                (13, 7, 2, 34.99),
                (13, 14, 5, 9.99),
                (14, 10, 1, 59.99),
                (14, 8, 1, 39.99),
                (15, 5, 1, 499.99)`,
        ]
    }

    private quoteIdentifier(identifier: string): string {
        return `\`${identifier.replaceAll('`', '``')}\``
    }
}
