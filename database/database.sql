-- =============================================================
-- SAMMOLLO RESTAURANT — MySQL / MariaDB (phpMyAdmin compatible)
-- Importez ce fichier directement dans phpMyAdmin > Importer.
-- Le script crée et sélectionne automatiquement la base sammollo_restaurant.
-- =============================================================

CREATE DATABASE IF NOT EXISTS sammollo_restaurant
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE sammollo_restaurant;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  UNIQUE KEY uq_categories_slug (slug),
  KEY idx_categories_sort (sort_order, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  price INT UNSIGNED NOT NULL DEFAULT 0,
  old_price INT UNSIGNED NULL,
  image_path VARCHAR(500) NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  badge VARCHAR(40) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menu_slug (slug),
  KEY idx_menu_category (category_id, available, sort_order),
  CONSTRAINT fk_menu_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_verifications (
  token VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL,
  subject VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token),
  KEY idx_verification_email (email),
  KEY idx_verification_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL,
  subject VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('new','read','replied','archived') NOT NULL DEFAULT 'new',
  verified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(36) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(180) NULL,
  customer_phone VARCHAR(40) NOT NULL,
  order_type ENUM('pickup','dine_in') NOT NULL DEFAULT 'pickup',
  status ENUM('pending','confirmed','preparing','ready','completed','cancelled') NOT NULL DEFAULT 'pending',
  payment_status ENUM('unpaid','pending','paid','failed','refunded') NOT NULL DEFAULT 'unpaid',
  payment_provider VARCHAR(60) NULL,
  payment_reference VARCHAR(160) NULL,
  subtotal INT UNSIGNED NOT NULL DEFAULT 0,
  delivery_fee INT UNSIGNED NOT NULL DEFAULT 0,
  total INT UNSIGNED NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_public_id (public_id),
  KEY idx_orders_created (created_at),
  KEY idx_orders_status (status, payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id INT UNSIGNED NULL,
  item_name VARCHAR(120) NOT NULL,
  unit_price INT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  line_total INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(180) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL DEFAULT 'Administrateur',
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id INT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id VARCHAR(80) NULL,
  ip_address VARCHAR(80) NULL,
  metadata LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_admin (admin_id),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(140) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  summary TEXT NOT NULL,
  image_path VARCHAR(500) NULL,
  event_date DATETIME NULL,
  recurrence_label VARCHAR(120) NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_events_slug (slug),
  KEY idx_events_status (status, featured, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(60) NOT NULL,
  provider_reference VARCHAR(180) NULL,
  amount INT UNSIGNED NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'DZD',
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  raw_metadata LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_order (order_id, created_at),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(60) NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total INT UNSIGNED NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'DZD',
  PRIMARY KEY (id),
  UNIQUE KEY uq_receipt_order (order_id),
  UNIQUE KEY uq_receipt_number (receipt_number),
  CONSTRAINT fk_receipt_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Données de départ : catégories
INSERT INTO categories (name, slug, sort_order, active) VALUES
('Pizzas','pizzas',10,1),
('Burgers','burgers',20,1),
('Plats','plats',30,1),
('Pâtes','pates',40,1),
('Desserts','desserts',50,1),
('Boissons','boissons',60,1)
ON DUPLICATE KEY UPDATE name=VALUES(name), sort_order=VALUES(sort_order), active=1;

-- Produits de départ
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Cheese Pizza','cheese-pizza','Sauce tomate, mozzarella, burrata, pecorino et olives.',1200,'image/cheese pizza.jpg',1,'Populaire',10 FROM categories c WHERE c.slug='pizzas'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),featured=VALUES(featured),badge=VALUES(badge),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Pizza Maison','pizza-maison','Mozzarella, sauce tomate, olives et herbes aromatiques.',1100,'image/food6.png',0,NULL,20 FROM categories c WHERE c.slug='pizzas'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Pizza Spéciale','pizza-speciale','Une composition généreuse aux saveurs de la maison.',1300,'image/Pizza_party1.jpg',0,'Maison',30 FROM categories c WHERE c.slug='pizzas'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),badge=VALUES(badge),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Burger Sammollo','burger-sammollo','Steak, cheddar, salade, tomate et sauce maison.',1100,'image/food12.jpeg',1,'Populaire',10 FROM categories c WHERE c.slug='burgers'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),featured=VALUES(featured),badge=VALUES(badge),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Burger Gourmand','burger-gourmand','Steak grillé, fromage fondant et garniture fraîche.',1200,'image/food9.jpeg',0,NULL,20 FROM categories c WHERE c.slug='burgers'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Burger Classique','burger-classique','Steak, fromage et garniture fraîche.',900,'image/APPELE.jpeg',0,NULL,30 FROM categories c WHERE c.slug='burgers'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Capo Steak','capo-steak','Steak de veau, pommes de terre et sauce aux truffes.',1500,'image/steak.jpg',1,'Chef',10 FROM categories c WHERE c.slug='plats'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),featured=VALUES(featured),badge=VALUES(badge),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Salade Composée','salade-composee','Salade, tomates cerises, betterave, carotte et vinaigrette.',500,'image/salade.jpg',0,NULL,20 FROM categories c WHERE c.slug='plats'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Mille','mille','Tortilla, thon, huile d’olive, tomate et saumon fumé.',1300,'image/result (11).png',0,NULL,30 FROM categories c WHERE c.slug='plats'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Vegetarian Pasta','vegetarian-pasta','Spaghetti, sauce tomate, basilic et épices.',800,'image/offer2.png',0,NULL,10 FROM categories c WHERE c.slug='pates'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Quattro Pasta','quattro-pasta','Pâtes, sauce au fromage, basilic et pesto.',800,'image/offer1.png',0,NULL,20 FROM categories c WHERE c.slug='pates'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Pasta Maison','pasta-maison','Pâtes généreuses et sauce signature Sammollo.',1000,'image/result (13).png',0,'Maison',30 FROM categories c WHERE c.slug='pates'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),badge=VALUES(badge),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Tiramisu','tiramisu','Café, mascarpone, biscuits et cacao.',700,'image/tiramis2.jpg',1,'Populaire',10 FROM categories c WHERE c.slug='desserts'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),featured=VALUES(featured),badge=VALUES(badge),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Torta','torta','Dessert gourmand de la maison.',600,'image/torta.jpeg',0,NULL,20 FROM categories c WHERE c.slug='desserts'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Fraise','fraise','Dessert fruité et frais.',500,'image/FRAISE1.jpeg',0,NULL,30 FROM categories c WHERE c.slug='desserts'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Cocktail Fruité','cocktail-fruite','Boisson fraîche aux fruits.',350,'image/food10.jpeg',0,NULL,10 FROM categories c WHERE c.slug='boissons'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Jus Maison','jus-maison','Jus frais préparé à la demande.',300,'image/t#U00e9l#U00e9chargement.jpeg',0,NULL,20 FROM categories c WHERE c.slug='boissons'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);
INSERT INTO menu_items (category_id,name,slug,description,price,image_path,featured,badge,sort_order)
SELECT c.id,'Boisson Fraîche','boisson-fraiche','Une boisson fraîche pour accompagner votre repas.',250,'image/food3.png',0,NULL,30 FROM categories c WHERE c.slug='boissons'
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),price=VALUES(price),image_path=VALUES(image_path),sort_order=VALUES(sort_order);

