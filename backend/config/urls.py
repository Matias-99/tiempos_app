from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import include, path, re_path
from django.views.static import serve


def frontend(request, path=''):
    """Sirve el build de React; cualquier ruta desconocida devuelve index.html."""
    dist = settings.FRONTEND_DIST
    if path and (dist / path).is_file():
        return serve(request, path, document_root=dist)
    index = dist / 'index.html'
    if not index.is_file():
        return HttpResponse('Frontend sin compilar: ejecutar "npm run build" en frontend/', status=503)
    return FileResponse(open(index, 'rb'), content_type='text/html')


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('trips.urls')),
    re_path(r'^(?P<path>.*)$', frontend),
]
