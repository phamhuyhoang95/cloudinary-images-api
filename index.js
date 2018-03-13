// setup server 
const express = require('express')
const app = express()
app.use(express.static('client'))

// config env
require('dotenv').config({
    path: '.localenv',
    silent: true
})
const bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({
    extended: true,
    limit: '50mb'
})); // support encoded bodies
// setup upload file
const multer = require('multer')
const upload = multer()
// setup database 
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync(process.env.DB_PATH)
const db = low(adapter)


// addition lib

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
    shuffle,
    optimizeUrl,
    buildCacheKey
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
app.post('/images', upload.array('file'), async (req, res, next) => {

    const schema = validator.object().keys({
        tags: validator.string().optional(),
        category_name: validator.string().required()
    })
    const path = req.route.path
    const run = async () => {
        try {
            let {
                tags,
                category_name
            } = req.body
            //default is empty
            tags = (tags) ? trimArr(tags.split(',')) : []
            const images = req.files
            const uploadProgress = await Promise.all(images.map(image => {
                const {
                    originalname,
                    buffer
                } = image
                const fileName = originalname.split('.')[0]
                const resource_type = 'image'
                return uploadToCloudinary(fileName, resource_type, buffer, tags)
            }))
            // insert to db after upload success to cloudinary
            db.defaults({
                images: []
            }).write()
            uploadProgress.map(image => {
                // add optimize url
                image.optimizeUrl = optimizeUrl(image.public_id, image.format)
                // add category to image 
                image.category_name = category_name.trim()
                // default feature image is false 
                image.isFeatureImage = false
                // init viewNumber of image
                image.viewNumber = 0
                db.get('images').push(image).write()
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
app.get('/images', async (req, res, next) => {
    const schema = validator.object().keys({
        query: validator.string().required(),
        page: validator.number().min(1).optional(),
        per_page: validator.number().min(1).optional()
    })
    const path =  req.route.path
    const run = async () => {
        try {
            let {
                page,
                per_page,
                query
            } = req.query
            // select image by matching category
            let result = db.get("images").value()
            const options = {
                keys: ['category_name', 'tags']
            }
            const fuse = new Fuse(result, options)
            // search with query
            result = fuse.search(query)
            // extract field needed
            result = pickMultiple(result, ['public_id', 'category_name', 'tags', 'url', 'optimizeUrl'])
            // paginate data 
            result = getPaginatedItems(result, page, per_page)
            // send back result to client
            return result
        } catch (error) {
            handleError(res, error, path)
        }
    }
    validateModel(req.query, schema, res, run, path)

})

/**
 * Make change image info : information can be change => tags, category_name
 */
app.put('/image', async (req, res) => {
    const schema = validator.object().keys({
        public_id: validator.string().required(),
        category_name: validator.string().optional(),
        tags: validator.string().optional(),
        isFeatureImage: validator.boolean().optional() // if true make this image become feature images
    })
    const run = async () => {
        try {
            let {
                category_name,
                tags,
                public_id,
                isFeatureImage
            } = req.body
            const foundImage = db.get('images').find({
                public_id
            })
            // change category name 
            if (category_name) {
                foundImage.assign({
                    category_name
                }).write()
            }
            // change tags
            if (tags) {
                tags = trimArr(tags.split(',')),
                    foundImage.assign({
                        tags
                    }).write()
            }
            if (isFeatureImage) {
                // toggle flag feature image
                foundImage.assign({
                    isFeatureImage: !foundImage.value().isFeatureImage
                }).write()
                // update all image of this category to false
                // const featureImages = db.get('images').filter({category_name}).assign({})
            }
            res.status('200').json({
                code: 200,
                message: `success update image with public_id = ${public_id}`,
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
            const {
                public_id
            } = req.body
            // delete in cloud first 
            const cloudinaryMessage = await deleteFileFromCloudinary(public_id)
            // finally delete in localdb
            db.get('images').remove({
                public_id
            }).write()
            res.json(cloudinaryMessage);
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
    const path =  req.route.path

    const run = async () => {
        try {
            const {
                public_id
            } = req.query
            const image = db.get('images').find(img => img.public_id == public_id)
            const imageValue = image.value()
            // incre number of view 
            image.assign({
                viewNumber: imageValue.viewNumber ? imageValue.viewNumber + 1 : 1
            }).write()
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
// todo get categories need add thumb image

app.get('/categories', async (req, res) => {
    const schema = validator.object().keys({
        page: validator.number().min(1).optional(),
        per_page: validator.number().min(1).optional()
    })
    const path =  req.route.path

    const run = () => {
        try {
            let result = db.get('images').value()
            const {
                page,
                per_page
            } = req.query
            // get category 
            result = _.uniq(result.map(image => image.category_name))
            result = result.map(category_name => {
                // get thumb for each category
                let imageInCategory = db.get('images').filter(img => img.category_name == category_name).value()
                // get thumb predefine 
                let thumb = imageInCategory.find(i => i.isFeatureImage)
                // when not found any thumb we set first image is thumb 
                thumb = thumb ? thumb.url : _.first(imageInCategory).url
                return {
                    category_name,
                    thumb,
                    total_image: imageInCategory.length
                }
            })
            result = getPaginatedItems(result, page, per_page)
            return result
        } catch (error) {
            handleError(res, error, path)
        }
    }
    validateModel(req.query, schema, res, run, path)

})
/**
 * get List Image for Category
 */
app.get('/category', async (req, res) => {
    const schema = validator.object().keys({
        category_name: validator.string().required(),
        page: validator.number().min(1).optional(),
        per_page: validator.number().min(1).optional()
    })
    const path = req.route.path
    const run = async () => {
        try {
            const {
                category_name,
                page,
                per_page
            } = req.query
            let categories = db.get('images').filter({
                category_name
            }).value()
            categories = pickMultiple(categories, ['public_id', 'category_name', 'tags', 'url', 'isFeatureImage', 'optimizeUrl'])
            categories = getPaginatedItems(categories, page, per_page)
            return categories
        } catch (error) {
            handleError(res, error, path)
        }
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
        category_name_new: validator.string().required()
    })
    const run = async () => {
        try {
            const {
                category_name_old,
                category_name_new
            } = req.body
            db.get('images').filter({
                category_name: category_name_old
            }).value().map(c => {
                // update each reacord math with old category to new category name
                const {
                    public_id
                } = c
                db.get('images').find({
                    public_id
                }).assign({
                    category_name: category_name_new
                }).write()
            })
            res.json({
                message: `success update from ${category_name_old} => ${category_name_new}`
            })
        } catch (error) {
            handleError(res, error, req.route.path)
        }
    }
    validateModel(req.body, schema, res, run)

});

/**
 * delete category: => need some advice
 */
app.delete('/category', (req, res) => {
    const schema = validator.object().keys({
        category_name: validator.string().required()
    })
    const run = async () => {
        try {
            const {
                category_name
            } = req.body
            db.get('images').filter({
                category_name
            }).value().map(i => {
                // delete image from category
                const {
                    public_id
                } = i
                db.get('images').remove({
                    public_id
                }).write()
            })
            res.json({
                message: `success delete category : ${category_name}`
            })
        } catch (error) {
            handleError(res, error, req.route.path)
        }
    }
    validateModel(req.body, schema, res, run)
});

/**
 * export database api to backup sometimes
 */

app.get("/export/db", async (req, res) => {
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
        res.json(apps);
    } catch (error) {
        handleError(res, error, req.route.path)
    }

})

// provide all suggestion tags for search
app.get('/suggestion', (req, res) => {
    try {
        let tags = [],
            categories = _.uniq(db.get('images').value().map(img => {
                tags = tags.concat(img.tags)
                return img.category_name
            }))
        tags = _.uniq(tags)
        res.json({
            categories,
            tags
        })
    } catch (error) {
        handleError(res, error, req.route.path)
    }
});

// API get random images
app.get('/images/top_search', (req, res) => {
    const schema = validator.object().keys({
        page: validator.number().min(1).optional(),
        per_page: validator.number().min(1).optional()
    })
    const path =  req.route.path

    const run = async () => {
        try {
            const {
                page,
                per_page
            } = req.query
            // make random image 
            let images = _.orderBy(pickMultiple(db.get('images').value(), ['public_id', 'category_name', 'tags', 'url', 'viewNumber', 'optimizeUrl']), ['viewNumber'], ['desc'])
            images = getPaginatedItems(images, page, per_page)
            return images
        } catch (error) {
            handleError(res, error, path)

        }

    }
    validateModel(req.query, schema, res, run, path)
});

// todo add swagger for api
// todo: make api get top category search
app.get('/', (req, res) => res.send('./client/index.html'))

app.listen(process.env.PORT, () => console.log(`Images app listening on port ${process.env.PORT}!`))