-- A small practice shop. Reset fresh for every run, and holds no real data.
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers (id),
  item TEXT NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL
);
INSERT INTO customers VALUES
  (1, 'Ada', 'London'),
  (2, 'Grace', 'New York'),
  (3, 'Lin', 'Toronto'),
  (4, 'Sam', 'Austin');
INSERT INTO orders VALUES
  (101, 1, 'Keyboard', 49, 'shipped'),
  (102, 2, 'Monitor', 189, 'processing'),
  (103, 1, 'USB cable', 9, 'delivered'),
  (104, 3, 'Mouse', 25, 'shipped'),
  (105, 2, 'Webcam', 15, 'delivered');
