import json
import uuid
from datetime import timedelta
from functools import wraps

from django.db import transaction
from django.db.models import Max
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt

from . import logic
from .models import Checkpoint, Event, Trip


class BadRequest(Exception):
    pass


def api(methods):
    """JSON in/out, sin CSRF (app personal sin sesiones) y errores 400 legibles."""

    def deco(fn):
        @csrf_exempt
        @wraps(fn)
        def view(request, *args, **kwargs):
            if request.method not in methods:
                return JsonResponse({'error': 'Método no permitido'}, status=405)
            if request.body:
                try:
                    request.data = json.loads(request.body)
                except json.JSONDecodeError:
                    return JsonResponse({'error': 'JSON inválido'}, status=400)
            else:
                request.data = {}
            try:
                return fn(request, *args, **kwargs)
            except (BadRequest, ValueError) as exc:
                return JsonResponse({'error': str(exc)}, status=400)

        return view

    return deco


def _event_dicts(trip):
    return [
        {'kind': e.kind, 'checkpoint_id': e.checkpoint_id, 'checkpoint_name': e.checkpoint_name,
         'timestamp': e.timestamp}
        for e in trip.events.all()
    ]


def _trip_json(trip, events=None):
    events = events if events is not None else _event_dicts(trip)
    return {
        'id': str(trip.id),
        'route': trip.route,
        'notes': trip.notes,
        'events': events,
        'summary': logic.summarize(events),
    }


def _get_trip(trip_id):
    trip = Trip.objects.filter(pk=trip_id).first()
    if trip is None:
        return None, JsonResponse({'error': 'Viaje no encontrado'}, status=404)
    return trip, None


# --- Semáforos -------------------------------------------------------------------------

@api(['GET', 'POST'])
def checkpoints(request):
    if request.method == 'POST':
        name = (request.data.get('name') or '').strip()
        if not name:
            raise BadRequest('El nombre es obligatorio')
        last = Checkpoint.objects.aggregate(m=Max('order'))['m']
        Checkpoint.objects.create(name=name[:80], order=(last or 0) + 1)
    return JsonResponse({'checkpoints': [c.as_dict() for c in Checkpoint.objects.all()]})


@api(['PATCH', 'DELETE'])
def checkpoint_detail(request, pk):
    cp = Checkpoint.objects.filter(pk=pk).first()
    if cp is None:
        return JsonResponse({'error': 'Semáforo no encontrado'}, status=404)
    if request.method == 'DELETE':
        cp.delete()
    else:
        if 'name' in request.data:
            name = (request.data['name'] or '').strip()
            if not name:
                raise BadRequest('El nombre es obligatorio')
            cp.name = name[:80]
        if 'active' in request.data:
            cp.active = bool(request.data['active'])
        cp.save()
    return JsonResponse({'checkpoints': [c.as_dict() for c in Checkpoint.objects.all()]})


@api(['POST'])
def checkpoints_reorder(request):
    ids = request.data.get('ids') or []
    with transaction.atomic():
        for i, pk in enumerate(ids, start=1):
            Checkpoint.objects.filter(pk=pk).update(order=i)
    return JsonResponse({'checkpoints': [c.as_dict() for c in Checkpoint.objects.all()]})


# --- Viajes ----------------------------------------------------------------------------

@api(['GET'])
def trips(request):
    limit = min(int(request.GET.get('limit', 50)), 500)
    qs = Trip.objects.prefetch_related('events')[:limit]
    return JsonResponse({'trips': [_trip_json(t) for t in qs]})


@api(['GET'])
def active_trip(request):
    trip = Trip.objects.filter(ended_at__isnull=True).prefetch_related('events').first()
    return JsonResponse({'trip': _trip_json(trip) if trip else None})


def _parse_events(raw):
    if not isinstance(raw, list):
        raise BadRequest('"events" debe ser una lista')
    valid_cp = set(Checkpoint.objects.values_list('id', flat=True))
    events = []
    for i, item in enumerate(raw):
        ts = parse_datetime(str(item.get('timestamp', '')))
        if ts is None or timezone.is_naive(ts):
            raise BadRequest(f'Evento #{i + 1}: timestamp inválido (usar ISO 8601 con zona horaria)')
        cp_id = item.get('checkpoint_id')
        events.append({
            'kind': item.get('kind'),
            'checkpoint_id': cp_id,
            'checkpoint_name': str(item.get('checkpoint_name') or '')[:80],
            'timestamp': ts,
            'db_checkpoint_id': cp_id if cp_id in valid_cp else None,
        })
    return events


@api(['GET', 'PUT', 'PATCH', 'DELETE'])
def trip_detail(request, trip_id):
    if request.method == 'PUT':
        return _put_trip(request, trip_id)

    trip, err = _get_trip(trip_id)
    if err:
        return err
    if request.method == 'DELETE':
        trip.delete()
        return JsonResponse({'deleted': True})
    if request.method == 'PATCH':
        if 'notes' in request.data:
            trip.notes = str(request.data['notes'] or '')[:200]
            trip.save(update_fields=['notes', 'updated_at'])
    return JsonResponse({'trip': _trip_json(trip)})


def _put_trip(request, trip_id):
    """Reemplaza el viaje completo (idempotente): así el cliente puede reintentar sin conexión."""
    trip_id = uuid.UUID(str(trip_id))
    events = _parse_events(request.data.get('events', []))
    route = request.data.get('route') or []
    if not isinstance(route, list) or not all(isinstance(r, dict) and 'id' in r and 'name' in r for r in route):
        raise BadRequest('"route" debe ser una lista de {id, name}')

    with transaction.atomic():
        if not events:  # se deshizo el "Arrancar": el viaje deja de existir
            Trip.objects.filter(pk=trip_id).delete()
            return JsonResponse({'trip': None})

        logic.validate_events(route, events)
        end = next((e['timestamp'] for e in events if e['kind'] == logic.END), None)
        trip, _ = Trip.objects.update_or_create(
            pk=trip_id,
            defaults={'started_at': events[0]['timestamp'], 'ended_at': end, 'route': route},
        )
        if 'notes' in request.data:
            trip.notes = str(request.data['notes'] or '')[:200]
            trip.save(update_fields=['notes'])
        trip.events.all().delete()
        Event.objects.bulk_create([
            Event(trip=trip, seq=i, kind=e['kind'], checkpoint_id=e['db_checkpoint_id'],
                  checkpoint_name=e['checkpoint_name'], timestamp=e['timestamp'])
            for i, e in enumerate(events)
        ])
    return JsonResponse({'trip': _trip_json(trip)})


@api(['GET'])
def reports(request):
    qs = Trip.objects.filter(ended_at__isnull=False).prefetch_related('events')
    days = request.GET.get('days')
    if days and days != 'all':
        qs = qs.filter(started_at__gte=timezone.now() - timedelta(days=int(days)))
    summaries = [logic.summarize(_event_dicts(t)) for t in qs]
    return JsonResponse({'report': logic.build_report(summaries)})
