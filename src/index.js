const { createClient: shopifyClient } = require('@particular./shopify-request')
const { send } = require('micro')
const { router, post, get } = require('microrouter')
const redirect = require('micro-redirect')
const cors = require('micro-cors')()
const crypto = require('crypto')
const nonce = require('nonce')()
const querystring = require('querystring')
const request = require('request-promise')
const admin = require('firebase-admin')

const _firebaseConfig = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: wrapKeyData(process.env.FIREBASE_PRIVATE_KEY, 'PRIVATE'),
  client_email: `firebase-adminsdk-3gpvn@${
    process.env.FIREBASE_PROJECT_ID
  }.iam.gserviceaccount.com`,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-3gpvn%40${
    process.env.FIREBASE_PROJECT_ID
  }.iam.gserviceaccount.com`
}

const wrapKeyData = (keyData, keyType = 'RSA PRIVATE') => {
  return `-----BEGIN ${keyType} KEY-----${keyData.replace(
    /\"/g,
    ''
  )}-----END ${keyType} KEY-----\n`.replace(/\\n/g, '\n')
}

// console.log('process.env.FIREBASE_CLIENT_ID',process.env.FIREBASE_CLIENT_ID)
// console.log('process.env.FIREBASE_PROJECT_ID',process.env.FIREBASE_PROJECT_ID)
// console.log('process.env.FIREBASE_PRIVATE_KEY_ID',process.env.FIREBASE_PRIVATE_KEY_ID)
// console.log('process.env.FIREBASE_PRIVATE_KEY',process.env.FIREBASE_PRIVATE_KEY)
// console.log(`_firebaseConfig: ${JSON.stringify(_firebaseConfig)}`)

if (!admin.apps.length) {
  const admin = require('firebase-admin')
  admin.initializeApp({
    credential: admin.credential.cert(_firebaseConfig),
    databaseURL: `https://${_firebaseConfig.project_id}.firebaseio.com`
  })
}
const firestore = admin.firestore()
const apiKey = process.env.SHOPIFY_API_KEY
const apiSecret = process.env.SHOPIFY_API_SECRET
const deployedURI = process.env.DEPLOYED_URI

const authURL = (shopName, nonce) => {
  return `https://${shopName}/admin/oauth/authorize?client_id=${apiKey}&scope=${
    process.env.SHOPIFY_OAUTH_SCOPES
  }&redirect_uri=${deployedURI}/auth/callback&state=${nonce}`
}

const _toJSON = error => {
  return !error
    ? ''
    : Object.getOwnPropertyNames(error).reduce(
        (jsonError, key) => {
          return { ...jsonError, [key]: error[key] }
        },
        { type: 'error' }
      )
}

const _toCamelcase = string => {
  return !string
    ? ''
    : string.replace(
        /\w\S*/g,
        word => `${word.charAt(0).toUpperCase()}${word.substr(1).toLowerCase()}`
      )
}

process.on('unhandledRejection', (reason, p) => {
  console.error(
    'Promise unhandledRejection: ',
    p,
    ', reason:',
    JSON.stringify(reason)
  )
})

const getSecureParam = (
  params,
  paramName,
  regexFilter = /\.myshopify\.com$/
) => {
  const paramVal = params[paramName]
  return paramVal && regexFilter.test(paramVal) ? paramVal : null
}

const notFound = async (req, res) =>
  send(res, 404, { error: 'Route not found' })
const notSupported = async (req, res) =>
  send(res, 405, { error: 'Method not supported' })

module.exports = cors(
  router(
    post('/*', notSupported),
    get('/auth', async (req, res) => {
      console.log('auth')
      if (req.method === 'OPTIONS') {
        return send(res, 204)
      }

      try {
        const { hmac } = req.query
        if (!hmac) {
          return send(res, 403, {
            error: 'Missing hmac parameter'
          })
        }
        const shop = getSecureParam(req.query, 'shop')
        if (shop) {
          const state = nonce()
          return firestore
            .collection('OAuth')
            .doc(shop)
            .set({ nonce: state })
            .then(() => {
              // console.log('state', state)
              // console.log('installURL', authURL(shop, state))
              return redirect(res, 302, authURL(shop, state))
            })
            .catch(error => {
              const jsonError = _toJSON(error)
              return send(res, error.statusCode || 500, jsonError)
            })
        } else {
          return send(res, 403, {
            error:
              'Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request'
          })
        }
      } catch (error) {
        const jsonError = _toJSON(error)
        return send(res, error.statusCode || 500, jsonError)
      }
    }),
    get('/auth/callback', async (req, res) => {
      console.log('auth/callback')
      if (req.method === 'OPTIONS') {
        return send(res, 204)
      }

      try {
        const { hmac, code, state } = req.query
        const shop = getSecureParam(req.query, 'shop')

        if (shop && hmac && code && state) {
          const useOnce = firestore.collection('OAuth').doc(shop)

          return useOnce
            .get()
            .then(previousState => {
              if (state != previousState.data().nonce) {
                return send(res, 403, {
                  error: 'Request origin cannot be verified'
                })
              }
              return useOnce.delete().then(() => {
                // Validate request is from Shopify
                // console.log('req.query',req.query)
                const params = {}
                Object.keys(req.query)
                  .sort()
                  .forEach(key => {
                    params[key] = req.query[key]
                  })
                delete params['signature']
                delete params['hmac']
                const message = querystring.stringify(params)

                // console.log('message',message)
                const providedHmac = Buffer.from(hmac, 'utf-8')
                const generatedHash = Buffer.from(
                  crypto
                    .createHmac('sha256', apiSecret)
                    .update(message)
                    .digest('hex'),
                  'utf-8'
                )
                let hashEqual = false

                try {
                  hashEqual = crypto.timingSafeEqual(
                    generatedHash,
                    providedHmac
                  )
                } catch (e) {
                  hashEqual = false
                }

                if (!hashEqual) {
                  return send(res, 403, { error: 'HMAC validation failed' })
                }

                //TODO: move this into shopifyClient API as .initialize or .authenticate method
                // Exchange temporary code for a permanent access token
                const accessTokenRequestUrl =
                  'https://' + shop + '/admin/oauth/access_token'
                const accessTokenPayload = {
                  grant_type: 'authorization_code',
                  client_id: apiKey,
                  client_secret: apiSecret,
                  code,
                  redirect_uri: `${deployedURI}/auth/callback`
                }

                return request
                  .post(accessTokenRequestUrl, { json: accessTokenPayload })
                  .then(accessTokenResponse => {
                    const accessToken = accessTokenResponse.access_token

                    // console.log('accessToken', accessToken)

                    const shopify = new shopifyClient({
                      store_name: 'particulartest',
                      access_token: accessToken
                    })

                    return shopify
                      .get('admin/shop.json')
                      .then(shopResponse => {
                        // console.log('shopResponse', shopResponse)

                        return send(res, 200, accessTokenResponse)
                      })
                      .catch(error => {
                        const jsonError = _toJSON(error)
                        return send(res, error.statusCode || 500, jsonError)
                      })
                  })
                  .catch(error => {
                    const jsonError = _toJSON(error)
                    return send(res, error.statusCode || 500, jsonError)
                  })
              })
            })
            .catch(error => {
              const jsonError = _toJSON(error)
              return send(res, error.statusCode || 500, jsonError)
            })
        } else {
          return send(res, 400, { error: 'Required parameters missing' })
        }
      } catch (error) {
        const jsonError = _toJSON(error)
        return send(res, error.statusCode || 500, jsonError)
      }
    }),
    get('/*', notFound)
  )
)
