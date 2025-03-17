import { assign } from "xstate";

export const states = {
  input: {
    on: {
      submit: { target: "create" },
    },
  },
  create: {
    invoke: {
      id: "create",
      src: () => {},
      onError: "input",
      onDone: "enterSecret",
    },
  },
  enterSecret: {
    on: {
      submit: { target: "verifySecret" },
    },
  },
  verifySecret: {
    invoke: {
      id: "verifySecret",
      src: () => {},
      onError: "enterSecret",
      onDone: "success",
    },
  },
  success: {
    type: "final",
    exit: [
      assign({
        webauthn: (context) => (context.webauthn ?? 0) + 1,
      }),
    ],
  },
};

export const guard = (context) => (context.webauthn ?? 0) < 1;

export default { states, guard };
