/**
 * DEVELOPMENT SESSION: which tenant and user id the API headers carry (matches NEXA_DEV_AUTH on the API).
 * Replaced by real sign-in once the API has sessions.
 */
export interface DevSession {
  tenant: string
  uid: number
}

export function useSession() {
  const cookie = useCookie<DevSession | null>('nexa_dev_session', { default: () => null, sameSite: 'strict' })
  const session = computed(() => cookie.value)
  function signIn(s: DevSession) {
    cookie.value = s
  }
  function signOut() {
    cookie.value = null
  }
  return { session, signIn, signOut }
}
