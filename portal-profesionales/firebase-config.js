/*
 * Configuración pública del cliente Firebase. Sustituye cada valor con la
 * configuración de tu proyecto desde Firebase Console > Configuración del proyecto.
 * Esta información identifica el proyecto; las reglas de Firestore son las que
 * protegen los datos clínicos.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'REEMPLAZA_CON_TU_API_KEY',
  authDomain: 'REEMPLAZA_CON_TU_PROYECTO.firebaseapp.com',
  projectId: 'REEMPLAZA_CON_TU_PROJECT_ID',
  storageBucket: 'REEMPLAZA_CON_TU_PROYECTO.firebasestorage.app',
  messagingSenderId: 'REEMPLAZA_CON_TU_MESSAGING_SENDER_ID',
  appId: 'REEMPLAZA_CON_TU_APP_ID'
};

export const isFirebaseConfigured = !Object.values(firebaseConfig).some(value => value.includes('REEMPLAZA_'));
export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

