/* eslint camelcase: 0 */ // --> OFF
const crypto = require('crypto')
const cloudinary = require('cloudinary')
const validator = require('joi')
const _ = require('lodash')
const Memcached = require('memcached')

const memcached = new Memcached(process.env.MEMCACHE_URL, {})
const request = require('request-promise')

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
})
/**
 * function upload stream file to cloudinary
 * @param {*} name
 * @param {*} type
 * @param {*} buffer
 * @param {*} tags
 */
function uploadToCloudinary(name, type, buffer, tags) {
    return new Promise((resolve, reject) => {
        cloudinary.v2.uploader
            .upload_stream(
                {
                    public_id: name,
                    resource_type: type,
                    tags
                },
                (error, result) => {
                    if (error) {
                        reject(error)
                    }
                    resolve(result)
                }
            )
            .end(buffer)
    })
}

/**
 * delete file from cloudinary by public_id
 * @param {*} public_id
 */
function deleteFileFromCloudinary(public_id) {
    return new Promise((resolve, reject) => {
        cloudinary.v2.uploader.destroy(public_id, (err, result) => {
            if (err) {
                reject(err)
            }
            resolve(result)
        })
    })
}

/**
 * build cache key with request and params
 *
 * @param {*} requestName
 * @param {*} requestObj
 */
function buildCacheKey(requestName, requestObj) {
    const cacheKey = JSON.stringify({
        requestName,
        requestObj
    })
    const hash = crypto
        .createHmac('sha256', process.env.HASH_SECRET)
        .update(cacheKey)
        .digest('hex')
    return hash
}

async function cacheExcute(key, fn) {
    // when data exist
    const getter = await new Promise((resolve, reject) => {
        memcached.get(key, (err, data) => {
            if (err) {
                reject(err)
            }
            resolve(data)
        })
    })
    if (!getter) {
        // cache when data not cached
        const val = await fn()
        // we don't need trigger when cache is saved
        const lifetime = parseInt(process.env.TTL)
        memcached.set(key, val, lifetime, () => {})
        return val
    }
    return getter
}

/**
 *  paginate array with conditional
 * @param {*} items
 * @param {*} page
 * @param {*} perPage
 */
function getPaginatedItems(items = [], page = 1, perPage = 5) {
    const pageNumber = parseInt(page)
    const numberItem = parseInt(perPage)
    const offset = (pageNumber - 1) * numberItem
    const take = offset + numberItem
    const paginatedItems = _.uniq(_.slice(items, offset, take))
    return {
        page: pageNumber,
        perPage: numberItem,
        total: items.length,
        total_pages: Math.ceil(items.length / perPage),
        data: paginatedItems
    }
}
/**
 * just trim all whitespace for all element in array
 * @param {*} arr
 */
function trimArr(arr) {
    return arr.map(el => el.trim())
}

/**
 *
 * @param {*} source : source data to validate
 * @param {*} schema : validate template
 * @param {*} res : response from server
 * @param {*} func: function callback after
 * @param {*} route: route of api
 */
async function validateModel(source, schema, res, func, route) {
    const { error } = validator.validate(source, schema)
    const verbosity = !error || error.details
    if (error && verbosity) {
        res.status(400).json({
            code: 400,
            message: 'Missing or invalid params',
            verbosity
        })
    } else {
        // cache data to fast return response
        let result
        if (route) {
            const cacheKey = buildCacheKey(route, source)
            result = await cacheExcute(cacheKey, func)
        } else {
            result = await func()
        }
        res.json(result)
    }
}
/**
 * common handle error
 * @param {*} res
 * @param {*} error
 */
function handleError(res, error, route) {
    console.log(`API exception ${route} : => ${error}`)
    res.status(500).json({
        message: 'Server error'
    })
}

/**
 *
 * @param {*} array
 * @param {*} thingsToPick
 */
function pickMultiple(array, thingsToPick) {
    return _.map(
        array,
        _.partial(_.ary(_.pick, thingsToPick.length), _, thingsToPick)
    )
}

/**
 * make array randomize
 * @param {*} array
 */
function shuffle(array) {
    let counter = array.length

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        const index = Math.floor(Math.random() * counter)

        // Decrease counter by 1
        counter -= 1

        // And swap the last element with it
        const temp = array[counter]
        array[counter] = array[index]
        array[index] = temp
    }

    return array
}

function optimizeUrl(public_id, file_type) {
    const options = 'q_auto:best'
    const url = `http://res.cloudinary.com/nothingatall/image/upload/${options}/${public_id}.${file_type}`
    return url
}

async function sendNotification(title, content, type, category_name) {
    const apiKey = process.env.ONE_SIGNAL_API_KEY
    const appId = process.env.ONE_SIGNAL_APP_ID
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${apiKey}`
    }

    const options = {
        port: 443,
        uri: 'https://onesignal.com/api/v1/notifications',
        method: 'POST',
        headers,
        body: {
            app_id: appId,
            headings: {
                en: title
            },
            contents: {
                en: content
            },
            included_segments: ['All'],
            data: {
                type
            }
        },
        json: true
    }
    switch (type) {
        case 0: // just a something new
            break
        case 1: // when have some image new
            break
        case 2: // when have category new
        case 3: // when category update
            options.body.data.category_name = category_name
            break
        default:
            break
    }
    const body = await request(options)
    return body
}
module.exports = {
    uploadToCloudinary,
    getPaginatedItems,
    trimArr,
    deleteFileFromCloudinary,
    validator,
    _,
    validateModel,
    handleError,
    pickMultiple,
    shuffle,
    optimizeUrl,
    cacheExcute,
    buildCacheKey,
    sendNotification
}
