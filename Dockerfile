# On utilise une version légère de Node.js
FROM node:20-slim

# On définit le dossier de travail dans le conteneur
WORKDIR /app

# On copie uniquement les fichiers de dépendances d'abord
# Ça permet à Docker de mettre en cache l'installation des modules
COPY package*.json ./

# On installe les dépendances
RUN npm install

# On copie tout le reste du code (controllers, views, etc.)
COPY . .

# On indique le port sur lequel ton Express tourne (ex: 3000)
EXPOSE 3000

# La commande pour démarrer ton serveur
CMD ["node", "server.js"]