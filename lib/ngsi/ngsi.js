'use strict';

var logger = require('logops'),
    middlewares = require('../common/genericMiddleware'),
    request = require('request'),    
    errors = require('../errors'),    
    config = require('../commons'), 
    entityService = require('../entity/entityService'),              
    orion = require('../plugins/orionPlugin'),
    proxy = require('../middleware/proxy'),     
    jp = require('jsonpath'),    
    _ = require('underscore'),
    intoTrans = require('../common/domains').intoTrans,    
    DOMParser = require('xmldom').DOMParser,
    packageInformation = require('../../package.json'),    
    async = require('async'),        
    apply = async.apply,        
    fs = require('fs'),         
    registerContextTemplate = require('../templates/registerContext.json'),        
    updateContextTemplate = require('../templates/updateContext.json'),
    updateContextTemplateV2 = require('../templates/updateContextV2.json'),        
    queryContextTemplate = require('../templates/queryContext.json'),
    notificationTemplate = require('../templates/notificationTemplate.json'),        
    context = {
        op: 'IoTBroker.NGSI'
    };


function registerRegisteryPayload(req, resp, callback){
    
    var doc = req.body;    
    var duration = extractDuraction(doc);
    var service = req.headers['fiware-service'];
    var subservice = req.headers['fiware-servicepath'];
                
    function extractContextRegistrations(doc, callback) {
            logger.debug(context, 'Extract context');
    
        var contextRegistrations = jp.query(doc, '$.contextRegistrations[*]');    
        var contextElements = [];
        
        for (var i = 0; i < contextRegistrations.   length; i++) {
            contextElements.push(contextRegistrations[i]);
        }

        async.map(contextElements, extractNodeJs, function(error, entitysObj){
            req.entity = _.flatten(entitysObj);  
            callback(null, req.entity);            
        });         
    }    
    
    function extractNodeJs(contextElements, callback){
        var entities = jp.query(contextElements, '$.entities[*]');
        var provider = jp.query(contextElements, '$.providingApplication');
                    
        var result = [];
        for(var key  in entities) {
            var value = entities[key];
            var url =  provider[0];            
           
            var entity = {
                "type" : value.type,
                "isPattern" : value.isPattern,
                "id" : value.id,
                "providingApplication" : middlewares.ensureHttp(url), 
                "duration" : duration
            };    
            
            //change the address the providingAplication
            contextElements['providingApplication'] = middlewares.ensureHttp(config.getConfig().resource.broker.host) + ":" +config.getConfig().resource.broker.port;

            logger.debug(context, 'Entity', entity);
            result.push(entity);
        }
                      
        callback(null, result);
    }
    
    function extractDuraction(doc) {
        var duration = jp.query(doc, '$.duration');    

        if (duration.length !== 1) {
            duration = 'P1M';
        }
    
        logger.debug(context, 'duracao : %s', duration);
        return duration[0];
    }
    
    /**
     * Check if has registrationId in the post. If has is removed the entity with the registrationId.
     */
    function extractRegistrationId(doc, callback) {
        var registrationId = jp.query(doc, '$.registrationId');    
       // logger.debug(context, 'doc : %s', JSON.stringify(doc));                    

        //existe elemento
        if (registrationId.length >= 1) {
            logger.debug(context, 'registrationId **: %s', registrationId);                    
            entityService.removeEntityRegistration(registrationId, service, subservice, callback);            
        }
        
        logger.debug(context, 'registrationId ^^^: %s', registrationId); 
        callback(null);
    }
            
    async.parallel([
        async.apply(extractRegistrationId, doc),
        async.apply(extractContextRegistrations, doc)
    ], function(error, response){
        if(error){
            logger.debug(context, new errors.BadRequest('Error parsing JSON at register.'));
        } 
        logger.debug(context, "response ", response);        
    });
    
    callback(null, req,resp);
    return;
}

/**
 * This function storage the Entity with the result registrationId from Orion.
 * The object with Entity is storage in req.
 */
