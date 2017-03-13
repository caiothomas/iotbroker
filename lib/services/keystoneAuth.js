'use strict';

var request = require('request'),
    config = require('../commons'),       
    errors = require('../errors'),
    async = require('async'),
    apply = async.apply,
    logger = require('logops'),
    constants = require('../constants'),
    EventEmitter = require('events').EventEmitter,
    //domainModule = require('domain'),
    waitingRequests = new EventEmitter(),
    cacheUtils = require('./cacheUtils'),
    authenticating = false,
    currentToken = null,
    context = {
        op: 'IoTBroker.KeystoneAuth'
    };        

if (config.getConfig().maxQueuedClients) {
    //waitingRequests.setMaxListeners(config.getConfig().maxQueuedClients);
    waitingRequests.setMaxListeners(0);
}

function getKeystoneError(error) {
    var message = 'Unknown';

    if (error.message) {
        message = error.message;
    } else if (error.error && error.error.message) {
        message = error.error.message;
    }
    
    return message;
}
/**
 *
 */
function retrieveUser(req, callback) {
    var userToken = req.headers[constants.AUTHORIZATION_HEADER];

    function processValue(cachedValue, innerCb) {
        if (cachedValue && cachedValue.userId) {
            req.serviceId = cachedValue.serviceId;
            req.domainName = cachedValue.domainName;
            req.userId = cachedValue.userId;

            logger.debug(context, 'User value processed with value: %j', cachedValue);

            innerCb(null, req.userId);
        } else {
            logger.error(context, 'Undefined cache value retrieving user from Keystone for service [%s] and subservice [%s]',
                req.headers[constants.ORGANIZATION_HEADER], req.headers[constants.PATH_HEADER]);

            innerCb(new errors.KeystoneAuthenticationError(503));
        }
    }

    function retrieveRequest(innerCb) {
        var options = {
            url: config.getConfig().authentication.options.protocol + '://' + config.getConfig().authentication.options.host + ':' +
            config.getConfig().authentication.options.port + config.getConfig().authentication.options.authPath,
            method: 'GET',
            json: {},
            headers: {
                'X-Auth-Token': currentToken,
                'X-Subject-Token': userToken
            }
        };

        logger.debug(context, 'Retrieving user from keystone: %j', options);

        request(options, function(error, response, body) {
            /* jshint camelcase: false */
            cacheUtils.get().updating.user[userToken] = false;

            if (body) {
                logger.debug(context, 'Keystone response retrieving user:\n\n %j', body);
            }

            if (error) {
                var message = getKeystoneError(error);

                logger.error(context, 'Error connecting Keystone for user retrieving: %s', message);
                innerCb(new errors.KeystoneAuthenticationError(message));
            } else if (response.statusCode === 401) {
                currentToken = null;
                logger.error(context, 'Invalid PEP token: %s', currentToken);
                innerCb(new errors.PepProxyAuthenticationRejected(401));
            } else if (response.statusCode === 200) {
                var cachedValue;

                logger.debug(context, 'User response from Keystone: \n%j\n\n', body);

                if (body.token && body.token['OS-TRUST:trust'] && body.token.project) {
                    req.trustData = body.token['OS-TRUST:trust'];
                    req.trustData.project = body.token.project;
                    cachedValue = {
                        domainName: body.token.project.domain.name,
                        serviceId: body.token.project.domain.id,
                        userId: body.token['OS-TRUST:trust'].trustor_user.id
                    };

                    innerCb(null, cachedValue);

                } else if (body.token && body.token.user && body.token.user.domain &&
                    body.token.user.domain.id && body.token.user.id) {

                    cachedValue = {
                        domainName: body.token.user.domain.name,
                        serviceId: body.token.user.domain.id,
                        userId: body.token.user.id
                    };

                    req.userData = cachedValue;
                    
                    cacheUtils.get().data.user.set(userToken, cachedValue, function(error) {
                        logger.debug('Value [%j] saved in the cache for token [%s](%s)', cachedValue, userToken, error);

                        innerCb(null, cachedValue);
                    });

                } else {
                    logger.error(context, 'Right response from Keystone without all the needed data:\n%s',
                        JSON.stringify(body, null, 4));

                    innerCb(new errors.KeystoneAuthenticationError(500));
                }
            } else if (response.statusCode === 404) {
                currentToken = null;
                logger.error(context, 'Invalid user token: %s', currentToken);
                innerCb(new errors.KeystoneAuthenticationRejected(401));
            } else {
                currentToken = null;
                logger.error(context, 'User extraction from Keystone rejected with code %s', response.statusCode);
                logger.debug(context, 'Error payload: \n%j\n\n', body);
                innerCb(new errors.KeystoneAuthenticationError(500));
            }
        });
    }
    cacheUtils.cacheAndHold('user', userToken, retrieveRequest, processValue, callback);
}

