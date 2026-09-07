-- =============================================================
-- SAMMOLLO — MENU V2
-- Compatible MySQL / MariaDB / phpMyAdmin
-- À importer APRÈS database/database.sql
--
-- Ce fichier :
-- 1) corrige les photos qui ne correspondaient pas aux aliments ;
-- 2) corrige certains noms/descriptions ;
-- 3) ajoute de nouveaux produits ;
-- 4) conserve les mêmes catégories et le carrousel existant.
-- =============================================================

USE sammollo_restaurant;
SET NAMES utf8mb4;

START TRANSACTION;

-- =============================================================
-- PIZZAS
-- =============================================================

UPDATE menu_items
SET
  name = 'Cheese Pizza',
  description = 'Sauce tomate, mozzarella, fromage fondant, maïs, poivrons et olives.',
  image_path = 'image/pizza-cheese.jpg',
  price = 1200,
  featured = 1,
  badge = 'Populaire',
  sort_order = 10
WHERE slug = 'cheese-pizza';

UPDATE menu_items
SET
  name = 'Pizza Maison',
  description = 'Sauce tomate, mozzarella, tomates, basilic et garniture maison.',
  image_path = 'image/food6.png',
  price = 1100,
  featured = 0,
  badge = NULL,
  sort_order = 20
WHERE slug = 'pizza-maison';

UPDATE menu_items
SET
  name = 'Pizza Spéciale',
  description = 'Pizza généreuse au fromage, légumes et garniture spéciale Sammollo.',
  image_path = 'image/pizza-speciale.jpg',
  price = 1300,
  featured = 0,
  badge = 'Maison',
  sort_order = 30
WHERE slug = 'pizza-speciale';

INSERT INTO menu_items
(category_id,name,slug,description,price,image_path,available,featured,badge,sort_order)
SELECT
  c.id,
  'Pizza Pepperoni',
  'pizza-pepperoni',
  'Sauce tomate, mozzarella, pepperoni et basilic.',
  1250,
  'image/pizza-sammollo.jpg',
  1,0,'Nouveau',40
FROM categories c
WHERE c.slug='pizzas'
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  description=VALUES(description),
  price=VALUES(price),
  image_path=VALUES(image_path),
  available=1,
  badge=VALUES(badge),
  sort_order=VALUES(sort_order);


-- =============================================================
-- BURGERS
-- Les anciennes images food12.jpeg, food9.jpeg et APPELE.jpeg
-- ne représentaient pas des burgers.
-- =============================================================

UPDATE menu_items
SET
  description = 'Steak de bœuf, cheddar, salade, tomate et sauce maison.',
  image_path = 'https://images.unsplash.com/photo-1658822118306-8ee34f118600?auto=format&fit=crop&w=1200&q=82',
  price = 1100,
  featured = 1,
  badge = 'Populaire',
  sort_order = 10
WHERE slug = 'burger-sammollo';

UPDATE menu_items
SET
  description = 'Steak grillé, cheddar fondant, salade et sauce gourmande.',
  image_path = 'https://images.unsplash.com/photo-1674073117843-5838b44b7ae0?auto=format&fit=crop&w=1200&q=82',
  price = 1200,
  featured = 0,
  badge = NULL,
  sort_order = 20
WHERE slug = 'burger-gourmand';

UPDATE menu_items
SET
  description = 'Steak de bœuf, fromage, salade et tomate.',
  image_path = 'https://images.unsplash.com/photo-1582762147088-0aee85cd50fc?auto=format&fit=crop&w=1200&q=82',
  price = 900,
  featured = 0,
  badge = NULL,
  sort_order = 30
WHERE slug = 'burger-classique';

INSERT INTO menu_items
(category_id,name,slug,description,price,image_path,available,featured,badge,sort_order)
SELECT
  c.id,
  'Double Burger',
  'double-burger',
  'Double steak, double cheddar, salade, tomate et sauce maison.',
  1450,
  'https://images.unsplash.com/photo-1703219338500-90f646e60c1b?auto=format&fit=crop&w=1200&q=82',
  1,0,'Gourmand',40
