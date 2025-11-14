import sqlite3 from 'sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');

sqlite3.verbose();
export const db = new sqlite3.Database(dbPath);

export function initDb() {
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
}

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}