INSERT INTO events(title,slug,summary,image_path,recurrence_label,status,featured,sort_order) VALUES
('Friday Party','friday-party','Une soirée conviviale autour de nos spécialités dans une ambiance détendue.','image/party.jpg','Chaque vendredi','published',1,10),
('Pizza Party','pizza-party','Des pizzas artisanales à partager entre amis ou en famille.','image/Pizza_party1.jpg','Sur annonce','published',0,20),
('Anniversaires & groupes','anniversaires-groupes','Un cadre chaleureux pour célébrer vos moments en famille ou entre amis.','image/happy.jpg','Sur réservation','published',0,30)
ON DUPLICATE KEY UPDATE title=VALUES(title),summary=VALUES(summary),image_path=VALUES(image_path),recurrence_label=VALUES(recurrence_label),status=VALUES(status),featured=VALUES(featured),sort_order=VALUES(sort_order);

INSERT INTO site_settings(setting_key,setting_value) VALUES
('restaurant','{"name":"Sammollo","phone":"0668929453","email":"SammolloDEM@gmail.com","city":"Draâ El Mizan","wilaya":"Tizi-Ouzou","country":"Algérie","copyrightYear":2025}'),
('opening_hours','{"friday":"14:00-01:00","saturday_thursday":"08:00-23:00"}')
ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value);

SET FOREIGN_KEY_CHECKS = 1;
