'use strict';

var logger = require('logops'),
    errors = require('../errors'),
    async = require('async'),
    config = require('../commons'),
    intoTrans = require('../common/domains').intoTrans,        
    context = {
        op: 'IoTBroker.EntityService'
    };


function storeEntity(newEntity, service, subservice, callback){
    
    if(newEntity.isPattern == "false")
        newEntity.isPattern = "false";
    else
        newEntity.isPattern = "true";
        
    if(!newEntity.duration)
        newEntity.duration = "PT24H";
    
    newEntity.service = service;
    newEntity.subservice = subservice;
    
    config.getRegistry().store(newEntity, service, subservice, callback);
}


function removeEntityRegistration(registrationId, service, subservice, callback) {
    config.getRegistry().removeEntityRegistration(registrationId, service, subservice, callback);
}

function removeExpiration(callback) {    
    config.getRegistry().removeExpiration(callback);
}

function getProviderAplications(Entity, service, subservice, callback){    
    var condition = {};    
    
    if(Entity.hasOwnProperty('type'))
        condition.type = Entity.type;
    
    if(Entity.hasOwnProperty('isPattern'))
        condition.isPattern = Entity.isPattern;
    
    if(Entity.hasOwnProperty('id'))
        condition.id = Entity.id;
    
    condition.service = service;
    condition.subservice = subservice;
    
    config.getRegistry().getProviderAplications(condition, service, subservice, callback);
}

/**
 * Return the list of currently registered entities (via callback).
 *
 * @param {String} service      Service for which the entities are requested.
 * @param {String} subservice   Subservice inside the service for which the entities are requested.
 * @param {Number} limit        Maximum number of entries to return.
 * @param {Number} offset       Number of entries to skip for pagination.
 */
function listEntities(type, id, service, subservice, limit, offset, callback) {
    var condition = {};
    
    if(service)
        condition.service = service;  
    
    if(subservice)
        condition.subservice = subservice;  
        
    if(id)
        condition.id = id;  
    
    if(type)
        condition.type = type;     
    
    config.getRegistry().listEntities(condition, service, subservice, limit, offset, function(error, results){
        logger.debug(context, 'config.getRegistry');        
        callback(error, {
            count: results[1],
            entities: results[0]
        });        
    });
}

function removeEntity(type, id,  service, subservice, callback) {
    var condition = {   
        type: type, 
        service: service, 
        subservice: subservice
    };
    
    if(!type){
        callback(new errors.EntityNotFound(Type));                
    }
        
    if(id){
        condition.id = id;   
        logger.debug(context, 'Removing entity with type [%s] and id [%s].', type, id);                
    } else {
        logger.debug(context, 'Removing entity with type [%s].', type);        
    }
    
    logger.debug(context, 'condition', condition);                    
    
    config.getRegistry().removeEntity(condition, function(error){
        callback(error);
    });
}


function update(entities, service, subservice,  callback) {    
    for(var i=0; i< entities.length; i++){
            var obj = {};        
            if(entities[i].id)
                obj.id = entities[i].id;
        
            obj.service = service;
            obj.subservice = subservice;
            config.getRegistry().update(obj, entities[i]);            
    }
    callback(null);
}

function clear(callback) {
    config.getRegistry().clear(callback);
}

exports.store = intoTrans(context, storeEntity);
exports.listEntities = intoTrans(context, listEntities);
exports.clear = intoTrans(context, clear);
exports.update = intoTrans(context, update);
exports.removeEntity = intoTrans(context, removeEntity);
exports.removeEntityRegistration = intoTrans(context, removeEntityRegistration);
exports.getProviderAplications = intoTrans(context, getProviderAplications);
exports.removeExpiration = intoTrans(context, removeExpiration);