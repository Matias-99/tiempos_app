"""Reglas del flujo de un viaje y cálculo de tiempos.

Flujo: start -> leave_parking -> (arrive -> depart) por cada semáforo -> end.
"Pasé en verde" se registra como arrive + depart con la misma hora.
Se puede finalizar antes de pasar por todos los semáforos (cambio de ruta).

La misma lógica está espejada en frontend/src/trip.js; mantener ambas en sincronía.
"""

from statistics import mean

START, LEAVE_PARKING, ARRIVE, DEPART, END = 'start', 'leave_parking', 'arrive', 'depart', 'end'

ORIGIN_KEY, ORIGIN_LABEL = 'origen', 'Estacionamiento origen'
PORTA_KEY, PORTA_LABEL = 'porta', 'Estacionamiento Porta'


def next_allowed(route, events):
    """Devuelve las acciones válidas como lista de (kind, checkpoint|None)."""
    if not events:
        return [(START, None)]
    last = events[-1]['kind']
    if last == START:
        return [(LEAVE_PARKING, None)]
    if last == ARRIVE:
        cp = events[-1]
        return [(DEPART, {'id': cp['checkpoint_id'], 'name': cp['checkpoint_name']})]
    if last in (LEAVE_PARKING, DEPART):
        passed = sum(1 for e in events if e['kind'] == DEPART)
        if passed < len(route):
            return [(ARRIVE, route[passed]), (END, None)]
        return [(END, None)]
    return []


def validate_events(route, events):
    """Lanza ValueError si la secuencia no respeta el flujo o el orden temporal."""
    for i, ev in enumerate(events):
        allowed = next_allowed(route, events[:i])
        match = any(
            kind == ev['kind'] and (cp is None or cp['id'] == ev.get('checkpoint_id'))
            for kind, cp in allowed
        )
        if not match:
            raise ValueError(f'Evento #{i + 1} "{ev["kind"]}" no es válido en este punto del viaje')
        if i and ev['timestamp'] < events[i - 1]['timestamp']:
            raise ValueError(f'Evento #{i + 1} tiene una hora anterior al evento previo')


def _secs(a, b):
    return (b - a).total_seconds() if a and b else None


def _cp_key(ev):
    return f'cp:{ev["checkpoint_id"]}' if ev.get('checkpoint_id') else f'name:{ev["checkpoint_name"]}'


def summarize(events):
    """Tiempos de un viaje a partir de sus eventos ordenados."""
    by_kind = {e['kind']: e['timestamp'] for e in events if e['kind'] in (START, LEAVE_PARKING, END)}
    start, leave, end = by_kind.get(START), by_kind.get(LEAVE_PARKING), by_kind.get(END)

    stops, segments = [], []
    prev_key, prev_label, prev_time = ORIGIN_KEY, ORIGIN_LABEL, leave
    open_stop = None
    for ev in events:
        if ev['kind'] == ARRIVE:
            key = _cp_key(ev)
            segments.append({
                'from_key': prev_key, 'from': prev_label, 'to_key': key, 'to': ev['checkpoint_name'],
                'seconds': _secs(prev_time, ev['timestamp']),
            })
            open_stop = {
                'key': key, 'checkpoint_id': ev.get('checkpoint_id'), 'name': ev['checkpoint_name'],
                'arrived_at': ev['timestamp'], 'departed_at': None, 'seconds': None,
            }
            stops.append(open_stop)
        elif ev['kind'] == DEPART and open_stop:
            open_stop['departed_at'] = ev['timestamp']
            open_stop['seconds'] = _secs(open_stop['arrived_at'], ev['timestamp'])
            prev_key, prev_label, prev_time = open_stop['key'], open_stop['name'], ev['timestamp']
            open_stop = None
        elif ev['kind'] == END:
            segments.append({
                'from_key': prev_key, 'from': prev_label, 'to_key': PORTA_KEY, 'to': PORTA_LABEL,
                'seconds': _secs(prev_time, ev['timestamp']),
            })

    done = [s['seconds'] for s in segments if s['seconds'] is not None]
    waits = [s['seconds'] for s in stops if s['seconds'] is not None]
    return {
        'started_at': start,
        'left_parking_at': leave,
        'ended_at': end,
        'parking_seconds': _secs(start, leave),
        'total_seconds': _secs(start, end),
        'driving_seconds': sum(done) if done else None,
        'waiting_seconds': sum(waits) if waits else None,
        'stops': stops,
        'segments': segments,
    }


def _stats(values):
    values = [v for v in values if v is not None]
    if not values:
        return {'count': 0, 'avg': None, 'min': None, 'max': None}
    return {'count': len(values), 'avg': mean(values), 'min': min(values), 'max': max(values)}


def build_report(summaries):
    """Promedios sobre viajes finalizados: viaje completo, por tramo y por semáforo."""
    segs, stops = {}, {}
    for s in summaries:
        for pos, seg in enumerate(s['segments']):
            g = segs.setdefault((seg['from_key'], seg['to_key']), {'values': [], 'pos': [], 'label': None})
            g['values'].append(seg['seconds'])
            g['pos'].append(pos)
            g['label'] = g['label'] or (seg['from'], seg['to'])  # resúmenes vienen del más reciente
        for pos, stop in enumerate(s['stops']):
            g = stops.setdefault(stop['key'], {'values': [], 'pos': [], 'label': None, 'green': 0})
            g['values'].append(stop['seconds'])
            g['pos'].append(pos)
            g['label'] = g['label'] or stop['name']
            if stop['seconds'] == 0:
                g['green'] += 1

    segments = sorted(
        ({'from': g['label'][0], 'to': g['label'][1], 'avg_position': mean(g['pos']), **_stats(g['values'])}
         for g in segs.values()),
        key=lambda r: r['avg_position'],
    )
    checkpoints = sorted(
        ({'name': g['label'], 'avg_position': mean(g['pos']), 'green_count': g['green'], **_stats(g['values'])}
         for g in stops.values()),
        key=lambda r: r['avg_position'],
    )
    return {
        'trip_count': len(summaries),
        'total': _stats([s['total_seconds'] for s in summaries]),
        'parking': _stats([s['parking_seconds'] for s in summaries]),
        'driving': _stats([s['driving_seconds'] for s in summaries]),
        'waiting': _stats([s['waiting_seconds'] for s in summaries]),
        'segments': segments,
        'checkpoints': checkpoints,
    }
