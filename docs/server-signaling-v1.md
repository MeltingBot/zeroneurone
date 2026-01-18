# zeroneurone-server — Signaling

## Destination : Claude Code

Serveur de signaling pur. Relaie des messages entre peers. Ne stocke rien.

---

## Principe

```
Client A ◄────────► Serveur ◄────────► Client B
              (relay WebSocket)
```

Le serveur :
1. Reçoit un message d'un client
2. Le renvoie à tous les autres clients de la même room
3. C'est tout

**Pas de stockage. Pas de base de données. Pas de persistance.**

Si le serveur redémarre → les clients se reconnectent et se re-synchronisent entre eux via Yjs.

---

## Implémentation complète

### Package.json

```json
{
  "name": "zeroneurone-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "ws": "^8.14.2"
  }
}
```

### index.js

```javascript
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3000;

// Map: roomId -> Set<WebSocket>
const rooms = new Map();

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  // Room ID = path sans le premier slash
  // ws://server/abc123 -> roomId = "abc123"
  const roomId = req.url?.slice(1) || 'default';
  
  // Ajouter à la room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(ws);
  
  console.log(`+ ${roomId} (${rooms.get(roomId).size} peers)`);
  
  // Relayer les messages
  ws.on('message', (data) => {
    const peers = rooms.get(roomId);
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === 1) {
        peer.send(data);
      }
    }
  });
  
  // Nettoyage
  ws.on('close', () => {
    const peers = rooms.get(roomId);
    if (peers) {
      peers.delete(ws);
      if (peers.size === 0) {
        rooms.delete(roomId);
      }
      console.log(`- ${roomId} (${peers.size} peers)`);
    }
  });
});

console.log(`Signaling server on port ${PORT}`);
```

**C'est tout. 40 lignes.**

---

## Dockerfile

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY index.js .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
```

## docker-compose.yml

```yaml
version: '3.8'
services:
  signaling:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
```

---

## Utilisation côté client

### Connexion

```typescript
const roomId = 'abc123'; // UUID généré par le client
const ws = new WebSocket(`wss://signal.zeroneurone.io/${roomId}`);
```

### Avec Yjs

```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const ydoc = new Y.Doc();
const roomId = 'abc123';

const provider = new WebsocketProvider(
  'wss://signal.zeroneurone.io',
  roomId,
  ydoc
);
```

Le `y-websocket` provider gère :
- La connexion/reconnexion
- La synchronisation initiale entre peers
- Le broadcast des updates

---

## URL de partage

```
https://app.zeroneurone.io/join/{roomId}#{secretKey}
```

- `roomId` : identifiant de la room (UUID généré par le créateur)
- `secretKey` : clé de chiffrement (dans le fragment, jamais envoyé au serveur)

Le serveur ne voit que `roomId`. Il ne sait pas ce que les clients s'échangent.

---

## Chiffrement E2E (côté client)

Le serveur relaie des octets. Si on veut du chiffrement, c'est côté client.

### Option 1 : Sans chiffrement

Les updates Yjs sont relayés en clair. Le serveur pourrait techniquement les lire (mais ne les stocke pas).

Pour des cas non-sensibles, c'est suffisant.

### Option 2 : Avec chiffrement

Wrapper le provider pour chiffrer/déchiffrer :

```typescript
// Provider chiffré (simplifié)
class EncryptedProvider {
  private ws: WebSocket;
  private key: CryptoKey;
  private doc: Y.Doc;

  constructor(serverUrl: string, roomId: string, doc: Y.Doc, key: CryptoKey) {
    this.doc = doc;
    this.key = key;
    this.ws = new WebSocket(`${serverUrl}/${roomId}`);
    
    this.ws.onmessage = async (e) => {
      const decrypted = await this.decrypt(new Uint8Array(e.data));
      Y.applyUpdate(this.doc, decrypted, 'remote');
    };
    
    this.doc.on('update', async (update, origin) => {
      if (origin === 'remote') return;
      const encrypted = await this.encrypt(update);
      this.ws.send(encrypted);
    });
  }

  private async encrypt(data: Uint8Array): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.key,
      data
    );
    const result = new Uint8Array(12 + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), 12);
    return result.buffer;
  }

  private async decrypt(data: Uint8Array): Promise<Uint8Array> {
    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.key,
      encrypted
    );
    return new Uint8Array(decrypted);
  }
}
```

---

## Ce que voit le serveur

| Donnée | Visible |
|--------|---------|
| roomId | Oui (UUID) |
| Nombre de peers par room | Oui |
| Contenu des messages | Octets (chiffrés ou non selon le client) |
| IP des clients | Oui (logs) |

**Rien n'est stocké. Quand le serveur redémarre, tout est vide.**

---

## Scalabilité

Pour un usage modéré (< 1000 rooms simultanées), un seul serveur suffit.

Pour scaler :
- Mettre plusieurs instances derrière un load balancer
- Utiliser Redis pub/sub pour synchroniser les rooms entre instances
- Ou : chaque instance gère un subset de rooms (hash du roomId)

Mais pour commencer, une instance suffit largement.

---

## Déploiement

**Fly.io (gratuit pour un petit usage) :**

```bash
fly launch
fly deploy
```

**Railway / Render / VPS :**

```bash
docker build -t zeroneurone-server .
docker run -p 3000:3000 zeroneurone-server
```

**Coût : quasi nul.** C'est juste un process Node qui relaie des WebSockets.

---

## Résumé

| | |
|-|-|
| Lignes de code | ~40 |
| Dépendances | 1 (ws) |
| Base de données | Aucune |
| Stockage | Aucun |
| Ce qu'il sait | roomId + nombre de peers |
| Compromis | Rien à voler |

---

*Serveur Signaling — zeroneurone — Janvier 2025*
