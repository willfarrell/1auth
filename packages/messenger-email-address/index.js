import {
  create as messengerCreate,
  createToken as messengerCreateToken,
  verifyToken as messengerVerifyToken,
  remove as messengerRemove,
  exists as messengerExists,
  lookup as messengerLookup,
  select as messengerSelect,
  list as messengerList,
  token as messengerToken,
  getOptions as messengerOptions,
} from "@1auth/messenger";

import { toASCII } from "tr46";

const id = "emailAddress";

export const token = ({ ...params } = {}) =>
  messengerToken({
    id,
    ...params,
  });

const defaults = {
  id,
  token: token(),

  // sanitize
  optionalDotDomains: [
    "gmail.com",
    "google.com",
    "googlemail.com",
    "yahoodns.net",
  ],
  aliasDomains: {
    "protonmail.ch": "protonmail.com",
    "pm.me": "protonmail.com",
    "proton.me": "protonmail.com",
  },
  // validate
  usernameBlacklist: ["admin", "root", "sa"],
};
const options = {};
const optionalDotDomainsMap = {};
export default (opt = {}) => {
  Object.assign(options, messengerOptions(), defaults, opt);
  for (let i = defaults.optionalDotDomains.length; i--; ) {
    optionalDotDomainsMap[options.optionalDotDomains[i]] = true;
  }
};

export const exists = async (emailAddress) => {
  const emailAddressSanitized = sanitize(emailAddress);
  return await messengerExists(options.id, emailAddressSanitized);
};

export const lookup = async (emailAddress) => {
  const emailAddressSanitized = sanitize(emailAddress);
  return await messengerLookup(options.id, emailAddressSanitized);
};

export const create = async (sub, emailAddress) => {
  const emailAddressSanitized = sanitize(emailAddress);
  const emailAddressValidate = validate(emailAddressSanitized);
  if (emailAddressValidate !== true) {
    throw new Error(emailAddressValidate, {
      cause: { emailAddress, emailAddressSanitized },
    });
  }

  return await messengerCreate(options.id, sub, emailAddressSanitized);
};

export const select = async (sub, id) => {
  return await messengerSelect(options.id, sub, id);
};

export const list = async (sub) => {
  return messengerList(options.id, sub);
};

export const remove = async (sub, id) => {
  await messengerRemove(options.id, sub, id);
};

export const createToken = async (sub, id) => {
  return messengerCreateToken(options.id, sub, id);
};

export const verifyToken = async (sub, token, sourceId) => {
  await messengerVerifyToken(options.id, sub, token, sourceId);
};

export const sanitize = (emailAddress) => {
  let [username, domain] = emailAddress.split("@");

  // not a valid email
  if (!domain) return emailAddress;

  username = username.trimStart().split("+")[0].toLowerCase(); // TODO puntycode?
  domain = toASCII(domain).trimEnd().toLowerCase();

  if (optionalDotDomainsMap[domain]) {
    username = username.replaceAll(".", "");
  }
  if (options.aliasDomains[domain]) {
    domain = options.aliasDomains[domain];
  }

  return `${username}@${domain}`;
};

const regexp =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
export const validate = (emailAddress) => {
  const [, domain] = emailAddress.split("@");
  if (!regexp.test(emailAddress)) {
    return "400 Bad Request";
  }
  if (
    options.usernameBlacklist.filter(
      (username) => `${username}@${domain}` === emailAddress,
    ).length
  ) {
    return "409 Conflict";
  }
  return true;
};