function setRegistrationId(req, resp, next){    
    var service = req.headers['fiware-service'];
    var subservice = req.headers['fiware-servicepath'];
                
    var registrationIdResponse = JSON.parse(resp.body);      
    
    if(req.entity && registrationIdResponse.hasOwnProperty('registrationId')){
        for(var i=0; i< req.entity.length; i++){
            var elem = req.entity[i];
            elem.registrationId = registrationIdResponse.registrationId;
            if(!registrationIdResponse.hasOwnProperty('errorCode')){
                entityService.store(elem, service, subservice, function(error, result){
                    if(result)
                        logger.debug(context, "Saved the Registration ID in Entityid [%s] and type [%s].", result.id, result.type);                                        
                });    
            }
        }
    }
}


function combineContextElement(data, callback){
    
    function extractEntity(contextElement){
        var entity =  {
                id: contextElement.id,
                isPattern: (contextElement.isPattern == "true") ?  "true" : "false",
                type: contextElement.type,
                attributes: contextElement.attributes
        };  
        
        return entity;        
    }
    
    function merge(output, obj){
        var find = false;        
        
        for(var key in output){
            logger.error(context, 'output[key]', output[key]);                                                   
            if(output[key].hasOwnProperty('id') && output[key].hasOwnProperty('type')){
                if(output[key].id == obj.id && output[key].type == obj.type && output[key].isPattern == obj.isPattern){
                    if(Array.isArray(output[key].attributes)){
                        //output[key].attributes = output[key].attributes.concat(obj.attributes);                          
                        output[key].attributes= _.extend(output[key].attributes, obj.attributes)
                      //  logger.error(context, 'concatena', output[key].attributes);                                       
                    }                                    
                    find = true;                                 
                }
                logger.error(context, 'existe objeto');                                                       
            }
        }
        
        if(find == false){
            output.push(obj);
            logger.error(context, 'find false'); 
        }
        logger.error(context, 'output ', output);                   
        return output;        
    }
    
    function formatResponse(contextElementList){        
        var result = {
            contextResponses: []
        };

        for (var i = 0; i < contextElementList.length; i++) {
            var contextResponse = {
                contextElement: contextElementList[i],
                statusCode: {
                    code: 200,
                    reasonPhrase: 'OK'
                }
            }; 
            result.contextResponses.push(contextResponse);
        }
        return result;    
    }        
    
    function readContextElements(data, callback){
        var output = [];
        
        if(!data){
            callback(new errors.TemplateLoadingError('Error get data to merge Context Element.'));
        }    
        
        for(var c in data){        
           if(data[c]){
                var contextElements = jp.query(JSON.parse(data[c]), '$.contextResponses[*].contextElement');//get reponse context elements 
                for(var k in contextElements){
                    logger.error(context, 'contextElements ',contextElements[k]);                    
                    if(contextElements[k]){                     
                        var entity = extractEntity(contextElements[k]);
                        merge(output, entity);   
                    }
                }               
           }
        }            
        
        logger.error(context, '**output  ', output);                      
        callback(null, output);
    }
    
    async.waterfall([
            apply(readContextElements, data)
    ], function(error, result){
        if(error)
            callback(new errors.TemplateLoadingError('Error to process merge of Context Elements.'));
        if(result)
            callback(null,  JSON.stringify(formatResponse(result)))
    });    
}


function handleRequest(req, entity, callback){

    logger.debug(context, '*** Para cada entity:', entity);
    
    var service = req.headers['fiware-service'];
    var subservice = req.headers['fiware-servicepath'];
    
    entityService.getProviderAplications(entity,service, subservice, function(error, url){        
        async.waterfall([
            apply(proxy.createOptions, url, req),//make a list options of request 
            apply(orion.requestUrls),//Returns a result list of requests
            apply(combineContextElement)//make merge from results
        ], function(error, result) {
                if(error){
                    callback(new errors.ConnectFail('Error to request Providers Aplications.'));
                } else {
                    callback(null, result);                
                }                                     
            });         
    });                       
}


function getContextElements(req, resp, callback){
    var result = [];
    
    var elem = [];
    if(req.body.contextElements)//NGSIv1-09
        elem = req.body.contextElements;
    
    if(req.body.entities)//NGSIv2
        elem = req.body.entities;
        
    for (var i = 0; i < elem.length; i++) {
        var entity = {
                id: elem[i].id,
                isPattern: (elem[i].isPattern == "true") ?  "true" : "false",
                type: elem[i].type
        };
        result.push(entity);
    }  
    
    return result;
}