FROM categories c
WHERE c.slug='burgers'
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  description=VALUES(description),
  price=VALUES(price),
  image_path=VALUES(image_path),
  available=1,
  badge=VALUES(badge),
  sort_order=VALUES(sort_order);


-- =============================================================
-- PLATS
-- =============================================================

UPDATE menu_items
SET
  name = 'Capo Steak',
  description = 'Steak de bœuf grillé, servi avec accompagnement de la maison.',
  image_path = 'image/steak-grille.jpg',
  price = 1500,
  featured = 1,
  badge = 'Chef',
  sort_order = 10
WHERE slug = 'capo-steak';

UPDATE menu_items
SET
  name = 'Salade Composée',
  description = 'Salade verte, tomates cerises, concombre, poivrons, olives et fromage.',
  image_path = 'image/salade-composee.jpg',
  price = 500,
  sort_order = 20
WHERE slug = 'salade-composee';

UPDATE menu_items
SET
  name = 'Mille Saumon',
  description = 'Préparation fraîche en couches au saumon fumé et garniture maison.',
  image_path = 'image/result (11).png',
  price = 1300,
  sort_order = 30
WHERE slug = 'mille';

INSERT INTO menu_items
(category_id,name,slug,description,price,image_path,available,featured,badge,sort_order)
SELECT
  c.id,
  'Poulet Grillé',
  'poulet-grille',
  'Blanc de poulet grillé accompagné de salade, tomates et avocat.',
  1200,
  'image/poulet-grille.png',
  1,0,'Léger',40
FROM categories c
WHERE c.slug='plats'
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  description=VALUES(description),
  price=VALUES(price),
  image_path=VALUES(image_path),
  available=1,
  badge=VALUES(badge),
  sort_order=VALUES(sort_order);

INSERT INTO menu_items
(category_id,name,slug,description,price,image_path,available,featured,badge,sort_order)
SELECT
  c.id,
  'Grillade de Bœuf',
  'grillade-boeuf',
  'Pièces de bœuf grillées avec légumes rôtis.',
  1600,
  'image/food4.png',
  1,0,'Grillade',50
FROM categories c
WHERE c.slug='plats'
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  description=VALUES(description),
  price=VALUES(price),
  image_path=VALUES(image_path),
  available=1,
  badge=VALUES(badge),
  sort_order=VALUES(sort_order);


-- =============================================================
-- PÂTES
-- =============================================================

UPDATE menu_items
SET
  name = 'Salade de Pâtes Méditerranéenne',
  description = 'Fusilli, brocoli, tomates, olives, fromage et salade fraîche.',
  image_path = 'image/offer2.png',
  price = 800,
  featured = 0,
  badge = NULL,
  sort_order = 10
WHERE slug = 'vegetarian-pasta';

UPDATE menu_items
SET
  name = 'Penne Tomate & Herbes',
  description = 'Penne, sauce tomate, tomates cerises et herbes fraîches.',
  image_path = 'image/offer1.png',
  price = 800,
  featured = 0,
  badge = NULL,
  sort_order = 20
WHERE slug = 'quattro-pasta';

UPDATE menu_items
SET
  name = 'Spaghetti Maison',
  description = 'Spaghetti, sauce tomate, basilic et garniture maison.',
  image_path = 'image/pates-maison.png',
  price = 1000,
  featured = 0,
  badge = 'Maison',
  sort_order = 30
WHERE slug = 'pasta-maison';

INSERT INTO menu_items
(category_id,name,slug,description,price,image_path,available,featured,badge,sort_order)
SELECT
  c.id,
  'Penne Sammollo',
  'penne-sammollo',
  'Penne à la sauce tomate, tomates cerises, persil et épices.',
  950,
  'image/pates-tomate.png',
  1,0,'Nouveau',40
FROM categories c
WHERE c.slug='pates'
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  description=VALUES(description),
  price=VALUES(price),
  image_path=VALUES(image_path),
  available=1,
  badge=VALUES(badge),
  sort_order=VALUES(sort_order);


