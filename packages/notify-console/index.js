const options = {
  client: (params) => console.log('console', params)
}

export default (params) => {
  Object.assign(options, params)
}

export const trigger = (id, sub, params) => {
  options.client({ id, sub, params })
}
