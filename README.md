# @particular./shopify-oauth

[![npm version](https://img.shields.io/npm/v/@particular./shopify-oauth.svg)](https://www.npmjs.com/package/@particular./shopify-oauth) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier) [![CircleCI](https://img.shields.io/circleci/project/github/uniquelyparticular/shopify-oauth.svg?label=circleci)](https://circleci.com/gh/uniquelyparticular/shopify-oauth)

> 🎮 Minimal OAuth implementation to support creating [Shopify](https://www.shopify.com) Public Apps

Built with [Micro](https://github.com/zeit/micro)! 🤩

## 🛠 Setup

A [Shopify](https://shopify.com) account is needed for this to function.

Start ngrok (change ngrok port below from 3000 if yarn dev deployed locally on different port above)

```bash
ngrok http 3000
```

Make a note of the https `ngrok URL` provided.

Create a `.env` at the project root with the following credentials:

```dosini
DEPLOYED_URI
SHOPIFY_OAUTH_SCOPES
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
```

`DEPLOYED_URI` should be set to your `ngrok URL` from above (ie. `https://312a9670.ngrok.io`)

`SHOPIFY_OAUTH_SCOPES` can be set to any of the following values: `read_products`,`read_product_listings`,`read_customers`,`write_customers`,`write_orders,write_draft_orders`,`write_shipping`,`write_checkouts`,`read_shopify_payments_disputes`,`unauthenticated_read_product_listings`,`unauthenticated_write_checkouts`,`unauthenticated_write_customers`.

---

Navigate to your [Shopify Partner Dashboard](https://partners.shopify.com/<<PartnerId>>/apps)'s App section and clicking `Create App`.

You can enter any value for `App Name`.

In the `App URL` field, be sure to enter your `ngrok URL` (provided above) followed by `/auth` such that `App URL` looks something like `https://312a9670.ngrok.io/auth`.

In the `Whitelisted redirection URL(s)` field, be sure to enter your `ngrok URL` (provided above) followed by `/auth/callback` such that `App URL` looks something like `https://312a9670.ngrok.io/auth/callback`.

Click the `Create app` button to create your App Credentials and find your `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`.

## 📦 Package

Run the following command to build the app

```bash
yarn install
```

Start the development server

```bash
yarn dev
```

The server will typically start on PORT `3000`. If not, you'll need to restart ngrok to point to whatever server port you've started here.

## ⛽️ Usage

Once your server is up and running, navigate back to your [Shopify Partner Dashboard](https://partners.shopify.com/<<PartnerId>>/apps)'s App section and clicking on the App you installed above (if you're not still there).

Open the `Test your app` accordian button > Select a store from the dropdown > Click the `Install app on store` button and follow the prompts to confirm your installation and `Install Unlisted app`.

**_Make a note of the `access_token` provided as you will need it for making subsequent API calls._**

**NOTE**: this repository works extremely well with our `@particular./shopify-auth` package which is available via `npm` or at:
https://github.com/uniquelyparticular/shopify-request.

```js
const { createClient } = require('@particular./shopify-request')
// import { createClient } from '@particular./shopify-request'

const shopify = new createClient({
  store_name: '...', //Shopify Store Name
  access_token: '...' //Shopify OAuth token received after registering as Public App and installing to Store above
})
```

## 🚀 Deploy

You can easily deploy this function to [now](https://now.sh).

_Contact [Adam Grohs](https://www.linkedin.com/in/adamgrohs/) @ [Particular.](https://uniquelyparticular.com) for any questions._
