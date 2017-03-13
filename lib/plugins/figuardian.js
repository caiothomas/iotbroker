'use strict';

var logger = require('logops'),
    middlewares = require('../common/genericMiddleware'),
    ngsi = require('../ngsi/ngsi'),    
    request = require('request'),
    _ = require('underscore'),    
    async = require('async'),        
    apply = async.apply,       
    jp = require('jsonpath'),
    registry = [],
    context = {
        op: 'IoTBroker.Figuardian'
    };    



function execute(req, resp, callback) {

    function extractContextRegistrations(doc, callback) {
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

    if (req.path.toLowerCase().match(/\/(ngsi10|v1|)\/updatecontext$/)) {
       
    } else if (req.path.toLowerCase().match(/\/v2\/op\/update$/)) {
    } else if (req.path.toLowerCase().match(/\/(v1\/registry|ngsi9)\/registercontext$/)) { 

        extractContextRegistrations(doc, function(error, result){                      
        
        if(req.headers['fiware-service'] && req.headers['fiware-servicepath']){
            var entities = result[0];
            var elem = {
                        service: req.headers['fiware-service'],
                        subservice: req.headers['fiware-servicepath'], 
                        itens: entities
            }
               
            if(registry && registry.length == 0){
                registry.push(elem);                                
            } else {            
                for(var i=0; i<registry.length; i++){
                    if(registry[i] && registry[i].service == req.headers['fiware-service'] &&
                       registry[i].subservice == req.headers['fiware-servicepath']){                    
                        if(registry[i].itens){
                            for(var k=0; k < elem.itens.length; j++){
                                for(var j=0; j < registry[i].itens.length; j++){                                    
                                    if(registry[i].itens[j] && elem.itens[k] && registry[i].itens[j].id == elem.itens[k].id){
                                        registry[i].itens[j].attributes = _.union(registry[i].itens[j].attributes, elem.itens[k].attributes);    
                                        logger.debug(context, 'encontrei!!', JSON.stringify(registry[i].itens[j], null, 4));                    
                                        logger.debug(context, 'REMOVE', JSON.stringify(registry[i].itens[j].id, null, 4));  
                                        delete registry[i].itens[j];                                        
                                    }
                                }
                            }
                        } 
                    } else {
                        registry.push(elem);
                    }
                }
            }
                            
            
            logger.debug(context, 'registry*', registry);                            
                                                                                                         
        }
            
        });
    } 
    
}

exports.execute = execute;
