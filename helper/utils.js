const cloudinary = require('cloudinary');
const validator = require('joi')
const _ = require('lodash')

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});
/**
 * function upload stream file to cloudinary
 * @param {*} name 
 * @param {*} type 
 * @param {*} buffer 
 * @param {*} tags 
 */
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
 *  paginate array with conditional
 * @param {*} items 
 * @param {*} page 
 * @param {*} per_page 
 */
function getPaginatedItems(items = [], page = 1, per_page = 5) {
    per_page = parseInt(per_page)
    page = parseInt(page)
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
 * @param {*} func: function callback after validate
 */
async function validateModel(source, schema, res, func) {
    var error = validator.validate(source, schema).error,
        verbosity = !error || error.details
    if (error && verbosity) {
        res.status(400).json({
            code: 400,
            message: 'Missing or invalid params',
            verbosity: verbosity
        });
    } else {
        await func()
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
        message: "Server error"
    });
}

/**
 * 
 * @param {*} array 
 * @param {*} thingsToPick 
 */
function pickMultiple(array, thingsToPick) {
    return _.map(array, _.partial(_.ary(_.pick, thingsToPick.length), _, thingsToPick));
}

/**
 * make array randomize
 * @param {*} array 
 */
function shuffle(array) {
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}

function optimiseUrl(public_id, file_type ){
    const options = 'p_auto:low'
    let url  = `http://res.cloudinary.com/nothingatall/image/upload/${options}/${public_id}.${file_type}`
    return url
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
    url
}