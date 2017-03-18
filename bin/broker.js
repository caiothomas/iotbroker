#!/usr/bin/env node
// to execute a bin script we must provide a hint as to Node's bin location.
var async = require('async'),
    apply = async.apply,
    proxy = require('../lib/index'),
    config_file = require('../config'),
    ngsi = require('../lib/ngsi/ngsi'),
    config = require('../lib/commons'),
    logger = require('logops'),
    db = require('../lib/model/dbConn'),
    context = {
        op: 'IoTBroker.Broker'
    },
    NodeCache = require( "node-cache" );
    EventEmitter = require('events').EventEmitter;
    waitingRequests = new EventEmitter();

function doActivate(newConfig) {
    var registry;

    logger.format = logger.formatters.pipe;

    config.setConfig(newConfig);
    
    logger.info(context, 'Activating IOT Broker NGSI Library.');

    if (newConfig.EntityRegistry &&
        newConfig.EntityRegistry.type &&
        newConfig.EntityRegistry.type === 'mongodb') {
        logger.info(context, 'MongoDB Device registry selected for NGSI Library');

        registry = require('../lib/entity/entityRegistryMongo');
    } else {
        logger.info(context, 'Falling back to Transient Memory registry for NGSI Library');

        registry = require('../lib/entity/entityRegistryMemory');
    }
        
    var proxyObj = {
        server: null,
        adminServer: null,
        middlewares: []
    };        
    
    config.setRegistry(registry);
    
    if(config.getConfig().middlewares && config.getConfig().middlewares.require){
        module = require('../' + config.getConfig().middlewares.require);

        for (var i in  config.getConfig().middlewares.functions) {
            console.log(module[config.getConfig().middlewares.functions[i]]);
            proxyObj.middlewares.push(module[config.getConfig().middlewares.functions[i]]);
        }                 
    }
    
    async.series([
        db.configureDb,
        apply(proxy.start, proxyObj),
    ], function(error, proxyObj) {        
        if (error) {
            process.exit();
        } else {
            console.log('Server started');
        }
    });    
}

doActivate(config_file);
