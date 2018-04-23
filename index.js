/* eslint camelcase: 0 */ // --> OFF
/* eslint prefer-const: 0 */ // --> OFF

// setup server
const express = require('express')

const app = express()
app.use(express.static('client'))

// config env
require('dotenv').config({
    path: '.localenv',
    silent: true
})
const bodyParser = require('body-parser')
const { taskRunner } = require('./helper/task')

app.use(bodyParser.json()) // support json encoded bodies
app.use(
    bodyParser.urlencoded({
        extended: true,
        limit: '50mb'
    })
) // support encoded bodies
// setup upload file
const multer = require('multer')

const upload = multer()
// setup database
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

const adapter = new FileSync(process.env.DB_PATH)
const db = low(adapter)

// addition lib
const shortid = require('shortid')
const Fuse = require('fuse.js')
const {
    uploadToCloudinary,
    deleteFileFromCloudinary,
    getPaginatedItems,
    _,
    validator,
    trimArr,
    validateModel,
    handleError,
    pickMultiple,
    optimizeUrl,
    sendNotification,
    convertDateToTimeStamp
} = require('./helper/utils')
// var pm2 = require('pm2');

// pm2.connect(function () {
//     pm2.launchBus(function (err, bus) {
//         bus.on('process:event', function (data) {
//             if (data.event === "exit") {
//                 // Do your stuff here ...
//                 console.log("something")
//             }
//         });
//     });
// });
/**
 * upload images to cloudinary
 */
app.post('/images', upload.array('file'), async (req, res) => {
    const schema = validator.object().keys({
        tags: validator.string().optional(),
        category_name: validator.string().required()
    })
    const { path } = req.route.path
    const run = async () => {
        try {
            let { tags, category_name } = req.body
            // default is empty
            tags = tags ? trimArr(tags.split(',')) : []
            const images = req.files
            const uploadProgress = await Promise.all(
                images.map(image => {
                    const { originalname, buffer } = image
                    const fileName = originalname.split('.')[0]
                    const resource_type = 'image'
                    return uploadToCloudinary(
                        fileName,
                        resource_type,
                        buffer,
                        tags
                    )
                })
            )
            // insert to db after upload success to cloudinary
            db
                .defaults({
                    images: []
                })
                .write()
            // check category is exist or not
            const existRecord = db
                .get('images')
                .find(image => image.category_name === category_name)
                .value()
            const category_id = existRecord
                ? existRecord.category_id
                : shortid.generate()
            uploadProgress.map(image => {
                // add optimize url
                image.optimizeUrl = optimizeUrl(image.public_id, image.format)
                // add category to image
                image.category_name = category_name.trim()
                // default feature image is false
                image.isFeatureImage = false
                // init viewNumber of image
                image.viewNumber = 0
                // add category_id
                image.category_id = category_id
                return db
                    .get('images')
                    .push(image)
                    .write()
            })
            res.json(uploadProgress)
        } catch (error) {
            handleError(res, error, path)
        }
    }
    validateModel(req.body, schema, res, run)
})

/**
 * get images with search condition
 */
app.get('/images', async (req, res) => {
    const schema = validator.object().keys({
        query: validator.string().required(),
        page: validator
            .number()
            .min(1)
            .optional(),
        per_page: validator
            .number()
            .min(1)
            .optional(),
        category_id: validator.string().optional()
    })
    const { path } = req.route.path
    const run = async () => {
        try {
            const { page, per_page, query, category_id } = req.query
            // select image by matching category
            let result = db.get('images')
            if (category_id) {
                return getPaginatedItems(
                    result.filter(r => r.category_id === category_id).value(),
                    page,
                    per_page
                )
            }
            const options = {
                keys: ['category_name', 'tags']
            }
            result = result.value().map(img => _.pick(img, ['public_id', 'category_name', 'tags', 'url', 'optimizeUrl']))
            const fuse = new Fuse(result, options)
            // search with query
            result = fuse.search(query)
            // paginate data
            result = getPaginatedItems(result, page, per_page)
            // send back result to client
            return result
        } catch (error) {
            handleError(res, error, path)
        }
        return []
    }
    validateModel(req.query, schema, res, run, path)
})

/**
 * Make change image info : information can be change => tags, category_name
 */
