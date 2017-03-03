'use strict';

var config = require('../../config'),
    request = require('request'),
    constants = require('../constants'),
    errors = require('../errors'),    
    logger = require('logops'),
    intoTrans = require('../common/domains').intoTrans,        
    packageInformation = require('../../package.json'),        
    validationHeaders = [
        'fiware-service',
        'fiware-servicepath'
    ],
    authorizationHeaders = [
        'fiware-service',
        'fiware-servicepath',        
        'x-auth-token'
    ],
    context = {
        op: 'IoTBroker.Proxy'
    };    

/**
 * Middleware to extract the organization data from the request.
 *
 * @param {Object} req           Incoming request.
 * @param {Object} res           Outgoing response.
 * @param {Function} next        Call to the next middleware in the chain.
 */
function extractOrganization(req, res, next) {
    if (req.headers[constants.ORGANIZATION_HEADER]) {
        req.organization = req.headers[constants.ORGANIZATION_HEADER];
        req.service = req.headers[constants.ORGANIZATION_HEADER];
        req.subService = req.headers[constants.PATH_HEADER];
        next();
    } else {
        logger.error(context, 'Organization headers not found');
        next(new errors.MissingHeaders("fiware-service/fiware-servicepath"));
    }
}

/**
 * Redirects the incoming request to the proxied host. The request is not read with a pipe, as it has been completely
 * read to guess its type.
 *
 * @param {Object} req           Incoming request.
 * @param {Object} res           Outgoing response.
 * @param {Function} next        Invokes the next middleware in the chain.
 */
function sendRequest(req, res, callback) {
    var options = {
        uri: 'http://' + config.resource.original.host + ':' + config.resource.original.port + req.path,
        qs: req.query,
        method: req.method,
        headers: req.headers
    };
    
    if (!options.headers[constants.X_FORWARDED_FOR_HEADER] && req.connection.remoteAddress) {
        options.headers[constants.X_FORWARDED_FOR_HEADER] = req.connection.remoteAddress;
    }

    if (req.is('*/json')) {
        options.body = JSON.stringify(req.body);
    } else {
        options.body = req.rawBody;
    }
    
    delete options.headers['content-length'];
    options.headers.connection = 'close';

    res.oldWriteHead = res.writeHead;
    res.writeHead = function(statusCode, reasonPhrase, headers) {
        if (res._headers['transfer-encoding']) {
            delete res._headers['transfer-encoding'];
        }

        res.oldWriteHead(statusCode, reasonPhrase, headers);
    };

    logger.debug('Forwarding request:\n\n%j\n', options);
    
    request(options, function (error, response, body){            
            if(error || !body){
                logger.error(context, 'Error forwarding the request to target proxy: Request error connecting to the server.');
                callback(new errors.TargetServerError("Request error connecting to the server."));    
                return;
            } 
            logger.debug(context, 'Body from request:', body);       
            response.entity = body;  
            callback(null, req, response);
    }).on('error', function handleConnectionError(e) {
            logger.error(context, 'Error forwarding the request to target proxy: %s', e.message);

            if (config.dieOnRedirectError) {
                logger.fatal(context, 'Configured to die upon error in a redirection. Stopping process.');

                process.exit(-1);
            } else {
                callback(new errors.TargetServerError(e.message));
            }                
    }).pipe(res);
}

/**
 * This function create Options to request list of Url.
 * @param {Array} urlList           List of Url to request.
 * @return {Array} requestUrl       List of url with options.
 */
function createOptions(urlList, req, callback){
    var requestUrl = []; 
    
    if(!urlList)
        callback(null, requestUrl);
    
    var path = req.path;
    
    if(req.path == "//updateContext")
        path = "/v1/updateContext";
    else if(req.path == "//queryContext")
        path = "/v1/queryContext";
        
        logger.debug(context, 'url:', urlList);        
        for(var key in urlList){
            var requestOptions = {
                        uri: urlList[key] +  path, //req.path,
                        qs: req.query,
                        method: req.method,
                        headers: req.headers
            };   
            

            if (req.is('*/json')) {
                requestOptions.body = JSON.stringify(req.body);
            } else {
                requestOptions.body = req.rawBody;
            }                
            
            requestOptions.headers['user-agent'] = packageInformation.name + '/' + packageInformation.version; 
            delete requestOptions.headers['content-length'];
            requestUrl.push(requestOptions);            
        }
    logger.debug(context, '*** requestUrl *** :', requestUrl);         
    
    callback(null, requestUrl);            
}

function extractUserId(req, res, next) {
    if (req.headers[constants.AUTHORIZATION_HEADER]) {
        req.userId = req.headers[constants.AUTHORIZATION_HEADER];
        next();
    } else {
        logger.error(context, 'User ID headers not found');
        next(new errors.UserNotFound());
    }
}

/**
 * Generates a middleware that checks for the pressence of the mandatory headers passed as a parameter, returning a
 * MISSING_HEADERS error if any one is not found.
 *
 * @param {Array} mandatoryHeaders      List of headers to check.
 * @return {Function}                  An express middleware that checks for the presence of the headers.
 */
function checkMandatoryHeaders(mandatoryHeaders) {
    return function(req, res, next) {
        var missing = [];
        
        for (var i = 0; i < mandatoryHeaders.length; i++) {
            if (!req.headers[mandatoryHeaders[i]] || req.headers[mandatoryHeaders[i]].trim() === '') {
                missing.push(mandatoryHeaders[i]);
            }
        }

        if (missing.length !== 0) {
            next(new errors.MissingHeaders(JSON.stringify(missing)));
        } else {
            next();
        }
    };
}

exports.extractOrganization = intoTrans(context, extractOrganization);
exports.sendRequest = intoTrans(context, sendRequest);
exports.checkMandatoryHeaders = intoTrans(context, checkMandatoryHeaders(validationHeaders));
exports.checkAuthorizationHeader = intoTrans(context, checkMandatoryHeaders(authorizationHeaders));
exports.createOptions = intoTrans(context, createOptions);
exports.extractUserId = intoTrans(context, extractUserId);