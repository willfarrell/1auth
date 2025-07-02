const options = {
	log: false,
	client: () => {},
};

export default (params) => {
	Object.assign(options, params);
};

/*
id: template id
sub: subject id
data: object of what will be used in templates. ie { token, username, expire }
notifyOptions: object of how and who to send message to
  - messengers: array of { id } or { type, value }
  - types: array of allowed types to be used
*/
export const trigger = (id, sub, data, notifyOptions = {}) => {
	options.client({ id, sub, data, options: notifyOptions });
};