app.put('/image', async (req, res) => {
    const schema = validator.object().keys({
        public_id: validator.string().required(),
        tags: validator.string().optional(),
        isFeatureImage: validator.boolean().optional() // if true make this image become feature images
    })
    const run = async () => {
        try {
            let { tags, public_id } = req.body
            const foundImage = db.get('images').find({
                public_id
            })
            // change category name
            // if (category_name) {
            //     foundImage
            //         .assign({
            //             category_name
            //         })
            //         .write()
            // }
            // change tags
            if (tags) {
                tags = trimArr(tags.split(','))
                foundImage
                    .assign({
                        tags
                    })
                    .write()
            }
            // toggle flag feature image
            foundImage
                .assign({
                    isFeatureImage: !foundImage.value().isFeatureImage
                })
                .write()

            res.status('200').json({
                code: 200,
                message: `success update image with public_id = ${public_id}`
            })
        } catch (error) {
            handleError(res, error, req.route.path)
        }
    }
    validateModel(req.body, schema, res, run)
})
/**
 * API make delete image via public_id
 */
app.delete('/image', async (req, res) => {
    const schema = validator.object().keys({
        public_id: validator.string().required()
    })
    const run = async () => {
        try {
            const { public_id } = req.body
            // delete in cloud first
            const cloudinaryMessage = await deleteFileFromCloudinary(public_id)
            // finally delete in localdb
            db
                .get('images')
                .remove({
                    public_id
                })
                .write()
            res.json(cloudinaryMessage)
        } catch (error) {
            handleError(res, error, req.route.path)
        }
    }
    validateModel(req.body, schema, res, run)
})
/**
 * get Detail information for images
 */
app.get('/image', async (req, res) => {
    const schema = validator.object().keys({
        public_id: validator.string().required()
    })
    const { path } = req.route.path

    const run = async () => {
        try {
            const { public_id } = req.query
            const image = db
                .get('images')
                .find(img => img.public_id === public_id)
            const imageValue = image.value()
            // incre number of view
            image
                .assign({
                    viewNumber: imageValue.viewNumber
                        ? imageValue.viewNumber + 1
                        : 1
                })
                .write()
            // return result
            res.json(image)
        } catch (error) {
            handleError(res, error, path)
        }
    }
    validateModel(req.query, schema, res, run, path)
})
/**
 * API return the list of all category
 */

app.get('/categories', async (req, res) => {
    const schema = validator.object().keys({
        page: validator
            .number()
            .min(1)
            .optional(),
        per_page: validator
            .number()
            .min(1)
            .optional(),
        numberImageView: validator
            .number()
            .min(10)
            .optional()
    })
    const { path } = req.route.path
    const run = () => {
        try {
            const result = db
                .get('images')
                .groupBy('category_id')
                .value()
            const finalResult = []
            const { page, per_page, numberImageView } = req.query
            // get category
            _.forOwn(result, (images, category_id) => {
                // get list image for category
                let imageInCategory = convertDateToTimeStamp(images)
                const totalImages = imageInCategory.length
                imageInCategory = _.orderBy(
                    imageInCategory,
                    ['created_at'],
                    ['desc']
                )
                const thumb =
                    imageInCategory.find(img => img.isFeatureImage) ||
                    _.first(imageInCategory)
                imageInCategory = _.take(imageInCategory, numberImageView || 10)
                finalResult.push({
                    category_id,
                    category_name: _.first(imageInCategory).category_name,
                    imageInCategory,
                    totalImages,
                    thumb: thumb.url
                })
            })
            const sortedCategoies = _.orderBy(
                finalResult,
                [img => img.category_name.toLowerCase()],
                ['asc']
            )
            return getPaginatedItems(sortedCategoies, page, per_page)
        } catch (error) {
            handleError(res, error, path)
        }
        return []
    }
    validateModel(req.query, schema, res, run, path)
})
/**
 * get List Image for Category
 */
app.get('/category', async (req, res) => {
    const schema = validator.object().keys({
        category_id: validator.string().required(),
        page: validator
            .number()
            .min(1)
            .optional(),
        per_page: validator
            .number()
            .min(1)
            .optional()
    })
    const { path } = req.route.path
    const run = async () => {
        try {
            const { category_id, page, per_page } = req.query
            let categories = db
                .get('images')
                .filter({
                    category_id
                })
                .value()
            categories = convertDateToTimeStamp(categories)
            categories = _.orderBy(categories, ['created_at'], ['desc'])
            categories = getPaginatedItems(categories, page, per_page)
            return categories
        } catch (error) {
            handleError(res, error, path)
        }
        return []
    }
    validateModel(req.query, schema, res, run, path)
})

/**
 * update category
 */
