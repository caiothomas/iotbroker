/*
 * Copyright 2014 Telefonica Investigación y Desarrollo, S.A.U
 *
 * This file is part of fiware-pep-steelskin
 *
 * fiware-pep-steelskin is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * fiware-pep-steelskin is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with fiware-pep-steelskin.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with::[iot_support@tid.es]
 */

'use strict';

var request = require('request'),
    config = require('../commons'),     
    errors = require('../errors'),
    fs = require('fs'),
    path = require('path'),       
    logger = require('logops'),
    async = require('async'),
    cacheUtils = require('./cacheUtils'),        
    apply = async.apply,
    constants = require('../constants'),   
    context = {
        op: 'IoTBroker.FiguardianAuth'
    };  

function retrieveUser(req, callback){
    var userToken = req.headers[constants.AUTHORIZATION_HEADER]
    
    function processValue(cachedValue, innerCb) {
        if (cachedValue && cachedValue.subject) {
 
           logger.debug('User value processed with value: %j', cachedValue);

            innerCb(null, req.subject);
        } else {
            logger.error('Undefined cache value retrieving user from Keystone for service [%s] and subservice [%s]',
                req.headers[constants.ORGANIZATION_HEADER], req.headers[constants.PATH_HEADER]);

            innerCb(new errors.KeystoneAuthenticationError(503));
        }
    }
    
    function retrieveRequest(innerCb) {
        var options = {
            url: config.getConfig().authentication.options.protocol  + config.getConfig().authentication.options.host + ':' +
                config.getConfig().authentication.options.port + config.getConfig().authentication.options.path,
            method: 'GET',
            qs: {
                'access_token': userToken
            }
        };
        
        if(config.getConfig().figuardian.ssl && config.getConfig().figuardian.ssl.active == true){      
            if(config.getConfig().figuardian.ssl.keyFile)        
                options.key = fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.keyFile));
            if(config.getConfig().figuardian.ssl.certFile)                
                options.cert = fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.certFile));          
            if(config.getConfig().figuardian.ssl.rejectUnauthorized)                
                options.rejectUnauthorized = (config.getConfig().figuardian.ssl.rejectUnauthorized == true ) ? true : false;                
            if(config.getConfig().figuardian.ssl.ca)
                options.ca =  fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.ca));                       
        }            

        logger.debug('Retrieving user from Figuardian %j', options, null, 4);

        request(options, function(error, response, body) {
            cacheUtils.get().updating.user[userToken] = false;
            var cachedValue;
            
            if (error) {
                logger.error(context, 'Error connecting the Figuardian for authentication: %s', error.message);
                innerCb(new errors.KeystoneAuthenticationError(error));                
            } else if (response.statusCode === 201) {
                cachedValue = {
                    subject: response.headers['x-subject-token']
                };
                
                logger.debug(context, 'Request response from the Figuardian: \n%j\n\n', cachedValue);

               cacheUtils.get().data.user.set(userToken, cachedValue, function(error) {
                    logger.debug('Value [%j] saved in the cache for token [%s](%s)', cachedValue, userToken, error);

                    innerCb(null, cachedValue);
                });                
            } else {
                logger.error(context, 'Invalid user token %s', response.statusCode);
                logger.debug(context, 'Error payload: \n%j\n\n', body);
                innerCb(new errors.KeystoneAuthenticationRejected(response.statusCode));                
            }
        });
        
    }
    
    cacheUtils.cacheAndHold('user', userToken, retrieveRequest, processValue, callback);    
}

function authenticate(req, res, next) {    
    async.series([
            async.apply(retrieveUser, req),
        ], function(error, result) {
       if (error) {
           next(error);
       } else if (!result || result.length === 0) {
           next(new errors.KeystoneAuthenticationError(req.headers[constants.PATH_HEADER]));
       } else {
           next();
       }
    });
    
}

function authenticationProcess(req, res, next) {
    var retries = config.getConfig().authentication.retries || 3,
        attempts = 0;

    function processFlow(callback) {
        async.series([
            apply(authenticate, req, res),
        ], callback);
    }

    function retry(error, result) {
        if (error && error.name === 'PEP_PROXY_AUTHENTICATION_REJECTED' && attempts < retries) {
            logger.debug(context, 'Authentication attempt number %d failed. Retrying.', attempts);
            attempts++;
            process.nextTick(processFlow.bind(null, retry));
        } else if (error) {
            logger.error(context, '[VALIDATION-GEN-003] Error connecting to Keystone authentication: %s', error);
            next(error);
        } else {
            logger.debug(context, 'Authentication success after %d attempts', attempts);
            next(null, result);
        }
    }

    processFlow(retry);
}

exports.process = authenticationProcess;