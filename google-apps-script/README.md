# Integración del formulario SIVE con Google Drive

Este script recibe el formulario web, crea un PDF y lo guarda en la carpeta
`Datos_de_autorización_voluntarios`.

## Configuración en Google

1. Inicia sesión en la cuenta institucional de SIVE. No compartas la contraseña.
2. Abre https://script.google.com y crea un proyecto nuevo llamado `SIVE Voluntariado`.
3. Sustituye el contenido de `Code.gs` por el contenido de este archivo `Code.gs`.
4. Guarda el proyecto.
5. Ejecuta manualmente la función `doGet` una vez y acepta los permisos solicitados.
6. Selecciona **Implementar > Nueva implementación > Aplicación web**.
7. Configura **Ejecutar como: Yo**.
8. Configura el acceso según el formulario:
   - Público: cualquier usuario, incluso anónimo.
   - Restringido: solo usuarios autenticados o del dominio institucional.
9. Implementa y copia la URL terminada en `/exec`.
10. Abre `app.js` y pega esa URL en `GOOGLE_SCRIPT_URL`.

## Seguridad

- Mantén privada la carpeta de Drive.
- Comparte la carpeta solo con responsables autorizados.
- Nunca copies contraseñas, tokens OAuth ni claves privadas al proyecto web.
- Revisa periódicamente los permisos y los archivos generados.
- Para un formulario público se recomienda añadir CAPTCHA o protección equivalente
  antes de publicarlo de forma masiva.

## Prueba

Después de configurar la URL, completa una inscripción de prueba. Debe aparecer un
PDF llamado `SIVE_Voluntario_Nombre_Apellido_Fecha.pdf` en la carpeta de Drive.
