'use strict';

var logger = require('logops'),
    revalidator = require('revalidator'),
    errors = require('../errors'),
    iotaInformation,
    context = {
        op: 'IoTBrokerCommon.genericMiddleware'
    };    

/**
 * Express middleware for handling errors in the IoTAs. It extracts the code information to return from the error itself
 * returning 500 when no error code has been found.
 *
 * @param {Object} error        Error object with all the information.
 */
function handleError(error, req, res, next) {
    var code = 500;

    logger.debug(context, 'Error [%s] handling request: %s', error.name, error.message);

    if (error.code && String(error.code).match(/^[2345]\d\d$/)) {
        code = error.code;
    }

    res.status(code).json({
        name: error.name,
        message: error.message
    });
}

/**
 *  Express middleware for tracing the complete request arriving to the IoTA in debug mode.
 */
function traceRequest(req, res, next) {
    logger.debug(context, 'Request for path [%s] from [%s]', req.path, req.get('host'));
    logger.debug(context, 'Headers:\n%j\n', req.headers);
    
    if (req.is('json')) {
        logger.debug(context, 'Body:\n\n%s\n\n', JSON.stringify(req.body, null, 4));
    } else if (req.is('xml')) {
        logger.debug(context, 'Body:\n\n%s\n\n', req.rawBody);
    } else {
        logger.debug('Unrecognized body type', req.headers['content-type']);
    }

    next();
}

/**
 * Changes the log level to the one specified in the request.
 */
function changeLogLevel(req, res, next) {
    var levels = ['INFO', 'ERROR', 'FATAL', 'DEBUG', 'WARNING'];

    if (!req.query.level) {
        res.status(400).json({
            error: 'log level missing'
        });
    } else if (levels.indexOf(req.query.level.toUpperCase()) < 0) {
        res.status(400).json({
            error: 'invalid log level'
        });
    } else {
        logger.setLevel(req.query.level.toUpperCase());
        res.status(200).send('');
    }
}

/**
 * Return the current log level.
 */
function getLogLevel(req, res, next) {
    res.status(200).json({
        level: logger.getLevel()
    });
}

/**
 * Ensures the request type is one of the supported ones.
 */
function ensureType(req, resp, callback) {
    var contentType = req.headers['content-type'];
    if (req.is('json') || req.is('xml')) {
        callback(null, req, resp);
    } else {
        callback(new errors.UnsupportedContentType(req.headers['content-type']));
    }
}

/**
 * Ensure the url has the protocol http before address.
 */
function ensureHttp(url){
    if (!/^(f|ht)tps?:\/\//i.test(url))
        url = "http://" + url;        
    return url;
}

/**
 * Generates a Middleware that validates incoming requests based on the JSON Schema template passed as a parameter.
 *
 * @param {Object} template     JSON Schema template to validate the request.
 * @return {Object}            Express middleware used in request validation with the given template.
 */
function validateJson(template) {
    return function validate(req, res, callback) {
        logger.debug('validade json');
        if (req.is('json')) {
            var errorList = revalidator.validate(req.body, template);

            if (errorList.valid) {
                callback(null, req, res);
            } else {
                logger.debug(context, 'Errors found validating request: %j', errorList);
                callback(new errors.TemplateLoadingError('Errors found validating request.'));
            }
        } else {
            callback(null, req, res);
        }
    };
}

/**
 *  Middleware that returns all the IoTA information stored in the module.
 */
function retrieveVersion(req, res, next) {
    res.status(200).json(iotaInformation);
}

function checkMandatoryQueryParams(mandatoryAttributes, body, callback) {
    var missing = [];

    for (var p in mandatoryAttributes) {
        var found = false;

        for (var i in body) {
            if (body.hasOwnProperty(i)) {
                if (i === mandatoryAttributes[p]) {
                    found = true;
                }
            }
        }

        if (!found) {
            missing.push(mandatoryAttributes[p]);
        }
    }

    if (missing.length !== 0) {
        callback(new errors.MissingAttributes('Missing attributes: ' + JSON.stringify(missing)));
    } else {
        callback(null, body);
    }
}

/**
 * Stores the information about the IoTAgent for further use in the `retrieveVersion()` middleware.
 *
 * @param {Object} newIoTAInfo              Object containing all the IoTA Information.
 */
function setIotaInformation(newIoTAInfo) {
    iotaInformation = newIoTAInfo;
}

exports.handleError = handleError;
exports.traceRequest = traceRequest;
exports.changeLogLevel = changeLogLevel;
exports.ensureType = ensureType;
exports.validateJson = validateJson;
exports.retrieveVersion = retrieveVersion;
exports.setIotaInformation = setIotaInformation;
exports.getLogLevel = getLogLevel;
exports.ensureHttp = ensureHttp;
exports.checkMandatoryQueryParams = checkMandatoryQueryParams;