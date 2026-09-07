# SAMMOLLO PRO — MySQL / phpMyAdmin

Cette version utilise **MySQL/MariaDB**, compatible avec phpMyAdmin/XAMPP.

## 1. Base de données
Dans phpMyAdmin :
1. Ouvrir **Importer**.
2. Choisir `database/database.sql`.
3. Lancer l'importation.

Le fichier crée automatiquement la base `sammollo_restaurant`, puis les tables et les données initiales. L'erreur « Aucune base n'a été sélectionnée » ne doit donc plus apparaître.

## 2. Configuration
Copier `.env.example` vers `.env` et adapter les valeurs MySQL.
Avec XAMPP local, les valeurs habituelles sont :

- `DB_HOST=127.0.0.1`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD=`
- `DB_NAME=sammollo_restaurant`

## 3. Démarrer
```bash
npm install
npm start
```
Puis ouvrir `http://localhost:3000`.

## Architecture demandée
- `database/database.sql` : schéma MySQL + données initiales
- `db.js` : connexion MySQL via `mysql2/promise`
- `serveur.js` : point de lancement Express et API

## Important
Le code de vérification contact est envoyé à l'adresse email saisie par le visiteur. Le code expire en 3 minutes et le serveur limite les tentatives.
