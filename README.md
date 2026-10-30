# Tiempos de viaje

Web app personal para cronometrar el recorrido estacionamiento origen → semáforos → estacionamiento Porta.
React (Vite) + Django + SQLite. Pensada para usar con una mano en el celular.

## Uso

| Pantalla | Qué hace |
|---|---|
| **Viaje** | Un único botón grande muestra siempre la próxima acción: ARRANCAR → SALIR ESTACIONAMIENTO → LLEGADA / SALIDA de cada semáforo → LLEGADA PORTA. Arriba: tiempo total en vivo, tiempo parcial actual y el promedio histórico de ese tramo/semáforo (en naranja si lo estás superando). |
| | **Pasé en verde**: registra llegada y salida a la vez (espera 0) con un toque. |
| | **Deshacer** y **Fin** (terminar antes del último semáforo) piden un segundo toque para confirmar. |
| **Historial** | Todos los viajes; tocar uno muestra cada tramo y cada espera. |
| **Reportes** | Promedio / mínimo / máximo del viaje completo, del estacionamiento, por tramo y por semáforo (con % de veces en verde). Filtro 7 / 30 / 90 días / todo. |
| **Semáforos** | Agregar, renombrar, reordenar, activar/desactivar. Los cambios aplican al próximo viaje. |

Detalles pensados para el auto:
- **Funciona sin señal**: la hora se toma en el teléfono al tocar y se guarda localmente; se sincroniza sola al volver la conexión (indicador arriba).
- La pantalla no se apaga durante un viaje (Wake Lock, requiere HTTPS).
- Se ignoran dobles toques accidentales (< 0,7 s) y vibra al registrar.
- Se puede instalar como app ("Agregar a pantalla de inicio").
- Si abrís la app en otro dispositivo, retoma el viaje en curso.

## Ejecutar

Requisitos: Python 3.11+, Node 20+.

```bash
# Backend
cd backend
pip install -r ../requirements.txt
python manage.py migrate          # crea la BD con "Semáforo 1..3" de ejemplo
python manage.py runserver 0.0.0.0:8000

# Frontend (otra terminal) — desarrollo con recarga en caliente
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxy /api → :8000)
```

**Producción / un solo servidor**: `cd frontend && npm run build`; Django sirve el build en `http://<host>:8000/`.

Para usarlo desde el celular en la calle, el servidor tiene que ser accesible desde internet y con HTTPS
(necesario para el modo sin señal y para mantener la pantalla encendida). Variables de entorno:
`DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, `DJANGO_ALLOWED_HOSTS=midominio.com`, `DJANGO_TIME_ZONE`.

> La API no tiene autenticación (app personal). Si la exponés a internet, poné el servidor detrás de
> autenticación básica del proxy (nginx/Caddy) o similar.

## Tests

```bash
cd backend && python manage.py test trips
cd frontend && npm test
```

## Estructura

```
backend/trips/logic.py   reglas del flujo + cálculo de tiempos y reportes
backend/trips/views.py   API JSON (/api/checkpoints, /api/trips, /api/reports)
frontend/src/trip.js     misma lógica del flujo en el cliente (mantener en sincronía con logic.py)
frontend/src/useTrip.js  estado del viaje, guardado local y sincronización
frontend/src/components/ pantallas
```

Modelo: `Checkpoint` (semáforo), `Trip` (id UUID generado en el teléfono, ruta congelada al arrancar),
`Event` (start / leave_parking / arrive / depart / end + fecha y hora). Los tiempos se calculan a partir de los eventos.
