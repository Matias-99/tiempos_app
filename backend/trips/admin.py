from django.contrib import admin

from .models import Checkpoint, Event, Trip


@admin.register(Checkpoint)
class CheckpointAdmin(admin.ModelAdmin):
    list_display = ('name', 'order', 'active')
    list_editable = ('order', 'active')


class EventInline(admin.TabularInline):
    model = Event
    extra = 0


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ('started_at', 'ended_at', 'notes')
    inlines = [EventInline]
