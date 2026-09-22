/*
 * AGREGA SOLO ESTOS CAMBIOS AL Código.gs DEL TABLERO INDEPENDIENTE.
 * No borres ni reemplaces el resto del archivo.
 */

// 1. Reemplaza SOLAMENTE la función scanFolder_ que ya existe por esta versión.
// Ahora también encuentra los PDF guardados dentro de subcarpetas por brigada.
function scanFolder_(catalog, indexedFiles) {
  const records = [];
  scanBrigadeFolder_(DriveApp.getFolderById(BRIGADE_FOLDER_ID), catalog, indexedFiles, records);
  records.sort(function (a, b) { return b.updated.getTime() - a.updated.getTime(); });
  return records;
}

// 2. Pega esta función inmediatamente debajo de scanFolder_.
function scanBrigadeFolder_(folder, catalog, indexedFiles, records) {
  const files = folder.getFiles();
  let newPdfCount = 0;

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.PDF) continue;

    const previous = indexedFiles[file.getId()];
    const inferred = inferFromFileName_(file.getName(), catalog);
    let extracted = previous || null;

    if ((!previous || !previous.profession) && newPdfCount < MAX_NEW_PDFS_PER_RUN) {
      newPdfCount++;
      try {
        extracted = extractPdfData_(file);
      } catch (error) {
        extracted = {
          participant: previous ? previous.participant : inferred.participant,
          profession: previous ? previous.profession : '',
          document: previous ? previous.document : '',
          status: 'Pendiente de lectura: ' + clean_(error.message || error)
        };
      }
    }

    extracted = extracted || {};
    records.push({
      updated: file.getLastUpdated(), fileId: file.getId(), fileName: file.getName(),
      brigadeId: inferred.brigadeId, brigade: inferred.brigade,
      participant: clean_(extracted.participant || inferred.participant),
      profession: clean_(extracted.profession), document: clean_(extracted.document),
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      status: clean_(extracted.status || 'Leído correctamente'),
      attendance: clean_((previous && previous.attendance) || extracted.attendance) === 'Sí' ? 'Sí' : 'No'
    });
  }

  const folders = folder.getFolders();
  while (folders.hasNext()) {
    scanBrigadeFolder_(folders.next(), catalog, indexedFiles, records);
  }
}

// 3. Para que se actualice aproximadamente cada minuto, en installTriggers_
// cambia solamente: .everyMinutes(5) por .everyMinutes(1)
