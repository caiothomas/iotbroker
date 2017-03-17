'use strict';

var logger = require('logops'),
    middlewares = require('../common/genericMiddleware'),
    ngsi = require('../ngsi/ngsi'),    
    request = require('request'),
    _ = require('underscore'),    
    async = require('async'),        
    apply = async.apply,       
    jp = require('jsonpath'),
    config = require('../commons'),   
    fs = require('fs'),
    path = require('path'),   
    registry = [],
    context = {
        op: 'IoTBroker.Figuardian'
    };    

function extractContextRegistrations(req, resp, callback){
     function extractContext(doc, callback) {
        logger.debug(context, 'Extract context');

        var contextRegistrations = jp.query(doc, '$.contextRegistrations[*]');    
        var contextElements = [];

        for (var i = 0; i < contextRegistrations.length; i++) {
            contextElements.push(contextRegistrations[i]);
        }

        async.map(contextElements, extractNodeJs, callback);         
    }   

    function extractNodeJs(contextElements, callback){
        var entities = jp.query(contextElements, '$.entities[*]');
        var attributes = jp.query(contextElements, '$.attributes[*]');
        
        var result = [];
        for(var key  in entities) {
            var value = entities[key];        
            var elem = {               
                    id: value.id,
                    type: value.type,
                    isPattern:  value.isPattern,
                    attributes: attributes              
                };  
            
            result.push(elem);
        }

        callback(null, result);
    }
        
    var doc = req.body; 
    extractContext(doc, function(error, result){
        callback(null, result[0], req, resp);
    });
}

function extractcontextElements(req, resp, callback){
    var json = req.body;
    var result = [];
    if(json && json.contextElements){
        for(var i=0; i<json.contextElements.length; i++){
            var elem = {
                id: json.contextElements[i].id,
                type: json.contextElements[i].type,
                attributes: json.contextElements[i].attributes
            }            
            result.push(elem);
        }       
    }
    
    logger.debug(context, 'EXECUTE FIGUARDIAN UPDATE', result);    
    callback(null, result, req, resp);
}

function send(req, contextElements){
    var service = req.headers['fiware-service'];
    var subservice = req.headers['fiware-servicepath'];
    var options = {   
        method: 'POST',
        uri: config.getConfig().figuardian.url,
        json: JSON.stringify(contextElements),
        headers: {
            'fiware-service': service,
            'fiware-servicepath': subservice,     
            'Content-type': 'application/json'
        }
    };

    if(config.getConfig().figuardian.ssl && config.getConfig().figuardian.ssl.active == true){        
        options.key = fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.keyFile));
        options.cert= fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.certFile));          
        options.rejectUnauthorized= (config.getConfig().figuardian.ssl.rejectUnauthorized == true ) ? true : false;        
        
        if(config.getConfig().figuardian.ssl.ca)
            options.ca =  fs.readFileSync(path.resolve(__dirname, "../../" + config.getConfig().figuardian.ssl.ca));                       
    }        

    logger.debug(context, 'Options', options);     
    logger.debug(context, 'json', contextElements);         
    request(options, function(error, response, body){
        if(response.statusCode == 201){
                logger.debug(context, 'Sucess to send the ContextElement to Figuardian. Element with id [%s] and service [%s] and subservice [%s].', contextElements.id, service, subservice);                                                                                 
        } else{
                logger.debug(context, 'Error to send values to Figuardian. Element with id [%s] and service [%s] and subservice [%s].', contextElements.id, service, subservice);                                                                                 
        }                                        
    });   
}

function registryElem(result, req, resp, callback){    
        if(req.headers['fiware-service'] && req.headers['fiware-servicepath']){
                var entities = result;
                var elem = {
                            service: req.headers['fiware-service'],
                            subservice: req.headers['fiware-servicepath'], 
                            itens: entities
                };

                logger.debug(context, 'elem*', elem);   
            
                if(registry && registry.length == 0){
                    registry.push(elem);
                } else{
                    for(var i=0; i<registry.length; i++){
                        logger.debug(context, 'FOR REGISTY');                                                                                                                                                                                    
                        if(registry[i] && registry[i].service == req.headers['fiware-service'] &&
                           registry[i].subservice == req.headers['fiware-servicepath']){  
                            logger.debug(context, 'ITENS REGISTRY', registry[i].itens);  
                                logger.debug(context, 'ITENS elem.itens', elem.itens);                                                                                                                                                                                                                            
                            
                            for(var k=0; k<elem.itens.length; k++){     
                                logger.debug(context, 'BUSCANDO', elem.itens[k].id);                                                                                                                                                                                                                            
                                var search = _.where(registry[i].itens, {id: elem.itens[k].id});    
                                if(search && search.length > 0){
                                    for(var j=0; j<search.length; j++){
                                        search[j].attributes = _.union(search[j].attributes, elem.itens[k].attributes);                                        
                                        send(req, search[j]);
                                        registry[i].itens = _.without(registry[i].itens, search[j]);                                                                            
                                    } 
                                    logger.debug(context, 'search', search);                                                                                                                                                                                        
                                    logger.debug(context, 'registry[i].itens', registry[i].itens);                                      
                                } else {
                                    registry[i].itens = _.union(registry[i].itens, entities);                                        
                                }
                            }
                                logger.debug(context, 'DEPOIS', registry);                                                                                                                                                    
                        } else {
                            logger.debug(context, 'SAVE ELEM REGISTRY', elem);                                                                                                                                                                                                                
                            registry.push(elem);
                        }                        
                    }
                } 
                
                logger.debug(context, 'registry*', registry);                            
                callback(null, req, resp);
        } else {
            callback(null, req, resp);
        }
}        

function executeTwo(req, resp, next) {
    function sendContextElements(result, req, resp, callback){    
        if(req.headers['fiware-service'] && req.headers['fiware-servicepath']){
                logger.debug(context, 'Send', result);                   
                for(var i=0; i<result.length; i++){
                    send(req, result[i]);
                }
        } 
        callback(null, req, resp);
    } 
    
    if (req.path.toLowerCase().match(/\/(v1\/registry|ngsi9)\/registercontext$/)) { 
            async.waterfall([
                async.apply(extractContextRegistrations, req, resp),                      
                async.apply(sendContextElements)                        
            ], function(error, req, resp){
                if(error)
                    next(error); 
            });                              
    }       
    
    next();     
}

function execute(req, resp, next) {
    logger.debug(context, 'EXECUTE FIGUARDIAN');
    if (req.path.toLowerCase().match(/\/(ngsi10|v1|)\/updatecontext$/)) {
           async.waterfall([
                async.apply(extractcontextElements, req, resp),                      
                async.apply(registryElem)                        
            ], function(error, req, resp){
                if(error)
                    next(error); 
            });          
    } else if (req.path.toLowerCase().match(/\/(v1\/registry|ngsi9)\/registercontext$/)) { 
            async.waterfall([
                async.apply(extractContextRegistrations, req, resp),                      
                async.apply(registryElem)                        
            ], function(error, req, resp){
                if(error)
                    next(error); 
            });                              
    }       
    next(); 
}

exports.execute = executeTwo;
