from django.urls import path

from . import views

urlpatterns = [
    path('checkpoints', views.checkpoints),
    path('checkpoints/reorder', views.checkpoints_reorder),
    path('checkpoints/<int:pk>', views.checkpoint_detail),
    path('trips', views.trips),
    path('trips/active', views.active_trip),
    path('trips/<uuid:trip_id>', views.trip_detail),
    path('reports', views.reports),
]