function handleQuery(req, resp, callback){
        
    var entitys = getContextElements(req, resp);
    logger.debug(context, '*** Para cada entity:', entitys);         
    
    async.map(entitys, function(entitys,callback){       
        handleRequest(this.req, entitys, callback);
    }.bind({
        req: req
    }), function(error, result){
        if(error)
            callback(new errors.ConnectFail('Error to Query.'));
        if(result){
            logger.debug(context, '********************************************? ', result);                                        
            combineContextElement(result, function(error, combine){
                if(error)
                    callback(new errors.TemplateLoadingError('Error to combine Providers Aplications.'));
                
                resp.writeHead(200, {'Content-Type': '*/json'});
                resp.end(JSON.parse(JSON.stringify(combine)));  
                resp.pipe(resp);                               
            });
        }                 
    });
}


function handleUpdate(req, resp, callback){
    logger.debug(context, 'handleUpdate', req.headers['user-agent']); 

    if(req.headers['user-agent'] && req.headers['user-agent'].toLowerCase().match(/orion/)){        
        logger.debug(context, 'Its Orion Request.', req.headers['user-agent']); 
        var entitys = [];
        entitys = getContextElements(req, resp);
        
        logger.debug(context, 'entitys ...', entitys); 
        
        logger.debug(context, '*** Para cada entity:', entitys);         
    
        async.map(entitys, function(entitys,callback){       
            handleRequest(this.req, entitys, callback);
        }.bind({
            req: req
        }), function(error, result){
                if(error)
                    callback(new errors.ConnectFail('Error to Update from Orion to Providers Applications.'));
                if(result){
                    logger.debug(context, '********************************************? ', result);                                        
                    combineContextElement(result, function(error, combine){
                        if(error)
                            callback(new errors.TemplateLoadingError('Error to combine Providers Applications.'));
                            resp.writeHead(200, {'Content-Type': '*/json'});
                            resp.end(JSON.parse(JSON.stringify(combine)));  
                            resp.pipe(resp);                               
                    });
                }            
        });

    } else {
        logger.debug(context, 'Send request Update to Orion'); 
        proxy.sendRequest(req, resp, function(error, req, resp){
            if(error)
                callback(new errors.BadRequest('Error to redirect the UpdateContext to Orion.'));                
            return;
        });
    }
    //se for orion
    //dada a entidade recupera seus IoT Agents    
    //manda realizar request para seus providers
    //o resultado eh merge e redirecionado
    //se nao 
    //envia para o orion    
}

/**
 * Load the routes related to context dispatching (NGSI10 calls).
 *
 * @param {Object} router      Express request router object.
 
function loadContextRoutes(router) {
        logger.error(context, 'Tried to handle an update request before the update handler was stablished.');
    
    //TODO: remove '//' paths when the appropriate patch comes to Orion
    var registerMiddlewares = [
            middlewares.ensureType,
            middlewares.validateJson(registerContextTemplate),
            orion.inspectUrl,
            registerRegisteryPayload,
            proxy.sendRequest,
            setRegistrationId
        ],      
        queryMiddlewares = [
            middlewares.ensureType,
            middlewares.validateJson(queryContextTemplate),
            orion.inspectUrl,                
            handleQuery
        ],
        updateMiddlewares = [
            middlewares.ensureType,
            //middlewares.validateJson(updateContextTemplate),
            orion.extractCBAction,
            handleUpdate            
        ],          
        registerPath = [
            '/v1/registry/registerContext',
            '/NGSI9/registerContext',
            '//registerContext'            
        ],        
        updatePaths = [
            '/v1/updateContext',
            '/NGSI10/updateContext',
            '//updateContext'
        ],
        queryPaths = [
            '/v1/queryContext',
            '/NGSI10/queryContext',
            '//queryContext'
        ];

    logger.info(context, 'Loading NGSI Contect server routes');

    for (var i = 0; i < updatePaths.length; i++) {
        router.post(updatePaths[i], updateMiddlewares);
        router.post(queryPaths[i], queryMiddlewares);
       // router.post(registerPath[i], registerMiddlewares);
        
    }
    
    router.post('/v2/op/update', updateMiddlewares);            
}*/

exports.registerRegisteryPayload = intoTrans(context, registerRegisteryPayload);
exports.setRegistrationId = intoTrans(context, setRegistrationId);
exports.handleUpdate = intoTrans(context, handleUpdate);
exports.handleQuery = intoTrans(context, handleQuery);
exports.getContextElements =  intoTrans(context, getContextElements);