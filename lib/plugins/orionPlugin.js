'use strict';

var sax = require('sax'),
    logger = require('logops'),
    errors = require('../errors'),
    identificationTable = require('./orionUrls'),
    request = require('request'),
    constants = require('../constants'),  
    proxy = require('../middleware/proxy'),  
    ngsi = require('../ngsi/ngsi'),        
    async = require('async'),        
    apply = async.apply,     
    intoTrans = require('../common/domains').intoTrans,            
    packageInformation = require('../../package.json'),
    middlewares = require('../common/genericMiddleware'),   
    registerContextTemplate = require('../templates/registerContext.json'),        
    updateContextTemplate = require('../templates/updateContext.json'),
    updateContextTemplateV2 = require('../templates/updateContextV2.json'),           
    queryContextTemplate = require('../templates/queryContext.json'),        
    context = {
        op: 'IoTBroker.OrionPlugin'
    };

/**
 * Translates the updateAction value to the appropriate action name for the Access Control.
 *
 * @param {String} originalAction        String with the action name.
 * @return {String}                      The string representation of the action name for the Access Control.
 */
function translateAction(originalAction) {
    var action;

    switch (originalAction.toUpperCase()) {
        case 'APPEND':
            action = 'create';
            break;

        case 'APPEND_STRICT':
            action = 'create';
            break;

        case 'UPDATE':
            action = 'update';
            break;

        case 'DELETE':
            action = 'delete';
            break;

        default:
            action = null;
    }

    logger.debug(context, 'Discovered action was: %s', action);

    return action;
}

/**
 * Extract the action from a JSON body.
 *
 * @param {Object} body          Javascript Object with the parsed payload.
 * @param {Object} field         Field that will be used to extract the type.
 */
function inspectBodyJSON(body, field, callback) {
    logger.error('inspect body ', body);
    logger.error('inspect body ', body[field]);
    
    if (body && body[field]) {
        var translatedAction = translateAction(body[field]);

        if (translatedAction) {
            callback(null, translatedAction);
        } else {
            callback(new errors.WrongJsonPayload("Error to read updateAction."));
        }
    } else {
        logger.error('[ORION-PLUGIN-003] Wrong JSON Payload: updateAction element not found');

        callback(new errors.WrongJsonPayload());
    }
}

/**
 * Determines what kind of body to parse to calculate the action, and invoke the appropriate function.
 *
 * @param {Object} req           Incoming request.
 * @param {Object} res           Outgoing response.
 */
function inspectBodyV1(req, res, callback) {
    var actionHandler = function actionHandler(error, action) {
        req.action = action;
        callback(error, req, res);
    };

    //verifica se a entrada eh json ou xml
    if (req.is('*/json')) {
        logger.debug(context, 'Inspecting JSON body to discover action: \n%j\n\n', req.body);
        inspectBodyJSON(req.body, 'updateAction', actionHandler);
    } else {
        // TODO: raise error if the type is not recognized.
        logger.error(context, 'Unknown content type: %s', req.headers['content-type']);
        actionHandler(new errors.UnexpectedContentType(req.headers['content-type']));
    }
}

function inspectBodyV2(req, res, callback) {
    var actionHandler = function actionHandler(error, action) {
        req.action = action;
        callback(error, req, res);
    };

    if (req.is('*/json')) {
        logger.debug(context, 'Inspecting JSON body to discover action: \n%j\n\n', req.body);
        inspectBodyJSON(req.body, 'actionType', actionHandler);
    } else {
        // TODO: raise error if the type is not recognized.
        logger.error(context, 'Unknown content type: %s', req.headers['content-type']);

        actionHandler(new errors.UnexpectedContentType(req.headers['content-type']));
    }
}

/**
 * Determines what is the requested action based on the request information, knowing that it is a convenience operation.
 *
 * @param {Object} req           Incoming request.
 * @param {Object} res           Outgoing response.
 */
