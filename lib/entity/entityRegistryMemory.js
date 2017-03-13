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

         var entity = {
                "type" : 'Room',
                "isPattern" : "false",
                "id" : 'Room2',
                "providingApplication" : 'http://192.168.1.9:3000', 
                "duration" : '123',
              //  "registrationId": "58938fe11943da98560efaea",
                "service": 'figuardian',
                "expiration": moment() + moment.duration('PT1S', moment.ISO_8601).asSeconds(),             
                "subservice": '/ufu'                
            };    

            var entity3 = {
                "type" : 'Car',
                "isPattern" : "false",
                "id" : 'Car1',
                "providingApplication" : 'http://192.168.1.9:3000', 
                "duration" : '123',
            //    "registrationId": "58938fe11943da98560efaea",
                "service": 'figuardian',
                "expiration": moment() + moment.duration('P1M', moment.ISO_8601).asSeconds(),                
                "subservice": '/ufu'                 
            };    

            var entity2 = {
                "type" : 'Room',
                "isPattern" : "false",
                "id" : 'Room2',
                "providingApplication" : 'http://192.168.1.9:4000', 
                "duration" : '123',
                "registrationId": "58938fe11943da98560efaea",
                "service": 'figuardian',
                "expiration": moment() + moment.duration('PT1S', moment.ISO_8601).asSeconds(),
                "subservice": '/ufu'                 
            };   

/*
registeredEntity['figuardian'] = []
registeredEntity['figuardian'].push(entity);
registeredEntity['figuardian'].push(entity2);
registeredEntity['figuardian'].push(entity3);
*/
//Store entity in array and this array is associated with array of service  of entity.
function storeEntity(newEntity, service, subservice, callback){
    
    if (!registeredEntity[service]) {
        registeredEntity[service] = [];
    }
    
    if(registeredEntity[service]){
        var array_object = registeredEntity[service];
        
        if(!array_object)
            array_object = [];                
                
        var value =  moment() + moment.duration(newEntity.duration, moment.ISO_8601).asSeconds();
        newEntity.expiration = value;        
        
        array_object.push(newEntity);
        logger.debug(context, 'Storing Entity with id [%s] and type [%s] and provider [%s]', newEntity.id, newEntity.type, newEntity.providingApplication);
    }
    logger.debug(context, 'registeredEntity FIM ', registeredEntity);   
    callback(null, newEntity);
}


function removeEntityRegistration(registrationId, service, subservice, callback) {    
    var services = Object.keys(registeredEntity);
    logger.debug(context, 'registeredEntity', registeredEntity);
    logger.debug(context, 'services', services);
    
    for (var i = 0; i < services.length; i++) { 
        var entity = registeredEntity[services[i]];
        
        for(var j=0; j<entity.length; j++){
            if(entity[j] && entity[j].hasOwnProperty('registrationId')){                
            logger.debug(context, 'registeredEntity ', entity[j]);
            logger.debug(context, 'registeredEntity registrationId:', entity[j].registrationId);
                if (entity[j].registrationId == registrationId && 
                    entity[j].service == service && entity[j].subservice == subservice) {
                    logger.debug(context, 'Entity with registrationId [%s] was removed.', registrationId);
                    entity.splice(j);
                }
            }
        }
    }  
    logger.debug(context, 'registeredEntity FIM ', registeredEntity);    
}

function removeExpiration(callback) {    
    var services = Object.keys(registeredEntity);    
    var currentTime = moment();
    var interval = 0;
    
    for (var i = 0; i < services.length; i++) { 
        var arrayEntity = registeredEntity[services[i]];
        registeredEntity[services[i]] = _.filter(arrayEntity, function(item){
            interval = item.expiration - currentTime;
            //returns non-expired elements
            if(interval >  0){
                return true;                 
            }
        });
    }     
    
    logger.debug(context, 'Expired entities have been removed.', registeredEntity);    
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

/*
function getEntitiesByService(service, subservice) {
    if (registeredEntity[service]) {
        return Object.keys(registeredEntity[service]).filter(function filterByService(item) {
            if (subservice) {
                return registeredEntity[service][item].subservice === subservice;
            } else {
                return true;
            }
        });
    } else {
        return [];
    }
}
*/

//obrigatorio apenas o type service e subservice
/*
function getEntity(type, id, service, subservice, callback) {
    
    var obj = {   
        type: type, 
        service: service, 
        subservice: subservice
    };
    
    if(!type)
        callback(new errors.EntityNotFound(Type));    
    
    if(id)
        obj.id = id;
    
    if (registeredEntity[service]) {
        logger.debug(context, 'obj', obj);    
        logger.debug(context, 'registeredEntity[service]', registeredEntity[service]);    
        
        var result = _.where(registeredEntity[service], obj); 
        logger.debug(context, 'result', result);    

        if(result){
           callback(null, {entities: result});
        } else {
            callback(new errors.EntityNotFound(id));
        }
    }
}*/

//obrigatorio apenas o id service s subservice
function removeEntity(condition, callback) {

    if (registeredEntity[condition.service]) {
        
        for (var i = 0; i < registeredEntity[condition.service].length; i++) {
            var entity =  registeredEntity[condition.service][i];    
                if(condition.type && condition.id){
                    if(entity && entity.hasOwnProperty('type') && entity.subservice == condition.subservice && 
                       entity.type == condition.type && entity.id == condition.id){
                       logger.debug(context, 'Remove entity with type [%s] and id [%s] from Registry Memory.', condition.type, condition.id);   
                        delete registeredEntity[condition.service][i];
                        //registeredEntity[service].slice(i);
                    }
                } else if (condition.type){
                    if(entity && entity.hasOwnProperty('type') && entity.subservice == condition.subservice && 
                       entity.type == condition.type){
                       logger.debug(context, 'Remove entity with type [%s] from Registry Memory.', entity.type);                     
                        delete registeredEntity[condition.service][i];                     
                        //registeredEntity[service].slice(i);
                    }                    
                } else {
                    callback(new errors.EntityNotFound(condition.id));
                }
        }
    }    
    callback(null);
    logger.debug(context, 'registeredEntity[service]', registeredEntity[condition.service]);        
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
         if (registeredEntity[service]) {
                var result = _.where(registeredEntity[service], obj);
             
                for(var j=0; j<result.length; j++){
                    result[j].type =  entities[i].type || result[j].type;
                    result[j].id = entities[i].id || result[j].id;
                    result[j].isPattern = entities[i].isPattern || result[j].isPattern;
                    result[j].duration = entities[i].duration || result[j].duration;     
                    result[j].providingApplication = entities[i].providingApplication || result[j].providingApplication;  
                    result[j].registrationId = entities[i].registrationId || result[j].registrationId;   
                }
         }
                    
    }
    
    logger.debug(context, 'Update entity in Memory.');                    
    logger.debug(context, 'result', registeredEntity[service]);            
    callback(null);    
}*/

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
exports.update = intoTrans(context, update);
exports.removeExpiration = intoTrans(context, removeExpiration);

//exports.getEntity = getEntity;