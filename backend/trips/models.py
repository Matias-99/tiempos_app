from django.db import models


class Checkpoint(models.Model):
    """Punto de control (semáforo) del recorrido habitual."""

    name = models.CharField(max_length=80)
    order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.name

    def as_dict(self):
        return {'id': self.id, 'name': self.name, 'order': self.order, 'active': self.active}


class Trip(models.Model):
    """Un viaje. El id lo genera el cliente para poder sincronizar sin conexión."""

    id = models.UUIDField(primary_key=True)
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    # Copia de los semáforos activos al iniciar: [{"id": 1, "name": "Semáforo 1"}, ...]
    route = models.JSONField(default=list)
    notes = models.CharField(max_length=200, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'Viaje {self.started_at:%Y-%m-%d %H:%M}'


class Event(models.Model):
    START = 'start'
    LEAVE_PARKING = 'leave_parking'
    ARRIVE = 'arrive'
    DEPART = 'depart'
    END = 'end'
    KIND_CHOICES = [
        (START, 'Arrancar'),
        (LEAVE_PARKING, 'Salir estacionamiento'),
        (ARRIVE, 'Llegada a semáforo'),
        (DEPART, 'Salida de semáforo'),
        (END, 'Llegada estacionamiento Porta'),
    ]

    trip = models.ForeignKey(Trip, related_name='events', on_delete=models.CASCADE)
    seq = models.PositiveIntegerField()
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    checkpoint = models.ForeignKey(Checkpoint, null=True, blank=True, on_delete=models.SET_NULL)
    # Nombre al momento del viaje, para que el historial no cambie si se renombra.
    checkpoint_name = models.CharField(max_length=80, blank=True, default='')
    timestamp = models.DateTimeField()

    class Meta:
        ordering = ['trip', 'seq']
        constraints = [models.UniqueConstraint(fields=['trip', 'seq'], name='unique_event_seq')]

    def __str__(self):
        return f'{self.get_kind_display()} {self.checkpoint_name} {self.timestamp:%H:%M:%S}'