/**
 *  Express middleware for authentication of the PEP Proxy against Keystone. The username and password of the PEP
 *  proxy are taken from the config.js file; the domain (service) and project name (subservice) are taken from the
 *  fiware-service and fiware-servicepath headers (extracted in previous middlewares).
 */
function authenticate(req, res, next) {
    if (authenticating) {
        logger.error('authenticating');
       waitingRequests.on('token', next);
    } else if (currentToken === null) {
        var options = {
            url: config.getConfig().authentication.options.protocol + '://' + config.getConfig().authentication.options.host + ':' +
            config.getConfig().authentication.options.port + config.getConfig().authentication.options.authPath,
            //url: 'http://localhost/orion/token.php',            
            method: 'POST',
            json: {
                auth: {
                    identity: {
                        methods: [
                            'password'
                        ],
                        password: {
                            user: {
                                domain: {
                                    name: config.getConfig().authentication.domainName
                                },
                                name: config.getConfig().authentication.user,
                                password: config.getConfig().authentication.password
                            }
                        }
                    },
                    scope: {
                        domain: {
                            name: config.getConfig().authentication.domainName
                        }
                    }
                }
            }
        };

        authenticating = true;
        waitingRequests.removeAllListeners('token');
        waitingRequests.addListener('token', next);

        logger.debug(context, 'context, Authenticating PEP Proxy against Keystone: %j', options);

        request(options, function(error, response, body) {
            authenticating = false;

            if (body) {
                logger.debug(context, 'Keystone response authenticating PEP:\n\n %j', body);
            }

            if (error) {
                var message = getKeystoneError(error);
                logger.error(context, 'Error connecting Keystone for PEP Proxy authentication: %s', message);
                waitingRequests.emit('token', new errors.KeystoneAuthenticationError(message));
            } else if (response.statusCode === 201 && response.headers['x-subject-token']) {
                logger.debug(context, 'Authentication of the PEP Proxy to keystone success: \n%j\n\n', body);
                req.token = response.headers['x-subject-token'];
                currentToken = req.token;
                waitingRequests.emit('token', null);
            } else if (response.statusCode === 404 || response.statusCode === 401) {
                logger.error(context, 'Authentication against Keystone rejected with code %s', response.statusCode);
                waitingRequests.emit('token', new errors.PepProxyAuthenticationRejected(response.statusCode));
            } else {
                logger.error(context, 'Authentication error trying to authenticate the PEP Proxy: %s', error);
                logger.debug(context, 'Error payload: \n%j\n\n', body);
                waitingRequests.emit('token', new errors.KeystoneAuthenticationError(500));
            }

            waitingRequests.removeAllListeners('token');
        });
    } else {
        next();
    }
}

/**
 * Middleware that authenticates the user token against keystone and retrieved all the information needed. It retrieves
 * the roles associated to an authenticated user from Keystone, and retrieves the ID of the project. This function
 * will extract less information (will not call for the roles nor the subserviceIf) if the validation is disabled.
 */
function extractRoles(req, res, next) {
    var sequence;

    if (config.getConfig().access.disable) {
        sequence = [
            async.apply(retrieveUser, req)];

        if (config.getConfig().authentication.enable) {
           // sequence.push(async.apply(validateUserHeaders, req));
        }

    } else {
        sequence = [
            async.apply(retrieveUser, req),
            async.apply(validateUserHeaders, req),
            async.apply(retrieveSubserviceId, req),
            async.apply(retrieveRoles, req)
        ];
    }
    
    logger.debug(context, 'extractRoles');

    async.series(sequence, function(error, result) {
       if (error) {
           next(error);
       } else if (!result || result.length === 0) {
           next(new errors.KeystoneAuthenticationError(req.headers[constants.PATH_HEADER]));
       } else {
           req.roles = result[3];
           next();
       }
    });
}

/**
 * Extract the roles list from Keystone's response. If the subservice is "/", the appropriate roles will be those with
 * domain scope, and those with project scope otherwise. As a side effect, this function caches the results, so the
 * next few calls to Keystone can be skipped.
 *
 * @param {String} rawBody               String representation of the JSON response.
 * @param {String} service               UUID of the service.
 * @param {String} subservice            Name of the subservice.
 * @param {String} cacheKey              Key of the cache where the value will be stored.
 * @return {Array}                       A list of strings containing the role IDs.
 */
