const { json, send } = require('micro')
const redirect = require('micro-redirect')
const cors = require('micro-cors')()
const { router, post, get } = require('microrouter')

const crypto = require('crypto')
const cookie = require('cookie')
const nonce = require('nonce')()
const querystring = require('querystring')
const request = require('request-promise')
const { createClient: shopifyClient } = require('@particular./shopify-request')

const apiKey = process.env.SHOPIFY_API_KEY
const apiSecret = process.env.SHOPIFY_API_SECRET
const scopes = process.env.SHOPIFY_OAUTH_SCOPES
const deployedURI = process.env.DEPLOYED_URI

const authURL = (shopName, nonce) => {
  return `https://${shopName}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${deployedURI}/auth/callback&state=${nonce}`
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
        const shop = req.query.shop
        if (shop) {
          const state = nonce()
          console.log('state', state)
          res.setHeader('Set-Cookie', cookie.serialize('state', state))
          console.log('installURL', authURL(shop, state))
          return redirect(res, 302, authURL(shop, state))
        } else {
          return send(res, 403, {
            error:
              'Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request'
          })
        }
      } catch (error) {
        const jsonError = _toJSON(error)
        return send(res, 500, jsonError)
      }
    }),
    get('/auth/callback', async (req, res) => {
      console.log('auth/callback')
      if (req.method === 'OPTIONS') {
        return send(res, 204)
      }

      try {
        const { shop, hmac, code, state } = req.query
        const stateCookie = cookie.parse(req.headers.cookie).state

        if (state !== stateCookie) {
          return send(res, 403, { error: 'Request origin cannot be verified' })
        }

        if (shop && hmac && code) {
          // Validate request is from Shopify
          const map = Object.assign({}, req.query)
          delete map['signature']
          delete map['hmac']
          const message = querystring.stringify(map)
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
            hashEqual = crypto.timingSafeEqual(generatedHash, providedHmac)
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

              console.log('accessToken', accessToken)

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
