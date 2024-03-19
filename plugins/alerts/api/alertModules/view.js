/**
 * @typedef {import('../parts/common-lib.js').Alert} Alert
 * @typedef {import('../parts/common-lib.js').App} App
 * @typedef {import('../parts/common-lib.js').MatchedResult} MatchedResult
 */

const crypto = require('crypto');
const log = require('../../../../api/utils/log.js')('alert:view');
const moment = require('moment-timezone');
const common = require('../../../../api/utils/common.js');
const commonLib = require("../parts/common-lib.js");
const { ObjectId } = require('mongodb');

const METRIC_TO_PROPERTY_MAP = {
    "Bounce rate": "b",
    "Number of page views": "t",
};

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
        const metricProperty = METRIC_TO_PROPERTY_MAP[alertDataSubType];
        compareValue = Number(compareValue);

        if (!metricProperty) {
            log.e(`Metric "${alert.alertDataSubType}" couldn't be mapped for alert ${alert._id.toString()}`);
            return done();
        }

        const metricValue = await getViewMetricByDate(app, metricProperty, alertDataSubType2, date, period);
        if (!metricValue) {
            return done();
        }

        if (compareType === "more than") {
            if (metricValue > compareValue) {
                await commonLib.trigger({ alert, app, metricValue, date });
            }
        }
        else {
            const before = moment(date).subtract(1, commonLib.PERIOD_TO_DATE_COMPONENT_MAP[period]).toDate();
            const metricValueBefore = await getViewMetricByDate(app, metricProperty, alertDataSubType2, before, period);
            if (!metricValueBefore) {
                return done();
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

/**
 * Returns the view metric value by view, date and metric type.
 * @param   {object}                    app    - app document
 * @param   {string}                    metric - "t" or "b" (from METRIC_TO_PROPERTY_MAP)
 * @param   {string}                    view   - _id of the view from app_viewsmeta...
 * @param   {Date}                      date   - date of the value you're looking for
 * @param   {string}                    period - hourly|daily|monthly
 * @returns {Promise<number|undefined>}        - a promise resolves to metric value or undefined
 */
async function getViewMetricByDate(app, metric, view, date, period) {
    const dateComponents = commonLib.getDateComponents(date, app.timezone);
    const compName = commonLib.PERIOD_TO_DATE_COMPONENT_MAP[period];
    const dateKey = dateComponents[compName];
    const monthFilter = String(dateComponents.years) + ":"
        + String(period === "monthly" ? 0 : dateComponents.months);
    const collectionName = "app_viewdata" + crypto
        .createHash('sha1')
        .update(app._id.toString())
        .digest('hex');

    const record = await common.db
        .collection(collectionName)
        .findOne({ m: monthFilter, vw: ObjectId(view.toString()) });

    // find the value we're interested inside the document.
    // structure in year based documents:
    // { d: { month1: {...}, month2: {...} },  } }
    // structure in month based documents:
    // { d: { day1: { hour1: {...}, hour2: {...} }, day2: {...} } }
    let scope = record?.d;
    if (period === "hourly") {
        scope = scope?.[dateComponents.days];
    }
    return scope?.[dateKey]?.[metric];
}

/*
(async function() {
    const hourly = await getViewMetricByDate(
        { _id: "65c1f875a12e98a328d5eb9e", timezone: "Europe/Istanbul" },
        "t",
        "65c5e7f7c26cadacd1229f3a",
        new Date("2024-02-13T13:47:19.247Z"),
        "hourly"
    );
    console.assert(hourly === 120, `==================  hourly ${hourly} doesn't match with 120`);
    const daily = await getViewMetricByDate(
        { _id: "65c1f875a12e98a328d5eb9e", timezone: "Europe/Istanbul" },
        "t",
        "65c5e7f7c26cadacd1229f3a",
        new Date("2024-02-13T13:47:19.247Z"),
        "daily"
    );
    console.assert(daily === 148, `================== daily ${daily} doesn't match with 148`);
    const monthly = await getViewMetricByDate(
        { _id: "65c1f875a12e98a328d5eb9e", timezone: "Europe/Istanbul" },
        "t",
        "65c5e7f7c26cadacd1229f3a",
        new Date("2024-02-13T13:47:19.247Z"),
        "monthly"
    );
    console.assert(monthly === 836, `================== monthly ${monthly} doesn't match with 836`);
})();
*/