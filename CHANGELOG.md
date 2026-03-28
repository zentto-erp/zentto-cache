# Changelog

Todos los cambios notables en este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [0.1.0] - 2026-03-28

### Added

- Cache Redis para persistencia de grid layouts por usuario, empresa y gridId.
- Cache Redis para report templates con soporte de templates publicos por empresa.
- API REST completa (GET/PUT/DELETE) para grid layouts con validacion Zod.
- API REST completa (GET/PUT/DELETE) para report templates (privados y publicos).
- Health check endpoint (`GET /health`).
- Indice Redis (SET) para listar layouts y templates por usuario.
- TTL configurable (por defecto 90 dias) con renovacion automatica.
- Limite de tamano configurable por layout/template (por defecto 50 KB).
- Despliegue Docker con Redis 7 Alpine y persistencia AOF.
- Reverse proxy Nginx con SSL para `cache.zentto.net`.
- Automatizacion DNS en Cloudflare via GitHub Actions.
- Autenticacion opcional por app key (`CACHE_APP_KEY`).
- CORS configurable por variable de entorno.
- Logging estructurado con Pino.
