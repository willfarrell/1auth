const options = {
  client: console.log
}

export default (params) => {
  Object.assign(options, params)
}

export const trigger = (id, sub, params) => {
  options.client({ id, sub, params })
}
