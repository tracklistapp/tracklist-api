import Koa from 'koa'
import Router from 'koa-router'
import bodyParser from 'koa-bodyparser'
import { log } from 'winston'
import request from 'request-promise'
import { hash } from 'RSVP'

require('dotenv').config()

const {
  APP_PORT: port = 8080
} = process.env

const app = new Koa()
const router = new Router()

router
  .get('/', hello)
  .get('/resolve', resolve)

async function hello (ctx, next) {
  ctx.body = 'API is running.'
}

/**
  * Resolve tracks by searching on multiple sources
  * (soundcloud, youtube, mixcloud, spotify and more...)
  * @name resolve
  * @function
  * @param {Object} req
  * @param {Object} res
  * @param {Object} next
  */

async function resolve (ctx, next) {
  const {
    q,
    limit = 10,
    sc = true,
    yt = true,
    spotify = false,
    mixcloud = false
  } = ctx.query

  if (!q) {
    ctx.status = 400
    ctx.body = {
      message: `Required ':q?' parameter is missing`
    }
  }

  const query = encodeURIComponent(q)
  const requests = []

  if (sc !== 'false') {
    let clientId = process.env.SC_CLIENT_ID
    let maxResults = limit <= 100 ? limit : 100
    requests.push({
      name: 'soundcloud',
      host: 'api.soundcloud.com',
      path: `tracks/?q=${query}&limit=${maxResults}&client_id=${clientId}`
    })
  }

  if (yt !== 'false') {
    let key = process.env.YT_API_KEY
    let maxResults = limit <= 50 ? limit : 50
    requests.push({
      name: 'youtube',
      host: 'www.googleapis.com',
      path: `youtube/v3/search?part=snippet&q=${query}&key=${key}&maxResults=${maxResults}`
    })
  }

  if (mixcloud) {
    let maxResults = limit <= 100 ? limit : 100
    requests.push({
      name: 'mixcloud',
      host: 'api.mixcloud.com',
      path: `search/?q=${query}&type=cloudcast&limit=${maxResults}`
    })
  }

  if (spotify) {
    let maxResults = limit <= 50 ? limit : 50
    requests.push({
      name: 'spotify',
      host: 'api.spotify.com',
      path: `v1/search/?q=${query}&type=track&limit=${maxResults}`
    })
  }

  try {
    // Create an object containing an hash of each resolved promises
    // {
    //   'soundcloud': Promise,
    //   'youtube': Promise
    //   'mixcloud': Promise,
    //   'spotify': Promise
    // }
    const promises = requests.map((req) => {
      return {
        [req.name]: new Promise(async (resolve, reject) => {
          try {
            resolve(JSON.parse(await request(`https://${req.host}/${req.path}`)))
          } catch (err) {
            reject(err)
          }
        })
      }
    }).reduce((result, item) => {
      const key = Object.keys(item)[0]
      result[key] = item[key]
      return result
    }, {})

    ctx.body = await hash(promises)
  } catch (err) {
    ctx.status = err.statusCode || err.status || 500
    ctx.body = {
      message: err.message
    }
  }
}

app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  log('info', `${ctx.method} ${ctx.url} - ${ms}ms`)
})

app
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods())

app.listen(port, (err) => {
  if (err) throw err
  log('info', `Tracklist-API listening on port ${port}`)
})