app.put('/category', (req, res) => {
    // update all images have same category name match with request
    const schema = validator.object().keys({
        category_name_old: validator.string().required(),
        category_id: validator.string().required(),
        category_name_new: validator.string().required()
    })
    const run = async () => {
        try {
            const {
                category_name_old,
                category_name_new,
                category_id
            } = req.body
            db
                .get('images')
                .filter({
                    category_id
                })
                .value()
                .map(c => {
                    // update each reacord math with old category to new category name
                    const { public_id } = c
                    return db
                        .get('images')
                        .find({
                            public_id
                        })
                        .assign({
                            category_name: category_name_new
                        })
                        .write()
                })
            res.json({
                message: `success update from ${category_name_old} => ${category_name_new}`
            })
        } catch (error) {
            handleError(res, error, req.route.path)
        }
    }
    validateModel(req.body, schema, res, run)
})

/**
 * delete category: => need some advice
 */
app.delete('/category', (req, res) => {
    const schema = validator.object().keys({
        category_name: validator.string().required(),
        category_id: validator.string().required()
    })
    const run = async () => {
        try {
            const { category_name, category_id } = req.body
            const imageShoudBeDeleted = []
            db
                .get('images')
                .filter({
                    category_id
                })
                .value()
                .map(i => {
                    // delete image from category
                    const { public_id } = i
                    // delete image by public_id
                    imageShoudBeDeleted.push(
                        deleteFileFromCloudinary(public_id)
                    )

                    return db
                        .get('images')
                        .remove({
                            public_id
                        })
                        .write()
                })
            // wait for all image deleted
            await Promise.all(imageShoudBeDeleted)
            res.json({
                message: `success delete category : ${category_name}`
            })
        } catch (error) {
            handleError(res, error, req.route.path)
        }
    }
    validateModel(req.body, schema, res, run)
})

/**
 * export database api to backup sometimes
 */

app.get('/export/db', async (req, res) => {
    try {
        res.json(db.get('images').value())
    } catch (error) {
        handleError(res, error, req.route.path)
    }
})

// add api to get more app => solution is hardcode

app.get('/more_app', (req, res) => {
    try {
        const apps = db.get('apps').value()
        res.json(apps)
    } catch (error) {
        handleError(res, error, req.route.path)
    }
})

// provide all suggestion tags for search
app.get('/suggestion', (req, res) => {
    try {
        let tags = []
        const categories = _.uniqBy(
            db
                .get('images')
                .value()
                .map(img => {
                    tags = tags.concat(img.tags)
                    return _.pick(img, ['category_id', 'category_name'])
                }),
            'category_id'
        )
        tags = _.uniq(tags)
        res.json({
            categories,
            tags
        })
    } catch (error) {
        handleError(res, error, req.route.path)
    }
})

// API get random images
app.get('/images/top_search', (req, res) => {
    const schema = validator.object().keys({
        page: validator
            .number()
            .min(1)
            .optional(),
        per_page: validator
            .number()
            .min(1)
            .optional()
    })

    const { path } = req.route.path
    const run = async () => {
        try {
            const { page, per_page } = req.query
            // sort image by viewNumber
            const dataSource = db
                .get('images')
                .orderBy('viewNumber', 'desc')
                .value()
            return getPaginatedItems(dataSource, page, per_page)
        } catch (error) {
            handleError(res, error, path)
        }
        return []
    }
    validateModel(req.query, schema, res, run, path)
})

// API get newest images by upload time

app.get('/images/newest', (req, res) => {
    const { path } = req.route.path

    const schema = validator.object().keys({
        page: validator
            .number()
            .min(1)
            .optional(),
        per_page: validator
            .number()
            .min(1)
            .optional()
    })
    const run = async () => {
        try {
            const { page, per_page } = req.query
            // get all from db
            let images = convertDateToTimeStamp(db.get('images').value())
            images = _.orderBy(images, ['created_at'], ['desc'])
            images = getPaginatedItems(images, page, per_page)
            return images
        } catch (error) {
            handleError(res, error, path)
        }
        return []
    }
    validateModel(req.query, schema, res, run, path)
})

// API send notification for all user
app.post('/notification', (req, res) => {
    const schema = validator.object().keys({
        title: validator.string().required(),
        content: validator.string().required(),
        type: validator
            .number()
            .min(0)
            .max(3)
            .required(),
        category_name: validator.string().optional()
    })
    const { path } = req.route.path
    const run = () => {
        try {
            const { title, content, type, category_name } = req.body
            return sendNotification(title, content, type, category_name)
        } catch (error) {
            handleError(res, error, path)
        }
        return {}
    }
    validateModel(req.body, schema, res, run)
})

// todo add swagger for api
// todo: make api get top category search
app.get('/', (req, res) => res.send('./client/index.html'))

app.listen(process.env.PORT, () => {
    console.log(`Images app listening on port ${process.env.PORT}!`)
    // start backup task
    console.log('taskRunner running')
    taskRunner.start()
})
