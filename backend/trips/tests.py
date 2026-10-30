import json
import uuid
from datetime import datetime, timedelta, timezone

from django.test import TestCase

from .models import Checkpoint

T0 = datetime(2026, 10, 1, 8, 0, 0, tzinfo=timezone.utc)


def ts(seconds):
    return (T0 + timedelta(seconds=seconds)).isoformat()


class TripApiTests(TestCase):
    def setUp(self):
        self.cps = list(Checkpoint.objects.all())  # 3 semáforos creados por la migración
        self.route = [{'id': c.id, 'name': c.name} for c in self.cps]

    def ev(self, kind, t, cp=None):
        return {'kind': kind, 'timestamp': ts(t),
                'checkpoint_id': cp.id if cp else None, 'checkpoint_name': cp.name if cp else ''}

    def full_trip(self, offset=0, wait1=30):
        a, b, c = self.cps
        o = offset
        return [
            self.ev('start', o),
            self.ev('leave_parking', o + 120),
            self.ev('arrive', o + 180, a), self.ev('depart', o + 180 + wait1, a),
            self.ev('arrive', o + 300, b), self.ev('depart', o + 300, b),  # pasé en verde
            self.ev('arrive', o + 400, c), self.ev('depart', o + 460, c),
            self.ev('end', o + 600),
        ]

    def put(self, trip_id, events, route=None):
        return self.client.put(f'/api/trips/{trip_id}', json.dumps({'route': route or self.route, 'events': events}),
                               content_type='application/json')

    def test_full_trip_summary(self):
        res = self.put(uuid.uuid4(), self.full_trip())
        self.assertEqual(res.status_code, 200, res.content)
        s = res.json()['trip']['summary']
        self.assertEqual(s['parking_seconds'], 120)
        self.assertEqual(s['total_seconds'], 600)
        self.assertEqual([x['seconds'] for x in s['stops']], [30, 0, 60])
        self.assertEqual([x['seconds'] for x in s['segments']], [60, 90, 100, 140])
        self.assertEqual(s['segments'][0]['from'], 'Estacionamiento origen')
        self.assertEqual(s['segments'][-1]['to'], 'Estacionamiento Porta')
        self.assertEqual(s['driving_seconds'] + s['waiting_seconds'] + s['parking_seconds'], 600)

    def test_put_is_idempotent_and_active_trip(self):
        trip_id = uuid.uuid4()
        partial = self.full_trip()[:3]
        self.put(trip_id, partial)
        self.put(trip_id, partial)
        active = self.client.get('/api/trips/active').json()['trip']
        self.assertEqual(active['id'], str(trip_id))
        self.assertEqual(len(active['events']), 3)

        self.put(trip_id, self.full_trip())
        self.assertIsNone(self.client.get('/api/trips/active').json()['trip'])

    def test_undo_start_deletes_trip(self):
        trip_id = uuid.uuid4()
        self.put(trip_id, self.full_trip()[:1])
        self.put(trip_id, [])
        self.assertEqual(self.client.get(f'/api/trips/{trip_id}').status_code, 404)

    def test_rejects_invalid_sequence(self):
        events = self.full_trip()
        del events[1]  # falta salir del estacionamiento
        self.assertEqual(self.put(uuid.uuid4(), events).status_code, 400)

    def test_rejects_wrong_checkpoint_order(self):
        events = self.full_trip()
        events[2]['checkpoint_id'] = self.cps[1].id
        self.assertEqual(self.put(uuid.uuid4(), events).status_code, 400)

    def test_rejects_time_going_backwards(self):
        events = self.full_trip()
        events[3]['timestamp'] = ts(100)
        self.assertEqual(self.put(uuid.uuid4(), events).status_code, 400)

    def test_can_finish_early(self):
        events = self.full_trip()[:4] + [self.ev('end', 500)]
        res = self.put(uuid.uuid4(), events)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['trip']['summary']['segments'][-1]['seconds'], 290)

    def test_history_survives_checkpoint_rename_and_delete(self):
        self.put(uuid.uuid4(), self.full_trip())
        self.client.patch(f'/api/checkpoints/{self.cps[0].id}', json.dumps({'name': 'Otro'}),
                          content_type='application/json')
        self.client.delete(f'/api/checkpoints/{self.cps[1].id}')
        trip = self.client.get('/api/trips').json()['trips'][0]
        names = [s['name'] for s in trip['summary']['stops']]
        self.assertEqual(names, ['Semáforo 1', 'Semáforo 2', 'Semáforo 3'])

    def test_report_averages(self):
        self.put(uuid.uuid4(), self.full_trip(0, wait1=30))
        self.put(uuid.uuid4(), self.full_trip(3600, wait1=50))
        self.put(uuid.uuid4(), self.full_trip(7200)[:3])  # en curso: se excluye
        r = self.client.get('/api/reports?days=all').json()['report']
        self.assertEqual(r['trip_count'], 2)
        self.assertEqual(r['total']['avg'], 600)
        self.assertEqual(r['checkpoints'][0]['avg'], 40)
        self.assertEqual(r['checkpoints'][0]['min'], 30)
        self.assertEqual(r['checkpoints'][1]['green_count'], 2)
        self.assertEqual([s['to'] for s in r['segments']],
                         ['Semáforo 1', 'Semáforo 2', 'Semáforo 3', 'Estacionamiento Porta'])

    def test_checkpoint_crud_and_reorder(self):
        res = self.client.post('/api/checkpoints', json.dumps({'name': 'Semáforo 4'}), content_type='application/json')
        ids = [c['id'] for c in res.json()['checkpoints']]
        self.assertEqual(len(ids), 4)
        res = self.client.post('/api/checkpoints/reorder', json.dumps({'ids': ids[::-1]}),
                               content_type='application/json')
        self.assertEqual([c['id'] for c in res.json()['checkpoints']], ids[::-1])
