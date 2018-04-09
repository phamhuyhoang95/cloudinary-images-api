const { CronJob } = require('cron')
const moment = require('moment')
const cloudinary = require('cloudinary')
const http = require('http')
require('dotenv').config({
    path: '.localenv',
    silent: true
})

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
})
const job = new CronJob(
    `0 0 */${process.env.BACKUP_TIME} * * *`,
    () => {
        console.log('Job is started')
        // do something

        const dates = moment().format('YYYY-MM-DD hh:mm:ss')
        const options = {
            method: 'GET',
            hostname: 'localhost',
            port: process.env.PORT,
            path: '/export/db',
            headers: {
                'cache-control': 'no-cache',
                'postman-token': 'c95aa5b3-161b-1376-6379-3ff84c23ef7b'
            }
        }

        const req = http.request(options, res => {
            const chunks = []

            res.on('data', chunk => {
                chunks.push(chunk)
            })
            res.on('end', () => {
                const buffer = Buffer.concat(chunks)
                cloudinary.v2.uploader
                    .upload_stream(
                        {
                            public_id: `${
                                process.env.TASK_PREFIX
                            }-${dates}.json`,
                            resource_type: 'auto',
                            folder: 'backup'
                        },
                        error => {
                            if (error) {
                                console.log(error)
                            }
                            console.log('Job done!')
                        }
                    )
                    .end(buffer)
            })
        })
        req.end()
    },
    () => {
        // get backup data from API
        console.log('Job is stoped !')
        /* This function is executed when the job stops */
    },
    false /* Start the job right now */
    // timeZone /* Time zone of this job. */
)

module.exports = {
    taskRunner: job
}
