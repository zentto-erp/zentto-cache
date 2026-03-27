# zentto-cache

Microservicio Redis para persistir layouts de `zentto-grid` por usuario y por tabla.

## Clave Redis

`zentto:grid-layout:{companyId}:{userKey}:{gridId}`

- `companyId`: empresa activa
- `userKey`: `userId` si existe, si no `email`
- `gridId`: id estable del grid en React

## Endpoints

- `GET /v1/grid-layouts/:gridId?companyId=1&userId=123`
- `PUT /v1/grid-layouts/:gridId`
- `DELETE /v1/grid-layouts/:gridId?companyId=1&userId=123`
- `GET /v1/grid-layouts?companyId=1&userId=123`
- `GET /health`

## Variables

Ver `.env.example`.

## Desarrollo

```bash
npm install
npm run dev
```

## Docker

```bash
docker compose up -d --build
```
