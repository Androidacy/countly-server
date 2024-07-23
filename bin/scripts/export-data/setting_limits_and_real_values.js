/**
 *  Description: Creates CSV file of document counts per month from drill data
 *  Server: countly
 *  Path: $(countly dir)/bin/scripts/export-data
 *  Command: node export_monthly_doc_count.js
 */

// const moment = require('moment-timezone');
const { ObjectId } = require('mongodb');
// const fs = require('fs');

const pluginManager = require('../../../plugins/pluginManager.js');
// const drillCommon = require('../../../plugins/drill/api/common.js');
// const countlyCommon = require('../../../api/lib/countly.common.js');

const app_list = []; //valid app_ids here. If empty array passed, script will process all apps.
// const pathToFile = './'; //path to save csv files
// const period = 'all'; //supported values are 60days, 30days, 7days, yesterday, all, or [startMiliseconds, endMiliseconds] as [1417730400000,1420149600000]
// const MAX_RETRIES = 5;

const DEFAULTS = {
    event_limit: 500,
    event_segment_limit: 100,
    event_segment_value_limit: 1000,
    view_limit: 50000,
    view_name_limit: 128,
    view_segment_limit: 100,
    view_segment_value_limit: 10,
    // user properties
//     custom_set_limit: 50,
//     custom_prop_limit: 20,
    // values in an array for one user property
//     ??
};

// plugins.setConfigs("users", {
//     custom_set_limit: 50,
//     custom_prop_limit: 20,
//     show_notes_in_list: true,
//     sampling_threshold: 100000,
//     batch_size: 100,
//     batch_cooldown: 10,
//     app_user_job: true
// });

Promise.all([pluginManager.dbConnection("countly"), pluginManager.dbConnection("countly_drill")]).then(async function([countlyDb, drillDb]) {
    console.log("Connected to databases...");
    try {
        var all_results = [];
        const apps = await getAppList({db: countlyDb});
        if (!apps || !apps.length) {
            return close();
        }
        else {
            // LOOP APPS FOR EACH REQUIREMENT
            for (let i = 0; i < apps.length; i++) {
                var app = apps[i];
                console.log(i + 1, ") Processing app:", app.name);

                try {
                    var app_results = { "App Name": app.name },
                        defaultVal,
                        realVal,
                        currentVal;

                    let eventsCollectionPerApp = await countlyDb.collection("events").findOne({"_id": ObjectId(app._id)});
                    let pluginsCollectionPlugins = await countlyDb.collection("plugins").findOne({"_id": 'plugins'});

                    // EVENT KEYS
                    defaultVal = DEFAULTS.event_limit;

                    let realEvents = eventsCollectionPerApp && eventsCollectionPerApp.list || [];
                    realVal = realEvents.length;

                    let currentEventLimit = pluginsCollectionPlugins && pluginsCollectionPlugins.api && pluginsCollectionPlugins.api.event_limit || [];
                    currentVal = currentEventLimit;

                    app_results['Event Keys'] = {"default": defaultVal, "set": currentVal, "real": realVal};

                    // SEGMENTS IN ONE EVENT
                    defaultVal = DEFAULTS.event_segment_limit;

                    let currentEventSegmentLimit = pluginsCollectionPlugins && pluginsCollectionPlugins.api && pluginsCollectionPlugins.api.event_segmentation_limit || [];
                    currentVal = currentEventSegmentLimit;

                    let eventSegments = eventsCollectionPerApp && eventsCollectionPerApp.segments || {};
                    realVal = Object.entries(eventSegments)
                        .sort((a, b) => b[1].length - a[1].length)
                        .map(([key, value]) => {
                            return { event: key, segment: value.length };
                        });

                    app_results['Event Segments'] = {"default": defaultVal, "set": currentVal, "real": realVal};

                    // UNIQUE EVENT SEGMENT VALUES FOR 1 SEGMENT
                    defaultVal = DEFAULTS.event_segment_value_limit;

                    let currentEventSegmentValueLimit = pluginsCollectionPlugins && pluginsCollectionPlugins.api && pluginsCollectionPlugins.api.event_segmentation_value_limit || [];
                    currentVal = currentEventSegmentValueLimit;

                    // real values for event segment values

                    // UNIQUE VIEV NAMES
                    defaultVal = DEFAULTS.view_limit;

                    let currentViewLimit = pluginsCollectionPlugins && pluginsCollectionPlugins.api && pluginsCollectionPlugins.api.view_limit || [];
                    currentVal = currentViewLimit;

                    // VIEW NAME LENGTH LIMIT
                    defaultVal = DEFAULTS.view_name_limit;

                    let currentViewNameLimit = pluginsCollectionPlugins && pluginsCollectionPlugins.api && pluginsCollectionPlugins.api.view_name_limit || [];
                    currentVal = currentViewNameLimit;

                    // SEGMENTS IN ONE VIEW
                    defaultVal = DEFAULTS.view_segment_limit;

                    let currentViewSegmentLimit = pluginsCollectionPlugins && pluginsCollectionPlugins.api && pluginsCollectionPlugins.api.segment_limit || [];
                    currentVal = currentViewSegmentLimit;

                    // VIEW SEGMENT'S UNIQUE VALUES
                    defaultVal = DEFAULTS.view_segment_value_limit;

                    let currentViewSegmentValueLimit = pluginsCollectionPlugins && pluginsCollectionPlugins.api && pluginsCollectionPlugins.api.segment_value_limit || [];
                    currentVal = currentViewSegmentValueLimit;

                    // USER PROPERTIES

                    // VALUES IN AN ARRAY FOR ONE USER PROPERTY


                    all_results.push(app_results);
                }
                catch (err) {
                    console.log("Couldn't get events for app:", app.name, err);
                }
            }
            console.log(all_results);

            // CREATE WRITE STREAM
            // const WriteStream = fs.createWriteStream(pathToFile + `event_keys.csv`);
        }
    }
    catch (err) {
        close(err);
    }
    finally {
        close();
    }

    async function getAppList(options) {
        var query = {};
        if (app_list && app_list.length > 0) {
            var listed = [];
            for (var z = 0; z < app_list.length; z++) {
                listed.push(ObjectId(app_list[z]));
            }
            query = {_id: {$in: listed}};
        }

        try {
            let apps = await options.db.collection("apps").find(query).toArray();
            return apps;
        }
        catch (err) {
            console.log("Error getting apps: ", err);
            return [];
        }

    }

    function close(err) {
        if (err) {
            console.log("Error: ", err);
        }
        countlyDb.close();
        drillDb.close();
        console.log("Done.");
    }
});