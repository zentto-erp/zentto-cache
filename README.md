# Zentto Cache

Microservicio de cache Redis para persistir grid layouts y report templates del ERP Zentto.

## Stack

- **Runtime**: Node.js + Express + TypeScript
- **Cache**: Redis 7 (via ioredis)
- **Validacion**: Zod
- **Logging**: Pino
- **Contenedores**: Docker Compose (Redis Alpine + API)

## Endpoints

### Grid Layouts (`/v1/grid-layouts`)

| Metodo   | Ruta                      | Descripcion                          |
| -------- | ------------------------- | ------------------------------------ |
| `GET`    | `/v1/grid-layouts`        | Listar IDs de layouts de un usuario  |
| `GET`    | `/v1/grid-layouts/:gridId`| Obtener layout especifico            |
| `PUT`    | `/v1/grid-layouts/:gridId`| Guardar/actualizar layout            |
| `DELETE` | `/v1/grid-layouts/:gridId`| Eliminar layout                      |

Query params requeridos: `companyId` + (`userId` o `email`).

### Report Templates (`/v1/report-templates`)

| Metodo   | Ruta                                       | Descripcion                           |
| -------- | ------------------------------------------ | ------------------------------------- |
| `GET`    | `/v1/report-templates`                     | Listar IDs de templates de un usuario |
| `GET`    | `/v1/report-templates/public`              | Listar templates publicos de empresa  |
| `GET`    | `/v1/report-templates/:templateId`         | Obtener template especifico           |
| `PUT`    | `/v1/report-templates/:templateId`         | Guardar/actualizar template           |
| `PUT`    | `/v1/report-templates/public/:templateId`  | Guardar template publico              |
| `DELETE` | `/v1/report-templates/:templateId`         | Eliminar template                     |

Query params requeridos: `companyId` + (`userId` o `email`). Rutas `/public` solo requieren `companyId`.

### Health

| Metodo | Ruta      | Descripcion              |
| ------ | --------- | ------------------------ |
| `GET`  | `/health` | Estado del servicio      |

## Variables de entorno

Ver `.env.example` para referencia completa.

| Variable           | Default                     | Descripcion                                  |
| ------------------ | --------------------------- | -------------------------------------------- |
| `PORT`             | `4100`                      | Puerto del servidor Express                  |
| `REDIS_URL`        | `redis://redis:6379`        | URL de conexion a Redis                      |
| `TTL_DAYS`         | `90`                        | Dias de vida de cada clave en Redis          |
| `CACHE_APP_KEY`    | _(vacio)_                   | App key opcional para autenticacion          |
| `CORS_ORIGINS`     | `http://localhost:3016`     | Origenes CORS separados por coma             |
| `LOG_LEVEL`        | `info`                      | Nivel de log (Pino)                          |
| `MAX_LAYOUT_BYTES` | `51200`                     | Tamano maximo por layout/template en bytes   |

## Desarrollo

```bash
npm install
npm run dev
```

El servidor arranca en `http://localhost:4100` con hot-reload via tsx.

## Tests

```bash
npm test            # ejecutar una vez
npm run test:watch  # modo watch
```

## Docker

```bash
docker compose up -d --build
```

El servicio queda expuesto en `http://localhost:4101` (host) y escucha internamente en el puerto `4100`. Redis usa persistencia AOF con limite de 128 MB y politica `allkeys-lru`.

## Clave Redis

### Grid Layouts

```
zentto:grid-layout:{companyId}:{userKey}:{gridId}
zentto:grid-layout-index:{companyId}:{userKey}        # SET de gridIds
```

### Report Templates

```
zentto:report-template:{companyId}:{userKey}:{templateId}
zentto:report-template-index:{companyId}:{userKey}     # SET de templateIds
zentto:report-template-public:{companyId}:{templateId}
zentto:report-template-public-index:{companyId}        # SET de templateIds publicos
```

- `companyId`: empresa activa
- `userKey`: `userId` si existe, si no `email`

## Licencia

MIT
