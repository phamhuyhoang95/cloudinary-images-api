var CronJob = require('cron').CronJob;
const fs = require('fs')
const moment = require('moment')
console.log("Job is running")
var job = new CronJob('*/1 * * * *', function () {
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
                var body = Buffer.concat(chunks);
                fs.writeFileSync(`${__dirname}/backup/data-${dates}.json`, body.toString())
            });
        });

        req.end();
    }, function () {
        // get backup data from API
        console.log("Job is stoped !")
        /* This function is executed when the job stops */
    },
    true, /* Start the job right now */
    // timeZone /* Time zone of this job. */
);