import {
  username,
  sub,
  webauthnCount,
  webauthnList,
  webauthnCreate,
  webauthnVerify,
  webauthnCreateChallenge,
  webauthnAuthenticate
} from '../../authn.js'

export default async (template, data) => {
  let registrationOutput = ''
  let authenticationOutput = ''
  if (data) {
    if (data.name) {
      // Registration
      const { registrationOptions, registrationResponse, name } = data
      try {
        const valid = await webauthnVerify(
          sub,
          JSON.parse(registrationResponse),
          { name },
          false
        )
        registrationOutput = `Registration: ${!!valid}`
      } catch (e) {
        console.error(e, { registrationOptions, registrationResponse, name })
      }
    } else if (data.username) {
      // Authentication
      const { authenticationOptions, authenticationResponse, username } = data
      try {
        const valid = await webauthnAuthenticate(
          username,
          JSON.parse(authenticationResponse)
        )
        authenticationOutput = `Authentication: ${!!valid}`
      } catch (e) {
        console.error(e, {
          authenticationOptions,
          authenticationResponse,
          username
        })
      }
    }
  }

  const authenticationCount = await webauthnCount(sub)
  const authenticationList = await webauthnList(sub)
  const registrationOptions = await webauthnCreate(sub)
  const authenticationOptions = await webauthnCreateChallenge(sub)

  return template
    .replace('{authenticationCount}', authenticationCount)
    .replace(
      '{authenticationList}',
      JSON.stringify(authenticationList, null, 2).replace('\n', '<br/>')
    )
    .replace('{name}', 'PassKey')
    .replace('{registrationOptions}', JSON.stringify(registrationOptions))
    .replace('{registrationOutput}', registrationOutput)
    .replace('{username}', username)
    .replace('{authenticationOptions}', JSON.stringify(authenticationOptions))
    .replace('{authenticationOutput}', authenticationOutput)
}
