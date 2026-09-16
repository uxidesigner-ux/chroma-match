/**
 * Firebase project configuration.
 *
 * These values are not secrets, despite `apiKey` being in the name. Firebase
 * web config identifies the project to Google's servers; it does not authorise
 * anything on its own. Every client that loads the game has to receive it, so
 * hiding it is impossible as well as pointless — which is why Google documents
 * it as public. What actually protects the data is the Firestore security rules
 * and the Cloud Function that replays a run before it is allowed to score.
 *
 * Analytics was deliberately not enabled, so no measurementId is carried here.
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD6JTKhj3c8GTJVQHMlK-IHwaQJRwo5nVk',
  authDomain: 'chroma-match-49906.firebaseapp.com',
  projectId: 'chroma-match-49906',
  storageBucket: 'chroma-match-49906.firebasestorage.app',
  messagingSenderId: '896332561536',
  appId: '1:896332561536:web:51978fe9b369b9101efa65',
} as const

/** Where the database lives. Fixed at creation and not changeable. */
export const FIREBASE_REGION = 'asia-northeast3'
