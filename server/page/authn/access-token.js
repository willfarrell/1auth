import {
  username,
  sub,
  accessTokenCount,
  accessTokenList,
  accessTokenCreate,
  accessTokenAuthenticate,
} from "../../authn.js";

export default async (template, data) => {
  let accessToken = "";
  let authenticationOutput = "";

  if (data) {
    if (data.name) {
      accessToken = await accessTokenCreate(sub);
    } else if (data.password) {
      // Registration
      const { password } = data;
      try {
        const valid = await accessTokenAuthenticate(password, password);
        authenticationOutput = `Authentication: ${!!valid}`;
      } catch (e) {
        console.error(e, { password });
      }
    }
  }
  const authenticationCount = await accessTokenCount(sub);
  const authenticationList = await accessTokenList(sub);

  return template
    .replace("{authenticationCount}", authenticationCount)
    .replace(
      "{authenticationList}",
      JSON.stringify(authenticationList, null, 2).replace("\n", "<br/>"),
    )
    .replace(
      "{accessToken}",
      JSON.stringify(accessToken, null, 2).replace("\n", "<br/>"),
    )
    .replace("{username}", username)
    .replace("{authenticationOutput}", authenticationOutput);
};
