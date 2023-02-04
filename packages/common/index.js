export const setOptions = (options, allowedKeys = [], params = {}) => {
  for (const key in params) {
    if (allowedKeys.includes(key)) {
      options[key] = params[key]
    }
  }
  return { ...options }
}

export const nowInSeconds = () => Math.floor(Date.now() / 1000)

// State Machines
// - authentication
// - onboard

/* import { createMachine, assign } from 'xstate'

export const account = createMachine({
  id: 'account',
  initial: 'email',
  context: {},
  states: {
    signin: {},
    email: {
      on: { next: 'password' }
    },
    password: {
      on: { submit: 'emailVerify' }
    },
    checkEmail: {
      on: {
        signin: 'signin',
        emailVerified: 'mfa'
      }
    },
    emailVerify: {
      on: { submit: 'mfa' }
    },
    mfa: {
      on: {
        webauthn: 'webauthn',
        totp: 'totp'
      }
    },
    webauthn: {
      on: {
        submit: 'webauthn',
        verify: 'webauthn',
        next: 'lookupSecrets'
      }
    },
    totp: {
      on: {
        view: 'totp',
        verify: 'totp',
        next: 'lookupSecrets'
      }
    },
    lookupSecrets: {
      on: { next: 'notifications' }
    },
    notifications: {
      on: {
        enablePushAPI: 'notifications',
        submit: 'success'
      }
    },
    success: {
      on: {
        signin:'signin'
      }
    }
  }
}, { actions: {} })

*/
