# AFK News Backend v2

## Déploiement Render
1. Remplacer les fichiers du dépôt `AFK-NEWS-BACKEND` par `server.js`, `package.json`, `.env.example`, `.gitignore` et ce README.
2. Commit/push sur `main`. Dans Render, conserver le Web Service existant, Build Command `npm install`, Start Command `npm start`.
3. Render > Environment : ajouter les variables ci-dessous. Ne jamais pousser les valeurs privées sur GitHub.

### Variables obligatoires
- `DATABASE_URL` : URI PostgreSQL Supabase (Session Pooler conseillé).
- `JWT_SECRET` : secret aléatoire long (64 caractères ou plus).
- `FRONTEND_URL` : URL exacte du site frontend Render. Plusieurs origines possibles séparées par des virgules.
- `ADMIN_EMAIL` et `ADMIN_PASSWORD` : identifiants du compte administrateur, stockés uniquement dans Render.

### Actualités
- `NEWSAPI_KEY` et/ou `GNEWS_API_KEY` : au moins une clé fournisseur pour alimenter le flux.
- `NEWS_COUNTRY=us` et `GNEWS_LANGUAGE=en` sont les réglages actuels par défaut. Cela ne garantit pas un flux consacré à Haïti.
- `NEWS_REFRESH_MINUTES=30` (minimum 15). Sur Render gratuit, la collecte programmée s'arrête lorsque le service dort.

### Email SpaceMail (newsletter)
- `SMTP_HOST=mail.spacemail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER` : adresse complète de la boîte mail.
- `SMTP_PASS` : mot de passe de la boîte, uniquement dans Render.
- `MAIL_FROM` : même adresse autorisée par SpaceMail.

## Routes
- `GET /`, `GET /api/health`, `GET /api/categories`, `GET /api/articles`, `GET /api/announcements`
- `POST /api/auth/register` `{name,email,password}`
- `POST /api/auth/login` `{email,password}` ; retourne un JWT
- `GET /api/auth/me` avec `Authorization: Bearer TOKEN`
- `GET /api/favorites`, `POST /api/favorites/:articleId`, `DELETE /api/favorites/:articleId`
- `POST /api/newsletter` `{email}` ; l'inscription est enregistrée même si SMTP n'est pas configuré, mais l'email de bienvenue ne partira pas.
- Admin : `POST /api/admin/refresh-news`, `GET /api/admin/stats`, `POST /api/admin/announcements`, `DELETE /api/admin/announcements/:id`, avec `Authorization: Bearer TOKEN` d'un compte admin.

Les tables sont créées automatiquement au démarrage. L'interface frontend doit encore appeler ces routes pour rendre les boutons compte/favoris/newsletter pleinement utilisables. Le backend seul ne transforme pas automatiquement les boutons de démonstration du HTML.
