var proxy = require('../lib/index'),
    config = require('../config'),
    logger = require('logops'),
    registry;

function anyIsSet(variableSet) {
    for (var i = 0; i < variableSet.length; i++) {
        if (process.env[variableSet[i]]) {
            return true;
        }
    }

    return false;
}

function loadConfiguration() {    
    
    var environmentValues = [
        'BROKER_PORT',
        'TARGET_HOST',
        'TARGET_PORT',
        'LOG_LEVEL',
        'ACCESS_HOST',
        'ACCESS_PORT',
        'ACCESS_PROTOCOL',
        'ADMIN_PORT',
        'AUTHENTICATION_HOST',
        'AUTHENTICATION_PORT',
        'AUTHENTICATION_PROTOCOL',
        'PROXY_USERNAME',
        'PROXY_PASSWORD',
        'COMPONENT_PLUGIN',
        'COMPONENT_NAME',
        'ENTITY_REGISTER_TYPE'        
    ],
    mongoVariables = [
            'IOTA_MONGO_HOST',
            'IOTA_MONGO_PORT',
            'IOTA_MONGO_DB',
            'IOTA_MONGO_REPLICASET'
    ];

    for (var i = 0; i < environmentValues.length; i++) {
        if (process.env[environmentValues[i]]) {
            console.log('Changing %s to environment value: %s', environmentValues[i], process.env[environmentValues[i]]);
        }
    }

    if (process.env.BROKER_PORT) {
        config.resource.broker.port = process.env.BROKER_PORT;
    }
    if (process.env.TARGET_HOST) {
        config.resource.original.host = process.env.TARGET_HOST;
    }
    if (process.env.TARGET_PORT) {
        config.resource.original.port = process.env.TARGET_PORT;
    }
    if (process.env.ADMIN_PORT) {
        config.resource.proxy.adminPort = process.env.ADMIN_PORT;
    }
    if (process.env.LOG_LEVEL) {
        config.logLevel = process.env.LOG_LEVEL;
    } 

    if (process.env.ENTITY_REGISTER_TYPE) {
        config.EntityRegistry = {};
        config.EntityRegistry.type = process.env.ENTITY_REGISTER_TYPE;
    }
        
    if (anyIsSet(mongoVariables)) {
        config.mongodb = {};
    }
    
    //mongo
    if (process.env.IOTA_MONGO_HOST) {
        config.mongodb.host = process.env.IOTA_MONGO_HOST;
    }

    if (process.env.IOTA_MONGO_PORT) {
        config.mongodb.port = process.env.IOTA_MONGO_PORT;
    }

    if (process.env.IOTA_MONGO_DB) {
        config.mongodb.db = process.env.IOTA_MONGO_DB;
    }

    if (process.env.IOTA_MONGO_REPLICASET) {
        config.mongodb.replicaSet = process.env.IOTA_MONGO_REPLICASET;
    }

    if (process.env.IOTA_MONGO_RETRIES) {
        config.mongodb.retries = process.env.IOTA_MONGO_RETRIES;
    }

    if (process.env.IOTA_MONGO_RETRY_TIME) {
        config.mongodb.retryTime = process.env.IOTA_MONGO_RETRY_TIME;
    }    
}

function setConfig(newConfig) {
    config = newConfig;

    if (config.logLevel) {
        logger.setLevel(config.logLevel);
    }

    loadConfiguration();
}

function getConfig() {
    return config;
}

function setRegistry(newRegistry) {
    registry = newRegistry;
}

function getRegistry() {
    return registry;
}

exports.setConfig = setConfig;
exports.getConfig = getConfig;
exports.setRegistry = setRegistry;
exports.getRegistry = getRegistry;