function getRolesFromResponse(rawBody, service, subservice, cacheKey) {
    /* jshint camelcase: false */

    var body = JSON.parse(rawBody),
        roles = [];

    logger.debug('Getting roles from response for service [%s] and subservice [%s]', service, subservice);

    for (var i = 0; i < body.role_assignments.length; i++) {
        logger.debug('Checking role assignment:\n%j\n', body.role_assignments[i]);

        if (subservice === '/') {
            if (body.role_assignments[i].scope &&
                body.role_assignments[i].scope.domain &&
                String(body.role_assignments[i].scope.domain.id) === String(service)) {
                logger.debug('Role assignment [%s] accepted', body.role_assignments[i].role.id);
                roles.push(body.role_assignments[i].role.id);
            }
        } else {
            if (body.role_assignments[i].scope &&
                body.role_assignments[i].scope.project &&
                String(body.role_assignments[i].scope.project.id) === String(subservice)) {
                logger.debug('Role assignment [%s] accepted', body.role_assignments[i].role.id);
                roles.push(body.role_assignments[i].role.id);
            }
        }
    }

    logger.debug('Extracted roles: \n%j\n', roles);

    cacheUtils.get().data.roles.set(cacheKey, roles);

    return roles;
}

/**
 * Get all the roles in the subservice for the user, given the PEP Token and the user ID.
 *
 * @param {Object} req               Request the proxy is processing.
 */
function retrieveRoles(req, callback) {
    var userId = req.userId,
        subserviceId = req.subserviceId,
        cacheKey = userId + ':' + subserviceId;

    function processValue(cachedValue, innerCb) {
        innerCb(null, cachedValue);
    }

    function retrieveRequest(innerCb) {
        var options = {
            url: config.authentication.options.protocol + '://' + config.authentication.options.host + ':' +
            config.authentication.options.port + config.authentication.options.path,
            method: 'GET',
            qs: {
                'user.id': req.userId,
                'effective': true
            },
            headers: {
                'X-Auth-Token': currentToken
            }
        };

        logger.debug('Extracting roles for token: %j', options);

        request(options, function retrieveRolesHandler(error, response, body) {
            cacheUtils.get().updating.roles[cacheKey] = false;

            if (body) {
                logger.debug('Keystone response retrieving roles:\n\n %j', body);
            }

            if (error) {
                var message = getKeystoneError(error);
                logger.error('Error connecting Keystone for role retrieving: %s', message);
                innerCb(new errors.KeystoneAuthenticationError(message));
            } else if (response.statusCode === 401) {
                currentToken = null;
                logger.error('Invalid token: %s', currentToken);
                innerCb(new errors.PepProxyAuthenticationRejected(401));
            } else if (response.statusCode === 200) {
                logger.debug('Roles response from Keystone: \n%j\n\n', body);
                innerCb(null, getRolesFromResponse(response.body, req.serviceId, req.subserviceId, cacheKey));
            } else {
                currentToken = null;
                logger.error('Role extraction from Keystone rejected with code %s', response.statusCode);
                logger.debug('Error payload: \n%j\n\n', body);
                innerCb(new errors.KeystoneAuthenticationError(500));
            }
        });
    }

    cacheUtils.cacheAndHold('roles', cacheKey, retrieveRequest, processValue, callback);
}

/**
 * Send a request to Keystone to get the UUID corresponding to the subservice name caught from the fiware-servicepath
 * header.
 *
 * @param {Object} req               Request the proxy is processing.
 */
