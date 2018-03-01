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
    extended: true
})); // support encoded bodies


// setup cloudinary and upload file
const cloudinary = require('cloudinary');
const multer = require('multer')
const upload = multer()
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});

// setup database 
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('./database/imageDB.json')
const db = low(adapter)

// addition lib
const validator = require('joi')
const _ = require('lodash')

app.post('/images', upload.array('images'), async (req, res, next) => {
    const {
        tags,
        category_name
    } = req.body
    const images = req.files
    const uploadProgress = await Promise.all(images.map(image => {
        const fileName = image.originalname.split('.')[0]
        const resource_type = 'image'
        const buffer = image.buffer
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
})

app.get('/images', async (req, res, next) => {
    let {
        page,
        per_page,
        category_name,
        tags
    } = req.query
    // select image by matching category
    let result = db.get("images").value()
    tags = tags ? tags.split(',').map(tag => tag.trim()) : null
    // apply filter 
    if (tags && !category_name) {
        result = result.filter(image => {
            return image.tags.some(tag => tags.includes(tag))
        })
    } else if (category_name && !tags) {
        result = result.filter(image => image.category_name == category_name)
    } else if (tags && category_name) {
        result = result.filter(image => image.category_name == category_name)
        result = result.filter(image => {
            return image.tags.some(tag => tags.includes(tag))
        })
    } else {
        throw 'missing category_name and tags'
    }
    // paginate data 
    result = getPaginatedItems(result, page, per_page)
    // send back result to client
    res.send(result)
})

/**
 * Make change image info : information can be change => tags, category_name
 */
app.put('/image', async (req, res) => {
    try {
        const schema = validator.object().keys({
            public_id: validator.string().required(),
            category_name: validator.string().when('tags', {
                is: validator.string().required(),
                then: validator.optional(),
                otherwise: validator.required()
            }),
            tags: validator.string().optional(),
            isFeatureImage: validator.boolean().optional() // if true make this image become feature images
        })
        var error = validator.validate(req.body, schema).error,
            verbosity = !error || error.details
        if (error && verbosity) {
            res.status(400).json({
                code: 400,
                message: 'Missing or invalid params',
                verbosity: verbosity
            });
        } else {
            let {
                category_name,
                tags,
                public_id,
                isFeatureImage
            } = req.body
            const foundImage = db.get('images').find({
                public_id
            })
            if (category_name && !isFeatureImage) {
                foundImage.assign({
                    category_name
                }).write()
            }
            if (tags) {
                tags = tags.split(',').map(tag => tag.trim())
                foundImage.assign({
                    tags
                }).write()
            }
            if (isFeatureImage == true && category_name) {
                foundImage.assign({
                    isFeatureImage: true
                }).write()
                // update all image of this category to false
                // const featureImages = db.get('images').filter({category_name}).assign({})
            }
            res.status('200').json({
                code: 200,
                message: `success update image with public_id = ${public_id}`,
            })
        }
    } catch (error) {
        console.log(error)
        res.status(500);
    }

})
/**
 * API make delete image via public_id
 */
app.delete('/image', async (req, res) => {
    const {
        public_id
    } = req.body
    try {
        // delete in cloud first 
        const cloudinaryMessage = await new Promise((resolve, reject) => {
            cloudinary.v2.uploader.destroy(public_id, (err, result) => {
                if (err) {
                    reject(err)
                }
                resolve(result)
            })
        })
        // finally delete in localdb
        db.get('images').remove({
            public_id
        }).write()
        res.send(cloudinaryMessage);

    } catch (error) {
        res.status(500).json({
            error
        });
    }

})
/**
 * API return the list of all category
 */
app.get('/categories', async (req, res) => {
    let result = db.get('images').value()
    const {
        page,
        per_page
    } = req.query
    // get category 
    result = _.uniq(result.map(image => image.category_name))
    getPaginatedItems(result, page, per_page)
    res.send(result)
})

/**
 * get List Image for Category
 */
app.get('/category', async (req, res) => {
    const {category_name} = req.body
    res.send(db.get('images').filter({category_name})).value()
})

function uploadToCloudinary(name, type, buffer, tags) {
    return new Promise((resolve, reject) => {
        cloudinary.v2.uploader.upload_stream({
                public_id: name,
                resource_type: type,
                tags
            }, (error, result) => {
                if (error) {
                    reject(error)
                }
                resolve(result)
            })
            .end(buffer);
    })
}

function getPaginatedItems(items = [], page = 1, per_page = 5) {
    offset = (page - 1) * per_page,
        take = (offset + per_page),
        paginatedItems = _.uniq(_.slice(items, offset, take))
    return {
        page: page,
        per_page: per_page,
        total: items.length,
        total_pages: Math.ceil(items.length / per_page),
        data: paginatedItems
    };
}

app.get('/', (req, res) => res.send('Hello World!'))

app.listen(3000, () => console.log('Images app listening on port 3000!'))