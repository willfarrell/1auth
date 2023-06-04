import { assign } from 'xstate'

export const states = {
  create: {
    invoke: {
      id: 'create',
      src: () => {},
      // onError: "enterToken",
      onDone: 'offlineSecret'
    }
  },
  offlineSecret: {
    on: {
      submit: { target: 'verifySecret' }
    }
  },
  verifySecret: {
    invoke: {
      id: 'verifySecret',
      src: () => {},
      onError: 'offlineSecret',
      onDone: 'success'
    }
  },
  success: {
    type: 'final',
    exit: [
      assign({
        lookup: (context) => (context.lookup ?? 0) + 5 // TODO use var
      })
    ]
  }
}

export const guard = (context) => (context.lookup ?? 0) < 1

export default { states, guard }
