from django.db import migrations


def create_defaults(apps, schema_editor):
    Checkpoint = apps.get_model('trips', 'Checkpoint')
    if not Checkpoint.objects.exists():
        for i in range(1, 4):
            Checkpoint.objects.create(name=f'Semáforo {i}', order=i)


class Migration(migrations.Migration):
    dependencies = [('trips', '0001_initial')]
    operations = [migrations.RunPython(create_defaults, migrations.RunPython.noop)]
