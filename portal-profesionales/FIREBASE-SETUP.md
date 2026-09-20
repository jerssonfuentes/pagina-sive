# Portal clínico SIVE: puesta en marcha segura

1. Crea un proyecto Firebase exclusivo para SIVE y registra una app web.
2. En **Authentication > Sign-in method**, habilita **Correo/contraseña**. Crea las cuentas de profesionales desde la consola; el portal no permite autorregistros.
3. Crea **Cloud Firestore** en modo producción. Copia el contenido de `firestore.rules` en la pestaña **Rules** y publícalo.
4. En `firebase-config.js`, reemplaza los seis valores `REEMPLAZA_...` con la configuración de la app web. No agregues claves privadas, cuentas de servicio ni tokens en este archivo.
5. Para cada cuenta creada, agrega en Firestore `professionals/<UID>` un documento con: `active: true`, `organizationId: "sive"`, `name: "Nombre profesional"` y `role: "professional"`. Para el primer administrador usa `role: "admin"`.
6. Agrega el dominio publicado de SIVE en **Authentication > Settings > Authorized domains**. Activa App Check antes de producción y prueba las reglas con el emulador o cuentas de prueba.

Las historias clínicas se guardan en `clinicalRecords`, los registros iniciales en `triageRecords` y las valoraciones de Psicología en `psychologyRecords`. Todo profesional activo de SIVE puede consultar y actualizar expedientes; solo `admin` puede eliminarlos. Cada vez que se modifique `firestore.rules`, publícalas nuevamente en Firebase.
