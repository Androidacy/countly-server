/**
 * @typedef {import('../parts/common-lib.js').Alert} Alert
 * @typedef {import('../parts/common-lib.js').App} App
 * @typedef {import('../parts/common-lib.js').MatchedResult} MatchedResult
 */

const crypto = require('crypto');
const log = require('../../../../api/utils/log.js')('alert:event');
const moment = require('moment-timezone');
const common = require('../../../../api/utils/common.js');
const commonLib = require("../parts/common-lib.js");
const { ObjectId } = require('mongodb');

/*
const eventAlert = {
    alert(alertConfigs, result, callback) {
        return bluebird.coroutine(function *() {
            try {
                log.i('trigger alert:', alertConfigs);
                utils.addAlertCount();
                if (alertConfigs.alertBy === 'email') {
                    const emails = yield utils.fillEmailList(alertConfigs);
                    let html = '';
                    const host = yield utils.getHost();

                    let appsListTitle = 'several apps';
                    if (result.length <= 3) {
                        const appName = [];
                        result.map((data)=>{
                            appName.push(data.app.name);
                        });
                        appsListTitle = appName.join(', ');
                    }
                    let title = '';
                    title = `Event count for ${appsListTitle} has changed compared to yesterday`;
                    const subject = title;

                    html = yield utils.getEmailTemplate({
                        title: `Countly Alert`,
                        subTitle: `Countly Alert: ` + alertConfigs.alertName,
                        host,
                        compareDescribe: alertConfigs.compareDescribe,
                        apps: result.map((data)=>{
                            const item = {
                                id: data.app._id,
                                name: data.app.name,
                                data: [{
                                    key: 'Today\'s Value',
                                    value: data.todayValue
                                }]
                            };
                            if (data.lastDateValue !== null && data.lastDateValue !== undefined) {
                                item.data.push({key: 'Yesterday\'s Value', value: data.lastDateValue});
                            }
                            return item;
                        })
                    });
                    emails.forEach((to) => {
                        utils.addAlertCount(to);
                        log.i('will send email=>>>>>>>>>>');
                        log.i('to:', to);
                        log.d('subject:', subject);
                        log.d('message:', html);

                        utils.sendEmail(to, subject, html);
                    });
                    callback && callback();
                }

                // if (alertConfigs.alertBy === 'http') {
                // 	utils.sendRequest(alertConfigs.alertValues)
                // }
            }
            catch (e) {
                log.e(e, e.stack);
            }
        })();
    },

    check({alertConfigs, done}) {
        var self = this;
        return bluebird.coroutine(function *() {
            try {
                const rightHour = yield utils.checkAppLocalTimeHour(alertConfigs.selectedApps[0], 23);
                if (rightHour) {
                    log.i("checking alert:", alertConfigs);
                    const data = yield getEventData(alertConfigs);
                    const result = utils.compareValues(alertConfigs, data, 'c', 0);
                    log.d('app:', alertConfigs.selectedApps[0], ' result:', result, "getEventData:", JSON.stringify(data));
                    if (result.matched) {
                        common.db.collection('apps').findOne({ _id: common.db.ObjectID(result.currentApp)}, function(err, app) {
                            result.app = app;
                            self.alert(alertConfigs, [result]);
                        });
                    }
                }
                done();
            }
            catch (e) {
                log.e(e, e.stack);
            }
        })();


    }
    */
const METRIC_TO_PROPERTY_MAP = {
    // these are directly being stored in db
    count: "c",
    sum: "s",
    duration: "dur",
    // these need to be calcuated by divising with count
    averageSum: "s",
    averageDuration: "dur"
};

const AVERAGE_METRICS = ["averageSum", "averageDuration"];

/**
 * Alert triggering logic
 * @param {Alert}    alert - alert document
 * @param {function} done  - callback function
 * @param {Date}     date  - scheduled date for the alert (job.next)
 */
module.exports.check = async({ alertConfigs: alert, done, scheduledTo: date }) => {
    try {
        const app = await common.db.collection("apps").findOne({ _id: ObjectId(alert.selectedApps[0]) });
        if (!app) {
            log.e(`App ${alert.selectedApps[0]} couldn't be found`);
            return done();
        }

        let { alertDataSubType, alertDataSubType2, period, compareType, compareValue } = alert;
        const metricProp = METRIC_TO_PROPERTY_MAP[alertDataSubType];
        let metricValue = await getEventMetricByDate(app, alertDataSubType2, metricProp, date, period);

        compareValue = Number(compareValue);

        if (!metricValue) {
            return done();
        }

        // if this is average:
        if (AVERAGE_METRICS.includes(alertDataSubType)) {
            const count = await getEventMetricByDate(app, alertDataSubType2, "c", date, period);
            if (!count) {
                return done();
            }
            metricValue /= count;
        }

        if (compareType === "more than") {
            if (metricValue > compareValue) {
                await commonLib.trigger({ alert, app, metricValue, date });
            }
        }
        else {
            const before = moment(date).subtract(1, commonLib.PERIOD_TO_DATE_COMPONENT_MAP[period]).toDate();
            let metricValueBefore = await getEventMetricByDate(app, alertDataSubType2, metricProp, before, period);

            if (!metricValueBefore) {
                return done();
            }

            // if this is average:
            if (AVERAGE_METRICS.includes(alertDataSubType)) {
                const count = await getEventMetricByDate(app, alertDataSubType2, "c", before, period);
                if (!count) {
                    return done();
                }
                metricValueBefore /= count;
            }

            const change = (metricValue / metricValueBefore - 1) * 100;
            const shouldTrigger = compareType === "increased by at least"
                ? change >= compareValue
                : change <= compareValue;

            if (shouldTrigger) {
                await commonLib.trigger({ alert, app, date, metricValue, metricValueBefore });
            }
        }
    }
    catch (err) {
        log.e("Error while running check for view alert", err);
    }
    done();
};


