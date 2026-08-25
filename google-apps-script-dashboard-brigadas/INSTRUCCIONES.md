# Tablero independiente de brigadas SIVE

Este tablero no modifica la hoja de programación ni el formulario web.

1. Cree una Hoja de Google nueva y vacía.
2. Abra **Extensiones → Apps Script**.
3. Pegue el contenido de `Code.gs` en el editor.
4. En **Servicios**, pulse `+`, seleccione **Drive API** y agréguelo.
5. Guarde el proyecto.
6. Seleccione `setupIndependentDashboard` y pulse **Ejecutar**.
7. Autorice el acceso a Drive, Documentos y Hojas de cálculo.

El proyecto creará `Resumen_Brigadas`, `Participantes` y `Archivos_Carpeta` en la hoja nueva.
Los cambios del catálogo se reflejan al editarlo y la carpeta se revisa cada cinco minutos.

Las pestañas `Participantes` y `Archivos_Carpeta` incluyen la columna `Asistencia`, con un selector de valores `Sí` y `No`. La selección se conserva durante las sincronizaciones.
