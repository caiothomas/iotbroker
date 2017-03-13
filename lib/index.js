'use strict';

var http = require('http'),
    https = require('https'),    
    fs = require('fs'),
    express = require('express'),
    config = require('../config'),
    domainUtils = require('./common/domains'),    
    genericMiddleware = require('./common/genericMiddleware'),
    proxy = require('./middleware/proxy'),
    adminMiddleware = require('./middleware/administration'),    
    entityProvisioning = require('./northbound/entityProvisioningServer'),        
    orion = require('./plugins/orionPlugin'),
    logger = require('logops'),
    ngsi = require('./ngsi/ngsi'),    
    key = require('./services/keystoneAuth'),    
    async = require('async'),
    cacheUtils = require('./services/cacheUtils'),        
    context = {
        op: 'IoTBroker.Index'
    };        


/**
 * This function creates a middleware that executes the current list of dynamic middlewares configured after the proxy
 * has been started.
 *
 * @return {Function}           Express middleware that executes the dynamic middlewares.
 */
function createDynamicMiddlewareExecutor(proxyObj) {
    return function dynamicMiddlewareExecutor(req, res, next) {
        var middlewareList = proxyObj.middlewares.slice(0);

        if (middlewareList.length > 0) {
            middlewareList[0] = async.apply(proxyObj.middlewares[0], req, res);
            async.waterfall(middlewareList, next);
        } else {
            next();
        }
    };
}


//erros do json: se for de sintexe eh disparado erro
function transformSystemErrors(error, req, res, next) {
    if (error.name === 'SyntaxError' || error.message === 'invalid json') {
        next(new errors.WrongJsonPayload());
    } else {
        next(error);
    }
}

function initializeProxy(proxyObj, callback){
    proxyObj.proxy = express();

    proxyObj.proxy.set('port', config.resource.broker.port);
    proxyObj.proxy.set('host', '0.0.0.0');
    proxyObj.proxy.use(express.json());//faz parse json
   // proxyObj.proxy.use(domainUtils.requestDomain);
        
    if (config.logLevel && config.logLevel === 'DEBUG') {
       proxyObj.proxy.use(genericMiddleware.traceRequest);
    }
    
    proxyObj.proxy.use(proxy.extractOrganization);    
    
    if (config.authentication && config.authentication.enable) {
       // proxyObj.proxy.use(proxy.checkAuthorizationHeader);        
       // proxyObj.proxy.use(key.process);        
        //proxyObj.proxy.use(proxy.extractUserId);        
    } else {
        proxyObj.proxy.use(proxy.checkMandatoryHeaders);        
    }
    
    proxyObj.proxy.use(proxyObj.proxy.router);
    entityProvisioning.loadContextRoutes(proxyObj.proxy);    
    
    //recupera fiware-service
    //proxyObj.proxy.use(proxy.extractOrganization);    
    //proxyObj.proxy.use(orion.extractCBAction);
    proxyObj.proxy.use(createDynamicMiddlewareExecutor(proxyObj));    
    
    proxyObj.proxy.use(genericMiddleware.handleError);
    proxyObj.proxy.use(transformSystemErrors);    
            
    if (config.ssl.active) {
        var sslOptions = {
            key: fs.readFileSync('../' + config.ssl.keyFile),
            cert: fs.readFileSync('../' + config.ssl.certFile),            
            requestCert: (config.ssl.requestCert == true ) ? true : false,
            rejectUnauthorized: (config.ssl.rejectUnauthorized == true ) ? true : false
        };
        
        if(config.ssl.ca)
            sslOptions['ca'] = fs.readFileSync('../' + config.ssl.ca);            

    logger.info(context, 'config.ssl', config.ssl);
        
        proxyObj.server = https.createServer(sslOptions, proxyObj.proxy);
    } else {
        proxyObj.server = http.createServer(proxyObj.proxy);
    }
    
    proxyObj.server.listen(proxyObj.proxy.get('port'), proxyObj.proxy.get('host'), function startServer(error) {
        if (error) {
            logger.error(context, 'Error initializing proxy: ' + error.message);

            callback(error);
        } else {
            logger.info(context, 'Proxy listening on port %d', config.resource.broker.port);
            logger.info(context, 'Redirecting to host %s and port %d', config.resource.original.host, config.resource.original.port);
            callback(null, proxyObj);        
        }
    });
}


/**
 * Initializes the administration server. It fills the proxyObj with information about the started proxy and passes
 * it along.
 *
 * @param {Object} proxyObj         Running data of the whole proxy application.
 */
function initializeAdmin(proxyObj, callback) {
    proxyObj.administration = express();

    proxyObj.administration.set('port', config.resource.broker.adminPort);
    proxyObj.administration.set('host', '0.0.0.0');
    proxyObj.administration.use(express.json());
    proxyObj.administration.use(express.urlencoded());
    //proxyObj.administration.use(domainMiddleware);
        
    proxyObj.administration.use(proxyObj.administration.router);
    adminMiddleware.loadContextRoutes(proxyObj.administration);

    if (config.ssl.active) {
        var sslOptions = {
            key: fs.readFileSync('../' + config.ssl.keyFile),
            cert: fs.readFileSync('../' + config.ssl.certFile)
        };
        proxyObj.adminServer = https.createServer(sslOptions, proxyObj.administration);
    } else {
        proxyObj.adminServer = http.createServer(proxyObj.administration);
    }

    proxyObj.administration.use(genericMiddleware.handleError);
    proxyObj.administration.use(transformSystemErrors);        
    
    proxyObj.adminServer.listen(
        proxyObj.administration.get('port'),
        proxyObj.administration.get('host'), function startServer(error) {

        if (error) {
            logger.error(context, 'Error initializing administration server: ' + error.message);

            callback(error);
        } else {
            logger.info(context, 'Administration service listening on port %d', config.resource.broker.adminPort);
            
            logger.info(context, 'Proxy Administration started');
            callback(null, proxyObj);
            
            /*
            validation.init(function initValidation(loadingError) {
                logger.info('Administration service started');
                callback(loadingError, proxyObj);
            });*/
        }
    });
}

function startProxy(proxyObj, callback) {
    logger.setLevel(config.logLevel);
    logger.format = logger.formatters.pipe;

    logger.info(context, 'Creating proxy');
    
    cacheUtils.create();
    
    async.waterfall([
        async.apply(initializeProxy, proxyObj),
        async.apply(initializeAdmin)
    ], callback);    
}

/**
 * Stops the proxy passed as a parameter.
 *
 * @param {Object} proxy         The proxy object as it was returned in the creation callback (this is not the proxy
 *                               field of the returned object, but the whole object).
 */
function stopProxy(proxy, callback) {
    logger.info(context, 'Stop proxy');

    proxy.server.close();
}

exports.start = startProxy;
exports.stop = stopProxy;