-- =============================================================
-- DESSERTS
-- =============================================================

UPDATE menu_items
SET
  name = 'Tiramisu',
  description = 'Mascarpone, café, biscuits et cacao.',
  image_path = 'image/tiramisu.jpg',
  price = 700,
  featured = 1,
  badge = 'Populaire',
  sort_order = 10
WHERE slug = 'tiramisu';

UPDATE menu_items
SET
  name = 'Gâteau Maison',
  description = 'Gâteau au chocolat moelleux, servi façon maison.',
  image_path = 'image/gateau-maison.jpeg',
  price = 600,
  featured = 0,
  badge = NULL,
  sort_order = 20
WHERE slug = 'torta';

-- L'ancienne entrée "Fraise" utilisait en réalité une photo de boisson.
UPDATE menu_items
SET
  name = 'Donuts Assortis',
  slug = 'donuts-assortis',
  description = 'Assortiment de donuts glacés et gourmands.',
  image_path = 'image/food5.png',
  price = 500,
  featured = 0,
  badge = NULL,
  sort_order = 30
WHERE slug = 'fraise';

INSERT INTO menu_items
(category_id,name,slug,description,price,image_path,available,featured,badge,sort_order)
SELECT
  c.id,
  'Pain Perdu aux Fruits',
  'pain-perdu-fruits',
  'Pain perdu doré, banane, myrtilles et touche de miel.',
  650,
  'image/food9.jpeg',
  1,0,'Gourmand',40
FROM categories c
WHERE c.slug='desserts'
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  description=VALUES(description),
  price=VALUES(price),
  image_path=VALUES(image_path),
  available=1,
  badge=VALUES(badge),
  sort_order=VALUES(sort_order);


-- =============================================================
-- BOISSONS
-- =============================================================

UPDATE menu_items
SET
  name = 'Cocktail Fraise',
  description = 'Cocktail frais à la fraise et au citron.',
  image_path = 'image/cocktail-fraise.jpeg',
  price = 350,
  featured = 0,
  badge = NULL,
  sort_order = 10
WHERE slug = 'cocktail-fruite';

UPDATE menu_items
SET
  name = 'Jus de Pomme',
  description = 'Jus de pomme frais.',
  image_path = 'image/jus-pomme.jpeg',
  price = 300,
  featured = 0,
  badge = NULL,
  sort_order = 20
WHERE slug = 'jus-maison';

UPDATE menu_items
SET
  name = 'Jus de Betterave',
  description = 'Jus frais de betterave.',
  image_path = 'image/food3.png',
  price = 300,
  featured = 0,
  badge = 'Vitaminé',
  sort_order = 30
WHERE slug = 'boisson-fraiche';

INSERT INTO menu_items
(category_id,name,slug,description,price,image_path,available,featured,badge,sort_order)
SELECT
  c.id,
  'Jus de Fraise',
  'jus-fraise',
  'Boisson fraîche à la fraise.',
  350,
  'image/FRAISE1.jpeg',
  1,0,'Frais',40
FROM categories c
WHERE c.slug='boissons'
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  description=VALUES(description),
  price=VALUES(price),
  image_path=VALUES(image_path),
  available=1,
  badge=VALUES(badge),
  sort_order=VALUES(sort_order);

COMMIT;

-- =============================================================
-- CONTRÔLE
-- Tu dois obtenir plusieurs produits par catégorie.
-- =============================================================

SELECT
  c.name AS categorie,
  COUNT(m.id) AS nombre_de_produits
FROM categories c
LEFT JOIN menu_items m ON m.category_id = c.id
WHERE c.active = 1
GROUP BY c.id, c.name, c.sort_order
ORDER BY c.sort_order;

SELECT
  c.name AS categorie,
  m.name,
  m.price,
  m.image_path,
  m.available,
  m.sort_order
FROM menu_items m
JOIN categories c ON c.id = m.category_id
WHERE c.active = 1
ORDER BY c.sort_order, m.sort_order, m.id;
