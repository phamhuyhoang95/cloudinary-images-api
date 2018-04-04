var CronJob = require('cron').CronJob;
const fs = require('fs')
const moment = require('moment')
const cloudinary = require('cloudinary')
require('dotenv').config({
    path: '.localenv',
    silent: true
})
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});
var job = new CronJob(`0 0 */${process.env.BACKUP_TIME} * * *`, function () {
        console.log("Job is started")
        // do something
        var http = require("http");
        const dates = moment().format('YYYY-MM-DD hh:mm:ss')
        var options = {
            "method": "GET",
            "hostname": "localhost",
            "port": "3000",
            "path": "/export/db",
            "headers": {
                "cache-control": "no-cache",
                "postman-token": "c95aa5b3-161b-1376-6379-3ff84c23ef7b"
            }
        };

        var req = http.request(options, function (res) {
            var chunks = [];

            res.on("data", function (chunk) {
                chunks.push(chunk);
            });
            res.on("end", function () {
                var buffer = Buffer.concat(chunks);
                cloudinary.v2.uploader.upload_stream({
                        public_id: `data-${dates}.json`,
                        resource_type: 'auto',
                        folder: 'backup'
                    }, (error, result) => {
                        if (error) {
                            console.log(error)
                        }
                        console.log("Job done!")
                    })
                    .end(buffer);
            });
        });
        req.end();
    }, function () {
        // get backup data from API
        console.log("Job is stoped !")
        /* This function is executed when the job stops */
    },
    false, /* Start the job right now */
    // timeZone /* Time zone of this job. */
);
module.exports = {
    taskRunner: job
}