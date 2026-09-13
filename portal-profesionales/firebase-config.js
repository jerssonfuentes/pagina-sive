/*
 * Configuración pública del cliente Firebase del portal SIVE. Las reglas de
 * Firestore y la autenticación son las que protegen los datos clínicos.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyA5qHMomlRPSfUIw1ynVtSfazyCTsqGKek',
  authDomain: 'portal-profesionales-b82b4.firebaseapp.com',
  projectId: 'portal-profesionales-b82b4',
  storageBucket: 'portal-profesionales-b82b4.firebasestorage.app',
  messagingSenderId: '625532713786',
  appId: '1:625532713786:web:09e44394d617cf90ceee03'
};

export const isFirebaseConfigured = true;
export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
