import {
  username,
  sub,
  recoveryCodesCount,
  recoveryCodesList,
  recoveryCodesCreate,
  recoveryCodesUpdate,
  recoveryCodesAuthenticate,
} from "../../authn.js";

export default async (template, data) => {
  let recoveryCodes = [];
  let authenticationOutput = "";

  if (data) {
    if (data.action === "create") {
      recoveryCodes = await recoveryCodesCreate(sub);
    } else if (data.action === "update") {
      recoveryCodes = await recoveryCodesUpdate(sub);
    } else if (data.password) {
      // Registration
      const { username, password } = data;
      try {
        const valid = await recoveryCodesAuthenticate(username, password);
        authenticationOutput = `Authentication: ${!!valid}`;
      } catch (e) {
        console.error(e, { username, password });
      }
    }
  }
  const authenticationCount = await recoveryCodesCount(sub);
  const authenticationList = await recoveryCodesList(sub);

  return template
    .replace("{authenticationCount}", authenticationCount)
    .replace(
      "{authenticationList}",
      JSON.stringify(authenticationList, null, 2).replace("\n", "<br/>"),
    )
    .replace(
      "{recoveryCodes}",
      JSON.stringify(recoveryCodes, null, 2).replace("\n", "<br/>"),
    )
    .replace("{username}", username)
    .replace("{authenticationOutput}", authenticationOutput);
};