module.exports.getEventMetricByDate = getEventMetricByDate;
/**
 * Returns the view metric value by view, date and metric type.
 * @param   {App}                       app      - app document
 * @param   {string}                    event    - list of event names
 * @param   {string}                    metric   - c, s, dur
 * @param   {Date}                      date     - date of the value you're looking for
 * @param   {string}                    period   - hourly|daily|monthly
 * @param   {object}                    segments - segmentation filter. e.g. {Category:"Electronics"}
 * @returns {Promise<number|undefined>}          - a promise resolves to metric value or undefined
 */
async function getEventMetricByDate(app, event, metric, date, period, segments) {
    const dateComponents = commonLib.getDateComponents(date, app.timezone);
    const monthFilter = String(dateComponents.years) + ":" + String(dateComponents.months);
    let segmentKeys = ["no-segment"];
    if (segments) {
        segmentKeys = Object.keys(segments);
    }

    const collectionName = "events" + crypto
        .createHash('sha1')
        .update(event + app._id.toString())
        .digest('hex');

    const records = await common.db.collection(collectionName)
        .find({
            m: monthFilter,
            s: { $in: segmentKeys },
        })
        .toArray();

    let number;
    for (let record of records) {
        const segmentKey = (!record || record.s === "no-segment") ? null : record.s;
        const segmentValue = segmentKey ? segments[segmentKey] : null;
        let value;

        if (period === "hourly") {
            // there's no hourly segmented records
            if (segmentKey) {
                return;
            }
            value = record?.d?.[dateComponents.days]?.[dateComponents.hours]?.[metric];
        }
        else if (period === "daily") {
            let context = record?.d?.[dateComponents.days];
            if (segmentKey) {
                context = context?.[segmentValue];
            }
            value = context?.[metric];
        }
        // calculate monthly value from daily values
        else if (period === "monthly") {
            for (let i = 1; i <= 31; i++) {
                let context = record?.d?.[i];
                if (segmentKey) {
                    context = context?.[segmentValue];
                }
                const dailyValue = context?.[metric];
                if (typeof dailyValue === "number") {
                    if (typeof value !== "number") {
                        value = 0;
                    }
                    value += dailyValue;
                }
            }
        }

        if (typeof value === "number") {
            if (typeof number !== "number") {
                number = 0;
            }
            number += value;
        }
    }
    return number;
}

/*
(async function() {
    await new Promise(res => setTimeout(res, 2000));

    const hourly = await getEventMetricByDate(
        { _id: "65c1f875a12e98a328d5eb9e", timezone: "Europe/Istanbul" },
        "Checkout",
        "c",
        new Date("2024-01-02T12:47:19.247Z"),
        "hourly"
    );
    console.assert(hourly === 5, "hourly event data doesn't match");

    const daily = await getEventMetricByDate(
        { _id: "65c1f875a12e98a328d5eb9e", timezone: "Europe/Istanbul", },
        "Checkout",
        "c",
        new Date("2024-01-03T13:47:19.247Z"),
        "daily",
        { "Delivery Type": "Express" }
    );
    console.assert(daily === 22, "daily segmented event data doesn't match");

    const monthly = await getEventMetricByDate(
        { _id: "65c1f875a12e98a328d5eb9e", timezone: "Europe/Istanbul", },
        "Checkout",
        "c",
        new Date("2024-01-03T13:47:19.247Z"),
        "monthly"
    );
    console.assert(monthly === 5120, "monthly event data doesn't match");

    const monthlySegmented = await getEventMetricByDate(
        { _id: "65c1f875a12e98a328d5eb9e", timezone: "Europe/Istanbul", },
        "Checkout",
        "c",
        new Date("2024-01-03T13:47:19.247Z"),
        "monthly",
        { "Delivery Type": "Express" }
    );
    console.assert(monthlySegmented === 2535, "monthly segmented event data doesn't match");
})();
*/