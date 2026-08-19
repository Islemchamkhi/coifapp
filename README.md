# Salon Barber — Réservation en ligne (PWA)

Site web de réservation en ligne pour un salon de coiffure pour hommes.
Accessible directement via un lien, sans installation obligatoire (avec option d'ajout à l'écran d'accueil en PWA).

## Stack technique

- **Client** : React + TypeScript + Vite + Tailwind CSS, mobile-first, i18n FR/AR avec RTL complet, PWA (manifest + service worker via `vite-plugin-pwa`)
- **Serveur** : Node.js + Express + TypeScript
- **Base de données** : SQLite (via `better-sqlite3`) — fichier réel, transactions atomiques, aucune dépendance externe à héberger
- Le serveur sert aussi le build du client en production → **un seul déploiement, un seul lien**

## Architecture

```
salon-booking/
├── server/                 # API + base de données
│   ├── src/
│   │   ├── db.ts           # schéma SQLite + seed (Abdou, Rayen, 3 services)
│   │   ├── lib/time.ts     # horaires, pause, granularité des créneaux
│   │   ├── services/
│   │   │   ├── availability.ts   # calcul des créneaux disponibles
│   │   │   └── booking.ts        # création atomique d'un rendez-vous
│   │   ├── routes/
│   │   │   ├── public.ts   # /api/staff, /api/services, /api/availability, /api/bookings
│   │   │   └── admin.ts    # /api/admin/* (CRUD, blocage, stats, clients)
│   │   ├── middleware/adminAuth.ts
│   │   └── index.ts        # point d'entrée Express
│   └── data/                # fichier salon.db (créé automatiquement)
└── client/                  # site React
    └── src/
        ├── i18n/            # traductions FR/AR + contexte RTL
        ├── api/client.ts    # appels API typés
        ├── pages/           # BookingPage (client) + pages/admin (back-office)
        └── components/      # sélecteurs service/coiffeur/date/créneaux, modals admin
```

## Règles métier implémentées

- **Horaires** : Mardi → Dimanche, 09:00-13:00 et 14:00-20:00. **Lundi fermé**. Pause 13h-14h bloquée automatiquement.
- **Services** : Coupe (20 min), Coupe + barbe (30 min), Autre (30 min) — durées modifiables depuis l'admin.
- **Coiffeurs** : Abdou et Rayen ont des plannings 100% indépendants (vérifié par tests).
- **Anti-chevauchement** : toute création de rendez-vous est vérifiée dans une transaction SQLite atomique — impossible de réserver deux fois le même créneau chez le même coiffeur (testé).
- **File d'attente** : à la confirmation, le nombre de clients déjà positionnés avant l'heure du rendez-vous est calculé, ainsi que l'estimation de passage (= l'heure du rendez-vous, puisque le système garantit déjà l'absence de chevauchement).
- **Admin** (`/admin`, protégé par mot de passe) : planning du jour par coiffeur, ajout/modification/annulation, blocage de créneaux, gestion des services et durées, statistiques (par coiffeur, par service, heures d'affluence), fiche client avec historique.

## Lancer en local

### 1. Serveur

```bash
cd server
cp .env.example .env      # modifier ADMIN_PASSWORD et JWT_SECRET
npm install
npm run dev                # http://localhost:4000
```

### 2. Client (dans un second terminal)

```bash
cd client
npm install
npm run dev                 # http://localhost:5173 (proxy vers l'API :4000)
```

Ouvrir `http://localhost:5173`. Le mot de passe admin par défaut (à changer !) est celui défini dans `server/.env`.

## Déployer en production (un seul lien)

Le plus simple : un seul service Node qui build le client puis sert tout.

```bash
cd client && npm install && npm run build   # génère client/dist
cd ../server && npm install && npm run build # compile TypeScript -> server/dist
npm start                                    # sert l'API + le site sur $PORT
```

Cela peut être déployé tel quel sur **Render, Railway, Fly.io ou tout hébergeur Node** :
1. Build command : `cd client && npm install && npm run build && cd ../server && npm install && npm run build`
2. Start command : `cd server && npm start`
3. Variables d'environnement à définir : `ADMIN_PASSWORD`, `JWT_SECRET`, `PORT` (fourni par l'hébergeur)
4. Prévoir un disque persistant pour `server/data/salon.db` (sur Render : "Persistent Disk" monté sur `server/data`) — sinon la base sera réinitialisée à chaque redéploiement.

Une fois déployé, l'hébergeur fournit une URL unique (ex. `https://salon-barber.onrender.com`) — c'est le lien à partager avec les clients. Le bouton "Ajouter à l'écran d'accueil" apparaîtra automatiquement sur mobile grâce à la PWA.

## Sécurité — à faire avant mise en production réelle

- Changer `ADMIN_PASSWORD` et `JWT_SECRET` (valeurs par défaut à usage de développement uniquement)
- Ajouter un rate-limiting sur `/api/bookings` et `/api/admin/login` (ex. `express-rate-limit`)
- Envisager un vrai système d'utilisateurs admin (actuellement : un seul mot de passe partagé) si plusieurs personnes gèrent le salon
- Ajouter des notifications SMS/WhatsApp de confirmation (non incluses dans ce scaffold)
- Sauvegardes régulières du fichier `salon.db`

## Ce qui est prêt à l'usage dès maintenant

✅ Flux client complet et testé (choix service → coiffeur → date → créneau → confirmation)
✅ Anti-chevauchement testé (double réservation refusée avec message clair)
✅ Plannings Abdou/Rayen indépendants (testé)
✅ Interface admin fonctionnelle (planning, CRUD, blocage, services, stats, clients)
✅ i18n FR/AR + RTL
✅ PWA installable (manifest + icônes + service worker)
✅ Design mobile-first premium (thème sombre + accents dorés)