function retrieveSubserviceId(req, callback) {
    /* jshint camelcase: false */
    var domainId = req.serviceId,
        subserviceName = req.headers[constants.PATH_HEADER],
        cacheKey = domainId + subserviceName;

    function processValue(cachedValue, innerCb) {
        if (cachedValue && cachedValue.subserviceId) {
            req.subserviceId = cachedValue.subserviceId;

            innerCb(null, req.subserviceId);
        } else {
            logger.error('Undefined cache value retrieving subserviceId for service [%s] and subservice [%s]',
                req.headers[constants.ORGANIZATION_HEADER], req.headers[constants.PATH_HEADER]);

            innerCb(new errors.KeystoneAuthenticationError(503));
        }
    }

    function retrieveRequest(innerCb) {
        var options = {
            url: config.authentication.options.protocol + '://' + config.authentication.options.host + ':' +
            config.authentication.options.port + '/v3/projects',
            method: 'GET',
            headers: {
                'X-Auth-Token': currentToken
            },
            qs: {
                domain_id: domainId,
                name: subserviceName
            },
            json: {}
        };

        logger.debug('Retrieving subservice ID from keystone: %j', options);

        request(options, function(error, response, body) {
            cacheUtils.get().updating.subservice[cacheKey] = false;

            if (body) {
                logger.debug('Keystone response retrieving subservice ID:\n\n %j', body);
            }

            if (error) {
                var message = getKeystoneError(error);

                logger.error('Error connecting Keystone for subservice ID retrieving: %s', message);
                innerCb(new errors.KeystoneAuthenticationError(message));
            } else if (!body || !body.projects || body.projects.length === 0) {
                logger.error('Couldn\'t find subservice id in Keystone with name %s', subserviceName);
                innerCb(new errors.KeystoneSubserviceNotFound(subserviceName));
            } else if (response.statusCode === 401) {
                currentToken = null;
                logger.error('Invalid PEP Proxy token: %s', currentToken);
                innerCb(new errors.PepProxyAuthenticationRejected(401));
            } else if (response.statusCode === 200) {
                var project;

                for (var i = 0; i < body.projects.length; i++) {
                    if (body.projects[i].name === subserviceName) {
                        project = body.projects[i];
                    }
                }

                if (project) {
                    var cachedValue = {
                        subserviceId: project.id
                    };

                    logger.debug('Subservice body response from Keystone: \n%j\n\n', body);
                    cacheUtils.get().data.subservice.set(cacheKey, cachedValue);

                    innerCb(null, cachedValue);
                } else {
                    logger.error('Couldn\'t find subservice id in Keystone with name %s', subserviceName);
                    innerCb(new errors.KeystoneSubserviceNotFound(subserviceName));
                }
            } else {
                currentToken = null;
                logger.error('Subservice ID retrieval from Keystone rejected with code %s. Invalidating token.',
                    response.statusCode);

                logger.debug('Error payload: \n%j\n\n', body);

                innerCb(new errors.KeystoneAuthenticationError(500));
            }
        });
    }

    if (subserviceName === '/') {
        req.subserviceId = '/';
        callback(null, '/');
    } else {
        cacheUtils.cacheAndHold('subservice', cacheKey, retrieveRequest, processValue, callback);
    }
}

function validateUserHeaders(req, callback) {
    if (req.domainName && req.headers['fiware-service'] === req.domainName) {
        callback();
    } else {
        currentToken = null;

        logger.error('Authentication rejected: the token does not match the service');
        callback(new errors.TokenDoesNotMatchService(401));
    }
}

function authenticate2(req, res, next) {
    if (authenticating) {
        logger.error('authenticating');
       waitingRequests.on('token', next);
    } else if (currentToken === null) {        
        authenticating = true;
        waitingRequests.removeAllListeners('token');
        waitingRequests.addListener('token', next);

        logger.debug(context, 'context, Authenticating PEP Proxy against Keystone:');
        currentToken ="test";
        logger.error(context, 'Error connecting Keystone for PEP Proxy authentication: %s');
        waitingRequests.emit('token', new errors.KeystoneAuthenticationError("teste erro!!"));
        waitingRequests.removeAllListeners('token');
        
    } else {
        next();
    }
}

/**
 * Performs the authentication process. The authentication will perform the optional authentication (will be skipped if
 * the currentToken token is not null. If the authenticaiton succeeds, the roles for the user will be extracted. If
 * there is any problem related with the authentication in the role extraction process, the current token is
 * invalidated.
 *
 * If there is any error contacting with Keystone, the process is retried n times (where n is defined in the config
 * file).
 */
function authenticationProcess(req, res, next) {
    var retries = config.getConfig().authentication.retries || 3,
        attempts = 0;
    
    function processFlow(callback) {
        async.series([
            apply(authenticate2, req, res),
           // apply(extractRoles, req, res)
        ], callback);
    }

    function retry(error, result) {
        if (error && error.name === 'PEP_PROXY_AUTHENTICATION_REJECTED' && attempts < retries) {
            logger.debug(context, 'Authentication attempt number %d failed. Retrying.', attempts);
            attempts++;
            process.nextTick(processFlow.bind(null, retry));
        } else if (error) {
            logger.error(context, 'Error connecting to Keystone authentication: %s', error);
            next(error);
        } else {
            logger.debug(context, 'Authentication success after %d attempts', attempts);
            next(null, result);
        }
    }

    processFlow(retry);
}

/**
 * Invalidates the current authentication token.
 */
function invalidateToken(callback) {
    currentToken = null;

    if (callback) {
        callback();
    }
}

exports.process = authenticationProcess;