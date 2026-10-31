# AFK News — Backend API

## GitHub puis Render
1. Décompresse ce ZIP.
2. Crée un dépôt GitHub vide nommé `AFK-NEWS-BACKEND`.
3. Envoie **le contenu du dossier** à la racine du dépôt (`server.js`, `package.json`, etc.).
4. Dans Render, crée un **Web Service** et connecte ce dépôt.
5. Build Command : `npm install`
6. Start Command : `npm start`
7. Dans Render > Environment, ajoute `DATABASE_URL` avec l'URI Session Pooler Supabase (port 5432).

Variables optionnelles Render :
- `NEWSAPI_KEY`
- `GNEWS_API_KEY`
- `NEWS_REFRESH_MINUTES` = `30`
- `NEWS_COUNTRY` = `us`
- `ADMIN_REFRESH_TOKEN` = secret privé choisi par toi.

Ne publie jamais `.env`, mot de passe PostgreSQL ou clés API sur GitHub. Les clés précédemment exposées doivent être révoquées et remplacées. Vérifie les quotas et licences du fournisseur avant usage public/commercial.

## Routes
- `GET /` statut API
- `GET /api/health` test connexion Supabase
- `GET /api/categories`
- `GET /api/articles?page=1&limit=12`
- `GET /api/articles?category=technologie`
- `GET /api/articles?q=climat`
- `GET /api/announcements`
- `POST /api/admin/refresh-news` avec en-tête `x-admin-token`

Les tables PostgreSQL et catégories sont créées automatiquement au premier démarrage si elles n'existent pas. Cette version expose les titres, résumés, métadonnées et liens fournis par les sources, pas les articles complets.

Attention : sur une offre Render qui met le service en veille, le minuteur ne tourne pas pendant la veille. Pour une collecte garantie toutes les 30 minutes, le serveur doit rester actif ou il faudra utiliser un cron externe.
