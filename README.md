# ₿ BitVibe : Monitoring Crypto Haptique

**BitVibe** est une application Android innovante conçue pour suivre le cours du Bitcoin de manière sensorielle et non intrusive. Grâce à une synchronisation en temps réel et une gestion double-flux de dispositifs haptiques, BitVibe permet de "ressentir" le marché sans jamais consulter son écran.

---

## 💡 Concept & Innovation

L'application transforme les données de marché en stimuli physiques différenciés pour une surveillance passive totale :

* **Poignet Droit (Hausse) :** Déclenche des vibrations lorsque le cours du Bitcoin monte.
* **Poignet Gauche (Baisse) :** Déclenche des vibrations lorsque le cours du Bitcoin descend.

Cette approche réduit la dépendance visuelle aux graphiques (anti "doom-scrolling") tout en maintenant l'utilisateur connecté aux mouvements majeurs du marché.

---

## 🛠 Spécifications Techniques

### 📱 Développement Mobile
* **Langage :** Java
* **IDE :** Android Studio
* **Architecture :** Utilisation de services d'arrière-plan (Background Services) pour assurer un monitoring continu et une gestion de la batterie optimisée.

### 📊 Flux de Données (Real-time)
* **API :** Intégration de l'API **ByBit** pour une synchronisation ultra-précise.
* **Récupération :** Gestion des flux de données en temps réel pour minimiser la latence entre la variation de prix et le signal physique.

### ⌚ Gestion Hardware & Bluetooth
* **Connectivité Simultanée :** Implémentation d'un protocole de communication Bluetooth permettant de piloter deux dispositifs haptiques de manière synchrone et indépendante.
* **Routage Haptique :** Algorithme de séparation des signaux (G/D) basé sur le delta de prix calculé.

### ⚙️ Personnalisation & UI
* **Gestion des Paliers :** Système de seuils réglables permettant à l'utilisateur de définir la sensibilité (ex: vibration uniquement dès 0.2% de variation).
* **Patterns de Vibration :** Intensité et durée des pulses configurables via l'interface.

---

## 🚀 Installation

1.  **Cloner le dépôt :**
    ```bash
    git clone [https://github.com/votre-username/BitVibe.git](https://github.com/votre-username/BitVibe.git)
    ```
2.  **Configuration API :**
    * Générez une clé API sur votre compte ByBit.
    * Renseignez vos identifiants dans les paramètres de l'application.
3.  **Appairage :**
    * Activez le Bluetooth sur votre smartphone.
    * Appairez vos deux dispositifs de vibration (L et R) directement depuis le menu de configuration BitVibe.
