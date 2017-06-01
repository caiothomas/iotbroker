'use strict';

var registeredEntity = {},
    logger = require('logops'),
    errors = require('../errors'),
    _ = require('underscore'),
    intoTrans = require('../common/domains').intoTrans,            
    moment = require('moment'),    
    context = {
        op: 'IoTBroker.InMemoryEntityRegister'
    };

//Store entity in array and this array is associated with array of service  of entity.
function storeEntity(newEntity, service, subservice, callback){
    
    if (!registeredEntity[service]) {
        registeredEntity[service] = [];
    }
    
    if(registeredEntity[service]){
        var array_object = registeredEntity[service];
        
        if(!array_object)
            array_object = [];                
          
        var exp =  moment().add(moment.duration(newEntity.duration, moment.ISO_8601)).format("x");        
        newEntity.expiration = exp;
        
        //var value =  moment() + moment.duration(newEntity.duration, moment.ISO_8601).asSeconds();
        //newEntity.expiration = value;        
        
        array_object.push(newEntity);
        logger.debug(context, 'Storing Entity with id [%s] and type [%s] and provider [%s]', newEntity.id, newEntity.type, newEntity.providingApplication);
    }

    callback(null, newEntity);
}


function removeEntityRegistration(registrationId, service, subservice, callback) {    
    var services = Object.keys(registeredEntity);    
    for (var i = 0; i < services.length; i++) { 
        var entity = registeredEntity[services[i]];  
        
        registeredEntity[services[i]]= _.reject(registeredEntity[services[i]], function(item){ 
            logger.debug(context, 'Entity with registrationId [%s] was removed.', registrationId);
            return item.registrationId == registrationId.toString();
        });
    }  
}

function removeExpiration(callback) {    
    var services = Object.keys(registeredEntity);    
    var currentTime = moment().format('x');
    var interval = 0;
    for (var i = 0; i < services.length; i++) { 
        var arrayEntity = registeredEntity[services[i]];
        registeredEntity[services[i]] = _.filter(arrayEntity, function(item){
            interval = item.expiration - currentTime;
            console.log("currentTime ", currentTime)
            console.log("item.expiration ", item.expiration)
            console.log("interval", interval)
            //returns non-expired elements
            if(interval >  0){
                return true;                 
            }
        });
    }     
    
    logger.debug(context, 'Expired entities have been removed.');    
    
    callback(null);
}

function getProviderAplications(condition, service, subservice, callback){
    var url = [];
    
    logger.debug(context, 'condition', condition);
             
    var arrayEntities = registeredEntity[service];
    if(arrayEntities){
        logger.debug(context, 'arrayEntities', arrayEntities);                
        var elem = _.where(arrayEntities,condition);
        
        if(elem){         
            url = _.pluck(elem, 'providingApplication');   
        }
    }
    
    logger.debug(context, 'providingApplication', url);    
    callback(null, url);    
}


function listEntities(condition, service, subservice, limit, offset, callback) {
    var skipped = 0;
    var entityList = [];
    var list = [];
    var result = [];
    
    if(registeredEntity[service]){
        entityList = _.where(registeredEntity[service], condition);
        logger.debug(context, 'entityList.', entityList);           
    }

    for (var i in entityList) {
        logger.debug(context, 'for ', entityList[i]);                            
        if (_.contains(registeredEntity[service], (entityList[i])) ){
            if (offset && skipped < parseInt(offset, 10)) {
                skipped++;
            } else {
                logger.debug(context, 'entityList', entityList[i]);                    
                list.push(entityList[i]);
            }

            if (limit && list.length === parseInt(limit, 10)) {
                break;
            }
        }
    }
    result[0] = list;
    result[1] = list.length; 
    callback(null, result);
}

//obrigatorio apenas o id service s subservice
function removeEntity(condition, callback) {    

    if (registeredEntity[condition.service]) {
        var listRemove;
        if(condition.type && condition.id){    
            registeredEntity[condition.service] = _.reject(registeredEntity[condition.service], function(item){ 
                logger.debug(context, 'Removed entity with type [%s]  and id [%s] and service [%s] and subservice [%s] from Registry Memory.', condition.type, condition.id, condition.service, condition.subservice);                                                 
                return item.id == condition.id && item.type == condition.type && item.service == condition.service && item.subservice == condition.subservice;
            });
        } else if (condition.type){                    
            registeredEntity[condition.service] = _.reject(registeredEntity[condition.service], function(item){ 
                logger.debug(context, 'Removed entity with type [%s] and service [%s] and subservice [%s] from Registry Memory.', condition.type, condition.service, condition.subservice);                                                                     
                return item.type == condition.type && item.service == condition.service && item.subservice == condition.subservice;
            });
        } else {
            callback(new errors.EntityNotFound(condition.id));
        }        
    }  
    logger.debug(context, 'registeredEntity[service]', registeredEntity[condition.service]);        
    callback(null);
}      


function update(ident, entity){

    if (registeredEntity[ident.service]) {
        var result = _.where(registeredEntity[ident.service], ident);
             
        for(var j=0; j<result.length; j++){
            result[j].type =  entity.type || result[j].type;
            result[j].id = entity.id || result[j].id;
            result[j].isPattern = entity.isPattern || result[j].isPattern;
            result[j].duration = entity.duration || result[j].duration;     
            result[j].providingApplication = entity.providingApplication || result[j].providingApplication;  
            result[j].registrationId = entity.registrationId || result[j].registrationId;
            
            if(entity.duration){
                var value =  moment() + moment.duration(entity.duration, moment.ISO_8601).asSeconds();
                result[j].expiration = value;      
            }                         
        }
    }
}

function clear(callback) {
    registeredEntity = {};
    callback();
}


exports.store = intoTrans(context, storeEntity);
exports.update = intoTrans(context, update);
exports.clear = intoTrans(context, clear);
exports.removeEntityRegistration = intoTrans(context, removeEntityRegistration);
exports.getProviderAplications = intoTrans(context, getProviderAplications);
exports.listEntities = intoTrans(context, listEntities);
exports.removeEntity = intoTrans(context, removeEntity);
exports.removeExpiration = intoTrans(context, removeExpiration);
