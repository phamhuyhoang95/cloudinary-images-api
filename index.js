// setup server 
const express = require('express')
const app = express()
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
const adapter = new FileSync('./database/imageDB.json')
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
    validateModel
} = require('./helper/utils')
/**
 * upload images to cloudinary
 */
app.post('/images', upload.array('images'), async (req, res, next) => {
    const schema = validator.object().keys({
        tags: validator.string().optional(),
        category_name: validator.string().required()
    })
    const run = async () => {
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
            // add category to image 
            image.category_name = category_name
            // default feature image is false 
            image.isFeatureImage = false
            db.get('images').push(image).write()
        })
        res.send(uploadProgress)

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
    const run = async () => {
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
        // paginate data 
        result = getPaginatedItems(result, page, per_page)
        // send back result to client
        res.send(result)

    }
    validateModel(req.query, schema, res, run)

})

/**
 * Make change image info : information can be change => tags, category_name
 */
app.put('/image', async (req, res) => {
    try {
        const schema = validator.object().keys({
            public_id: validator.string().required(),
            category_name: validator.string().optional(),
            tags: validator.string().optional(),
            isFeatureImage: validator.boolean().optional() // if true make this image become feature images
        })
        const run = async () => {
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
        }
        validateModel(req.body, schema, res, run)
    } catch (error) {
        console.log(error)
        res.status(500);
    }

})
/**
 * API make delete image via public_id
 */
app.delete('/image', async (req, res) => {
    const schema = validator.object().keys({
        public_id: validator.string().required()
    })
    try {
        const run = async () => {
            const {
                public_id
            } = req.body
            // delete in cloud first 
            const cloudinaryMessage = await deleteFileFromCloudinary(public_id)
            // finally delete in localdb
            db.get('images').remove({
                public_id
            }).write()
            res.send(cloudinaryMessage);
        }
        validateModel(req.body, schema, res, run)

    } catch (error) {
        res.status(500).json({
            error
        });
    }

})
/**
 * get Detail information for images
 */
app.get('/image', async (req, res) => {
    const {
        public_id
    } = req.query
    const image = db.get('images').find(img => img.public_id == public_id)
    res.json(image)
})
/**
 * API return the list of all category
 */
// todo get categories need add thumb image

app.get('/categories', async (req, res) => {
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
            thumb
        }
    })
    result = getPaginatedItems(result, page, per_page)
    res.send(result)
})
/**
 * get List Image for Category
 */
app.get('/category', async (req, res) => {
    const {
        category_name,
        page,
        per_page
    } = req.query
    let categories = db.get('images').filter({
        category_name
    }).value()
    categories = getPaginatedItems(categories, page, per_page)
    res.send(categories)
})


/**
 * export database api to backup sometimes
 */

app.get("/export/db", async (req, res) => {
    res.json(db.get('images').value())
})

// add api to get more app => solution is hardcode

app.get('/more_app', (req, res) => {
    const apps = [{
        name: 'ringtone',
        icon: '',
        rate: 5,
        url: ''
    }]
    res.send(app);
})

// todo add swagger for api
app.get('/', (req, res) => res.send('Hello World!'))

app.listen(3000, () => console.log('Images app listening on port 3000!'))