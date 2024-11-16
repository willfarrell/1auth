const options = {
  log: console.log,
  client: (params) => options.log('console', params)
}

export default (params) => {
  Object.assign(options, params)
}

export const trigger = (id, sub, data, options = {}) => {
  options.client({ id, sub, data, options })
}
