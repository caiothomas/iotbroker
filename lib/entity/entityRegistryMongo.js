'use strict';

var mongoose = require('mongoose')
require('mongoose-moment')(mongoose);

var logger = require('logops'),
    dbService = require('../model/dbConn'),
    errors = require('../errors'),
    _ = require('underscore'),
    async = require('async'),
    Entity = require('../model/Entity'), 
    intoTrans = require('../common/domains').intoTrans,                
    moment = require('moment'),
    context = {
        op: 'IoTBroker.MongoDBEntityRegister'
    };


function storeEntity(newEntity, service, subservice, callback){
    var entityObj = new Entity.model();    
    var attributeList = ['id', 'type', 'duration', 'isPattern', 'providingApplication', 'registrationId', 
                         'isPattern', 'duration', 'service', 'subservice'];
        
    for(var i=0; i< attributeList.length; i++){
        entityObj[attributeList[i]] = newEntity[attributeList[i]];        
    }
    
    //expiration = current-time + duration
    var exp =  moment().add(moment.duration(entityObj.duration, moment.ISO_8601)).format("x");        
    entityObj.expiration = exp;

    entityObj.save(function(error, result){
        if(error){
            logger.debug(context, 'Error storing Entity information: %s', error);
            callback(new errors.InternalDbError(error));            
        } else {
            callback(null, result.toObject());
        }
    });        
}


function removeEntityRegistration(registrationId, service, subservice, callback) {
    var query;
    var condition = {   
        registrationId: registrationId, 
        service: service, 
        subservice: subservice
    };

    Entity.model.remove(condition, function(error) {
        logger.debug(context, 'Entity with registrationId [%s] was removed.', registrationId);                        
    });        
}

function removeExpiration(callback) {    
    var currentTime = moment().format('x');
    var interval = 0;
    var query;
    
    Entity.model.remove({expiration: {"$lte": Date.now()} }, function(error) {
        if(error)
            callback(error);
        logger.debug(context, 'Expired entities have been removed.');     
    });        
   
    callback(null);
}



function getProviderAplications(condition, service, subservice, callback){
    var url = [];
    var query;
    
    logger.debug(context, 'condition', condition);                        
    
    query = Entity.model.find(condition);
        
    query.exec(function (error, result) {
        var url = [];        
        if(result){
            url = _.pluck(result, 'providingApplication');              
        }
        callback(error, url);
    });
}

/**
 * Return the list of currently registered entities (via callback).
 *
 * @param {String} service      Service for which the entities are requested.
 * @param {String} subservice   Subservice inside the service for which the entities are requested.
 * @param {Number} limit        Maximum number of entries to return.
 * @param {Number} offset       Number of entries to skip for pagination.
 */
function listEntities(condition, service, subservice, limit, offset, callback) {
    var query;   

    query = Entity.model.find(condition).sort();
        
    if (limit) {
        query.limit(parseInt(limit, 10));
    }

    if (offset) {
        query.skip(parseInt(offset, 10));
    }    

    logger.debug(context, 'results', condition);        
    
    async.series([
        query.exec.bind(query),
        Entity.model.count.bind(Entity.model, condition)
    ], callback);    
}

/*
function getEntitiesByService(service, subservice) {
    var query;
    var condition = {    
        service: service
    };
    
    query = Entity.model.find(condition).sort();
    
    async.series([
        query.exec.bind(query),
        Entity.model.count.bind(Entity.model, condition)        
    ], function(error, results) {        
        if (error) {
            logger.debug(context, 'Internal MongoDB Error getting entity: %s', error);
            callback(new errors.InternalDbError(error));
        } else if (results) {
            callback(error, {
                count: results[1],
                entities: results[0]
            });            
        } else {
            logger.debug(context, 'Entity [%s] not found.', id);
            callback(new errors.EntityNotFound(id));
        }    
    });    
}*/
/*
function getEntity(type, id, service, subservice, callback) {
    var query;
    var condition = {   
        type: type, 
        service: service, 
        subservice: subservice
    };
    
    if(!type)
        callback(new errors.EntityNotFound(Type));    
    
    if(id)
        condition.id = id;
    
    query = Entity.model.find(condition).sort();
    
    async.series([
        query.exec.bind(query),
        Entity.model.count.bind(Entity.model, condition)        
    ], function(error, results) {        
        if (error) {
            logger.debug(context, 'Internal MongoDB Error getting entity: %s', error);
            callback(new errors.InternalDbError(error));
        } else if (results) {
            callback(error, {
                count: results[1],
                entities: results[0]
            });            
        } else {
            logger.debug(context, 'Entity [%s] not found.', id);
            callback(new errors.EntityNotFound(id));
        }    
    });
};   
    
*/

function removeEntity(condition, callback) {
    

    Entity.model.remove(condition, function(error) {
        if (error) {
            logger.debug(context, 'Internal MongoDB Error getting entity: %s', error);

            callback(new errors.InternalDbError(error));
        } else {
            
            if(condition.id){
                logger.debug(context, 'Entity with type [%s] and id [%s] successfully removed.', condition.type, condition.id);                
            } else {
                logger.debug(context, 'Entity with type [%s]', condition.type);        
            }
            
            callback(null);
        }
    });    
}

/*
function update(entities, service, subservice,  callback) {
    var obj = {};        
    for(var i=0; i< entities.length; i++){
            if(entities[i].id)
                obj.id = entities[i].id;
            /*
            if(entities[i].type)
                obj.type = entities[i].type;

            if(entities[i].registrationId)
                obj.registrationId = entities[i].registrationId;
            
            obj.service = service;
            obj.subservice = subservice;
            
        Entity.model.update(obj, entities[i], {multi: true}, function(error, doc){            
            if(error){
                callback(error);
                logger.debug(context, "Something wrong when updating data!");
            }
                logger.debug(context, 'Update entity in MongoDb.', doc);                
        });      
    }
    callback(null);
}*/

function update(ident, entity){
    logger.debug(context, "ident", ident);
    logger.debug(context, "entity", entity);
    
    //update the expiration
    if(entity.duration){
        //expiration = current-time + duration
        var exp =  moment().add(moment.duration(entity.duration, moment.ISO_8601)).format("x");        
        entity.expiration = exp;
    }
    
    Entity.model.update(ident, entity, {multi: true}, function(error, doc){            
        if(error){
            logger.debug(context, "Something wrong when updating data!");
        }
            logger.debug(context, 'Update entity in MongoDb.', doc);                
    });     
}

/**
 * Cleans all the information in the database, leaving it in a clean state.
 */
function clear(callback) {
    dbService.db.db.dropDatabase(callback);
}

exports.store = intoTrans(context, storeEntity);
exports.listEntities = intoTrans(context, listEntities);
exports.clear = intoTrans(context, clear);
exports.update = intoTrans(context, update);
exports.removeEntity = intoTrans(context, removeEntity);
exports.removeEntityRegistration = intoTrans(context, removeEntityRegistration);
exports.getProviderAplications = intoTrans(context, getProviderAplications);
exports.removeExpiration = intoTrans(context, removeExpiration);
//exports.getEntitiesByService = getEntitiesByService;
//exports.getEntity = getEntity;
