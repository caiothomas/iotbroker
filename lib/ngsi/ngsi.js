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
    figuardian = require('../plugins/figuardian'),    
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

function registerPayload(req, resp, callback){
    var doc = _.map(req.body.contextRegistrations, _.clone);    
    var duration = extractDuraction(req.body);
    var service = req.headers['fiware-service'];
    var subservice = req.headers['fiware-servicepath'];    
    
    function extractDuraction(doc) {
        var duration = jp.query(doc, '$.duration');    

        if (duration && duration.length !== 1) {
            duration = 'P1M';
        }
        return duration[0];
    }
    
    function removeRegistrationId(docJson, callback) {        
        var registrationId = jp.query(docJson, '$.registrationId');    
        
        if (registrationId && registrationId.length >= 1) {
            console.log("remove Registration  ", registrationId);            
            entityService.removeEntityRegistration(registrationId, service, subservice, callback);            
        }
        callback(null);
    }
    
    function extractContextRegistrations(doc, registrationId, callback) {    
        console.log("doc", doc)
        console.log("registrationId", registrationId)
        
        /*
        var contextRegistrations = jp.query(doc, '$.contextRegistrations[*]');    
        var contextElements = [];
        
        for (var i = 0; i < doc.   length; i++) {
            contextElements.push(doc[i]);
        }*/
          
        async.map(doc, function(context, callback) {
            extractNodeJs(context, registrationId, callback);
        }, function(error, entitysObj){
            callback(null, _.flatten(entitysObj));            
        }); 
    }  
    
    function extractNodeJs(contextElements, registrationId, callback){
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
                "duration" : duration,
                "registrationId":  registrationId                                
            };    

            logger.debug(context, 'Entity', entity);
            result.push(entity);
            
            entityService.store(entity, service, subservice, function(error, result){
                if(result){
                    logger.debug(context, "Saved the Registration ID in Entityid [%s] and type [%s].", result.id, result.type);                                        
                }
            });
        }
                      
        callback(null, result);
    }  
    
    function setRegistrationId(response, body, callback){    
        if(response.statusCode == 200 && body){
            var registrationIdResponse = JSON.parse(body);   

            if(registrationIdResponse.hasOwnProperty('registrationId') && !registrationIdResponse.hasOwnProperty('errorCode')){
                extractContextRegistrations(doc, registrationIdResponse.registrationId, callback);
            }                               
        } else {
            logger.error(context, new errors.BadRequest('Error in registration! Not found registration Id. Status code response %s.', response.statusCode));           
        }
    }
    
    function replaceProvider(doc, callback){
        
        var context = req.body.contextRegistrations;
            
        for(var i=0; i< context.length; i++){
            if(context[i].providingApplication){
                context[i]['providingApplication'] =  middlewares.ensureHttp(config.getConfig().resource.broker.host) + ":" +config.getConfig().resource.broker.port;
            }
        }
        
        req.body.contextRegistrations = context
        console.log("request", req.body.contextRegistrations)         
        console.log("doc", doc)
        callback(null)
    }
    
    async.waterfall([
        async.apply(removeRegistrationId, req.body),
        async.apply(replaceProvider, doc),
        async.apply(proxy.sendRequest, req, resp),
        async.apply(setRegistrationId)            
    ], function(error, entities){
        
        if(entities && entities.length > 0 && duration != 'PT1S')
            figuardian.getEvent().emit('figuardian',  entities);
        
        callback(error, req,resp);            
    });
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
                        if(config.getConfig().resource.broker.concat &&  config.getConfig().resource.broker.concat  == true){
                            output[key].attributes = output[key].attributes.concat(obj.attributes);                          
                            console.log("concat",  config.getConfig().resource.broker.concat )
                        }
                        else{
                            output[key].attributes= _.extend(output[key].attributes, obj.attributes);
                            console.log("merge",  config.getConfig().resource.broker.concat )
                        }
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

exports.registerPayload = intoTrans(context, registerPayload);
exports.handleUpdate = intoTrans(context, handleUpdate);
exports.handleQuery = intoTrans(context, handleQuery);
exports.getContextElements =  intoTrans(context, getContextElements);