function inspectUrl(req, res, callback) {

    var match = false;

    logger.debug(context, 'Extracting action from the URL "%s"', req.url);

    for (var i = 0; i < identificationTable.length; i++) {
        match = false;
        
        
        if (req.method === identificationTable[i][0] &&
            req.path.toLowerCase().match(identificationTable[i][1])) {
            
            logger.debug(context, 'req.method', req.method);
            logger.debug(context, 'identificationTable[i][1]', identificationTable[i][1]);
            
            
            match = true;            
            if (identificationTable[i].length >= 4 && req.query) {
                for (var j in identificationTable[i][3]) {                    
                    if (!req.query[j] ||
                        identificationTable[i][3].hasOwnProperty(j) &&
                        req.query[j].split(',').indexOf(identificationTable[i][3][j]) < 0) {
                        match = false;
                    }
                }
            }

            if (match) {
                req.action = identificationTable[i][2];
                break;
            }
        }
    }

    if(match){
        callback(null, req, res);
    } else {
        logger.error(context, 'Action not found');
        callback(new errors.ActionNotFound());        
    }
}


//entrada as url com headers 
//saida concatencao de dados
function requestUrls(urls, callback){
    async.map(urls, function(options, callback) {    
        request(options, function(error, response, body){
                    callback(null, body);
        });
        
    }, function(err, data) {
        logger.debug(context, "Result from providingApplication: ", JSON.stringify(data, null, 4));   
        callback(null, data);
    });
}

function requestUrlParallel(urls, callback){
    async.map(urls, function(url, callback){
            request(url, function (error, response, body) {
                callback(null, body);
            }); 
    }, function(err, data){
        logger.debug(context, "Result from providingApplication: ", JSON.stringify(data, null, 4));                                
        
        callback(null, data);    
    });
}

/**
 * Middleware to calculate what Context Broker action has been received based on the path and the request payload.
 *
 * @param {Object} req           Incoming request.
 * @param {Object} res           Outgoing response.
 */
function extractCBAction(req, res, next) {

    if (req.path.toLowerCase().match(/\/(ngsi10|v1|)\/updatecontext$/)) {
       async.waterfall([
            async.apply(middlewares.ensureType, req, res),
            async.apply(middlewares.validateJson(updateContextTemplate)),
            async.apply(inspectBodyV1),   
            async.apply(ngsi.handleUpdate),             
        ], function(error, req, resp){
            if(error)
                next(error); 
        });        
    } else if (req.path.toLowerCase().match(/\/v2\/op\/update$/)) {
        async.waterfall([
            async.apply(middlewares.ensureType, req, res),
            async.apply(middlewares.validateJson(updateContextTemplateV2)),
            async.apply(inspectBodyV2),  
            async.apply(ngsi.handleUpdate),            
        ], function(error, req, resp){
             if(error)
                next(error); 
        });                    
    } else if (req.path.toLowerCase().match(/\/(v1\/registry|ngsi9)\/registercontext$/)) {            
        async.waterfall([
            async.apply(middlewares.ensureType, req, res),
            async.apply(middlewares.validateJson(registerContextTemplate)),
            async.apply(inspectUrl),
            async.apply(ngsi.registerRegisteryPayload),
            async.apply(proxy.sendRequest),
            async.apply(ngsi.setRegistrationId),            
        ], function(error, req, resp){
            if(error)
                next(error);          
        });
    } else if(req.path.toLowerCase().match(/\/(v1|ngsi10|)\/querycontext$/)){        
        async.waterfall([
            async.apply(middlewares.ensureType, req, res),
            async.apply(middlewares.validateJson(queryContextTemplate)),
            async.apply(inspectUrl),
            async.apply(ngsi.handleQuery)           
        ], function(error, req, resp){
            if(error)
                next(error); 
        });        
    } else {
        async.waterfall([
            async.apply(inspectUrl, req, res),
            async.apply(proxy.sendRequest)
        ], function(error, req, resp){
            if(error)
                next(error); 
        });            
    }
}


exports.extractCBAction = intoTrans(context, extractCBAction);
exports.inspectUrl = intoTrans(context,inspectUrl);
exports.requestUrls = intoTrans(context,requestUrls);
exports.requestUrlParallel = intoTrans(context,requestUrlParallel);