'use strict';

var logger = require('logops'),
    async = require('async'),
    apply = async.apply,    
    errors = require('../errors'),
    _ = require('underscore'),
    config = require('../commons'), 
    intoTrans = require('../common/domains').intoTrans,            
    entityService = require('../entity/entityService'),          
    proxy = require('../middleware/proxy'),  
    entity = require('../entity/entityRegistryMemory'),         
    updateEntityTemplate = require('../templates/updateEntity.json'),
    createEntityTemplate = require('../templates/createEntity.json'),
    middlewares = require('../common/genericMiddleware'),   
    context = {
        op: 'IoTBroker.EntityProvisioning'
    };


function handleProvision(req, res, next) {

    function handleProvisioningFinish(error, results) {
        if (error) {
            logger.debug(context, 'Entity provisioning failed due to the following error: ', error.message);
            next(error);
        } else {
            logger.debug(context, 'Entity provisioning request succeeded');
            res.status(201).json({});
        }
    }

    function fillEntityData(service, subservice, body, callback) {
        /* jshint sub: true */
        var entity = {
            type: body['type'],
            id: body['id'],
            service: service,
            subservice: subservice,
            providingApplication: body['providingApplication'],
            registrationId: body['registrationId'],
            isPattern: (body['isPattern'] == "false") ? "false": "true",
            duration: (body['duration']) ? body['duration'] : "1PM"            
        };
        
        callback(null, entity, service, subservice);
    }

    function provisionSingleEntity(entities, callback) {
       async.waterfall([
            apply(middlewares.checkMandatoryQueryParams, [ 'id', 'providingApplication'], entities),
            apply(fillEntityData, req.headers['fiware-service'], req.headers['fiware-servicepath']),
            entityService.store
        ], callback);
    }

    function extractEntity() {
        return req.body.entities;
    }

    logger.debug(context, 'Handling Entity Provisioning Provision.');

    async.map(extractEntity(), provisionSingleEntity, handleProvisioningFinish);
}

function toProvisioningAPIFormat(entity) {
    return {
        id: entity.id,
        type: entity.type,
        isPattern: entity.isPattern,
        providingApplication: entity.providingApplication,
        duration: entity.duration,        
        registrationId: entity.registrationId,
        service: entity.service,
        subservice: entity.subservice        
    };
}

function handleListEntities(req, res, next) {
    logger.debug(context, 'Handling Entity Provisioning List.');
    
    entityService.listEntities(
        req.params.type, 
        req.params.id, 
        req.headers['fiware-service'],
        req.headers['fiware-servicepath'],
        req.query.limit,
        req.query.offset,
        function handleListDevices(error, entityList) {
            if (error) {
                next(error);
            } else {
                var response = entityList;
                response.entities = entityList.entities.map(toProvisioningAPIFormat);

                res.status(200).json(response);
            }
        });
}

/*excluir
function handleGetEntity(req, res, next) {
    logger.debug(context, 'funcao getEntity');
    config.getRegistry().getEntity(req.params.type, req.params.id, req.headers['fiware-service'], req.headers['fiware-servicepath'],
        function(error, entityList) {
            if (error) {
                next(error);
            } else if (entityList) {
                var response = entityList;
                response.entities = entityList.entities.map(toProvisioningAPIFormat);

                res.status(200).json(response);
            } else {
                    next(new errors.EntityNotFound("type [" +req.params.type + "] and id [" + req.params.id+"]."));
            }
        });
}
*/

function handleRemoveEntity(req, res, next) {
    logger.debug(context, 'Handling Remove Entity Provision.');
    
    entityService.removeEntity(req.params.type, req.params.id, req.headers['fiware-service'], req.headers['fiware-servicepath'],
        function(error) {
            if (error) {
                next(error);
            } else {
                res.status(204).send();
            }
    });
}

function handleExpiration(req, resp, next){
    logger.debug(context, 'Handling remove Entity Expiration.');
    
    entityService.removeExpiration(function(error, result) {
            if (error) {
                next(error);
            } else {
                resp.status(204).send();
            }
    });
}

/**
 * This middleware handles updates in the provisioning devices. The only attribute
 */
function handleUpdateEntity(req, res, next) {
    logger.debug(context, 'Handling Entity Provisioning Update.');

    if (!req.body.entities) {
        next(new errors.BadRequest('Array of entities isn\'t send into body request.'));
    } else {
        
        entityService.update(
        req.body.entities,
        req.headers['fiware-service'],
        req.headers['fiware-servicepath'],
        function (error, entityList) {
            if (error) {
                next(error);
            } else {                               
                res.status(204).json({});
            }
        });    
    }
}

function loadContextRoutes(router) {
    
    router.delete('/iot/duration',
        handleExpiration
    );  
    
    router.post('/iot/entities',
        middlewares.ensureType,
        middlewares.validateJson(createEntityTemplate),
        handleProvision
    );
    
    router.get('/iot/entities\/?:type?/:id?',
        handleListEntities
    );
        
    router.put('/iot/entities',
        middlewares.ensureType,
        middlewares.validateJson(updateEntityTemplate),
        handleUpdateEntity
    );
    
    router.delete('/iot/entities/:type/:id?',
        handleRemoveEntity
    );
  
}

exports.loadContextRoutes = intoTrans(context, loadContextRoutes);