import { FIREBASE_CONFIG } from './firebase-config.ts'

/**
 * One Firebase app, one auth state, for everything that talks to the backend.
 *
 * The leaderboard used to open its own app and sign in anonymously inside a
 * private method. That was fine while scores were the only thing stored; the
 * moment a second feature needs the same uid — a friends list keyed by it —
 * two independent sign-ins is a bug waiting to be found, because whichever one
 * ran second would be looking at a different account than the one the rows
 * were written under.
 *
 * Everything is behind dynamic imports. The Firebase SDK is by far the largest
 * thing this game would ship, and a player who never signs in or opens the
 * board should not pay for it.
 */

export type AccountKind = 'anonymous' | 'google'

export interface Account {
  uid: string
  kind: AccountKind
  /** The Google display name, when there is one. Never shown unedited. */
  name: string
  photo: string
}

interface Live {
  app: import('firebase/app').FirebaseApp
  auth: import('firebase/auth').Auth
  db: import('firebase/firestore').Firestore
}

let live: Promise<Live> | null = null
let current: Account | null = null
const listeners = new Set<(account: Account | null) => void>()

function describe(user: import('firebase/auth').User): Account {
  // isAnonymous is the authority, not the provider list: an anonymous account
  // that has been linked to Google keeps its uid and flips this flag, which is
  // exactly the upgrade path below relies on.
  return {
    uid: user.uid,
    kind: user.isAnonymous ? 'anonymous' : 'google',
    name: user.displayName ?? '',
    photo: user.photoURL ?? '',
  }
}

function announce(account: Account | null): void {
  current = account
  for (const listener of listeners) listener(account)
}

/**
 * Opens the app and makes sure somebody is signed in.
 *
 * Anonymous by default, because the game has to work for a player who never
 * wants an account: a score can be posted, coins can be earned, and none of it
 * asks who they are. Signing in with Google is an upgrade of that same
 * anonymous account, not a replacement for it.
 */
export function session(): Promise<Live> {
  live ??= (async () => {
    const [{ initializeApp }, auth, { getFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])

    const app = initializeApp(FIREBASE_CONFIG)
    const instance = auth.getAuth(app)

    await new Promise<void>((resolve) => {
      let settled = false
      auth.onAuthStateChanged(instance, (user) => {
        announce(user ? describe(user) : null)
        if (!settled) {
          settled = true
          resolve()
        }
      })
    })

    if (!instance.currentUser) {
      const credential = await auth.signInAnonymously(instance)
      announce(describe(credential.user))
    }

    return { app, auth: instance, db: getFirestore(app) }
  })()
  return live
}

/** The uid everything is stored under. Signing in with Google does not move it. */
export async function uid(): Promise<string> {
  await session()
  if (!current) throw new Error('Not signed in')
  return current.uid
}

/** The account as it stands right now, or null before the first connection. */
export function account(): Account | null {
  return current
}

/** Fires on every change, and immediately with whatever is known already. */
export function onAccount(listener: (account: Account | null) => void): () => void {
  listeners.add(listener)
  listener(current)
  return () => listeners.delete(listener)
}

export interface SignInResult {
  ok: boolean
  /** Set when it failed, in words a player can act on. Never a raw error. */
  reason?: string
  /**
   * True when the anonymous account could not be carried over, because the
   * Google account already had a history of its own. The player keeps that
   * history and loses this device's anonymous one — which is the right way
   * round, but it is not silent: the caller says so.
   */
  switched?: boolean
}

/**
 * Signs in with Google, keeping this device's history if it can.
 *
 * `linkWithPopup` upgrades the anonymous account in place: same uid, so every
 * run already posted stays the player's own and their rank does not reset for
 * signing in. That only works if the Google account has never been used here
 * before; if it has, the credential is already spoken for and the only correct
 * move is to sign into the older account and say that the anonymous one was
 * left behind.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  let auth: typeof import('firebase/auth')
  let instance: import('firebase/auth').Auth
  try {
    const opened = await session()
    auth = await import('firebase/auth')
    instance = opened.auth
  } catch {
    return { ok: false, reason: 'Could not reach the sign-in service.' }
  }

  const provider = new auth.GoogleAuthProvider()
  const user = instance.currentUser

  try {
    if (user?.isAnonymous) {
      const credential = await auth.linkWithPopup(user, provider)
      announce(describe(credential.user))
      return { ok: true }
    }
    const credential = await auth.signInWithPopup(instance, provider)
    announce(describe(credential.user))
    return { ok: true }
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''

    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
      try {
        const credential = auth.GoogleAuthProvider.credentialFromError(
          error as import('firebase/auth').AuthError,
        )
        if (!credential) throw new Error('no credential')
        const signed = await auth.signInWithCredential(instance, credential)
        announce(describe(signed.user))
        return { ok: true, switched: true }
      } catch {
        return { ok: false, reason: 'That Google account is already signed in elsewhere.' }
      }
    }

    // A closed popup is the player changing their mind, not a fault, so it is
    // reported as nothing at all rather than as an error card.
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { ok: false }
    }
    if (code === 'auth/operation-not-allowed') {
      return { ok: false, reason: 'Google sign-in is not enabled for this project yet.' }
    }
    if (code === 'auth/unauthorized-domain') {
      return { ok: false, reason: 'This site is not on the project’s allowed sign-in domains.' }
    }
    if (code === 'auth/popup-blocked') {
      return { ok: false, reason: 'Your browser blocked the sign-in window.' }
    }
    return { ok: false, reason: 'Sign-in did not complete.' }
  }
}

/**
 * Signs out, and straight back in anonymously.
 *
 * Leaving the player signed out of everything would mean a game that cannot
 * post a score until they sign in again, which is a worse state than the one
 * they started in. The anonymous account they land on is a new one: their old
 * runs stay attached to the Google account they just left.
 */
export async function signOutToAnonymous(): Promise<void> {
  const { auth: instance } = await session()
  const auth = await import('firebase/auth')
  await auth.signOut(instance)
  const credential = await auth.signInAnonymously(instance)
  announce(describe(credential.user))
}
